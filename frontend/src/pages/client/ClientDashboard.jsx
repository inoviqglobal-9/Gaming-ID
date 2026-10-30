import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Clock,
  PieChart as PieIcon,
  Activity,
  Layers,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { traderService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';

export const ClientDashboard = ({ navigate }) => {
  const { user, balances, refreshUser } = useAuth();
  const [period, setPeriod] = useState('7D'); // '7D' or '30D'
  const [summary, setSummary] = useState(null);
  const [volumeData, setVolumeData] = useState([]);
  const [statusData, setStatusData] = useState({ total: 0, breakdown: [] });
  const [recentApplications, setRecentApplications] = useState([]);
  const [usdtWallet, setUsdtWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async (activePeriod = period, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const [sumRes, volRes, statRes, appRes, walletRes] = await Promise.all([
        traderService.getDashboardSummary(activePeriod),
        traderService.getDashboardVolume(activePeriod),
        traderService.getTransactionStatus(activePeriod),
        traderService.getRecentApplications(10),
        traderService.getUsdtWallet('NORMAL').catch(() => null),
      ]);

      if (sumRes && sumRes.success) setSummary(sumRes.data);
      if (volRes && volRes.success) setVolumeData(volRes.data);
      if (statRes && statRes.success) setStatusData(statRes.data);
      if (appRes && appRes.success) setRecentApplications(appRes.data);
      if (walletRes && (walletRes.success || walletRes.availableBalance !== undefined)) {
        setUsdtWallet(walletRes);
      }
    } catch (err) {
      console.warn('[ClientDashboard Load Error]:', err.message);
    } finally {
      setLoading(false);
      setWalletLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    fetchDashboardData(period);

    // Live Socket.IO connection for targeted real-time updates
    let socket = null;
    if (user && user._id) {
      try {
        socket = io('/', { transports: ['websocket', 'polling'] });
        socket.emit('join_trader_room', user._id);
        socket.on('deposit_status_update', () => {
          fetchDashboardData(period, true);
          refreshUser();
        });
        socket.on('balance_update', () => {
          fetchDashboardData(period, true);
          refreshUser();
        });
        socket.on('wallet_rate_updated', () => {
          fetchDashboardData(period, true);
        });
        socket.on('usdt_rate_updated', () => {
          fetchDashboardData(period, true);
        });
      } catch (err) {
        console.warn('[Trader Socket.IO Error]:', err);
      }
    }

    let es = null;
    try {
      es = new EventSource('/api/crypto/live-qr-stream');
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'BALANCE_UPDATE') {
            fetchDashboardData(period, true);
            refreshUser();
          }
        } catch (e) {}
      };
    } catch (e) {}

    const onFocus = () => {
      fetchDashboardData(period, true);
      refreshUser();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      if (es) es.close();
      if (socket) socket.disconnect();
      window.removeEventListener('focus', onFocus);
    };
  }, [period, fetchDashboardData, refreshUser, user]);

  const handlePeriodChange = (newPeriod) => {
    if (newPeriod !== period) {
      setPeriod(newPeriod);
    }
  };

  const handleManualRefresh = async () => {
    await Promise.all([refreshUser(), fetchDashboardData(period, true)]);
  };

  // Custom Chart Tooltip
  const CustomChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0E1524] border border-[#1F293D] p-3 rounded-xl shadow-2xl text-xs space-y-1">
          <p className="font-semibold text-gray-300 border-b border-[#1F293D] pb-1 font-mono">{label}</p>
          {payload.map((entry, index) => (
            <div key={`tooltip-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-white">
                ₹{Number(entry.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* 1. Dashboard Heading & Date Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1F293D] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-blue-400">
              Trader Dashboard
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Trader Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Performance analytics • Real-time updates</p>
        </div>

        {/* Filters and Refresh button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* 7D and 30D Filter Buttons */}
          <div className="flex items-center bg-[#111827] border border-[#1F293D] p-1 rounded-xl">
            <button
              onClick={() => handlePeriodChange('7D')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === '7D'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              7D
            </button>
            <button
              onClick={() => handlePeriodChange('30D')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === '30D'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              30D
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh Live Analytics"
            className="p-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#151D2F] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Three Statistic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1 — USDT Balance (Phase 3) */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 relative overflow-hidden shadow-lg group hover:border-blue-500/30 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                USDT BALANCE
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1.5 font-mono tracking-tight">
                {walletLoading ? (
                  <span className="text-gray-500 text-lg">Loading...</span>
                ) : (
                  `${Number(usdtWallet?.availableBalance || balances?.USDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
                )}
              </h2>
              <p className="text-[11px] text-gray-400 mt-1">
                Available USDT Wallet Balance
              </p>
              <div className="mt-2.5 pt-2 border-t border-[#1F293D]/70 space-y-1 text-[11px] font-mono">
                <div className="text-gray-400 flex items-center justify-between">
                  <span>USDT Rate:</span>
                  <span className="text-blue-400 font-semibold">
                    ₹{usdtWallet?.valuationRate !== undefined
                      ? (Number(usdtWallet.valuationRate) % 1 === 0
                          ? Number(usdtWallet.valuationRate)
                          : Number(usdtWallet.valuationRate).toFixed(2))
                      : 105} / USDT
                  </span>
                </div>
                <div className="text-gray-300 flex items-center justify-between">
                  <span>INR Equivalent:</span>
                  <span className="text-emerald-400 font-bold">
                    ₹{Number(
                      usdtWallet?.inrEquivalent !== undefined
                        ? usdtWallet.inrEquivalent
                        : ((Number(usdtWallet?.availableBalance || balances?.USDT || 0)) * (Number(usdtWallet?.valuationRate) || 105))
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Security Deposit Balance Section */}
              <div className="mt-2.5 pt-2 border-t border-[#1F293D]/70">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    SECURITY DEPOSIT
                  </span>
                  <span className="font-bold text-amber-400 font-mono text-xs">
                    {Number(usdtWallet?.securityDepositBalance ?? summary?.balance?.securityDeposit ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Approved Security Deposit • Not Available for Withdrawal
                </p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1F293D] flex items-center justify-between">
            <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Real-time Synced
            </span>
          </div>
        </div>

        {/* Card 2 — Total Volume */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 relative overflow-hidden shadow-lg group hover:border-blue-500/30 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Total Volume ({period})
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-2 font-mono">
                ₹{(summary?.totalVolume || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <p className="text-[11px] text-gray-500 mt-1">
                Total Orders: {summary?.totalTransactions || 0}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1F293D] flex items-center justify-between text-[11px] text-gray-400">
            <span>PayIn & PayOut Aggregated</span>
            <span className="font-mono font-semibold text-gray-300">
              {summary?.totalConfirmed || 0} Confirmed
            </span>
          </div>
        </div>

        {/* Card 3 — Success Rate */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 relative overflow-hidden shadow-lg group hover:border-cyan-500/30 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                Success Rate
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-2 font-mono flex items-baseline gap-2">
                <span>{summary?.successRate || 0}%</span>
                <span className="text-xs text-cyan-400 font-sans font-medium">Verified</span>
              </h2>
              <p className="text-[11px] text-gray-500 mt-1">
                {summary?.totalConfirmed || 0} Confirmed Transactions
              </p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1F293D]">
            {/* Success percentage progress bar */}
            <div className="w-full bg-[#0B0F19] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, summary?.successRate || 0))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. PayIn and PayOut Summary Cards (Side-by-Side) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PayIn Card — Green Accent */}
        <div className="bg-[#111827] border-l-4 border-l-emerald-500 border-t border-r border-b border-[#1F293D] rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#1F293D]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ArrowDownToLine className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">PayIn Volume</h3>
                <span className="text-[10px] text-gray-500">Incoming Verified Payments</span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              INR
            </span>
          </div>

          <div className="mt-4">
            <h4 className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              ₹{(summary?.payIn?.volume || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F293D] grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-[#1F293D]">
              <span className="text-[10px] text-gray-500 block uppercase">Confirmed</span>
              <strong className="text-white font-mono text-sm">{summary?.payIn?.count || 0}</strong>
            </div>
            <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-[#1F293D]">
              <span className="text-[10px] text-gray-500 block uppercase">Total Orders</span>
              <strong className="text-white font-mono text-sm">{summary?.payIn?.total || 0}</strong>
            </div>
            <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-[#1F293D]">
              <span className="text-[10px] text-gray-500 block uppercase">Success</span>
              <strong className="text-emerald-400 font-mono text-sm">{summary?.payIn?.successRate || 0}%</strong>
            </div>
          </div>
        </div>

        {/* PayOut Card — Red Accent */}
        <div className="bg-[#111827] border-l-4 border-l-rose-500 border-t border-r border-b border-[#1F293D] rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#1F293D]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <ArrowUpFromLine className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">PayOut Volume</h3>
                <span className="text-[10px] text-gray-500">Processed Outgoing Transfers</span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
              INR
            </span>
          </div>

          <div className="mt-4">
            <h4 className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              ₹{(summary?.payOut?.volume || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F293D] grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-[#1F293D]">
              <span className="text-[10px] text-gray-500 block uppercase">Completed</span>
              <strong className="text-white font-mono text-sm">{summary?.payOut?.count || 0}</strong>
            </div>
            <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-[#1F293D]">
              <span className="text-[10px] text-gray-500 block uppercase">Total Requests</span>
              <strong className="text-white font-mono text-sm">{summary?.payOut?.total || 0}</strong>
            </div>
            <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-[#1F293D]">
              <span className="text-[10px] text-gray-500 block uppercase">Success</span>
              <strong className="text-rose-400 font-mono text-sm">{summary?.payOut?.successRate || 0}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Charts Section: Volume Chart & Transaction Status Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Volume Chart (2 columns) */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1F293D] mb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">Volume Chart</h3>
              <p className="text-[11px] text-gray-400">Daily PayIn (Green) vs PayOut (Red) transaction trends</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>PayIn</span>
              </span>
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>PayOut</span>
              </span>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full">
            {volumeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                No volume records available for the selected {period} period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="payInGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="payOutGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F293D" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#6B7280"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={{ stroke: '#1F293D' }}
                  />
                  <YAxis
                    stroke="#6B7280"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={{ stroke: '#1F293D' }}
                    tickFormatter={(val) => (val >= 1000 ? `₹${val / 1000}k` : `₹${val}`)}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="payIn"
                    name="PayIn"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#payInGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="payOut"
                    name="PayOut"
                    stroke="#EF4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#payOutGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right: Transaction Status Chart (1 column) */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-[#1F293D] mb-4">
              <h3 className="text-sm font-bold text-white tracking-wide">Transaction Status</h3>
              <p className="text-[11px] text-gray-400">Order verification distribution</p>
            </div>

            <div className="h-48 w-full relative flex items-center justify-center">
              {statusData.total === 0 ? (
                <div className="text-center text-gray-500 text-xs">
                  <PieIcon className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <span>No transactions recorded yet</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData.breakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="count"
                    >
                      {statusData.breakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#111827" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name, item) => [
                        `${val} orders (${item.payload.percentage}%)`,
                        item.payload.status,
                      ]}
                      contentStyle={{
                        backgroundColor: '#0E1524',
                        borderColor: '#1F293D',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#F8FAFC',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Status Breakdown Legend List */}
          <div className="mt-4 pt-3 border-t border-[#1F293D] space-y-2">
            {statusData.breakdown.map((item) => (
              <div key={item.status} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-gray-300">{item.status}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-white">{item.count}</span>
                  <span className="text-[11px] text-gray-500 w-8 text-right font-mono">{item.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Recent Applications Table (Last 7 Days) */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#1F293D] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Recent Applications (Last 7 Days)</h3>
            <p className="text-[11px] text-gray-400">Authenticated client payment claims & deposits</p>
          </div>
          <button
            onClick={() => navigate('/applications')}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            View All
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0E1524] border-b border-[#1F293D] text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                <th className="p-4">Application ID</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4">Merchant</th>
                <th className="p-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {recentApplications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-gray-500 text-xs">
                    No recent applications found. Submit a PayIn request to begin trading.
                  </td>
                </tr>
              ) : (
                recentApplications.map((app) => (
                  <tr key={app.applicationId} className="hover:bg-[#151D2F] transition-colors">
                    <td className="p-4 font-mono font-semibold text-white">
                      {app.applicationId}
                    </td>
                    <td className="p-4 font-mono font-bold text-emerald-400">
                      {app.currency} {Number(app.amount).toFixed(2)}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="p-4 text-gray-300 font-medium">
                      {app.merchant}
                    </td>
                    <td className="p-4 text-gray-400 font-mono text-[11px]">
                      {new Date(app.created).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
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
