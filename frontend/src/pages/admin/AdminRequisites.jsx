import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  Settings,
  X,
  Edit2,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { requisiteService } from '../../services/api';

export const AdminRequisites = () => {
  const [requisites, setRequisites] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [traderFilter, setTraderFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Review Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [reviewAction, setReviewAction] = useState('APPROVE'); // 'APPROVE', 'REJECT', 'STATUS_CHANGE', 'LIMITS'
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [newDailyLimit, setNewDailyLimit] = useState('');
  const [newMinAmount, setNewMinAmount] = useState('');
  const [newMaxAmount, setNewMaxAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Settings Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  // Statistics Modal
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const fetchRequisites = useCallback(
    async (page = 1, isManual = false) => {
      try {
        if (isManual) setIsRefreshing(true);
        else setLoading(true);

        const res = await requisiteService.getAllAdmin({
          page,
          limit: pagination.limit,
          search: search.trim(),
          status: statusFilter,
          type: typeFilter,
          trader: traderFilter.trim(),
        });

        if (res.success) {
          setRequisites(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      } catch (err) {
        console.error('[AdminRequisites] Fetch error:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [pagination.limit, search, statusFilter, typeFilter, traderFilter]
  );

  const fetchSettings = useCallback(async () => {
    try {
      const res = await requisiteService.getSettingsAdmin();
      if (res.success) {
        setSettings(res.data);
      }
    } catch (err) {
      console.error('[AdminRequisites] Settings fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchRequisites(1);
    fetchSettings();
  }, [fetchRequisites, fetchSettings]);

  // Open Review / Audit Modal
  const handleOpenReview = (item, defaultAction = 'APPROVE') => {
    setSelectedReq(item);
    setReviewAction(defaultAction);
    setRejectionReason('');
    setReviewNotes('');
    setNewStatus(item.status);
    setNewDailyLimit(item.dailyLimit?.toString() || '500000');
    setNewMinAmount(item.minAmount?.toString() || '100');
    setNewMaxAmount(item.maxAmount?.toString() || '50000');
    setReviewError('');
    setReviewModalOpen(true);
  };

  // Submit Review Action
  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!selectedReq) return;
    setReviewError('');

    try {
      setProcessing(true);
      let res;
      if (reviewAction === 'APPROVE') {
        res = await requisiteService.approveAdmin(selectedReq._id, reviewNotes.trim());
      } else if (reviewAction === 'REJECT') {
        if (!rejectionReason.trim()) {
          setReviewError('Rejection reason is required.');
          setProcessing(false);
          return;
        }
        res = await requisiteService.rejectAdmin(selectedReq._id, rejectionReason.trim());
      } else if (reviewAction === 'STATUS_CHANGE') {
        res = await requisiteService.updateStatusAdmin(selectedReq._id, newStatus);
      } else if (reviewAction === 'LIMITS') {
        res = await requisiteService.updateLimitsAdmin(selectedReq._id, {
          dailyLimit: Number(newDailyLimit),
          minAmount: Number(newMinAmount),
          maxAmount: Number(newMaxAmount),
        });
      }

      if (res && res.success) {
        setReviewModalOpen(false);
        setSelectedReq(null);
        fetchRequisites(pagination.page);
        alert(res.message || 'Action executed successfully.');
      } else {
        setReviewError(res?.message || 'Operation failed.');
      }
    } catch (err) {
      setReviewError(err.message || 'Failed to execute review action.');
    } finally {
      setProcessing(false);
    }
  };

  // Toggle Admin PayIn Permission
  const handleTogglePayInPermission = async (item) => {
    const target = !item.adminPayinAllowed;
    try {
      const res = await requisiteService.updatePayInPermissionAdmin(item._id, target);
      if (res.success) {
        setRequisites((prev) =>
          prev.map((r) =>
            r._id === item._id
              ? {
                  ...r,
                  adminPayinAllowed: target,
                  payinEnabled: target ? r.payinEnabled : false,
                }
              : r
          )
        );
      } else {
        alert(res.message || 'Failed to update PayIn permission.');
      }
    } catch (err) {
      alert(err.message || 'Error updating permission.');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSavingSettings(true);
      setSettingsMessage('');
      const res = await requisiteService.updateSettingsAdmin(settings);
      if (res.success) {
        setSettings(res.data);
        setSettingsMessage('Settings saved successfully.');
        setTimeout(() => setSettingsMessage(''), 3000);
      } else {
        setSettingsMessage(res.message || 'Failed to save settings.');
      }
    } catch (err) {
      setSettingsMessage(err.message || 'Error saving settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Open Stats
  const handleOpenStats = async (item) => {
    setSelectedReq(item);
    setStatsModalOpen(true);
    setLoadingStats(true);
    try {
      const res = await requisiteService.getStatistics(item._id);
      if (res.success) {
        setStatsData(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatISTDate = (isoStr) => {
    if (!isoStr) return '-';
    try {
      return new Date(isoStr).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Active
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-500/15 text-gray-400 border border-gray-500/30">
            Inactive
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Pending Review
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-500/15 text-gray-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Requisites Management Desk</h1>
          <p className="text-xs text-gray-400 mt-1">
            Review, approve, activate, and manage trader bank accounts and UPI IDs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold hover:border-gray-600 transition-colors"
          >
            <Settings className="w-4 h-4 text-blue-400" />
            <span>Requisite Settings</span>
          </button>

          <button
            onClick={() => fetchRequisites(pagination.page, true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold hover:border-gray-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Requisite ID, Trader, UPI..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Types</option>
            <option value="UPI">UPI</option>
            <option value="IMPS">IMPS</option>
          </select>
        </div>
      </div>

      {/* Admin Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1250px] text-xs">
            <thead>
              <tr className="border-b border-[#1F293D] bg-[#0E1524] text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Trader</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Account Holder</th>
                <th className="py-3 px-4">Account / UPI</th>
                <th className="py-3 px-4">IFSC</th>
                <th className="py-3 px-4">Bank</th>
                <th className="py-3 px-4">Daily Limit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">PayIn</th>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D] text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan="12" className="py-12 text-center text-gray-400">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading requisites...
                  </td>
                </tr>
              ) : requisites.length === 0 ? (
                <tr>
                  <td colSpan="12" className="py-12 text-center text-gray-500">
                    No requisites found matching the criteria.
                  </td>
                </tr>
              ) : (
                requisites.map((item) => (
                  <tr key={item._id} className="hover:bg-[#162032] transition-colors">
                    {/* ID */}
                    <td className="py-3.5 px-4 font-mono font-medium text-white">
                      {item.requisiteId}
                    </td>

                    {/* Trader */}
                    <td className="py-3.5 px-4 font-medium text-gray-200">
                      <div>
                        <span>{item.trader?.username || item.clientId}</span>
                        {item.trader?.fullName && (
                          <span className="block text-[10px] text-gray-500">{item.trader.fullName}</span>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4">
                      {item.type === 'UPI' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          UPI
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          IMPS
                        </span>
                      )}
                    </td>

                    {/* Account Holder */}
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {item.accountHolderName}
                    </td>

                    {/* Account/UPI */}
                    <td className="py-3.5 px-4 font-mono text-gray-200">
                      {item.accountOrUpi}
                    </td>

                    {/* IFSC */}
                    <td className="py-3.5 px-4 font-mono text-gray-400">
                      {item.ifsc}
                    </td>

                    {/* Bank */}
                    <td className="py-3.5 px-4 text-gray-300">
                      {item.bankName}
                    </td>

                    {/* Daily Limit */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-semibold text-white">
                        ₹{Number(item.dailyLimit).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        Used: ₹{Number(item.usedToday || 0).toLocaleString('en-IN')}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(item.status)}
                    </td>

                    {/* PayIn */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[11px] font-mono font-bold ${
                            item.payinEnabled ? 'text-blue-400' : 'text-gray-500'
                          }`}
                        >
                          {item.payinEnabled ? 'ON' : 'OFF'}
                        </span>
                        {!item.adminPayinAllowed && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Blocked
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Created At */}
                    <td className="py-3.5 px-4 text-gray-400 whitespace-nowrap">
                      {formatISTDate(item.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status !== 'ACTIVE' ? (
                          <button
                            onClick={() => handleOpenReview(item, 'APPROVE')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 font-semibold text-[11px] transition-colors"
                          >
                            Approve
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenReview(item, 'STATUS_CHANGE')}
                            className="px-2 py-1 rounded-lg bg-[#162032] hover:bg-[#22334F] text-gray-300 text-[11px] transition-colors"
                          >
                            Status
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenReview(item, 'LIMITS')}
                          className="p-1.5 rounded-lg bg-[#162032] hover:bg-[#22334F] text-gray-300 hover:text-white transition-colors"
                          title="Edit Limits"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenStats(item)}
                          className="p-1.5 rounded-lg bg-[#162032] hover:bg-[#22334F] text-blue-400 hover:text-white transition-colors"
                          title="Statistics"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {reviewModalOpen && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-left space-y-4">
            <button
              onClick={() => setReviewModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-white">Review Requisite</h2>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#162032] text-blue-300 border border-[#22334F]">
                  {selectedReq.requisiteId}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Trader: <strong className="text-white">{selectedReq.trader?.username || selectedReq.clientId}</strong> |{' '}
                {selectedReq.accountHolderName} ({selectedReq.type})
              </p>
            </div>

            {reviewError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  Action
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('APPROVE')}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border text-center ${
                      reviewAction === 'APPROVE'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400'
                    }`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('REJECT')}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border text-center ${
                      reviewAction === 'REJECT'
                        ? 'bg-rose-600/20 border-rose-500 text-rose-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400'
                    }`}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('STATUS_CHANGE')}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border text-center ${
                      reviewAction === 'STATUS_CHANGE'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400'
                    }`}
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('LIMITS')}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border text-center ${
                      reviewAction === 'LIMITS'
                        ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400'
                    }`}
                  >
                    Limits
                  </button>
                </div>
              </div>

              {reviewAction === 'APPROVE' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Approval Notes
                  </label>
                  <input
                    type="text"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="e.g. Bank account verified"
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              {reviewAction === 'REJECT' && (
                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">
                    Rejection Reason *
                  </label>
                  <input
                    type="text"
                    required
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. IFSC code mismatch"
                    className="w-full bg-[#162032] border border-rose-500/50 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              {reviewAction === 'STATUS_CHANGE' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Set Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              )}

              {reviewAction === 'LIMITS' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Daily Limit (₹)
                    </label>
                    <input
                      type="number"
                      value={newDailyLimit}
                      onChange={(e) => setNewDailyLimit(e.target.value)}
                      className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1">
                        Min Transaction (₹)
                      </label>
                      <input
                        type="number"
                        value={newMinAmount}
                        onChange={(e) => setNewMinAmount(e.target.value)}
                        className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1">
                        Max Transaction (₹)
                      </label>
                      <input
                        type="number"
                        value={newMaxAmount}
                        onChange={(e) => setNewMaxAmount(e.target.value)}
                        className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30"
                >
                  {processing ? 'Processing...' : 'Apply Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal (Task 15) */}
      {settingsModalOpen && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-left space-y-4">
            <button
              onClick={() => setSettingsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-base font-bold text-white">Requisite Workflow Settings</h2>
              <p className="text-xs text-gray-400">
                Configure global limits, allowed types, and review parameters.
              </p>
            </div>

            {settingsMessage && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs rounded-xl">
                {settingsMessage}
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-3 bg-[#162032] border border-[#22334F] rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.upiEnabled}
                    onChange={(e) => setSettings({ ...settings, upiEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">UPI Enabled</span>
                    <span className="text-[10px] text-gray-400">Allow UPI requisites</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 bg-[#162032] border border-[#22334F] rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.impsEnabled}
                    onChange={(e) => setSettings({ ...settings, impsEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">IMPS Enabled</span>
                    <span className="text-[10px] text-gray-400">Allow bank transfers</span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Default Daily Limit (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.defaultDailyLimit}
                    onChange={(e) => setSettings({ ...settings, defaultDailyLimit: Number(e.target.value) })}
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Max Allowed Limit (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.maxDailyLimit}
                    onChange={(e) => setSettings({ ...settings, maxDailyLimit: Number(e.target.value) })}
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Max Requisites / Trader
                  </label>
                  <input
                    type="number"
                    value={settings.maxRequisitesPerTrader}
                    onChange={(e) => setSettings({ ...settings, maxRequisitesPerTrader: Number(e.target.value) })}
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoApprove}
                      onChange={(e) => setSettings({ ...settings, autoApprove: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-xs font-semibold text-white">Auto-Approve Requisites</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white text-xs font-semibold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {statsModalOpen && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-left space-y-4">
            <button
              onClick={() => setStatsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-base font-bold text-white">Requisite Performance & Transactions</h2>
              <p className="text-xs text-gray-400">
                ID: {selectedReq.requisiteId} ({selectedReq.type}) | Trader: {selectedReq.trader?.username}
              </p>
            </div>

            {loadingStats ? (
              <div className="py-8 text-center text-gray-400 text-xs">Loading statistics...</div>
            ) : statsData ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-[#162032] p-3 rounded-xl border border-[#22334F]">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Daily Limit</span>
                    <span className="font-mono font-bold text-white text-sm">
                      ₹{Number(statsData.dailyLimit).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Used Today</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      ₹{Number(statsData.usedToday).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Today Tx Count</span>
                    <span className="font-mono text-white text-sm">{statsData.todayTxCount} tx</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Today Verified Volume</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      ₹{Number(statsData.todayVerifiedVolume).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStatsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1F293D] hover:bg-[#2B3A52] text-white text-xs font-semibold"
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
