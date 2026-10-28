const ScannerConfig = require('../models/ScannerConfig');

// Generate an SVG data URI for non-payable demo QR
const createDemoQrDataUri = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <rect width="400" height="400" fill="#ffffff" rx="16"/>
    <!-- Decorative QR pattern boxes -->
    <rect x="40" y="40" width="80" height="80" fill="#0f172a" rx="8"/>
    <rect x="55" y="55" width="50" height="50" fill="#ffffff" rx="4"/>
    <rect x="68" y="68" width="24" height="24" fill="#0f172a" rx="2"/>

    <rect x="280" y="40" width="80" height="80" fill="#0f172a" rx="8"/>
    <rect x="295" y="55" width="50" height="50" fill="#ffffff" rx="4"/>
    <rect x="308" y="68" width="24" height="24" fill="#0f172a" rx="2"/>

    <rect x="40" y="280" width="80" height="80" fill="#0f172a" rx="8"/>
    <rect x="55" y="295" width="50" height="50" fill="#ffffff" rx="4"/>
    <rect x="68" y="308" width="24" height="24" fill="#0f172a" rx="2"/>

    <!-- Simulated harmless QR data elements -->
    <rect x="150" y="45" width="20" height="20" fill="#334155"/>
    <rect x="190" y="45" width="20" height="20" fill="#334155"/>
    <rect x="230" y="45" width="20" height="20" fill="#334155"/>

    <rect x="150" y="85" width="20" height="20" fill="#334155"/>
    <rect x="210" y="85" width="40" height="20" fill="#334155"/>

    <rect x="45" y="150" width="20" height="20" fill="#334155"/>
    <rect x="85" y="150" width="20" height="20" fill="#334155"/>
    <rect x="150" y="150" width="100" height="100" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2" rx="8"/>

    <text x="200" y="195" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0284c7" text-anchor="middle">PhonePe</text>
    <text x="200" y="215" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#64748b" text-anchor="middle">DEMO ONLY</text>

    <rect x="280" y="150" width="20" height="20" fill="#334155"/>
    <rect x="320" y="150" width="40" height="20" fill="#334155"/>

    <rect x="150" y="280" width="40" height="20" fill="#334155"/>
    <rect x="210" y="280" width="20" height="20" fill="#334155"/>
    <rect x="280" y="280" width="80" height="80" fill="#fee2e2" stroke="#ef4444" stroke-width="2" rx="6"/>
    <text x="320" y="325" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#dc2626" text-anchor="middle">TEST</text>

    <!-- Prominent Warning Banner Across QR -->
    <rect x="20" y="355" width="360" height="32" fill="#ef4444" rx="6"/>
    <text x="200" y="376" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">DEMO ONLY — DO NOT PAY</text>

    <!-- Top Watermark -->
    <rect x="20" y="12" width="360" height="20" fill="#fef2f2" stroke="#fecaca" rx="4"/>
    <text x="200" y="26" font-family="monospace" font-size="9" font-weight="bold" fill="#b91c1c" text-anchor="middle">FICHASPOT_DEMO_QR_NOT_FOR_PAYMENT</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const seedDemoScanner = async () => {
  try {
    const existing = await ScannerConfig.findOne({ scannerId: 'QR-DEMO-001' });
    if (!existing) {
      const demoScanner = new ScannerConfig({
        scannerId: 'QR-DEMO-001',
        scannerName: 'FICHASPOT DEMO SCANNER',
        merchantName: 'FICHASPOT DEMO MERCHANT',
        merchantIdentifier: 'MID-DEMO-FICHASPOT-001',
        paymentProvider: 'PhonePe Business (Demo)',
        qrImageUrl: createDemoQrDataUri(),
        assetUrl: createDemoQrDataUri(),
        paymentPurpose: 'Trader Deposit / PayIn (Demo Testing)',
        instructions: 'DEMO ONLY — DO NOT PAY. This scanner is for simulated testing. No real money will be charged.',
        mode: 'DEMO_ONLY',
        status: 'ACTIVE',
        isPublished: true,
        isActive: true,
        version: 1,
        authorizationStatus: 'DEMO_EXEMPT',
        authorizationDetails: 'Standard Non-Payable Demo Scanner for platform verification.',
        workflowType: 'ALL',
        supportedCurrencies: ['INR'],
      });

      await demoScanner.save();
      console.log('[Bootstrap] Initialized Default Demo Scanner: QR-DEMO-001 (ACTIVE)');
      return demoScanner;
    }
    return existing;
  } catch (error) {
    console.error('[Bootstrap Error] Failed to seed demo scanner:', error.message);
  }
};

module.exports = {
  seedDemoScanner,
  createDemoQrDataUri,
};
