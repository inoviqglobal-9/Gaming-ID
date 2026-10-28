const dns = require('dns');
const mongoose = require('mongoose');
const { config } = require('./env');

let isConnected = false;
let listenersRegistered = false;

/**
 * Safely mask credentials in MongoDB URI for logging and errors.
 */
const maskUri = (rawUri) => {
  if (!rawUri || typeof rawUri !== 'string') return '';
  try {
    const parsed = new URL(rawUri);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return rawUri.replace(/(:\/\/)([^:@\s]+):([^@\s]+)(@)/, '$1$2:****$4');
  }
};

/**
 * Categorize database errors with clear, actionable diagnostics.
 */
const classifyError = (error) => {
  if (!error) return 'Unknown database error';
  const msg = error.message || error.toString();
  const code = error.code || '';

  if (
    msg.includes('querySrv') ||
    code === 'ECONNREFUSED' ||
    code === 'EREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ESERVFAIL' ||
    msg.includes('ECONNREFUSED')
  ) {
    return `DNS SRV Resolution Failure [${code || 'DNS_ERROR'}]: ${msg}. Local DNS failed to resolve MongoDB SRV records. Configure DNS_SERVERS=8.8.8.8,1.1.1.1 in .env or update Windows network adapter DNS.`;
  }

  if (msg.includes('Authentication failed') || msg.includes('bad auth') || error.code === 18) {
    return `Authentication Failure: Provided database user credentials in MONGODB_URI are invalid. Verify Atlas Database Access user permissions.`;
  }

  if (
    error.name === 'MongooseServerSelectionError' ||
    msg.includes('timed out') ||
    msg.includes('Could not connect to any servers')
  ) {
    return `Server Selection Timeout: Could not reach MongoDB Atlas cluster within timeout. Check internet connectivity and ensure your IP is added to the MongoDB Atlas Network Access whitelist (https://cloud.mongodb.com).`;
  }

  if (msg.includes('SSL') || msg.includes('tls') || msg.includes('alert') || msg.includes('certificate')) {
    return `TLS/SSL Security Handshake Error: Ensure TLS is enabled and certificate validation is permitted on your network.`;
  }

  return msg;
};

/**
 * Resolve SRV record using specific DNS nameservers.
 */
const testSrvWithResolver = (srvRecord, servers) => {
  return new Promise((resolve) => {
    const resolver = new dns.Resolver();
    resolver.setServers(servers);
    resolver.resolveSrv(srvRecord, (err, addresses) => {
      if (err) resolve({ ok: false, error: err });
      else resolve({ ok: true, addresses });
    });
  });
};

/**
 * Resolve SRV record using default system DNS.
 */
const testSrvWithDefault = (srvRecord) => {
  return new Promise((resolve) => {
    dns.resolveSrv(srvRecord, (err, addresses) => {
      if (err) resolve({ ok: false, error: err });
      else resolve({ ok: true, addresses });
    });
  });
};

/**
 * Ensure Node runtime DNS is capable of resolving MongoDB SRV records.
 */
