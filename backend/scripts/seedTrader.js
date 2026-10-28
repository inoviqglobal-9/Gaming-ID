const User = require('../models/User');
const PayInRequest = require('../models/PayInRequest');

const seedDemoTrader = async () => {
  try {
    let trader = await User.findOne({ username: 'inrpay_trader_001' });
    const hash = await User.hashPassword('TraderPass#2026');

    if (!trader) {
      trader = new User({
        username: 'inrpay_trader_001',
        fullName: 'INRPay Demo Trader',
        passwordHash: hash,
        role: 'TRADER',
        status: 'ACTIVE',
        mustChangePassword: false,
        notes: 'Demo Trader for live testing',
      });
      await trader.save();
      console.log('[Bootstrap] Initialized Demo Trader: inrpay_trader_001 (Password: TraderPass#2026)');
    } else {
      trader.passwordHash = hash;
      trader.role = 'TRADER';
      trader.status = 'ACTIVE';
      await trader.save();
    }

    const appCount = await PayInRequest.countDocuments({ userId: trader._id });
    if (appCount === 0) {
      await PayInRequest.create([
        {
          requestId: 'PIN-981204-4120',
          applicationId: 'PIN-981204-4120',
          orderId: 'ORD-981204-5112',
          utr: '492817290192',
          payerName: 'Rajesh Kumar',
          requisite: 'HDFC UPI / Merchant A',
          amount: 5000,
          currency: 'INR',
          status: 'CONFIRMED',
          userId: trader._id,
          clientId: trader.username,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          requestId: 'PIN-819230-1923',
          applicationId: 'PIN-819230-1923',
          orderId: 'ORD-819230-8472',
          utr: '501928491823',
          payerName: 'Amit Verma',
          requisite: 'ICICI UPI / Merchant B',
          amount: 12500,
          currency: 'INR',
          status: 'PROCESSING',
          userId: trader._id,
          clientId: trader.username,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          requestId: 'PIN-710294-8192',
          applicationId: 'PIN-710294-8192',
          orderId: 'ORD-710294-3918',
          utr: '401928371928',
          payerName: 'Sunil Mehta',
          requisite: 'PhonePe QR / Merchant A',
          amount: 2000,
          currency: 'INR',
          status: 'PENDING',
          userId: trader._id,
          clientId: trader.username,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          requestId: 'PIN-609182-7201',
          applicationId: 'PIN-609182-7201',
          orderId: 'ORD-609182-1920',
          utr: '391029384719',
          payerName: 'Deepak Sharma',
          requisite: 'Axis Bank / Merchant C',
          amount: 7500,
          currency: 'INR',
          status: 'DECLINED',
          userId: trader._id,
          clientId: trader.username,
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]);
      console.log('[Bootstrap] Initialized 4 Demo PayIn Applications for inrpay_trader_001');
    }

    // Seed Demo Deposit Requests for inrpay_trader_001 matching Screenshot 1 & 2
    const DepositRequest = require('../models/DepositRequest');
    const depCount = await DepositRequest.countDocuments({ userId: trader._id });
    if (depCount === 0) {
      await DepositRequest.create([
        {
          requestId: 'TDR-863750-7195',
          depositType: 'SECURITY_DEPOSIT',
          amount: 1000,
          currency: 'USDT',
          network: 'TRC20',
          wallet: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
          destinationWalletSnapshot: {
            address: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
            network: 'TRC20',
            currency: 'USDT',
            label: 'Primary Corporate USDT-TRC20 Vault',
          },
          status: 'DRAFT',
          verification: 'NOT_CHECKED',
          userId: trader._id,
          clientId: trader.username,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 58 * 60 * 1000 + 45 * 1000),
        },
        {
          requestId: 'TDR-863750-7194',
          depositType: 'WORKING_DEPOSIT',
          amount: 1000,
          currency: 'USDT',
          network: 'TRC20',
          wallet: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
          destinationWalletSnapshot: {
            address: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
            network: 'TRC20',
            currency: 'USDT',
            label: 'Primary Corporate USDT-TRC20 Vault',
          },
          status: 'EXPIRED',
          verification: 'NOT_CHECKED',
          userId: trader._id,
          clientId: trader.username,
          createdAt: new Date(Date.now() - 3600000 * 4),
          expiresAt: new Date(Date.now() - 3600000 * 2),
        },
      ]);
      console.log('[Bootstrap] Initialized 2 Demo Deposit Requests (Draft & Expired) for inrpay_trader_001');
    }

    // Seed Demo Requisites matching Screenshot 1
    const Requisite = require('../models/Requisite');
    const reqCount = await Requisite.countDocuments({ userId: trader._id });
    if (reqCount === 0) {
      await Requisite.create([
        {
          requisiteId: '19138',
          userId: trader._id,
          clientId: trader.username,
          type: 'UPI',
          accountHolderName: 'Ganesh',
          upiId: 'ganesh@upi',
          bankName: 'State Bank of India',
          dailyLimit: 500000,
          usedToday: 0,
          minAmount: 100,
          maxAmount: 50000,
          status: 'INACTIVE',
          approvalStatus: 'PENDING_REVIEW',
          payinEnabled: false,
          adminPayinAllowed: true,
          note: '-',
        },
        {
          requisiteId: '18939',
          userId: trader._id,
          clientId: trader.username,
          type: 'UPI',
          accountHolderName: 'Rajesh',
          upiId: 'rajesh@paytm',
          bankName: 'HDFC Bank',
          dailyLimit: 500000,
          usedToday: 0,
          minAmount: 100,
          maxAmount: 50000,
          status: 'INACTIVE',
          approvalStatus: 'PENDING_REVIEW',
          payinEnabled: false,
          adminPayinAllowed: true,
          note: '-',
        },
      ]);
      console.log('[Bootstrap] Initialized 2 Demo Requisites (19138, 18939) matching Screenshot 1');
    }

    // Ensure Demo Trader has USDT balance for live testing Wallet Check fee
    const BalanceLedger = require('../models/BalanceLedger');
    const usdtBalance = await BalanceLedger.calculateAvailableBalance(trader._id, 'USDT');
    if (usdtBalance < 10) {
      const existingEntry = await BalanceLedger.findOne({ referenceRequestId: 'INIT-USDT-DEMO-001' });
      if (!existingEntry) {
        await BalanceLedger.recordVerifiedEntry({
          userId: trader._id,
          clientId: trader.username,
          currency: 'USDT',
          entryType: 'CRYPTO_DEPOSIT_CONFIRMED',
          amount: 50.00,
          referenceRequestId: 'INIT-USDT-DEMO-001',
          notes: 'Initial Demo USDT Balance for testing Wallet Check AML fees',
          performedBy: trader._id,
        });
        console.log('[Bootstrap] Credited 50.00 USDT verified balance to inrpay_trader_001');
      }
    }

    return trader;
  } catch (err) {
    console.error('[Bootstrap Warning] Failed to seed demo trader:', err.message);
  }
};

module.exports = { seedDemoTrader };

