import React, { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  Upload,
  Clock,
  RefreshCw,
  Eye,
  Info,
  DollarSign,
  Wallet,
  Gift,
  Trash2,
  X,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { cryptoService, traderService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const TraderCryptoPage = ({ navigate, currentRoute = '/trader/crypto' }) => {
  const { user } = useAuth();
  // Determine active tab based on route or state
  const getInitialTab = () => {
    if (currentRoute === '/trader/crypto/deposit') return 'DEPOSIT';
    if (currentRoute === '/trader/crypto/withdrawal') return 'WITHDRAWAL';
    return 'OVERVIEW';
  };

  const FIXED_WITHDRAWAL_AMOUNTS = [100, 200, 300, 500, 800, 1000, 2000, 3000, 5000, 10000];

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [wallet, setWallet] = useState(null);
  const [rates, setRates] = useState({
    baseRate: 105.0,
    depositFeePercent: 3.0,
    withdrawalFeePercent: 0.0,
    withdrawalBonusPercent: 1.0,
    effectiveDepositRate: 108.15,
    effectiveWithdrawalRate: 105.0,
  });
  const [activeQR, setActiveQR] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNetwork, setDepositNetwork] = useState('TRC20');
  const [depositTxHash, setDepositTxHash] = useState('');
  const [depositProofFile, setDepositProofFile] = useState(null);
  const [depositProofPreview, setDepositProofPreview] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState('');

  // Withdrawal Form State
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalUpiId, setWithdrawalUpiId] = useState('');
  const [withdrawalQrFile, setWithdrawalQrFile] = useState(null);
  const [withdrawalQrPreview, setWithdrawalQrPreview] = useState('');
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawalSuccessMsg, setWithdrawalSuccessMsg] = useState('');

  // Details Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  // Sync route changes
  useEffect(() => {
    if (currentRoute === '/trader/crypto/deposit') setActiveTab('DEPOSIT');
    else if (currentRoute === '/trader/crypto/withdrawal') setActiveTab('WITHDRAWAL');
  }, [currentRoute]);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [walletRes, ratesRes, qrRes, txRes] = await Promise.all([
        cryptoService.getWallet().catch(() => traderService.getUsdtWallet('CRYPTO')).catch(() => null),
        cryptoService.getRates().catch(() => null),
        cryptoService.getActiveQR().catch(() => null),
        cryptoService.getTraderTransactions().catch(() => null),
      ]);

      if (walletRes && walletRes.success) setWallet(walletRes);
      if (ratesRes && ratesRes.success) setRates(ratesRes);
      if (qrRes && qrRes.success) {
        setActiveQR(qrRes.data);
        if (qrRes.data && qrRes.data.network) {
          setDepositNetwork(qrRes.data.network);
        }
      }
      if (txRes && txRes.success) setTransactions(txRes.data || []);
    } catch (err) {
      console.error('[Trader Crypto Load Error]:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Live Socket.IO connection for private real-time updates
    let socket = null;
    if (user && user._id) {
      try {
        socket = io('/', { transports: ['websocket', 'polling'] });
        socket.emit('join_trader_room', user._id);
        socket.on('deposit_status_update', (data) => {
          loadData();
        });
        socket.on('balance_update', () => {
          loadData();
        });
      } catch (err) {
        console.warn('[Trader Socket.IO Error]:', err);
      }
    }

    // Live Server-Sent Events (SSE) synchronization for published/updated QR
    let es = null;
    try {
      es = new EventSource('/api/crypto/live-qr-stream');
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'ACTIVE_QR_UPDATE') {
            setActiveQR(parsed.data);
            if (parsed.data && parsed.data.network) {
              setDepositNetwork(parsed.data.network);
            }
          } else if (parsed.type === 'BALANCE_UPDATE') {
            loadData();
          }
        } catch (e) {
          console.error('[Trader SSE Parse Error]:', e);
        }
      };
      es.onerror = () => {
        // SSE auto-reconnects; fallback poll ensures sync
      };
    } catch (err) {
      console.warn('[Trader SSE Setup Error]:', err);
    }

    // Periodic fallback re-sync every 20 seconds
    const interval = setInterval(() => {
      cryptoService.getActiveQR().then((res) => {
        if (res && res.success) {
          setActiveQR(res.data);
          if (res.data && res.data.network) {
            setDepositNetwork(res.data.network);
          }
        }
      }).catch(() => {});
    }, 20000);

    return () => {
      if (es) es.close();
      if (socket) socket.disconnect();
      clearInterval(interval);
    };
  }, [loadData, user]);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(''), 2000);
  };

  // Calculations for Deposit Live Calculator (Dynamic User Amount + 3% Automatic Platform Bonus)
  const numDep = parseFloat(depositAmount) || 0;
  const fixedRate = Number(rates.baseRate || 105.0);
  const depBonusPercent = 3.0;
  const depBonusAmountUsdt = Math.round((numDep * 0.03) * 1000000) / 1000000;
  const depExpectedCreditUsdt = Math.round((numDep * 1.03) * 1000000) / 1000000;
  const depInrEquivalent = Math.round((numDep * fixedRate) * 100) / 100;

  // Calculations for Withdrawal Live Calculator (+1% Platform Bonus)
  const numWd = parseFloat(withdrawalAmount) || 0;
  const wdBonusPercent = Number(rates.withdrawalBonusPercent || 1.0);
  const wdBonusUsdt = Math.round((numWd * (wdBonusPercent / 100)) * 1000000) / 1000000;
  const wdDebitUsdt = Math.round((numWd - wdBonusUsdt) * 1000000) / 1000000;
  const wdFinalPayout = Math.round(numWd * rates.baseRate * 100) / 100;
  const availBal = parseFloat(wallet?.availableBalance || 0);
  const hasSufficientBalance = availBal >= wdDebitUsdt;

  // File Handlers
  const handleDepositFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDepositProofFile(file);
      setDepositProofPreview(URL.createObjectURL(file));
    }
  };

  const handleWithdrawalFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setWithdrawalQrFile(file);
      setWithdrawalQrPreview(URL.createObjectURL(file));
    }
  };

  // Submit Deposit (USDT Only + 3% Automatic Platform Bonus)
  const handleSubmitDeposit = async (e) => {
    e.preventDefault();
    if (!activeQR) {
      alert('No active USDT deposit wallet is currently available. Deposits cannot be accepted at this time.');
      return;
    }
    if (!numDep || numDep <= 0) {
      alert('Please enter a valid positive USDT deposit amount.');
      return;
    }
    if (!depositTxHash.trim()) {
      alert('Please enter your blockchain Transaction Hash / TXID.');
      return;
    }

    try {
      setSubmittingDeposit(true);
      setDepositSuccessMsg('');
      const formData = new FormData();
      formData.append('amount', numDep);
      formData.append('depositAmountUSDT', numDep);
      formData.append('network', activeQR.network || depositNetwork);
      formData.append('txHash', depositTxHash.trim());
      formData.append('utr', depositTxHash.trim());
      formData.append('destinationWalletAddress', activeQR.walletAddress || '');
      if (depositProofFile) {
        formData.append('proofImage', depositProofFile);
      }

      const res = await cryptoService.submitDeposit(formData);
      if (res.success) {
        setDepositSuccessMsg(
          `Deposit request ${res.data.requestId} submitted for ${numDep} USDT. You will receive ${depExpectedCreditUsdt.toFixed(2)} USDT (${numDep} USDT + 3% bonus: ${depBonusAmountUsdt.toFixed(2)} USDT) upon Admin verification.`
        );
        setDepositAmount('');
        setDepositTxHash('');
        setDepositProofFile(null);
        setDepositProofPreview('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to submit deposit request.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Submit Withdrawal (+1% Platform Bonus)
  const handleSubmitWithdrawal = async (e) => {
    e.preventDefault();
    if (!numWd || !FIXED_WITHDRAWAL_AMOUNTS.includes(numWd)) {
      alert(`Please select one of the fixed withdrawal amounts: ${FIXED_WITHDRAWAL_AMOUNTS.join(', ')} USDT.`);
      return;
    }
    const currentAvail = parseFloat(wallet?.availableBalance || 0);
    if (currentAvail < wdDebitUsdt) {
      alert(`Insufficient available USDT balance. Available: ${currentAvail.toFixed(2)} USDT, Required balance debit: ${wdDebitUsdt.toFixed(2)} USDT (99% of ${numWd} USDT with +1% bonus).`);
      return;
    }
    if (!withdrawalQrFile && (!withdrawalUpiId || !withdrawalUpiId.trim())) {
      alert('Please provide at least one payout destination: PhonePe / UPI QR code or UPI ID / Payment Address.');
      return;
    }

    try {
      setSubmittingWithdrawal(true);
      setWithdrawalSuccessMsg('');
      const formData = new FormData();
      formData.append('amount', numWd);
      if (withdrawalUpiId.trim()) formData.append('traderUpiId', withdrawalUpiId.trim());
      if (withdrawalQrFile) formData.append('traderQrImage', withdrawalQrFile);

      const res = await cryptoService.submitWithdrawal(formData);
      if (res.success) {
        setWithdrawalSuccessMsg(
          `Withdrawal request ${res.data.requestId} submitted for ${numWd} USDT. Only ${wdDebitUsdt.toFixed(2)} USDT debited from balance (+1% Bonus Benefit: +${wdBonusUsdt.toFixed(2)} USDT). Full payout obligation: ₹${wdFinalPayout.toLocaleString('en-IN')}.`
        );
        setWithdrawalAmount('');
        setWithdrawalUpiId('');
        setWithdrawalQrFile(null);
        setWithdrawalQrPreview('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to submit withdrawal request.');
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">CRYPTO MANAGEMENT</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Enterprise USDT Transfers: TRC20 Deposits (Fixed ₹105 Rate) & Crypto Withdrawals (+1% Bonus).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>Fixed Platform Rate: ₹{rates.baseRate || 105} / USDT</span>
          </div>

          <button
            onClick={loadData}
            disabled={refreshing}
            className="p-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-400 hover:text-white transition-all disabled:opacity-50"
            title="Refresh balances"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Balance & Commercial Rates Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available USDT Card */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Available USDT</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {wallet ? `${wallet.availableBalance} USDT` : '0.00 USDT'}
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-mono">
            INR Equivalent: ₹{wallet ? (parseFloat(wallet.availableBalance || 0) * (rates.baseRate || 105)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
        </div>

        {/* Locked USDT Card */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Locked / In Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {wallet ? `${wallet.lockedBalance} USDT` : '0.00 USDT'}
          </div>
          <div className="mt-2 text-xs text-gray-500 font-mono">
            Total Balance: {wallet ? `${wallet.totalBalance} USDT` : '0.00 USDT'}
          </div>
        </div>

        {/* Fixed Platform Rate Card */}
        <div className="bg-[#111827] border border-blue-500/20 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-blue-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Fixed USDT Rate</span>
            <ArrowDownLeft className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono flex items-baseline gap-2">
            <span>₹{rates.baseRate || 105} / USDT</span>
            <span className="text-xs font-normal text-blue-400 font-sans">Fixed Rate</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-400">
            Deposits receive +3% bonus (e.g. 100 USDT deposit = 103 USDT credited)
          </div>
        </div>

        {/* Withdrawal Bonus Card */}
        <div className="bg-[#111827] border border-purple-500/20 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-purple-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Withdrawal Bonus (+1%)</span>
            <Gift className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono flex items-baseline gap-2">
            <span>+1% Bonus</span>
            <span className="text-xs font-normal text-purple-400 font-sans">0% Fee</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-400">
            Get 100% full payout while only 99% USDT balance is debited
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1F293D] pb-3 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab('OVERVIEW');
            if (navigate) navigate('/trader/crypto');
          }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'OVERVIEW'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-gray-400 hover:text-white hover:bg-[#111827]'
          }`}
        >
          Crypto Hub Overview
        </button>

        <button
          onClick={() => {
            setActiveTab('DEPOSIT');
            if (navigate) navigate('/trader/crypto/deposit');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'DEPOSIT'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-gray-400 hover:text-white hover:bg-[#111827]'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          <span>Crypto Deposit (+3% Bonus)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('WITHDRAWAL');
            if (navigate) navigate('/trader/crypto/withdrawal');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'WITHDRAWAL'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'text-gray-400 hover:text-white hover:bg-[#111827]'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span>Crypto Withdrawal (+1% Bonus)</span>
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'HISTORY'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-gray-400 hover:text-white hover:bg-[#111827]'
          }`}
        >
          Transaction History ({transactions.length})
        </button>
      </div>

      {/* 4. OVERVIEW TAB: Quick Choice Cards */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Action Card: Deposit */}
            <div className="bg-[#111827] border border-[#1F293D] hover:border-emerald-500/40 rounded-2xl p-6 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ArrowDownLeft className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Crypto Deposit (+3% Bonus)</h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Deposit USDT directly via TRC20 blockchain transfer with an automatic +3% platform bonus benefit upon Admin approval and fixed platform valuation at ₹105 / USDT.
                </p>
              </div>

              <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-gray-400">
                  <span>Deposit Amount:</span>
                  <span className="text-white">Dynamic User Choice</span>
                </div>
                <div className="flex justify-between text-blue-400">
                  <span>Fixed Platform Rate:</span>
                  <span>₹105 / USDT</span>
                </div>
                <div className="flex justify-between text-purple-400">
                  <span>Deposit Bonus (3%):</span>
                  <span className="font-bold">+3% Platform Benefit</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold border-t border-[#1F293D] pt-1">
                  <span>Total USDT Credited:</span>
                  <span>103% of Deposit Amount</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveTab('DEPOSIT');
                  if (navigate) navigate('/trader/crypto/deposit');
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                <span>Proceed to Crypto Deposit (+3% Bonus)</span>
                <ArrowDownLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Action Card: Withdrawal */}
            <div className="bg-[#111827] border border-[#1F293D] hover:border-purple-500/40 rounded-2xl p-6 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Crypto Withdrawal (+1% Bonus)</h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Withdraw USDT directly to your PhonePe / UPI with a +1% platform bonus benefit. You receive 100% full payout for only 99% balance debited.
                </p>
              </div>

              <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-gray-400">
                  <span>Base Rate:</span>
                  <span className="text-white">₹105 / USDT</span>
                </div>
                <div className="flex justify-between text-purple-400">
                  <span>Bonus Benefit (1%):</span>
                  <span>+1% Platform Benefit</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Actual USDT Balance Debit:</span>
                  <span className="text-amber-400 font-bold">99% of Request</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold border-t border-[#1F293D] pt-1">
                  <span>Full Payout Obligation:</span>
                  <span>100% USDT Equivalent</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveTab('WITHDRAWAL');
                  if (navigate) navigate('/trader/crypto/withdrawal');
                }}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
              >
                <span>Proceed to Crypto Withdrawal (+1% Bonus)</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-3 text-xs text-emerald-300">
            <Info className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
            <div>
              <strong className="block text-white font-semibold">Crypto Policy:</strong>
              <span>
                All crypto deposits receive a +3% platform bonus upon Admin verification at the fixed platform rate of ₹105 / USDT (e.g. 100 USDT deposit = 103 USDT credited; 500 = 515; 1000 = 1030). Ensure you send exact USDT on TRON (TRC20) and supply your valid TXID. Crypto withdrawals enjoy a +1% platform bonus with 100% full payout obligation.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. CRYPTO DEPOSIT SECTION */}
      {activeTab === 'DEPOSIT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: Dynamic Deposit Calculation & Submission */}
          <div className="lg:col-span-7 bg-[#111827] border border-[#1F293D] rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                <span>CREATE CRYPTO DEPOSIT REQUEST</span>
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Enter any custom USDT amount to view real-time crediting and INR equivalent at the fixed ₹105 rate. Transfer exact USDT to the official TRC20 wallet and provide your TXID.
              </p>
            </div>

            {depositSuccessMsg && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>{depositSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmitDeposit} className="space-y-4">
              {/* Dynamic User Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Desired USDT Amount *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Enter any USDT amount (e.g. 50, 100, 125.50, 750, 1000)"
                    className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-4 py-3 text-white text-sm font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-4 top-3 text-xs text-emerald-400 font-bold font-mono">
                    USDT
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Enter any valid positive amount. Decimals and fractional tokens supported.
                </p>
              </div>

              {/* Dynamic 3% Bonus Live Calculation Card */}
              <div className="p-4 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-2.5 text-xs font-mono shadow-inner">
                <div className="flex justify-between text-gray-300">
                  <span>Deposit Amount:</span>
                  <span className="text-white font-bold text-sm">
                    {numDep > 0 ? numDep.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Amount to Send:</span>
                  <span className="text-white font-bold text-sm">
                    {numDep > 0 ? numDep.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>
                <div className="flex justify-between text-purple-400">
                  <span>Deposit Bonus (+3%):</span>
                  <span className="font-bold text-sm">
                    +{numDep > 0 ? depBonusAmountUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>
                <div className="flex justify-between text-emerald-400 border-t border-[#1F293D] pt-2 font-bold text-sm">
                  <span>Total Wallet Credit (103%):</span>
                  <span className="text-emerald-400 font-bold text-base">
                    {numDep > 0 ? depExpectedCreditUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>
                <div className="flex justify-between text-blue-400 border-t border-[#1F293D] pt-2 font-bold text-sm">
                  <span>INR Equivalent (at ₹{fixedRate} / USDT):</span>
                  <span className="text-blue-300 font-bold text-base">
                    ₹{numDep > 0 ? depInrEquivalent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 leading-relaxed font-sans mt-1">
                  <strong>3% Deposit Bonus:</strong> You receive 103% of your verified USDT deposit credited to your balance upon Admin verification (+3% bonus funded by platform). Platform conversion rate is fixed at ₹{fixedRate} / USDT.
                </div>
              </div>

              {/* Blockchain Network Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Blockchain Network *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['TRC20', 'ERC20'].map((net) => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setDepositNetwork(net)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition-all border text-center ${
                        depositNetwork === net
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30'
                          : 'bg-[#0B0F19] text-gray-400 border-[#1F293D] hover:text-white hover:border-emerald-500/40'
                      }`}
                    >
                      {net} {net === 'TRC20' ? '(Tron)' : '(Ethereum)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Hash / TXID */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-300">
                    Transaction Hash / TXID *
                  </label>
                  <span className="text-[10px] text-gray-400">Blockchain Hash</span>
                </div>
                <input
                  type="text"
                  required
                  value={depositTxHash}
                  onChange={(e) => setDepositTxHash(e.target.value)}
                  placeholder="Paste transaction hash / TXID from your wallet or exchange"
                  className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-4 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Required to verify your transaction on the blockchain explorer.
                </p>
              </div>

              {/* Payment Proof Upload (Optional) */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-300">
                    Upload Payment Screenshot / Receipt (Optional)
                  </label>
                  <span className="text-[10px] text-gray-400">Max 5MB</span>
                </div>
                <div className="border-2 border-dashed border-[#1F293D] hover:border-emerald-500/50 rounded-xl p-3.5 text-center cursor-pointer transition-colors bg-[#0B0F19]">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleDepositFileChange}
                    className="hidden"
                    id="deposit-proof-upload"
                  />
                  <label htmlFor="deposit-proof-upload" className="cursor-pointer block space-y-1.5">
                    <Upload className="w-5 h-5 mx-auto text-gray-400" />
                    <span className="text-xs text-gray-300 block font-medium">
                      {depositProofFile ? depositProofFile.name : 'Click to select or drop transfer receipt (JPEG, PNG, WebP)'}
                    </span>
                    <span className="text-[10px] text-gray-500 block">Optional supporting proof image</span>
                  </label>
                </div>

                {depositProofPreview && (
                  <div className="mt-3 flex items-center justify-between p-2.5 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#1F293D] bg-black">
                        <img src={depositProofPreview} alt="Receipt Preview" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-xs text-gray-300 font-mono truncate max-w-[200px]">
                        {depositProofFile?.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDepositProofFile(null);
                        setDepositProofPreview('');
                      }}
                      className="p-1.5 text-rose-400 hover:text-rose-300 text-xs"
                      title="Remove receipt"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!activeQR || submittingDeposit || numDep <= 0 || !depositTxHash.trim()}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>
                  {!activeQR
                    ? 'No Active USDT Deposit Wallet Available'
                    : submittingDeposit
                    ? 'Submitting Deposit Request...'
                    : numDep > 0
                    ? `Submit Deposit Request (+3% Bonus: Credit ${depExpectedCreditUsdt.toFixed(2)} USDT)`
                    : 'Enter an Amount to Submit Deposit'}
                </span>
              </button>
            </form>
          </div>

          {/* Right Card: Official USDT Payment QR Scanner */}
          {!activeQR ? (
            <div className="lg:col-span-5 bg-[#111827] border border-amber-500/30 rounded-2xl p-8 shadow-xl space-y-4 text-center flex flex-col items-center justify-center min-h-[350px]">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-white">
                  No active USDT deposit wallet is currently available.
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                  USDT deposits are temporarily suspended because no active deposit wallet has been configured by administration. Please check back shortly or contact 24/7 support.
                </p>
              </div>
              <div className="p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D] text-[11px] text-gray-500 font-mono w-full">
                Deposit Gateway Status: Inactive / Pending Admin Configuration
              </div>
            </div>
          ) : (
            <div className="lg:col-span-5 bg-[#111827] border border-[#1F293D] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>Official USDT Payment QR Scanner</span>
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  {activeQR.network || depositNetwork}
                </span>
              </div>

              {/* QR Code Container */}
              <div className="bg-white p-4 rounded-2xl mx-auto w-56 h-56 flex items-center justify-center shadow-inner">
                <img
                  src={activeQR.qrImageUrl}
                  alt="Official USDT Payment QR Scanner"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Recipient Details & Dynamic Original Amount Display */}
              <div className="p-3.5 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-gray-400">
                  <span>Configured Blockchain Network:</span>
                  <span className="text-white font-semibold font-mono">{activeQR.network || depositNetwork}</span>
                </div>

                <div className="flex flex-col gap-1 text-gray-400 border-t border-[#1F293D] pt-2">
                  <span>Destination Wallet Address:</span>
                  <div className="flex items-center justify-between gap-1.5 p-2 bg-[#111827] border border-[#1F293D] rounded-lg font-mono text-emerald-400 font-bold text-[11px] break-all">
                    <span>{activeQR.walletAddress}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeQR.walletAddress, 'wallet')}
                      className="p-1 hover:text-white shrink-0"
                      title="Copy Address"
                    >
                      {copiedText === 'wallet' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-gray-400 border-t border-[#1F293D] pt-2">
                  <span>Amount to Send:</span>
                  <span className="text-white font-bold font-mono text-sm">
                    {numDep > 0 ? numDep.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center text-purple-400 border-t border-[#1F293D] pt-2 font-semibold">
                  <span>Deposit Bonus (+3%):</span>
                  <span className="font-mono text-sm">
                    +{numDep > 0 ? depBonusAmountUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center text-emerald-400 border-t border-[#1F293D] pt-2 font-semibold">
                  <span>Total USDT to Credit:</span>
                  <span className="font-mono text-sm font-bold">
                    {numDep > 0 ? depExpectedCreditUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center text-blue-400 border-t border-[#1F293D] pt-2 font-bold text-sm">
                  <span>INR Equivalent (at ₹{fixedRate} / USDT):</span>
                  <span className="font-mono text-base text-blue-300">
                    ₹{numDep > 0 ? depInrEquivalent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                Scan the official USDT payment QR code or copy the wallet address above. Send exact amount in <strong>{activeQR.network || depositNetwork}</strong>. After submitting, copy your transaction hash (TXID) into the form on the left.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 6. CRYPTO WITHDRAWAL SECTION */}
      {activeTab === 'WITHDRAWAL' && (
        <div className="max-w-2xl mx-auto bg-[#111827] border border-[#1F293D] rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Crypto Withdrawal (+1% Bonus)
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Select a fixed USDT withdrawal amount. Receive <strong className="text-white">100% full payout obligation</strong> (₹{rates.baseRate}/USDT), while only <strong className="text-purple-400">99% is debited</strong> from your crypto balance. The 1% bonus is platform-funded benefit!
            </p>
          </div>

          {withdrawalSuccessMsg && (
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
              <span>{withdrawalSuccessMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmitWithdrawal} className="space-y-5">
            {/* Task 2: 10 Fixed USDT Withdrawal Buttons */}
            <div>
              <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                <span className="font-semibold text-gray-200">
                  Select Crypto Withdrawal Amount *
                </span>
                <span>
                  Available Balance:{' '}
                  <strong className="text-emerald-400 font-mono">
                    {wallet?.availableBalance || '0.00'} USDT
                  </strong>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {FIXED_WITHDRAWAL_AMOUNTS.map((amt) => {
                  const isSelected = parseFloat(withdrawalAmount) === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setWithdrawalAmount(amt.toString())}
                      className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition-all border text-center ${
                        isSelected
                          ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                          : 'bg-[#0B0F19] text-gray-300 border-[#1F293D] hover:border-purple-500/50 hover:text-white'
                      }`}
                    >
                      {amt.toLocaleString()} USDT
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Read-only Amount Display */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Selected Withdrawal Amount (Read-Only) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  required
                  value={withdrawalAmount ? `${withdrawalAmount} USDT` : ''}
                  placeholder="Select a fixed withdrawal amount above"
                  className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-4 py-3 text-white text-sm font-mono font-bold cursor-not-allowed focus:outline-none"
                />
                <span className="absolute right-4 top-3 text-xs text-purple-400 font-bold font-mono">
                  Read-Only
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Custom amounts are disallowed. Choose one of the 10 fixed buttons above.
              </p>
            </div>

            {/* Task 3: Automatic 1% Bonus Calculation Card */}
            {numWd > 0 && (
              <div className="p-4 bg-[#0B0F19] border border-purple-500/30 rounded-xl space-y-2.5 text-xs font-mono shadow-inner">
                <div className="flex justify-between text-gray-400">
                  <span>Requested Withdrawal Amount:</span>
                  <span className="text-white font-bold">{numWd.toFixed(6)} USDT</span>
                </div>
                <div className="flex justify-between text-purple-400">
                  <span className="flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-purple-400" />
                    Withdrawal Bonus (+1%):
                  </span>
                  <span className="font-bold">+{wdBonusUsdt.toFixed(6)} USDT</span>
                </div>
                <div className="flex justify-between text-amber-300 border-t border-[#1F293D] pt-2">
                  <span>Actual USDT Balance Debit:</span>
                  <span className="font-bold text-sm">{wdDebitUsdt.toFixed(6)} USDT</span>
                </div>
                <div className="border-t border-[#1F293D] pt-2 flex justify-between text-sm font-bold text-emerald-400">
                  <span>Full Payout Obligation:</span>
                  <span className="text-white font-mono">
                    {numWd.toFixed(2)} USDT (<span className="text-emerald-400">₹{wdFinalPayout.toLocaleString('en-IN')}</span>)
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 leading-relaxed font-sans mt-1">
                  <strong>Platform-Funded Benefit:</strong> You receive the full requested payout of ₹{wdFinalPayout.toLocaleString('en-IN')}, while only {wdDebitUsdt.toFixed(2)} USDT (99%) is debited from your platform crypto balance.
                </div>
              </div>
            )}

            {/* Balance Validation Notice */}
            {numWd > 0 && !hasSufficientBalance && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>
                  Insufficient available balance. You need at least <strong>{wdDebitUsdt.toFixed(2)} USDT</strong> available (99% balance debit). Your available balance is <strong>{availBal.toFixed(2)} USDT</strong>.
                </span>
              </div>
            )}

            {/* Task 4: PhonePe / UPI QR Upload */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  TRC 20 QR code
                </label>
                <span className="text-[10px] text-gray-400">(JPG, JPEG, PNG, WebP ≤ 5MB)</span>
              </div>

              {!withdrawalQrFile ? (
                <div className="border-2 border-dashed border-[#1F293D] hover:border-purple-500/50 rounded-xl p-4 text-center cursor-pointer transition-colors bg-[#0B0F19]">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleWithdrawalFileChange}
                    className="hidden"
                    id="withdrawal-qr-upload"
                  />
                  <label htmlFor="withdrawal-qr-upload" className="cursor-pointer block space-y-2">
                    <QrCode className="w-6 h-6 mx-auto text-gray-400" />
                    <span className="text-xs text-gray-300 block font-medium">
                      Upload QR Code
                    </span>
                    <span className="text-[10px] text-gray-500 block">Max file size: 5MB</span>
                  </label>
                </div>
              ) : (
                <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-white p-1 rounded-lg shrink-0">
                      <img src={withdrawalQrPreview} alt="Trader QR Preview" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-xs space-y-0.5">
                      <span className="font-semibold text-white block truncate max-w-[200px]">
                        {withdrawalQrFile.name}
                      </span>
                      <span className="text-gray-400 text-[11px] block">
                        {(withdrawalQrFile.size / 1024).toFixed(1)} KB • QR Code
                      </span>
                      <span className="text-emerald-400 text-[10px] font-semibold block">QR Attached</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="withdrawal-qr-replace"
                      className="px-2.5 py-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs cursor-pointer"
                    >
                      Replace
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleWithdrawalFileChange}
                        className="hidden"
                        id="withdrawal-qr-replace"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawalQrFile(null);
                        setWithdrawalQrPreview('');
                      }}
                      className="p-1.5 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 text-xs"
                      title="Remove QR"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Task 5: Payment Address / UPI ID Field */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  Wallet Address
                </label>
                <span className="text-[10px] text-gray-400">e.g. yourname@upi</span>
              </div>
              <input
                type="text"
                value={withdrawalUpiId}
                onChange={(e) => setWithdrawalUpiId(e.target.value)}
                placeholder="e.g. yourname@upi"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-4 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                At least one payment destination (QR image or UPI ID) is required. You can provide both.
              </p>
            </div>

            <button
              type="submit"
              disabled={
                submittingWithdrawal ||
                numWd < 1 ||
                !hasSufficientBalance ||
                (!withdrawalQrFile && (!withdrawalUpiId || !withdrawalUpiId.trim()))
              }
              className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>
                {submittingWithdrawal
                  ? 'Reserving 99% USDT & Submitting...'
                  : numWd > 0
                  ? `Submit Withdrawal (Receive Full ₹${wdFinalPayout.toLocaleString('en-IN')})`
                  : 'Select an Amount to Withdraw'}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* 7. TRANSACTION HISTORY TAB */}
      {activeTab === 'HISTORY' && (
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Your Crypto Transfers & Requests</h3>
            <span className="text-xs text-gray-400">{transactions.length} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                  <th className="p-4">Request ID</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">USDT Amount</th>
                  <th className="p-4">Bonus Benefit</th>
                  <th className="p-4">Balance Impact</th>
                  <th className="p-4">Full Settlement / Credit</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F293D]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-400">Loading your transactions...</td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-500">
                      No crypto transfer requests found. Click 'Crypto Deposit' or 'Crypto Withdrawal' to start.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isWd = tx.transactionType === 'WITHDRAWAL';
                    const numAmt = tx.depositAmountUSDT || tx.requestedUSDT || tx.usdtAmount || 0;
                    const bonusUsdt = tx.bonusUSDT !== undefined
                      ? tx.bonusUSDT
                      : (tx.bonusAmountUSDT !== undefined
                        ? tx.bonusAmountUSDT
                        : (isWd ? Math.round(numAmt * 0.01 * 1000000) / 1000000 : Math.round(numAmt * 0.03 * 1000000) / 1000000));
                    const debitUsdt = tx.balanceDebitUSDT !== undefined
                      ? tx.balanceDebitUSDT
                      : (isWd ? Math.round(numAmt * 0.99 * 1000000) / 1000000 : numAmt);
                    const creditUsdt = tx.totalCreditUSDT !== undefined
                      ? tx.totalCreditUSDT
                      : (tx.creditedAmountUSDT !== undefined
                        ? tx.creditedAmountUSDT
                        : (isWd ? 0 : Math.round(numAmt * 1.03 * 1000000) / 1000000));
                    const inrVal = tx.inrEquivalent !== undefined ? tx.inrEquivalent : Math.round(numAmt * (tx.fixedRate || 105) * 100) / 100;

                    return (
                      <tr key={tx._id} className="hover:bg-[#151D2F]">
                        <td className="p-4 font-mono font-semibold text-white">{tx.requestId}</td>
                        <td className="p-4">
                          <span
                            className={`font-semibold ${
                              isWd ? 'text-purple-400' : 'text-emerald-400'
                            }`}
                          >
                            {isWd ? 'WITHDRAWAL' : 'DEPOSIT'}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-white font-mono">{numAmt.toFixed(2)} USDT</td>
                        <td className="p-4 font-mono">
                          {isWd ? (
                            <span className="text-purple-400 font-bold">
                              +1% Bonus (+{bonusUsdt.toFixed(2)} USDT)
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold">
                              +3% Bonus (+{bonusUsdt.toFixed(2)} USDT)
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-mono">
                          {isWd ? (
                            <span className="text-amber-300 font-bold">-{debitUsdt.toFixed(2)} USDT (99% Debit)</span>
                          ) : (
                            <span className="text-emerald-400 font-bold">
                              {tx.status === 'COMPLETED' ? `+${creditUsdt.toFixed(2)} USDT (Credited)` : `+${creditUsdt.toFixed(2)} USDT (Pending)`}
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-400">
                          {isWd ? `₹${tx.finalAmount?.toLocaleString('en-IN')}` : `${creditUsdt.toFixed(2)} USDT (₹${inrVal.toLocaleString('en-IN')})`}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={tx.status} />
                        </td>
                        <td className="p-4 text-gray-400">{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedTx(tx);
                              setDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-[#0B0F19] hover:bg-[#1F293D] text-gray-300 hover:text-white"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedTx && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Crypto Transfer Details (${selectedTx.requestId})`}
        >
          {(() => {
            const isDep = selectedTx.transactionType === 'DEPOSIT';
            const numAmt = selectedTx.depositAmountUSDT || selectedTx.requestedUSDT || selectedTx.usdtAmount || 0;
            const bonusAmt = selectedTx.bonusUSDT !== undefined
              ? selectedTx.bonusUSDT
              : (selectedTx.bonusAmountUSDT !== undefined
                ? selectedTx.bonusAmountUSDT
                : (isDep ? Math.round(numAmt * 0.03 * 1000000) / 1000000 : Math.round(numAmt * 0.01 * 1000000) / 1000000));
            const credAmt = selectedTx.totalCreditUSDT !== undefined && selectedTx.totalCreditUSDT > 0
              ? selectedTx.totalCreditUSDT
              : Math.round(numAmt * 1.03 * 1000000) / 1000000;
            const inrVal = selectedTx.inrEquivalent !== undefined
              ? selectedTx.inrEquivalent
              : Math.round(numAmt * (selectedTx.fixedRate || 105) * 100) / 100;

            return (
              <div className="space-y-4 text-xs font-mono">
                {/* Specific Status Banners for Deposit Requests */}
                {isDep && selectedTx.status === 'PENDING_VERIFICATION' && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1 text-amber-300">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Pending Verification</span>
                    </div>
                    <p className="text-[11px] text-gray-300">
                      Your Crypto Deposit Request has been submitted successfully and is waiting for Admin verification.
                    </p>
                    <p className="text-[10px] text-gray-400">
                      No balance has been credited yet. Upon verification, your deposit and +3% bonus will be credited to your USDT wallet.
                    </p>
                  </div>
                )}

                {isDep && selectedTx.status === 'COMPLETED' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-emerald-300">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Deposit Request Approved</span>
                    </div>
                    <p className="text-[11px] text-gray-300">
                      Your Crypto Deposit Request has been approved. Your deposit amount and 3% bonus have been successfully credited to your USDT wallet.
                    </p>
                    <div className="space-y-1 text-[11px] text-gray-300 bg-[#0B0F19] p-2.5 rounded-lg border border-[#1F293D]">
                      <div className="flex justify-between">
                        <span>Deposit Amount:</span>
                        <span className="text-white font-bold font-mono">{numAmt.toFixed(2)} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Bonus (3%):</span>
                        <span className="text-emerald-400 font-bold font-mono">+{bonusAmt.toFixed(2)} USDT</span>
                      </div>
                      <div className="flex justify-between font-bold text-emerald-300 border-t border-[#1F293D] pt-1">
                        <span>Total Credited to Wallet:</span>
                        <span className="font-mono">{credAmt.toFixed(2)} USDT</span>
                      </div>
                      {wallet && (
                        <div className="flex justify-between text-blue-300 border-t border-[#1F293D] pt-1">
                          <span>Updated Wallet Balance:</span>
                          <span className="font-bold font-mono">{wallet.availableBalance} USDT</span>
                        </div>
                      )}
                      {(selectedTx.approvedAt || selectedTx.verifiedAt) && (
                        <div className="flex justify-between text-gray-400">
                          <span>Approval Date:</span>
                          <span>{new Date(selectedTx.approvedAt || selectedTx.verifiedAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isDep && selectedTx.status === 'REJECTED' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-rose-300">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <X className="w-4 h-4 text-rose-400" />
                      <span>Deposit Request Rejected</span>
                    </div>
                    <p className="text-[11px] text-gray-300">
                      Your Crypto Deposit Request has been rejected by Admin.
                    </p>
                    <div className="mt-1 p-2 bg-[#0B0F19] rounded-lg border border-[#1F293D] text-[11px] text-rose-300">
                      <strong>Rejection Reason:</strong> {selectedTx.rejectionReason || 'No reason provided.'}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Zero balance has been credited to your USDT wallet.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D]">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Type</span>
                    <span className={`font-bold ${isDep ? 'text-emerald-400' : 'text-purple-400'}`}>
                      {selectedTx.transactionType}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Status</span>
                    <StatusBadge status={selectedTx.status} />
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">
                      {isDep ? 'Deposit USDT' : 'Requested USDT'}
                    </span>
                    <span className="text-white font-bold">
                      {numAmt.toFixed(2)} USDT
                    </span>
                  </div>
                  {!isDep ? (
                    <div>
                      <span className="text-gray-400 block text-[11px]">Actual Balance Debit</span>
                      <span className="text-amber-300 font-bold">
                        {(selectedTx.balanceDebitUSDT || selectedTx.usdtAmount * 0.99).toFixed(2)} USDT (99%)
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-400 block text-[11px]">3% Deposit Bonus</span>
                      <span className="text-emerald-400 font-bold">
                        +{bonusAmt.toFixed(2)} USDT (+3%)
                      </span>
                    </div>
                  )}
                  {!isDep ? (
                    <div>
                      <span className="text-gray-400 block text-[11px]">1% Platform Bonus</span>
                      <span className="text-purple-400 font-bold">
                        +{(selectedTx.bonusUSDT || selectedTx.usdtAmount * 0.01).toFixed(2)} USDT Benefit
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-400 block text-[11px]">Total USDT Credited</span>
                      <span className="text-emerald-400 font-bold font-mono">
                        {credAmt.toFixed(2)} USDT
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 block text-[11px]">Fixed Platform Rate</span>
                    <span className="text-blue-400 font-bold">
                      ₹{selectedTx.fixedRate || 105} / USDT
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">
                      {isDep ? 'INR Equivalent (at ₹105)' : 'Full INR Payout'}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {isDep
                        ? `₹${inrVal.toLocaleString('en-IN')}`
                        : `₹${selectedTx.finalAmount?.toLocaleString('en-IN')}`}
                    </span>
                  </div>
                </div>

                {selectedTx.network && (
                  <div className="p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D] flex justify-between">
                    <span className="text-gray-400 text-[11px]">Blockchain Network</span>
                    <span className="text-white font-bold">{selectedTx.network}</span>
                  </div>
                )}

                {(selectedTx.txHash || selectedTx.utr) && (
                  <div className="p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D]">
                    <span className="text-gray-400 block text-[11px]">
                      {isDep ? 'Transaction Hash (TXID)' : 'Submitted UTR / Reference'}
                    </span>
                    <span className="text-white font-bold break-all">{selectedTx.txHash || selectedTx.utr}</span>
                  </div>
                )}

                {selectedTx.paymentProofUrl && (
                  <div>
                    <span className="text-gray-400 block text-[11px] mb-1">Your Payment Proof</span>
                    <div className="max-h-48 rounded-xl overflow-hidden border border-[#1F293D]">
                      <img src={selectedTx.paymentProofUrl} alt="Payment Proof" className="w-full object-contain max-h-48" />
                    </div>
                  </div>
                )}

                {selectedTx.traderQrImageUrl && (
                  <div>
                    <span className="text-gray-400 block text-[11px] mb-1">Your Submitted Payout QR</span>
                    <div className="w-36 h-36 bg-white p-2 rounded-xl mx-auto border border-[#1F293D]">
                      <img src={selectedTx.traderQrImageUrl} alt="Trader QR" className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}

                {selectedTx.payoutReference && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300">
                    <span className="block text-[11px] font-bold">Payout Reference / UTR</span>
                    <span className="text-white font-bold">{selectedTx.payoutReference}</span>
                  </div>
                )}

                {!isDep && selectedTx.rejectionReason && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300">
                    <span className="block text-[11px] font-bold">Rejection Reason</span>
                    <span>{selectedTx.rejectionReason}</span>
                  </div>
                )}

                <div className="pt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setDetailModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};
