const crypto = require('crypto');

// Base58 characters (excluding 0, O, I, l)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = {};
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP[ALPHABET[i]] = i;
}

/**
 * Decode a Base58 string into a Buffer
 */
const decodeBase58 = (string) => {
  if (!string || typeof string !== 'string' || string.length === 0) return null;

  const bytes = [0];
  for (let i = 0; i < string.length; i++) {
    const c = string[i];
    if (!(c in ALPHABET_MAP)) return null;

    for (let j = 0; j < bytes.length; j++) {
      bytes[j] *= 58;
    }
    bytes[0] += ALPHABET_MAP[c];

    let carry = 0;
    for (let j = 0; j < bytes.length; ++j) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }

    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Deal with leading zeros
  for (let i = 0; i < string.length && string[i] === '1'; i++) {
    bytes.push(0);
  }

  return Buffer.from(bytes.reverse());
};

/**
 * Validate TRC-20 (Tron) Address
 * Must start with 'T', be 34 chars, and pass Base58Check checksum
 */
const validateTronAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return { valid: false, message: 'Wallet address cannot be empty.' };
  }

  const trimmed = address.trim();

  if (!trimmed.startsWith('T')) {
    return { valid: false, message: 'TRC-20 address must begin with the letter "T".' };
  }

  if (trimmed.length !== 34) {
    return {
      valid: false,
      message: `TRC-20 address must be exactly 34 characters long (currently ${trimmed.length}).`,
    };
  }

  const decoded = decodeBase58(trimmed);
  if (!decoded || decoded.length !== 25) {
    return { valid: false, message: 'Invalid Base58 encoding in Tron address.' };
  }

  // First byte of Tron mainnet address must be 0x41 ('A' / Tron prefix)
  if (decoded[0] !== 0x41) {
    return { valid: false, message: 'Invalid Tron address header prefix.' };
  }

  // Checksum is the last 4 bytes
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21, 25);

  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  const expectedChecksum = hash2.subarray(0, 4);

  if (!checksum.equals(expectedChecksum)) {
    return { valid: false, message: 'Tron address checksum validation failed. Please check for typos.' };
  }

  return { valid: true, cleanAddress: trimmed };
};

/**
 * Validate ERC-20 (Ethereum/EVM) Address
 */
const validateEthereumAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return { valid: false, message: 'Wallet address cannot be empty.' };
  }

  const trimmed = address.trim();
  const evmRegex = /^0x[a-fA-F0-9]{40}$/;

  if (!evmRegex.test(trimmed)) {
    return {
      valid: false,
      message: 'ERC-20 address must start with 0x followed by 40 hexadecimal characters.',
    };
  }

  return { valid: true, cleanAddress: trimmed };
};

/**
 * Validate Bitcoin Address
 */
const validateBitcoinAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return { valid: false, message: 'Wallet address cannot be empty.' };
  }

  const trimmed = address.trim();
  const btcRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;

  if (!btcRegex.test(trimmed)) {
    return { valid: false, message: 'Invalid Bitcoin address format.' };
  }

  return { valid: true, cleanAddress: trimmed };
};

/**
 * Network Dispatcher
 */
const validateCryptoAddress = (address, network = 'TRC-20') => {
  const cleanNetwork = (network || 'TRC-20').toUpperCase();

  switch (cleanNetwork) {
    case 'TRC-20':
    case 'TRC20':
    case 'TRON':
      return validateTronAddress(address);

    case 'ERC-20':
    case 'ERC20':
    case 'ETH':
    case 'ETHEREUM':
      return validateEthereumAddress(address);

    case 'BTC':
    case 'BITCOIN':
      return validateBitcoinAddress(address);

    default:
      return {
        valid: false,
        message: `Unsupported blockchain network: ${network}. Supported networks include TRC-20, ERC-20, BTC.`,
      };
  }
};

module.exports = {
  validateCryptoAddress,
  validateTronAddress,
  validateEthereumAddress,
  validateBitcoinAddress,
};