const setupDnsForUri = async (uri, customDnsServers = null) => {
  if (!uri || !uri.startsWith('mongodb+srv://')) {
    return { ok: true, method: 'standard', message: 'Standard non-SRV URI — SRV check skipped' };
  }

  let hostname = '';
  try {
    const parsed = new URL(uri);
    hostname = parsed.hostname;
  } catch {
    const match = uri.match(/mongodb\+srv:\/\/[^@]+@([^/?]+)/);
    hostname = match ? match[1] : '';
  }

  if (!hostname) {
    return { ok: false, error: new Error('Unable to extract Atlas hostname from mongodb+srv URI') };
  }

  const srvRecord = `_mongodb._tcp.${hostname}`;

  // 1. Test existing runtime DNS resolver
  const defaultTest = await testSrvWithDefault(srvRecord);
  if (defaultTest.ok) {
    return {
      ok: true,
      method: 'system_dns',
      servers: dns.getServers(),
      addresses: defaultTest.addresses,
    };
  }

  // 2. System DNS failed (e.g. 127.0.0.1 or ISP DNS refusing SRV queries)
  // Test configurable fallback resolvers (Google DNS 8.8.8.8, Cloudflare 1.1.1.1)
  const fallbackServers =
    customDnsServers && customDnsServers.length > 0
      ? customDnsServers
      : config.dnsServers && config.dnsServers.length > 0
      ? config.dnsServers
      : ['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1'];

  const fallbackTest = await testSrvWithResolver(srvRecord, fallbackServers);
  if (fallbackTest.ok) {
    dns.setServers(fallbackServers);
    console.warn(
      `[Database DNS] Default resolver (${defaultTest.error?.code || 'ERROR'}) could not resolve SRV records. Automatically configured reliable public DNS resolvers: [${fallbackServers.join(', ')}].`
    );
    return {
      ok: true,
      method: 'fallback_dns',
      servers: fallbackServers,
      addresses: fallbackTest.addresses,
      defaultError: defaultTest.error,
    };
  }

  return {
    ok: false,
    method: 'failed',
    defaultError: defaultTest.error,
    fallbackError: fallbackTest.error,
    error: new Error(
      `Failed to resolve SRV record ${srvRecord} via both system DNS (${defaultTest.error?.code}) and fallback DNS [${fallbackServers.join(', ')}] (${fallbackTest.error?.code}).`
    ),
  };
};

/**
 * Register Mongoose connection event listeners with deduplication.
 */
const registerConnectionEvents = () => {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    console.log(`[Database Event] Connected: host=${mongoose.connection.host} db=${mongoose.connection.name}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[Database Event] Runtime Connection Error: ${classifyError(err)}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database Event] Disconnected from MongoDB cluster.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[Database Event] Successfully reconnected to MongoDB cluster.');
  });
};

/**
 * Centralized MongoDB Connection with exponential backoff and jitter.
 */
const connectDB = async (customUri) => {
  const uri = customUri || config.mongodbUri;
  if (!uri) {
    throw new Error('Database connection failed: MONGODB_URI is not defined.');
  }

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  registerConnectionEvents();

  // Ensure DNS is configured if using mongodb+srv://
  if (uri.startsWith('mongodb+srv://')) {
    const dnsResult = await setupDnsForUri(uri, config.dnsServers);
    if (!dnsResult.ok) {
      const detailedError = classifyError(dnsResult.error);
      console.error(`[Database Error] Pre-flight DNS check failed: ${detailedError}`);
    }
  }

  const maxRetries = config.mongodbMaxRetries || 3;
  const baseDelayMs = config.mongodbRetryDelayMs || 2000;
  const timeoutMs = config.mongodbTimeoutMs || 10000;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[Database] Connecting to MongoDB (attempt ${attempt}/${maxRetries}): ${maskUri(uri)}...`
      );

      const conn = await mongoose.connect(uri, {
        autoIndex: true,
        serverSelectionTimeoutMS: timeoutMs,
        connectTimeoutMS: timeoutMs,
      });

      // Verify connection by performing an administrative ping
      await conn.connection.db.admin().ping();
      isConnected = true;

      console.log(
        `[Database] Connection verified and active: host=${conn.connection.host} db=${conn.connection.name}`
      );
      return conn;
    } catch (err) {
      lastError = err;
      const classified = classifyError(err);
      console.error(`[Database Error] Attempt ${attempt}/${maxRetries} failed: ${classified}`);

      if (attempt < maxRetries) {
        // Capped exponential backoff with random jitter
        const backoff = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 10000);
        const jitter = Math.floor(Math.random() * 500);
        const waitTime = backoff + jitter;
        console.log(`[Database Retry] Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  // All connection retries failed
  const finalError = new Error(
    `Failed to establish verified MongoDB connection after ${maxRetries} attempts: ${classifyError(lastError)}`
  );
  finalError.originalError = lastError;
  throw finalError;
};

/**
 * Disconnect MongoDB gracefully on application shutdown.
 */
const disconnectDB = async () => {
  if (isConnected || mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      isConnected = false;
      console.log('[Database] MongoDB connection closed cleanly.');
    } catch (err) {
      console.error('[Database Error] Error during disconnection:', err.message);
    }
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  maskUri,
  setupDnsForUri,
  classifyError,
};
