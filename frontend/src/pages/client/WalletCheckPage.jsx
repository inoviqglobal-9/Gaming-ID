import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Copy,
  Check,
  AlertTriangle,
  RotateCw,
  ExternalLink,
  Wallet,
  Clock,
  ArrowRight,
  FileText,
  Printer,
  X,
  Info,
} from 'lucide-react';
import { walletCheckService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const WalletCheckPage = () => {
  const { user, balances, checkAuth } = useAuth();

  // Settings & state
  const [settings, setSettings] = useState({
    enabled: true,
    feeAmount: 3.0,
    feeCurrency: 'USDT',
    supportedNetworks: ['TRC-20', 'ERC-20', 'BTC'],
    providerName: 'TRM Labs',
    dailyCheckLimit: 50,
    availableUsdtBalance: 0,
    canAffordCheck: false,
  });

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Form Inputs
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState('TRC-20');
  const [formError, setFormError] = useState('');
  const [copiedText, setCopiedText] = useState('');

  // Modals
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Live IST Clock
  const [istTime, setIstTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      setIstTime(
        new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' IST'
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // TRC-20 Base58 format validator
  const validateAddressInput = useCallback((address, net) => {
    if (!address || !address.trim()) return '';
    const clean = address.trim();
    const cleanNet = (net || 'TRC-20').toUpperCase();

    if (cleanNet === 'TRC-20' || cleanNet === 'TRC20') {
      if (!clean.startsWith('T')) {
        return 'TRC-20 address must begin with the letter "T".';
      }
      if (clean.length !== 34) {
        return `TRC-20 address must be 34 characters (currently ${clean.length}).`;
      }
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(clean)) {
        return 'TRC-20 address contains invalid Base58 characters (0, O, I, l are disallowed).';
      }
    } else if (cleanNet === 'ERC-20' || cleanNet === 'ERC20') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
        return 'ERC-20 address must start with 0x followed by 40 hexadecimal characters.';
      }
    } else if (cleanNet === 'BTC') {
      if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(clean)) {
        return 'Invalid Bitcoin address format.';
      }
    }
    return '';
  }, []);

  // Fetch Settings and Check History
  const loadData = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) setIsRefreshing(true);
        else setLoading(true);

        const [settingsRes, historyRes] = await Promise.all([
          walletCheckService.getSettings().catch(() => null),
          walletCheckService.getHistory({ limit: 50 }).catch(() => null),
        ]);

        if (settingsRes && settingsRes.success) {
          setSettings((prev) => ({
            ...prev,
            ...settingsRes.data,
          }));
        }

        if (historyRes && historyRes.success) {
          setHistory(historyRes.data || []);
        }
      } catch (err) {
        console.error('[WalletCheckPage] Load error:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Address change
  const handleAddressChange = (e) => {
    const val = e.target.value;
    setWalletAddress(val);
    const err = validateAddressInput(val, network);
    setFormError(err);
  };

  // Handle Network change
  const handleNetworkChange = (e) => {
    const net = e.target.value;
    setNetwork(net);
    const err = validateAddressInput(walletAddress, net);
    setFormError(err);
  };

  // Effective USDT Balance
  const currentUsdtBalance = useMemo(() => {
    if (typeof settings.availableUsdtBalance === 'number') {
      return settings.availableUsdtBalance;
    }
    if (balances && typeof balances.USDT === 'number') {
      return balances.USDT;
    }
    return 0.0;
  }, [settings.availableUsdtBalance, balances]);

  const canAfford = currentUsdtBalance >= (settings.feeAmount || 3.0);
  const balanceAfterCharge = Math.max(0, currentUsdtBalance - (settings.feeAmount || 3.0));

  const isFormValid =
    walletAddress.trim().length > 0 &&
    !formError &&
    validateAddressInput(walletAddress, network) === '';

  // Open Confirmation Modal
  const handleOpenConfirm = (e) => {
    e.preventDefault();
    const err = validateAddressInput(walletAddress, network);
    if (err) {
      setFormError(err);
      return;
    }
    setConfirmModalOpen(true);
  };

  // Submit Check
  const handleConfirmAndCheck = async () => {
    try {
      setSubmitting(true);
      const res = await walletCheckService.checkWallet({
        walletAddress: walletAddress.trim(),
        network,
      });

      if (res.success) {
        setConfirmModalOpen(false);
        setWalletAddress('');
        await loadData();
        await checkAuth(); // Refresh navbar balance

        // Open detailed report modal immediately with the result
        setSelectedReport(res.data);
        setReportModalOpen(true);
      } else {
        alert(res.message || 'Screening request failed.');
      }
    } catch (err) {
      alert(err.message || 'Failed to complete wallet screening.');
    } finally {
      setSubmitting(false);
    }
  };

  // View Report
  const handleViewReport = async (item) => {
    try {
      const res = await walletCheckService.getReport(item.checkId || item._id);
      if (res.success) {
        setSelectedReport(res.data);
        setReportModalOpen(true);
      } else {
        setSelectedReport(item);
        setReportModalOpen(true);
      }
    } catch {
      setSelectedReport(item);
      setReportModalOpen(true);
    }
  };

  const copyToClipboard = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopiedText(txt);
    setTimeout(() => setCopiedText(''), 2000);
  };

  // Risk Category Badge styling
  const renderRiskBadge = (category) => {
    switch (category) {
      case 'LOW_RISK':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            Low Risk
          </span>
        );
      case 'MEDIUM_RISK':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            Medium Risk
          </span>
        );
      case 'HIGH_RISK':
      case 'CRITICAL_RISK':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            High Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/15 text-gray-400 border border-gray-500/30">
            Unknown
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#1F293D]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Wallet check
            </h1>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {user?.username || 'Trader'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-3xl leading-relaxed">
            AML check of an address before sending crypto. One check costs{' '}
            <strong className="text-white font-semibold">
              {Number(settings.feeAmount || 3.0).toFixed(2)} USDT
            </strong>{' '}
            and is charged only for a check that was actually performed.
          </p>
        </div>

        {/* Header Right: Balance Badge + Live Clock + Refresh */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* USDT Balance Badge */}
          <div className="flex items-center gap-2 bg-[#111827] border border-[#1F293D] px-3 py-1.5 rounded-lg text-xs font-mono">
            <Wallet className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-gray-400">USDT:</span>
            <span
              className={`font-bold ${
                canAfford ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              ${currentUsdtBalance.toFixed(2)}
            </span>
          </div>

          {/* Live IST Clock */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#111827] border border-[#1F293D] px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold">{istTime || 'IST'}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            title="Refresh history"
            className="p-2 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#151D2F] transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Service Disabled Notice */}
      {!settings.enabled && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-400 text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-white text-sm">Wallet Check is Temporarily Disabled</h4>
            <p className="mt-0.5 text-gray-300">
              The administrator has temporarily paused crypto AML screening. Please check back later.
            </p>
          </div>
        </div>
      )}

      {/* Main Horizontal Form (Matching Screenshot) */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-xl">
        <form onSubmit={handleOpenConfirm} className="space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Field 1: Wallet Address */}
            <div className="flex-1 relative">
              <input
                type="text"
                id="wallet-address-input"
                data-testid="wallet-address-input"
                value={walletAddress}
                onChange={handleAddressChange}
                placeholder="Wallet address"
                disabled={!settings.enabled || submitting}
                className={`w-full bg-[#0B0F19] border ${
                  formError ? 'border-rose-500/80 focus:border-rose-500' : 'border-[#1F293D] focus:border-blue-500'
                } rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors`}
              />
            </div>

            {/* Field 2: Network Dropdown */}
            <div className="w-full lg:w-44 shrink-0">
              <select
                id="network-select"
                data-testid="network-select"
                value={network}
                onChange={handleNetworkChange}
                disabled={!settings.enabled || submitting}
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-3 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
              >
                {(settings.supportedNetworks || ['TRC-20']).map((net) => (
                  <option key={net} value={net} className="bg-[#111827] text-white">
                    {net}
                  </option>
                ))}
              </select>
            </div>

            {/* Field 3: Check Wallet Button */}
            <div className="shrink-0">
              <button
                type="submit"
                id="check-wallet-btn"
                data-testid="check-wallet-btn"
                disabled={!settings.enabled || !isFormValid || submitting}
                className="w-full lg:w-auto px-6 py-3 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 min-h-[46px]"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Screening on-chain...</span>
                  </>
                ) : (
                  <span>
                    Check wallet ({Number(settings.feeAmount || 3.0).toFixed(2)} USDT)
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Inline Validation Error */}
          {formError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5 pl-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{formError}</span>
            </p>
          )}
        </form>
      </div>

      {/* Check History Section (Matching Screenshot) */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white tracking-tight">Check history</h2>

        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0E1524] border-b border-[#1F293D] text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="py-3.5 px-4">Address</th>
                  <th className="py-3.5 px-4">Network</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F293D]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <span>Loading check history...</span>
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                      No checks yet
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr
                      key={item._id || item.checkId}
                      className="hover:bg-[#151D2F] transition-colors"
                    >
                      {/* 1. Address */}
                      <td className="py-3.5 px-4 font-mono font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span title={item.walletAddress}>
                            {item.maskedAddress ||
                              (item.walletAddress.length > 12
                                ? `${item.walletAddress.slice(0, 6)}...${item.walletAddress.slice(-4)}`
                                : item.walletAddress)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(item.walletAddress)}
                            title="Copy full address"
                            className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
                          >
                            {copiedText === item.walletAddress ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 2. Network */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 font-mono">
                          {item.network}
                        </span>
                      </td>

                      {/* 3. Status */}
                      <td className="py-3.5 px-4">
                        {item.status === 'COMPLETED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Completed
                          </span>
                        ) : item.status === 'FAILED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* 4. Date */}
                      <td className="py-3.5 px-4 font-mono text-gray-300">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              timeZone: 'Asia/Kolkata',
                            })
                          : '-'}
                      </td>

                      {/* 5. Report */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleViewReport(item)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 transition-all inline-flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{item.status === 'COMPLETED' ? 'View' : 'Details'}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL 1: Confirm Wallet Check Modal (Task 6) */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#111827] border border-[#1F293D] rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setConfirmModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-bold text-white tracking-tight">Confirm Wallet Check</h3>
            <p className="text-xs text-gray-400 mt-1">
              Please review the screening details and fee deduction before proceeding.
            </p>

            <div className="mt-5 space-y-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl p-4 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Wallet Address:</span>
                <span className="text-white font-bold" title={walletAddress}>
                  {walletAddress.length > 18
                    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`
                    : walletAddress}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Network:</span>
                <span className="text-blue-400 font-bold">{network}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#1F293D] pt-2">
                <span className="text-gray-400">Screening Fee:</span>
                <span className="text-white font-bold">
                  {Number(settings.feeAmount || 3.0).toFixed(2)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Available Balance:</span>
                <span className="text-emerald-400 font-bold">
                  ${currentUsdtBalance.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[#1F293D] pt-2">
                <span className="text-gray-400">Balance After Charge:</span>
                <span
                  className={`font-bold ${
                    canAfford ? 'text-white' : 'text-rose-400'
                  }`}
                >
                  ${balanceAfterCharge.toFixed(2)} USDT
                </span>
              </div>
            </div>

            {/* Insufficient balance warning */}
            {!canAfford && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Insufficient balance</p>
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    Minimum {Number(settings.feeAmount || 3.0).toFixed(2)} USDT required for
                    wallet checking.
                  </p>
                  <a
                    href="/deposit-requests"
                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-bold mt-1.5"
                  >
                    <span>Deposit USDT</span>
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#151D2F] font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                id="modal-confirm-check-btn"
                data-testid="modal-confirm-check-btn"
                onClick={handleConfirmAndCheck}
                disabled={!canAfford || submitting}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Screening...</span>
                  </>
                ) : (
                  <span>Confirm & Check Wallet</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Detailed AML Report Modal (Task 8 & 10) */}
      {reportModalOpen && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-[#111827] border border-[#1F293D] rounded-2xl p-6 shadow-2xl relative text-left max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setReportModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  AML Screening Report
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  Check ID: {selectedReport.checkId}
                </p>
              </div>
            </div>

            {/* Risk Assessment Score Card */}
            <div className="mt-5 p-4 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Risk Category
                </p>
                <div className="mt-1">{renderRiskBadge(selectedReport.riskCategory)}</div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Risk Score
                </p>
                <p className="text-2xl font-extrabold text-white font-mono mt-0.5">
                  {selectedReport.riskScore !== null && selectedReport.riskScore !== undefined
                    ? `${selectedReport.riskScore} / 100`
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Screening Details Grid */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  Wallet Address
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white truncate font-medium" title={selectedReport.walletAddress}>
                    {selectedReport.walletAddress}
                  </span>
                  <button
                    onClick={() => copyToClipboard(selectedReport.walletAddress)}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1F293D]"
                  >
                    {copiedText === selectedReport.walletAddress ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  Blockchain Network
                </span>
                <span className="text-blue-400 font-bold">{selectedReport.network}</span>
              </div>

              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  AML Provider
                </span>
                <span className="text-gray-200 font-medium">{selectedReport.provider}</span>
              </div>

              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  Fee Charged
                </span>
                <span className="text-emerald-400 font-bold">
                  {selectedReport.feeAmount !== undefined
                    ? `${Number(selectedReport.feeAmount).toFixed(2)} ${selectedReport.feeCurrency || 'USDT'}`
                    : selectedReport.feeCharged || '3.00 USDT'}
                </span>
              </div>
            </div>

            {/* Risk Findings / Indicators */}
            <div className="mt-4 bg-[#0B0F19] border border-[#1F293D] rounded-xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
                Heuristic Findings & Counterparty Analysis
              </h4>
              <div className="space-y-2">
                {(selectedReport.riskIndicators || []).length > 0 ? (
                  selectedReport.riskIndicators.map((ind, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-[#111827] border border-[#1F293D] text-xs flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-white">{ind.category}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{ind.description}</p>
                        {ind.entity && (
                          <p className="text-[10px] text-gray-500 font-mono mt-1">
                            Counterparty: {ind.entity}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          ind.severity === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-400'
                            : ind.severity === 'MEDIUM'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {ind.severity}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400">No specific entity flags detected.</p>
                )}
              </div>
            </div>

            {/* Point-in-time Disclaimer */}
            <div className="mt-4 p-3 rounded-xl bg-[#0E1524] border border-[#1F293D] text-[11px] text-gray-400 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
              <span>
                {selectedReport.disclaimer ||
                  'Notice: This screening report reflects automated on-chain entity and heuristics analysis at the time of evaluation. It does not constitute legal or regulatory advice or an endorsement of counterparty legitimacy.'}
              </span>
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#151D2F] font-semibold text-xs transition-colors inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
