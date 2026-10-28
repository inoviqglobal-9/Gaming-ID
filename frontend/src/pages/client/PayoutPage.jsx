import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RotateCw,
  AlertCircle,
  ClipboardList,
  Play,
  History,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  X,
  Search,
} from 'lucide-react';
import { payoutService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';

export const PayoutPage = () => {
  const { user, refreshUser } = useAuth();

  // Settings & Permission
  const [payoutEnabled, setPayoutEnabled] = useState(
    user?.payoutEnabled !== false
  );

  // Active Payout State
  const [activePayout, setActivePayout] = useState(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  // Payout History State
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Filter Popover & Search
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const filterRef = useRef(null);

  // Details Modal
  const [detailsModal, setDetailsModal] = useState({ open: false, payout: null });

  // Action feedback message
  const [feedback, setFeedback] = useState(null);

  // Close filter popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch settings & active payout
  const fetchActiveAndSettings = useCallback(async () => {
    try {
      setActiveLoading(true);
      const [settingsRes, activeRes] = await Promise.allSettled([
        payoutService.getSettings(),
        payoutService.getActivePayout(),
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value?.success) {
        setPayoutEnabled(settingsRes.value.payoutEnabled !== false);
      } else if (user?.payoutEnabled !== undefined) {
        setPayoutEnabled(user.payoutEnabled !== false);
      }

      if (activeRes.status === 'fulfilled' && activeRes.value?.success) {
        setActivePayout(activeRes.value.activePayout);
        if (activeRes.value.payoutEnabled !== undefined) {
          setPayoutEnabled(activeRes.value.payoutEnabled !== false);
        }
      }
    } catch (err) {
      console.warn('[PayoutPage] fetch active error:', err.message);
    } finally {
      setActiveLoading(false);
    }
  }, [user]);

  // Fetch Payout History
  const fetchHistory = useCallback(
    async (page = 1) => {
      try {
        setHistoryLoading(true);
        const res = await payoutService.getHistory({
          page,
          limit: 10,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: searchQuery || undefined,
        });

        if (res && res.success) {
          setHistory(res.data || []);
          setPagination(
            res.pagination || {
              page,
              limit: 10,
              total: res.data?.length || 0,
              totalPages: 1,
            }
          );
        }
      } catch (err) {
        console.warn('[PayoutPage] fetch history error:', err.message);
      } finally {
        setHistoryLoading(false);
      }
    },
    [statusFilter, searchQuery]
  );

  // Initial load
  useEffect(() => {
    fetchActiveAndSettings();
    fetchHistory(1);
  }, [fetchActiveAndSettings, fetchHistory]);

  // Global Page Refresh
  const handlePageRefresh = async () => {
    setFeedback({ type: 'info', text: 'Refreshing payout data...' });
    if (refreshUser) refreshUser();
    await Promise.all([fetchActiveAndSettings(), fetchHistory(pagination.page)]);
    setTimeout(() => setFeedback(null), 2500);
  };

  // Claim assigned payout
  const handleClaimPayout = async (payoutId) => {
    if (!payoutEnabled) {
      alert('Payouts are disabled for your account. Contact administrator.');
      return;
    }
    if (!payoutId) return;

    try {
      setClaiming(true);
      const res = await payoutService.claimPayout(payoutId);
      if (res && res.success) {
        setFeedback({
          type: 'success',
          text: 'Payout claimed successfully! Awaiting settlement verification.',
        });
        await Promise.all([fetchActiveAndSettings(), fetchHistory(1)]);
      } else {
        alert(res?.message || 'Failed to claim payout.');
      }
    } catch (err) {
      alert(err.message || 'Error claiming payout.');
    } finally {
      setClaiming(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Export CSV
  const handleDownloadCsv = () => {
    const url = payoutService.exportCsvUrl(statusFilter);
    window.open(url, '_blank');
  };

  // Status Badge Renderer
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ASSIGNED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" />
            ASSIGNED
          </span>
        );
      case 'CLAIMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            CLAIMED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <RotateCw className="w-3 h-3 animate-spin" />
            PROCESSING
          </span>
        );
      case 'COMPLETED':
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            COMPLETED
          </span>
        );
      case 'REJECTED':
      case 'FAILED':
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            {status}
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            <Clock className="w-3 h-3" />
            EXPIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            {status || 'PENDING'}
          </span>
        );
    }
  };

  // Pagination bounds calculation
  const startIndex = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endIndex = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-6">
      {/* 2.3 PAGE TITLE & REFRESH ICON */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payouts</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Claim assigned payouts and review execution history in real time.
          </p>
        </div>

        <button
          onClick={handlePageRefresh}
          title="Refresh Payout Information"
          className="p-2.5 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#1A2338] transition-all"
        >
          <RotateCw className={`w-4 h-4 ${activeLoading || historyLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* FEEDBACK TOAST */}
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* PHASE 3 — PAYOUTS DISABLED WARNING BANNER (CONDITIONAL) */}
      {!payoutEnabled && (
        <div className="bg-[#2D0B12] border border-[#781B26] rounded-xl p-4 flex items-start gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-[#FF4D63] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-[#FF8596] tracking-wide">Payouts Disabled</h3>
            <p className="text-xs text-[#FFAEBA] mt-0.5">
              Administrator has disabled payouts for your account
            </p>
          </div>
        </div>
      )}

      {/* PHASE 4 — ACTIVE PAYOUTS SECTION */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-5 sm:p-6 shadow-xl">
        {/* Section Heading */}
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
            <ClipboardList className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="text-sm font-semibold text-white tracking-wide">Active Payouts</h2>
        </div>

        {/* Inner container with subtle blue-to-purple gradient styling */}
        <div className="bg-gradient-to-r from-[#121929] via-[#141a2e] to-[#18182b] border border-[#232f48] rounded-xl p-6 sm:p-8">
          {activeLoading ? (
            <div className="py-8 text-center text-xs text-gray-400 space-y-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Checking assigned payouts...</p>
            </div>
          ) : !activePayout ? (
            /* EMPTY STATE */
            <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
              <p className="text-xs sm:text-sm text-gray-400 font-medium">
                No active payout assigned
              </p>

              {/* Disabled Button Styling: Grey background, muted text, Play icon */}
              <button
                disabled
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1F293D]/70 border border-gray-700/40 text-gray-500 text-xs font-semibold cursor-not-allowed select-none transition-none"
              >
                <Play className="w-3.5 h-3.5 fill-gray-500 text-gray-500" />
                <span>Take Payout</span>
              </button>
            </div>
          ) : (
            /* ACTIVE PAYOUT ASSIGNED STATE */
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#232f48]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono">PAYOUT ID:</span>
                    <span className="text-xs font-mono font-bold text-white">{activePayout.requestId}</span>
                    {renderStatusBadge(activePayout.status)}
                  </div>
                  <p className="text-2xl font-bold text-white font-mono mt-1">
                    ₹{Number(activePayout.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-400">Assigned</p>
                  <p className="text-xs text-gray-300 font-mono mt-0.5">
                    {activePayout.assignedAt
                      ? new Date(activePayout.assignedAt).toLocaleString()
                      : new Date(activePayout.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Recipient Account Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-[#0B0F19]/60 border border-[#232f48] rounded-xl p-3.5">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Beneficiary</span>
                  <span className="text-white font-medium">
                    {activePayout.recipientDetails?.accountHolder || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Account / IFSC / UPI</span>
                  <span className="text-white font-mono">
                    {activePayout.recipientDetails?.accountNumberMasked ||
                      activePayout.recipientDetails?.ifscOrUpi ||
                      'Masked'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Assignment Notes</span>
                  <span className="text-gray-300">
                    {activePayout.assignmentNotes || 'Standard settlement payout'}
                  </span>
                </div>
              </div>

              {/* Take Payout Action Button */}
              <div className="flex items-center justify-center pt-2">
                {activePayout.status === 'ASSIGNED' ? (
                  <button
                    disabled={!payoutEnabled || claiming}
                    onClick={() => handleClaimPayout(activePayout._id || activePayout.requestId)}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                      payoutEnabled && !claiming
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 cursor-pointer active:scale-95'
                        : 'bg-[#1F293D]/70 border border-gray-700/40 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{claiming ? 'Claiming Payout...' : 'Take Payout'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <Clock className="w-4 h-4" />
                    <span>Payout Claimed — In Verification Queue</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PHASE 5 — PAYOUT HISTORY SECTION */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        {/* Card Header */}
        <div className="p-4 sm:p-5 border-b border-[#1F293D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Blue history icon & dynamic payout count badge */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <History className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">Payout History</h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-[#1A2338] text-blue-400 border border-blue-500/20">
              {pagination.total}
            </span>
          </div>

          {/* Right Toolbar: 1. Filter, 2. Download, 3. Refresh */}
          <div className="flex items-center gap-2 relative">
            {/* Filter Popover Toggle */}
            <div ref={filterRef} className="relative">
              <button
                onClick={() => setFilterOpen((prev) => !prev)}
                title="Filter Payouts"
                className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
                  filterOpen || statusFilter !== 'ALL' || searchQuery
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                    : 'bg-[#0B0F19] border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#161F33]'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filter</span>
              </button>

              {/* Filter Dropdown Popover */}
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#111827] border border-[#1F293D] rounded-xl shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1F293D] pb-2">
                    <span className="text-xs font-semibold text-white">Filter Payouts</span>
                    <button
                      onClick={() => setFilterOpen(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ASSIGNED">ASSIGNED</option>
                      <option value="CLAIMED">CLAIMED</option>
                      <option value="PROCESSING">PROCESSING</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="REJECTED">REJECTED</option>
                      <option value="FAILED">FAILED</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Search ID / Beneficiary</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1F293D]">
                    <button
                      onClick={() => {
                        setStatusFilter('ALL');
                        setSearchQuery('');
                      }}
                      className="text-[11px] text-gray-400 hover:text-white"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => {
                        setFilterOpen(false);
                        fetchHistory(1);
                      }}
                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Download CSV */}
            <button
              onClick={handleDownloadCsv}
              title="Export Payout History (CSV)"
              className="p-2 rounded-lg bg-[#0B0F19] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#161F33] transition-all flex items-center gap-1.5 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchHistory(pagination.page)}
              title="Refresh Payout History"
              className="p-2 rounded-lg bg-[#0B0F19] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#161F33] transition-all"
            >
              <RotateCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* TABLE COLUMNS (Exact Order):
            1. Payout ID
            2. Amount
            3. Status
            4. Beneficiary
            5. Account
            6. Date
            7. Actions
        */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] text-[11px] font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Payout ID</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Beneficiary</th>
                <th className="py-3.5 px-4">Account</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1F293D]">
              {historyLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <RotateCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Loading payout history...</span>
                    </div>
                  </td>
                </tr>
              ) : history.length === 0 ? (
                /* EMPTY STATE */
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <ClipboardList className="w-8 h-8 text-gray-600 stroke-[1.5]" />
                      <p className="text-sm font-medium text-gray-400">No payouts found</p>
                      <p className="text-xs text-gray-600">
                        Assigned payouts and completed records will appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item._id} className="hover:bg-[#151D2F] transition-colors">
                    {/* 1. Payout ID */}
                    <td className="py-3.5 px-4 font-mono font-semibold text-white">
                      {item.requestId}
                    </td>

                    {/* 2. Amount */}
                    <td className="py-3.5 px-4 font-mono font-bold text-rose-400">
                      ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* 3. Status */}
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(item.status)}
                    </td>

                    {/* 4. Beneficiary */}
                    <td className="py-3.5 px-4 text-gray-200 font-medium">
                      {item.recipientDetails?.accountHolder || 'N/A'}
                    </td>

                    {/* 5. Account */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-gray-400">
                      {item.recipientDetails?.accountNumberMasked ||
                        item.recipientDetails?.ifscOrUpi ||
                        item.recipientDetails?.walletAddressMasked ||
                        '-'}
                    </td>

                    {/* 6. Date */}
                    <td className="py-3.5 px-4 text-gray-400 font-mono text-[11px]">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                      })}
                    </td>

                    {/* 7. Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === 'ASSIGNED' && payoutEnabled && (
                          <button
                            onClick={() => handleClaimPayout(item._id)}
                            disabled={claiming}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] shadow-sm flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Take</span>
                          </button>
                        )}
                        <button
                          onClick={() => setDetailsModal({ open: true, payout: item })}
                          title="View Details"
                          className="p-1.5 rounded-lg bg-[#0B0F19] hover:bg-[#1E293B] text-gray-400 hover:text-white border border-[#1F293D]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION (Bottom-Right: Rows per page: 10, 0-0 of 0, < >) */}
        <div className="p-4 border-t border-[#1F293D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-400">
          <div className="text-[11px] text-gray-500 font-mono">
            Showing records for authenticated Trader: <strong className="text-gray-300">{user?.username}</strong>
          </div>

          <div className="flex items-center gap-4 self-end sm:self-auto font-mono text-xs">
            <span>Rows per page: 10</span>
            <span>
              {startIndex}–{endIndex} of {pagination.total}
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1 || historyLoading}
                onClick={() => fetchHistory(pagination.page - 1)}
                className="p-1 rounded-lg border border-[#1F293D] hover:bg-[#1E293B] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages || historyLoading}
                onClick={() => fetchHistory(pagination.page + 1)}
                className="p-1 rounded-lg border border-[#1F293D] hover:bg-[#1E293B] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PAYOUT DETAILS MODAL */}
      <Modal
        isOpen={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, payout: null })}
        title={`Payout Details: ${detailsModal.payout?.requestId || ''}`}
      >
        {detailsModal.payout && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-400">Settlement Amount</p>
                <p className="text-xl font-bold text-rose-400 font-mono">
                  ₹{Number(detailsModal.payout.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>{renderStatusBadge(detailsModal.payout.status)}</div>
            </div>

            <div className="space-y-2 bg-[#0B0F19] border border-[#1F293D] rounded-xl p-3">
              <div className="flex justify-between py-1 border-b border-[#1F293D]">
                <span className="text-gray-400">Beneficiary Holder</span>
                <span className="text-white font-medium">
                  {detailsModal.payout.recipientDetails?.accountHolder}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F293D]">
                <span className="text-gray-400">Masked Account</span>
                <span className="text-white font-mono">
                  {detailsModal.payout.recipientDetails?.accountNumberMasked || '-'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F293D]">
                <span className="text-gray-400">IFSC / UPI</span>
                <span className="text-white font-mono">
                  {detailsModal.payout.recipientDetails?.ifscOrUpi || '-'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F293D]">
                <span className="text-gray-400">Assigned At</span>
                <span className="text-gray-300 font-mono">
                  {detailsModal.payout.assignedAt
                    ? new Date(detailsModal.payout.assignedAt).toLocaleString()
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F293D]">
                <span className="text-gray-400">Claimed At</span>
                <span className="text-gray-300 font-mono">
                  {detailsModal.payout.claimedAt
                    ? new Date(detailsModal.payout.claimedAt).toLocaleString()
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Completed At</span>
                <span className="text-gray-300 font-mono">
                  {detailsModal.payout.completedAt
                    ? new Date(detailsModal.payout.completedAt).toLocaleString()
                    : '-'}
                </span>
              </div>
            </div>

            {detailsModal.payout.adminDecisionNotes && (
              <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                <span className="text-gray-400 block text-[10px] uppercase font-semibold mb-1">
                  Administrative Reference & Notes
                </span>
                <p className="text-gray-200">{detailsModal.payout.adminDecisionNotes}</p>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setDetailsModal({ open: false, payout: null })}
                className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
