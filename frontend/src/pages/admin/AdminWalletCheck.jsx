import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Copy,
  Check,
  AlertTriangle,
  RotateCw,
  Settings,
  X,
  FileText,
  Printer,
  Info,
  DollarSign,
  Activity,
  Layers,
} from 'lucide-react';
import { walletCheckService } from '../../services/api';

export const AdminWalletCheck = () => {
  const [checks, setChecks] = useState([]);
  const [statistics, setStatistics] = useState({
    totalChecks: 0,
    completedChecks: 0,
    failedChecks: 0,
    highRiskChecks: 0,
    totalFeesCollected: 0,
  });

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [networkFilter, setNetworkFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [copiedText, setCopiedText] = useState('');

  // Settings form state
  const [settingsData, setSettingsData] = useState({
    enabled: true,
    feeAmount: 3.0,
    supportedNetworks: ['TRC-20', 'ERC-20', 'BTC'],
    providerName: 'TRM Labs',
    providerApiKey: '',
    providerApiUrl: 'https://api.trmlabs.com/public/v2/screening/addresses',
    dailyCheckLimit: 50,
    providerTimeout: 15,
    sandboxMode: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Fetch Data
  const loadData = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) setIsRefreshing(true);
        else setLoading(true);

        const [checksRes, statsRes] = await Promise.all([
          walletCheckService
            .getAllAdmin({
              search,
              network: networkFilter,
              status: statusFilter,
              limit: 50,
            })
            .catch(() => null),
          walletCheckService.getStatisticsAdmin().catch(() => null),
        ]);

        if (checksRes && checksRes.success) {
          setChecks(checksRes.data || []);
        }
        if (statsRes && statsRes.success) {
          setStatistics(statsRes.data || {});
        }
      } catch (err) {
        console.error('[AdminWalletCheck] Load error:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [search, networkFilter, statusFilter]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Settings Modal
  const handleOpenSettings = async () => {
    try {
      const res = await walletCheckService.getSettingsAdmin();
      if (res && res.success) {
        setSettingsData(res.data);
      }
      setSettingsModalOpen(true);
    } catch (err) {
      alert(`Failed to load settings: ${err.message}`);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await walletCheckService.updateSettingsAdmin(settingsData);
      if (res && res.success) {
        setSettingsModalOpen(false);
        alert('Wallet Check settings updated successfully.');
        await loadData();
      } else {
        alert(res?.message || 'Failed to update settings.');
      }
    } catch (err) {
      alert(err.message || 'Error updating settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // View Report Modal
  const handleOpenReport = async (check) => {
    try {
      const res = await walletCheckService.getByIdAdmin(check.checkId || check._id);
      if (res && res.success) {
        setSelectedReport(res.data);
      } else {
        setSelectedReport(check);
      }
    } catch {
      setSelectedReport(check);
    }
    setReportModalOpen(true);
  };

  const copyToClipboard = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopiedText(txt);
    setTimeout(() => setCopiedText(''), 2000);
  };

  // Risk Badge Helper
  const renderRiskBadge = (category) => {
    switch (category) {
      case 'LOW_RISK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3 h-3" />
            Low Risk
          </span>
        );
      case 'MEDIUM_RISK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            Medium Risk
          </span>
        );
      case 'HIGH_RISK':
      case 'CRITICAL_RISK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3 h-3" />
            High Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
            Unknown
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1F293D]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Wallet Check & AML Screening Desk
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Monitor trader on-chain address screenings, risk findings, and fee collections.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenSettings}
            id="admin-wallet-check-settings-btn"
            data-testid="admin-wallet-check-settings-btn"
            className="px-4 py-2 rounded-xl bg-[#162032] hover:bg-[#22334F] border border-blue-500/30 text-blue-400 hover:text-white font-semibold text-xs shadow-sm transition-all flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            <span>Wallet Check Settings</span>
          </button>

          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#151D2F] transition-colors"
            title="Refresh records"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Checks */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">
              Total Screenings
            </span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono mt-2">
            {statistics.totalChecks || 0}
          </p>
        </div>

        {/* Card 2: Completed */}
        <div className="bg-[#111827] border border-emerald-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
              Completed Checks
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-2">
            {statistics.completedChecks || 0}
          </p>
        </div>

        {/* Card 3: High Risk Flagged */}
        <div className="bg-[#111827] border border-rose-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-rose-400 text-xs font-bold uppercase tracking-wider">
              High Risk Flagged
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-rose-400 font-mono mt-2">
            {statistics.highRiskChecks || 0}
          </p>
        </div>

        {/* Card 4: Fees Collected */}
        <div className="bg-[#111827] border border-cyan-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider">
              Fees Collected
            </span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-extrabold text-cyan-400 font-mono mt-2">
            ${Number(statistics.totalFeesCollected || 0).toFixed(2)} USDT
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Trader, Wallet address, or Check ID..."
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="w-full sm:w-44">
            <select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Networks</option>
              <option value="TRC-20">TRC-20</option>
              <option value="ERC-20">ERC-20</option>
              <option value="BTC">BTC</option>
            </select>
          </div>

          <div className="w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Admin Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0E1524] border-b border-[#1F293D] text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <tr>
                <th className="py-3.5 px-4">Check ID</th>
                <th className="py-3.5 px-4">Trader</th>
                <th className="py-3.5 px-4">Address</th>
                <th className="py-3.5 px-4">Network</th>
                <th className="py-3.5 px-4">Provider</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Risk Category</th>
                <th className="py-3.5 px-4">Fee</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading screenings...</span>
                  </td>
                </tr>
              ) : checks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    No wallet check records found.
                  </td>
                </tr>
              ) : (
                checks.map((item) => (
                  <tr
                    key={item._id || item.checkId}
                    className="hover:bg-[#151D2F] transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {item.checkId}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-blue-400">
                      {item.clientId}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-gray-200">
                      <div className="flex items-center gap-2">
                        <span title={item.walletAddress}>
                          {item.maskedAddress ||
                            (item.walletAddress.length > 12
                              ? `${item.walletAddress.slice(0, 6)}...${item.walletAddress.slice(-4)}`
                              : item.walletAddress)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(item.walletAddress)}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1F293D]"
                        >
                          {copiedText === item.walletAddress ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {item.network}
                    </td>

                    <td className="py-3.5 px-4 text-gray-300">
                      {item.provider}
                    </td>

                    <td className="py-3.5 px-4">
                      {item.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Completed
                        </span>
                      ) : item.status === 'FAILED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Pending
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {renderRiskBadge(item.riskCategory)}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-400">
                      ${Number(item.feeAmount || 0).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-gray-400 text-[11px]">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          })
                        : '-'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenReport(item)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 transition-all inline-flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Report</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Admin Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[#111827] border border-[#1F293D] rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setSettingsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-bold text-white tracking-tight">
              Wallet Check Workflow Settings
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Configure screening fee, provider credentials, and access policies.
            </p>

            <form onSubmit={handleSaveSettings} className="mt-5 space-y-4">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                <div>
                  <p className="text-xs font-bold text-white">Enable Wallet Check Service</p>
                  <p className="text-[11px] text-gray-400">
                    Allow traders to submit crypto addresses for AML screening.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settingsData.enabled}
                  onChange={(e) =>
                    setSettingsData({ ...settingsData, enabled: e.target.checked })
                  }
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* Fee and Daily Limit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Screening Fee (USDT)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={settingsData.feeAmount}
                    onChange={(e) =>
                      setSettingsData({ ...settingsData, feeAmount: e.target.value })
                    }
                    className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Daily Limit / Trader
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settingsData.dailyCheckLimit}
                    onChange={(e) =>
                      setSettingsData({ ...settingsData, dailyCheckLimit: e.target.value })
                    }
                    className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* AML Provider Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  AML Screening Provider
                </label>
                <select
                  value={settingsData.providerName}
                  onChange={(e) =>
                    setSettingsData({ ...settingsData, providerName: e.target.value })
                  }
                  className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="TRM Labs">TRM Labs (Live Heuristics)</option>
                  <option value="Chainalysis">Chainalysis (KYT Oracle)</option>
                  <option value="Elliptic">Elliptic (Forensics Engine)</option>
                  <option value="Demo Compliance Sandbox">Demo Compliance Sandbox Engine</option>
                </select>
              </div>

              {/* Provider API Key */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  Provider API Key / Token
                </label>
                <input
                  type="password"
                  value={settingsData.providerApiKey || ''}
                  onChange={(e) =>
                    setSettingsData({ ...settingsData, providerApiKey: e.target.value })
                  }
                  placeholder="Enter licensed API key or leave blank for Sandbox"
                  className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Sandbox Mode Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                <div>
                  <p className="text-xs font-bold text-white">Enable Sandbox Demo Mode</p>
                  <p className="text-[11px] text-gray-400">
                    Provides deterministic testing evaluations when external API key is absent.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settingsData.sandboxMode}
                  onChange={(e) =>
                    setSettingsData({ ...settingsData, sandboxMode: e.target.checked })
                  }
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-300 hover:text-white font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Report Modal */}
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
                  Check ID: {selectedReport.checkId} | Trader: {selectedReport.clientId}
                </p>
              </div>
            </div>

            {/* Score Card */}
            <div className="mt-5 p-4 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between">
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

            {/* Details */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3 col-span-2">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  Full Wallet Address
                </span>
                <span className="text-white break-all font-medium select-all">
                  {selectedReport.walletAddress}
                </span>
              </div>

              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  Network
                </span>
                <span className="text-blue-400 font-bold">{selectedReport.network}</span>
              </div>

              <div className="bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-1">
                  Provider
                </span>
                <span className="text-gray-200 font-medium">{selectedReport.provider}</span>
              </div>
            </div>

            {/* Findings */}
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
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        {ind.severity}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400">No specific flags detected.</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-300 hover:text-white font-semibold text-xs inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-500"
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
