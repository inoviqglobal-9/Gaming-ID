import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
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
  }, [fetchAnalytics, filterDays]);

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
    </div>
  );
};
