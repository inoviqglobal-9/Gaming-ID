import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Coins,
  X,
  CheckCircle2,
} from 'lucide-react';
import { adminService } from '../../services/api';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export const AdminDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [filterDays, setFilterDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // USDT Valuation Rate Management States
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [currentRateData, setCurrentRateData] = useState(null);
  const [newRateInput, setNewRateInput] = useState('');
  const [changeReasonInput, setChangeReasonInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [rateError, setRateError] = useState('');
  const [rateSuccess, setRateSuccess] = useState('');

  const fetchRateConfig = useCallback(async () => {
    try {
      const res = await adminService.getWalletRate();
      if (res && res.success && res.data) {
        setCurrentRateData(res.data);
      }
    } catch (err) {
      console.warn('[AdminDashboard Rate Error]:', err.message);
    }
  }, []);

  const handleOpenRateModal = () => {
    setRateError('');
    setRateSuccess('');
    setNewRateInput(currentRateData?.rateINRPerUSDT ? String(currentRateData.rateINRPerUSDT) : '105');
    setChangeReasonInput('');
    setRateModalOpen(true);
  };

  const handleSaveRate = async (e) => {
    e.preventDefault();
    setRateError('');
    setRateSuccess('');

    const parsedRate = Number(newRateInput);
    if (isNaN(parsedRate) || !isFinite(parsedRate) || parsedRate <= 0) {
      setRateError('Please enter a valid positive USDT valuation rate.');
      return;
    }

    if (parsedRate < 1 || parsedRate > 100000) {
      setRateError('USDT rate must be between ₹1 and ₹100,000.');
      return;
    }

    const rateStr = String(newRateInput).trim();
    if (rateStr.includes('.') && rateStr.split('.')[1].length > 4) {
      setRateError('Rate cannot have more than 4 decimal places.');
      return;
    }

    try {
      setSavingRate(true);
      const res = await adminService.updateWalletRate({
        newRate: parsedRate,
        changeReason: changeReasonInput.trim() || undefined,
      });

      if (res && res.success && res.data) {
        setCurrentRateData(res.data);
        setRateSuccess(`USDT rate successfully updated to ₹${Number(res.data.rateINRPerUSDT).toFixed(2)} and published!`);
        setTimeout(() => {
          setRateModalOpen(false);
          setRateSuccess('');
        }, 1200);
      } else {
        setRateError(res.message || 'Failed to update USDT rate.');
      }
    } catch (err) {
      setRateError(err.message || 'Failed to publish USDT rate.');
    } finally {
      setSavingRate(false);
    }
  };

  const fetchAnalytics = useCallback(async (days) => {
    try {
      setLoading(true);
      setError('');
      const res = await adminService.getAnalytics(days);
      if (res.success) {
        setAnalytics(res.analytics);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(filterDays);
    fetchRateConfig();
  }, [fetchAnalytics, fetchRateConfig, filterDays]);

  // Aggregate real database charts
  const chartData = [
    {
      name: 'INR (₹)',
      PayIn: (analytics?.volume?.inr?.payIn || []).reduce((acc, curr) => acc + curr.totalAmount, 0),
      Payout: (analytics?.volume?.inr?.payout || []).reduce((acc, curr) => acc + curr.totalAmount, 0),
    },
    {
      name: 'USDT ($)',
      PayIn: (analytics?.volume?.usdt?.payIn || []).reduce((acc, curr) => acc + curr.totalAmount, 0),
      Payout: (analytics?.volume?.usdt?.payout || []).reduce((acc, curr) => acc + curr.totalAmount, 0),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-gray-400 mt-1">
            Real-time telemetry and database-backed financial metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Manage USDT Rate Button */}
          <button
            type="button"
            onClick={handleOpenRateModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            title="Manage USDT Wallet Valuation Rate"
          >
            <Coins className="w-4 h-4 text-blue-200" />
            <span>Manage USDT Rate</span>
            {currentRateData?.rateINRPerUSDT && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-700/80 text-[10px] font-mono font-bold text-blue-100">
                ₹{Number(currentRateData.rateINRPerUSDT).toFixed(2)}
              </span>
            )}
          </button>

          {/* 7-day vs 30-day Time Horizon filter */}
          <div className="flex items-center gap-1.5 bg-[#111827] border border-[#1F293D] p-1 rounded-xl">
            <button
              onClick={() => setFilterDays(7)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterDays === 7 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setFilterDays(30)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterDays === 30 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Clients"
          value={loading ? '...' : analytics?.clients?.total || 0}
          subtext={`${analytics?.clients?.active || 0} Active • ${analytics?.clients?.suspended || 0} Suspended`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Pending Requests"
          value={loading ? '...' : analytics?.pendingSummary?.totalPending || 0}
          subtext={`${analytics?.pendingSummary?.payIns || 0} PayIns • ${analytics?.pendingSummary?.payouts || 0} Payouts`}
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Total PayIn Vol (INR)"
          value={
            loading
              ? '...'
              : `₹${(
                  analytics?.volume?.inr?.payIn?.reduce((acc, c) => acc + c.totalAmount, 0) || 0
                ).toLocaleString()}`
          }
          subtext="Processed via verified scanner"
          icon={ArrowDownToLine}
          color="green"
        />
        <StatCard
          title="Total Payout Vol (INR)"
          value={
            loading
              ? '...'
              : `₹${(
                  analytics?.volume?.inr?.payout?.reduce((acc, c) => acc + c.totalAmount, 0) || 0
                ).toLocaleString()}`
          }
          subtext="Executed withdrawals"
          icon={ArrowUpFromLine}
          color="purple"
        />
      </div>

      {/* Analytics Charts & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real Chart */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1F293D] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span>Volume Comparison ({filterDays} Days)</span>
            </h3>
            <span className="text-[11px] text-gray-400 font-mono">INR & USDT strictly separated</span>
          </div>

          <div className="h-64 w-full pt-4 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0E1524',
                    borderColor: '#1F293D',
                    borderRadius: '8px',
                    color: '#FFF',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="PayIn" fill="#10B981" radius={[4, 4, 0, 0]} name="PayIn Volume" />
                <Bar dataKey="Payout" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Payout Volume" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Administrative Audit Feed */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1F293D]">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Audit Feed</span>
            </h3>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Immutable</span>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(!analytics?.recentActivity || analytics.recentActivity.length === 0) ? (
              <p className="text-xs text-gray-500 text-center py-8">No recent security events logged.</p>
            ) : (
              analytics.recentActivity.map((log) => (
                <div key={log._id} className="text-xs border-b border-[#1F293D]/50 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{log.action}</span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    By <strong className="text-blue-400 font-mono">{log.performedByUsername}</strong>
                    {log.targetUsername ? ` on ${log.targetUsername}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Requests Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent PayIn Requests</h3>
          <span className="text-xs text-gray-500">Last 5 submissions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-3">Request ID</th>
                <th className="p-3">Client</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Reference / UTR</th>
                <th className="p-3">Status</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {(!analytics?.recentPayIns || analytics.recentPayIns.length === 0) ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500">
                    No PayIn requests logged yet.
                  </td>
                </tr>
              ) : (
                analytics.recentPayIns.map((pin) => (
                  <tr key={pin._id} className="hover:bg-[#151D2F]">
                    <td className="p-3 font-mono font-semibold text-white">{pin.requestId}</td>
                    <td className="p-3 text-gray-300">{pin.clientId}</td>
                    <td className="p-3 font-semibold text-emerald-400">
                      {pin.currency} {pin.amount.toFixed(2)}
                    </td>
                    <td className="p-3 font-mono text-gray-400">{pin.referenceId || 'Pending client submission'}</td>
                    <td className="p-3">
                      <StatusBadge status={pin.status} />
                    </td>
                    <td className="p-3 text-gray-500">{new Date(pin.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Manage USDT Wallet Valuation Rate */}
      {rateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-6 w-full max-w-md shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1F293D]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Manage USDT Wallet Valuation Rate
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    System-wide rate for Trader Available USDT valuation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error & Success alerts */}
            {rateError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rateError}</span>
              </div>
            )}
            {rateSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{rateSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveRate} className="space-y-4">
              {/* Field 1: Current USDT Rate */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Current USDT Rate
                </label>
                <div className="flex items-center justify-between bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5">
                  <span className="text-sm font-mono font-bold text-blue-400">
                    ₹{Number(currentRateData?.rateINRPerUSDT || 105).toFixed(2)} / USDT
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                    Version {currentRateData?.version || 1}
                  </span>
                </div>
              </div>

              {/* Field 2: New USDT Rate */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  New USDT Rate <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 font-mono text-sm">
                    ₹
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="100000"
                    required
                    value={newRateInput}
                    onChange={(e) => setNewRateInput(e.target.value)}
                    placeholder="e.g. 110.00"
                    className="w-full bg-[#162032] border border-[#22334F] focus:border-blue-500 rounded-xl pl-8 pr-16 py-2.5 text-sm text-white font-mono outline-none transition-colors"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400 text-xs font-mono">
                    / USDT
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Must be positive with up to 4 decimal places.
                </p>
              </div>

              {/* Dynamic Live Preview */}
              {Number(newRateInput) > 0 && (
                <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/20 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-gray-300">
                    <span className="text-gray-400">Valuation Preview:</span>
                    <span className="font-mono text-white font-semibold">
                      997 USDT = <strong className="text-emerald-400 font-bold">₹{(997 * Number(newRateInput)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Field 3: Change Reason */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Change Reason
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={changeReasonInput}
                  onChange={(e) => setChangeReasonInput(e.target.value)}
                  placeholder="e.g. Market valuation adjustment"
                  className="w-full bg-[#162032] border border-[#22334F] focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              {/* Field 4: Last Updated */}
              <div className="bg-[#162032]/60 border border-[#22334F]/50 rounded-xl p-3 text-[11px] text-gray-400 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span>Last Updated:</span>
                  <span className="font-mono text-gray-300">
                    {currentRateData?.updatedAt ? new Date(currentRateData.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Initial system setting'}
                  </span>
                </div>
                {currentRateData?.updatedByUsername && (
                  <div className="flex items-center justify-between">
                    <span>Updated By:</span>
                    <span className="font-mono text-gray-300">
                      {currentRateData.updatedByUsername}
                    </span>
                  </div>
                )}
                {currentRateData?.changeReason && (
                  <div className="flex items-center justify-between pt-1 text-[10px] text-gray-500 italic">
                    <span className="truncate max-w-[320px]">
                      "{currentRateData.changeReason}"
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons: Cancel and Save & Publish Rate */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setRateModalOpen(false)}
                  disabled={savingRate}
                  className="px-4 py-2.5 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#162032] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRate || !newRateInput || Number(newRateInput) <= 0}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-[#1F293D] disabled:text-gray-500 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {savingRate ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <span>Save & Publish Rate</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
