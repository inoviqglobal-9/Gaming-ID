import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download,
  Filter,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  AlertCircle,
  X,
  Check,
  Building2,
  User,
  ShieldCheck,
  Copy,
  Calendar,
} from 'lucide-react';
import { applicationService, adminService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const AdminApplications = () => {
  const [applications, setApplications] = useState([]);
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    from: 0,
    to: 0,
  });

  // Filters State
  const [search, setSearch] = useState('');
  const [selectedTrader, setSelectedTrader] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Modals
  const [detailsModal, setDetailsModal] = useState({ open: false, application: null });
  const [historyModal, setHistoryModal] = useState({ open: false, history: [], loading: false, app: null });
  const [reviewModal, setReviewModal] = useState({
    open: false,
    application: null,
    action: 'CONFIRM',
    decisionNotes: '',
    verificationEvidence: '',
    submitting: false,
    error: '',
  });

  const [copiedUtr, setCopiedUtr] = useState(null);
  const inFlightRef = useRef(false);

  // Fetch list of traders for dropdown
  useEffect(() => {
    const fetchTradersList = async () => {
      try {
        const res = await adminService.getTraders({ limit: 100 });
        if (res && res.success) {
          setTraders(res.data || []);
        }
      } catch (err) {
        console.warn('Failed to load traders list:', err.message);
      }
    };
    fetchTradersList();
  }, []);

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch applications
  const fetchApplications = useCallback(
    async (isBackground = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      try {
        const params = {
          page,
          limit,
          sortBy,
          sortOrder,
          ...(search && { search }),
          ...(selectedTrader && { traderId: selectedTrader }),
          ...(selectedStatus !== 'ALL' && { status: selectedStatus }),
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo }),
        };

        const res = await applicationService.getAllAdmin(params);
        if (res && res.success) {
          setApplications(res.data || []);
          if (res.pagination) {
            setPagination(res.pagination);
          }
        }
      } catch (err) {
        if (!isBackground) {
          setFeedback({ type: 'error', text: err.message || 'Failed to load applications.' });
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, sortBy, sortOrder, search, selectedTrader, selectedStatus, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchApplications(false);
  }, [fetchApplications]);

  // Periodic polling every 15s
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) {
        fetchApplications(true);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchApplications]);

  const handleManualRefresh = async () => {
    setFeedback({ type: 'info', text: 'Refreshing admin applications...' });
    await fetchApplications(false);
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedTrader('');
    setSelectedStatus('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setFilterOpen(false);
  };

  // CSV Export
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const params = {
        ...(selectedTrader && { traderId: selectedTrader }),
        ...(selectedStatus !== 'ALL' && { status: selectedStatus }),
      };
      const blob = await applicationService.exportAdminCsv(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_applications_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setFeedback({ type: 'success', text: 'Admin applications CSV exported successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Export failed.' });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  // View History
  const handleOpenHistory = async (app) => {
    setHistoryModal({ open: true, history: [], loading: true, app });
    try {
      const res = await applicationService.getHistoryAdmin(app._id);
      if (res && res.success) {
        setHistoryModal((prev) => ({ ...prev, history: res.data || [], loading: false }));
      }
    } catch (err) {
      setHistoryModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Review Status Action Submit
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewModal.application) return;

    setReviewModal((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      const res = await applicationService.reviewAdmin(
        reviewModal.application._id,
        reviewModal.action,
        reviewModal.decisionNotes,
        reviewModal.verificationEvidence
      );
      if (res && res.success) {
        setFeedback({
          type: 'success',
          text: `Application status updated to ${reviewModal.action} successfully.`,
        });
        setReviewModal({
          open: false,
          application: null,
          action: 'CONFIRM',
          decisionNotes: '',
          verificationEvidence: '',
          submitting: false,
          error: '',
        });
        fetchApplications(page);
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err) {
      setReviewModal((prev) => ({ ...prev, error: err.message || 'Review failed.', submitting: false }));
    }
  };

  const formatAmount = (val, currency = 'INR') => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) + ', ' + d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(dateStr);
    }
  };

  const handleCopy = (text, id) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedUtr(id);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Admin Applications Management (PayIn)
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Audit, verify settlements, review audit logs, and manage Trader PayIn applications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* CSV Export */}
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold hover:bg-[#161F33] transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>

          {/* Refresh */}
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold hover:bg-[#161F33] transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between border ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="font-bold text-sm">
            &times;
          </button>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search Application, Order, UTR, Trader..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filters and Trader dropdown */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Trader Filter */}
          <select
            value={selectedTrader}
            onChange={(e) => {
              setSelectedTrader(e.target.value);
              setPage(1);
            }}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Traders</option>
            {traders.map((t) => {
              const traderKey = t._id ?? t.id ?? t.username;
              return (
                <option key={traderKey} value={traderKey}>
                  {t.username}
                </option>
              );
            })}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="DECLINED">DECLINED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>

          {/* Date Filter Popover */}
          <div ref={filterRef} className="relative">
            <button
              onClick={() => setFilterOpen((p) => !p)}
              className={`px-3 py-2 rounded-xl border flex items-center gap-1.5 text-xs font-medium transition-colors ${
                dateFrom || dateTo
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-[#0B0F19] border-[#1F293D] text-gray-300 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Dates</span>
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#111827] border border-[#1F293D] rounded-xl shadow-2xl p-3.5 z-50 space-y-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Date From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Date To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-between pt-2 border-t border-[#1F293D]">
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => {
                      setFilterOpen(false);
                      setPage(1);
                    }}
                    className="px-3 py-1 bg-blue-600 rounded text-xs text-white font-semibold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {(search || selectedTrader || selectedStatus !== 'ALL' || dateFrom || dateTo) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-gray-400 hover:text-white underline underline-offset-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Admin Applications Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto min-w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] text-[11px] font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Application ID</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Trader</th>
                <th className="py-3 px-4">UTR</th>
                <th className="py-3 px-4">Payer Name</th>
                <th className="py-3 px-4">Requisite</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1F293D]">
              {loading && applications.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RotateCw className="w-5 h-5 animate-spin text-blue-500" />
                      <span>Loading applications...</span>
                    </div>
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-gray-400">
                    No applications found matching the selected filters.
                  </td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app._id ?? app.id ?? app.applicationId} className="hover:bg-[#161F33]/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-white font-medium">
                      {app.applicationId}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-300">
                      {app.orderId}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-blue-400">
                        {app.trader?.username || 'Trader'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className={app.utr && app.utr !== '-' ? 'text-gray-200' : 'text-gray-500'}>
                          {app.utr || '-'}
                        </span>
                        {app.utr && app.utr !== '-' && (
                          <button
                            onClick={() => handleCopy(app.utr, app._id)}
                            className="text-gray-500 hover:text-blue-400"
                            title="Copy UTR"
                          >
                            {copiedUtr === app._id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {app.payerName || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-300 max-w-[150px] truncate" title={app.requisite}>
                      {app.requisite || '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {formatAmount(app.amount, app.currency)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap text-[11px]">
                      {formatDate(app.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Details */}
                        <button
                          onClick={() => setDetailsModal({ open: true, application: app })}
                          title="View Details"
                          className="p-1.5 rounded-lg bg-[#0B0F19] border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#161F33]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* History */}
                        <button
                          onClick={() => handleOpenHistory(app)}
                          title="Status History"
                          className="p-1.5 rounded-lg bg-[#0B0F19] border border-[#1F293D] text-gray-400 hover:text-blue-400 hover:bg-[#161F33]"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>

                        {/* Status Action (if not finalized) */}
                        {!['CONFIRMED', 'DECLINED', 'REJECTED', 'DEMO_TRANSACTION'].includes(app.status) && (
                          <button
                            onClick={() =>
                              setReviewModal({
                                open: true,
                                application: app,
                                action: 'CONFIRM',
                                decisionNotes: '',
                                verificationEvidence: '',
                                submitting: false,
                                error: '',
                              })
                            }
                            title="Manage Status"
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] shadow-sm shadow-blue-500/20"
                          >
                            Review
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between sm:justify-end gap-3 px-4 py-3 bg-[#0E1524] border-t border-[#1F293D] text-xs text-gray-400">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[11px]">Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-[#0B0F19] border border-[#1F293D] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="text-[11px] font-mono text-gray-300">
              {pagination.total === 0
                ? '0–0 of 0'
                : `${pagination.from}–${pagination.to} of ${pagination.total}`}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1 rounded border border-[#1F293D] bg-[#0B0F19] text-gray-400 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || pagination.total === 0 || loading}
                className="p-1 rounded border border-[#1F293D] bg-[#0B0F19] text-gray-400 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, application: null })}
        title="Admin Application Details"
      >
        {detailsModal.application && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">
                  Application ID
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {detailsModal.application.applicationId}
                </span>
              </div>
              <StatusBadge status={detailsModal.application.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#0B0F19] border border-[#1F293D] p-3 rounded-xl">
              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Trader
                </span>
                <span className="font-semibold text-blue-400">
                  {detailsModal.application.trader?.username || 'Trader'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Order ID
                </span>
                <span className="font-mono text-gray-200">
                  {detailsModal.application.orderId}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  UTR Reference
                </span>
                <span className="font-mono text-gray-200">
                  {detailsModal.application.utr}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Amount
                </span>
                <span className="font-bold text-emerald-400 text-sm">
                  {formatAmount(detailsModal.application.amount, detailsModal.application.currency)}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Payer Name
                </span>
                <span className="text-gray-200">
                  {detailsModal.application.payerName}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Requisite
                </span>
                <span className="text-gray-200">
                  {detailsModal.application.requisite}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Created Date
                </span>
                <span className="text-gray-400">
                  {formatDate(detailsModal.application.createdAt)}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Updated Date
                </span>
                <span className="text-gray-400">
                  {formatDate(detailsModal.application.updatedAt)}
                </span>
              </div>
            </div>

            {detailsModal.application.reviewNotes && (
              <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded-xl">
                <span className="text-[10px] uppercase text-blue-400 font-semibold block mb-1">
                  Review Notes
                </span>
                <p className="text-gray-300 text-xs">{detailsModal.application.reviewNotes}</p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[#1F293D]">
              <button
                onClick={() => setDetailsModal({ open: false, application: null })}
                className="px-4 py-1.5 rounded-lg bg-[#1F293D] hover:bg-[#2A374F] text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Status History Modal */}
      <Modal
        isOpen={historyModal.open}
        onClose={() => setHistoryModal({ open: false, history: [], loading: false, app: null })}
        title={`Status History — ${historyModal.app?.applicationId || ''}`}
      >
        <div className="space-y-3 text-xs">
          {historyModal.loading ? (
            <div className="py-8 text-center text-gray-400">
              <RotateCw className="w-5 h-5 animate-spin mx-auto text-blue-500 mb-2" />
              <span>Loading status transitions...</span>
            </div>
          ) : historyModal.history.length === 0 ? (
            <div className="py-8 text-center text-gray-400">
              No status changes recorded yet. Current status: <StatusBadge status={historyModal.app?.status} />
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {historyModal.history.map((h, idx) => (
                <div
                  key={h._id ?? h.id ?? `hist-${idx}`}
                  className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={h.status} />
                      <span className="text-gray-400 text-[11px]">
                        by {h.changedBy?.username || 'Admin'}
                      </span>
                    </div>
                    {h.notes && <p className="text-gray-300 text-[11px] mt-1">{h.notes}</p>}
                  </div>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {formatDate(h.changedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-[#1F293D]">
            <button
              onClick={() => setHistoryModal({ open: false, history: [], loading: false, app: null })}
              className="px-4 py-1.5 rounded-lg bg-[#1F293D] hover:bg-[#2A374F] text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Review & Status Action Modal */}
      <Modal
        isOpen={reviewModal.open}
        onClose={() =>
          setReviewModal({
            open: false,
            application: null,
            action: 'CONFIRM',
            decisionNotes: '',
            verificationEvidence: '',
            submitting: false,
            error: '',
          })
        }
        title="Admin Application Review & Status Action"
      >
        {reviewModal.application && (
          <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
            <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-500 uppercase font-bold block">
                  Target Application
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {reviewModal.application.applicationId}
                </span>
                <span className="text-[11px] text-gray-400 block mt-0.5">
                  Trader: <strong className="text-blue-400">{reviewModal.application.trader?.username}</strong> • Amount: <strong className="text-emerald-400">{formatAmount(reviewModal.application.amount)}</strong>
                </span>
              </div>
              <StatusBadge status={reviewModal.application.status} />
            </div>

            {reviewModal.error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {reviewModal.error}
              </div>
            )}

            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Select Action
              </label>
              <select
                value={reviewModal.action}
                onChange={(e) => setReviewModal((prev) => ({ ...prev, action: e.target.value }))}
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="CONFIRM">Confirm Application (₹ Settlement Verified)</option>
                <option value="PROCESSING">Mark As Processing</option>
                <option value="UNDER_REVIEW">Move to Under Review</option>
                <option value="DECLINE">Decline / Reject Application</option>
              </select>
              {reviewModal.action === 'CONFIRM' && (
                <p className="text-[11px] text-amber-400 mt-1">
                  Note: Confirming will execute an atomic ledger credit to the Trader's INR balance if this is a live order.
                </p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Review Notes / Reason
              </label>
              <textarea
                rows={3}
                placeholder="Enter review notes, settlement reference or decline reason..."
                value={reviewModal.decisionNotes}
                onChange={(e) => setReviewModal((prev) => ({ ...prev, decisionNotes: e.target.value }))}
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder-gray-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1F293D]">
              <button
                type="button"
                onClick={() =>
                  setReviewModal({
                    open: false,
                    application: null,
                    action: 'CONFIRM',
                    decisionNotes: '',
                    verificationEvidence: '',
                    submitting: false,
                    error: '',
                  })
                }
                className="px-4 py-2 rounded-xl bg-[#1F293D] hover:bg-[#2A374F] text-gray-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reviewModal.submitting}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-md transition-all ${
                  reviewModal.action === 'DECLINE'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                } disabled:opacity-50`}
              >
                {reviewModal.submitting ? 'Processing...' : 'Submit Action'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
