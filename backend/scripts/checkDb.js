const dns = require('dns');
const mongoose = require('mongoose');
const { config } = require('../config/env');
const { maskUri, setupDnsForUri, classifyError } = require('../config/db');

const runDiagnostics = async () => {
  console.log('========================================================');
  console.log('       SECURE SCANNER & TRADER - DB DIAGNOSTICS         ');
  console.log('========================================================\n');

  let hasFailures = false;

  // 1. Environment Variables Check
  const rawUri = config.mongodbUri;
  if (!rawUri) {
    console.error('[Database Check] Environment: FAILED');
    console.error('  -> Reason: MONGODB_URI environment variable is not defined.');
    console.error('  -> Action: Define MONGODB_URI in backend/.env (refer to backend/.env.example).');
    process.exit(1);
  }
  console.log('[Database Check] Environment: OK');

  // 2. URI Format Check
  let parsedUrl = null;
  try {
    parsedUrl = new URL(rawUri);
    if (!['mongodb:', 'mongodb+srv:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}. Expected 'mongodb:' or 'mongodb+srv:'`);
    }
    if (!parsedUrl.hostname) {
      throw new Error('Missing database hostname in connection string.');
    }
    console.log(`[Database Check] URI Format: OK (${maskUri(rawUri)})`);
  } catch (err) {
    console.error('[Database Check] URI Format: FAILED');
    console.error(`  -> Reason: ${err.message}`);
    console.error('  -> Action: Ensure MONGODB_URI is a valid MongoDB connection string.');
    process.exit(1);
  }

  // 3. DNS Resolution Check
  const isSrv = rawUri.startsWith('mongodb+srv://');
  if (isSrv) {
    try {
      const dnsResult = await setupDnsForUri(rawUri, config.dnsServers);
      if (!dnsResult.ok) {
        throw dnsResult.error || new Error(dnsResult.reason);
      }
      const shardCount = dnsResult.addresses ? dnsResult.addresses.length : 'unknown';
      console.log(
        `[Database Check] DNS Resolution: OK (${dnsResult.method}, resolved ${shardCount} shard nodes via [${dnsResult.servers.join(', ')}])`
      );
    } catch (err) {
      console.error('[Database Check] DNS Resolution: FAILED');
      console.error(`  -> Reason: ${classifyError(err)}`);
      console.error('  -> Suggested Actions:');
      console.error('     1. Configure DNS_SERVERS=8.8.8.8,1.1.1.1 in backend/.env');
      console.error('     2. Or change Windows network adapter DNS to 8.8.8.8 / 1.1.1.1');
      console.error('     3. Or use a standard replica set connection string (non-SRV) from Atlas');
      process.exit(1);
    }
  } else {
    // Non-SRV connection string (standard host:port format)
    console.log('[Database Check] DNS Resolution: OK (Standard non-SRV URI)');
  }

  // 4. MongoDB Connection Check
  const timeoutMs = config.mongodbTimeoutMs || 10000;
  console.log(`[Database Check] Connecting to database (timeout: ${timeoutMs}ms)...`);
  try {
    await mongoose.connect(rawUri, {
      serverSelectionTimeoutMS: timeoutMs,
      connectTimeoutMS: timeoutMs,
    });
    console.log(`[Database Check] MongoDB Connection: OK (Host: ${mongoose.connection.host})`);
  } catch (err) {
    console.error('[Database Check] MongoDB Connection: FAILED');
    console.error(`  -> Reason: ${classifyError(err)}`);
    console.error('  -> Suggested Actions:');
    console.error('     1. Check if your current IP is whitelisted in MongoDB Atlas Network Access.');
    console.error('     2. Verify username and password in MONGODB_URI.');
    console.error('     3. Verify cluster status at https://cloud.mongodb.com.');
    process.exit(1);
  }

  // 5. Database Ping Check
  try {
    const pingResult = await mongoose.connection.db.admin().ping();
    if (pingResult && pingResult.ok === 1) {
      console.log(`[Database Check] Database Ping: OK (Ping response: ${JSON.stringify(pingResult)})`);
    } else {
      throw new Error(`Unexpected ping response: ${JSON.stringify(pingResult)}`);
    }
  } catch (err) {
    console.error('[Database Check] Database Ping: FAILED');
    console.error(`  -> Reason: ${err.message}`);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  console.log('\n========================================================');
  console.log('       ALL DATABASE DIAGNOSTIC CHECKS PASSED           ');
  console.log('========================================================\n');
  process.exit(0);
};

runDiagnostics().catch((err) => {
  console.error('[Database Check Fatal]:', err.message);
  process.exit(1);
});
