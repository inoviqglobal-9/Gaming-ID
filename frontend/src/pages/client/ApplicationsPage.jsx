import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download,
  SlidersHorizontal,
  Filter,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Eye,
  X,
  Check,
  Copy,
  Calendar,
  AlertCircle,
  FileText,
  Search,
} from 'lucide-react';
import { applicationService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const ApplicationsPage = () => {
  // Applications dataset and loading states
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Sorting: Created column sorted newest-first by default
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Server-side Pagination: Default 20 rows per page matching screenshot
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    from: 0,
    to: 0,
  });

  // Action Toolbar States
  const [filterOpen, setFilterOpen] = useState(false);
  const [colVisibilityOpen, setColVisibilityOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filter Values
  const [filterAppId, setFilterAppId] = useState('');
  const [filterOrderId, setFilterOrderId] = useState('');
  const [filterUtr, setFilterUtr] = useState('');
  const [filterPayerName, setFilterPayerName] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');

  // Applied Filters Snapshot (to prevent premature re-fetch until 'Apply Filters' clicked)
  const [appliedFilters, setAppliedFilters] = useState({
    applicationId: '',
    orderId: '',
    utr: '',
    payerName: '',
    status: 'ALL',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  // Column Visibility State (All 9 columns visible by default)
  const defaultColumns = {
    applicationId: true,
    orderId: true,
    utr: true,
    payerName: true,
    requisite: true,
    amount: true,
    status: true,
    created: true,
    actions: true,
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('inrpay_app_columns_v1');
      return saved ? { ...defaultColumns, ...JSON.parse(saved) } : defaultColumns;
    } catch {
      return defaultColumns;
    }
  });

  // Persist column visibility
  const toggleColumn = (colKey) => {
    setVisibleColumns((prev) => {
      const updated = { ...prev, [colKey]: !prev[colKey] };
      try {
        localStorage.setItem('inrpay_app_columns_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Details Modal
  const [detailsModal, setDetailsModal] = useState({ open: false, application: null });
  const [copiedUtr, setCopiedUtr] = useState(null);

  // Ref to track in-flight requests and prevent overlapping auto-refresh
  const inFlightRef = useRef(false);
  const filterDropdownRef = useRef(null);
  const colDropdownRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target)) {
        setColVisibilityOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Format currency in INR
  const formatAmount = (val, currency = 'INR') => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format Date in standard format: DD MMM YYYY, hh:mm A
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

  // Fetch applications from backend
  const fetchApplications = useCallback(
    async (isBackground = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (!isBackground) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        setError(null);
        const params = {
          page,
          limit,
          sortBy,
          sortOrder,
          ...(appliedFilters.applicationId && { applicationId: appliedFilters.applicationId }),
          ...(appliedFilters.orderId && { orderId: appliedFilters.orderId }),
          ...(appliedFilters.utr && { utr: appliedFilters.utr }),
          ...(appliedFilters.payerName && { payerName: appliedFilters.payerName }),
          ...(appliedFilters.status !== 'ALL' && { status: appliedFilters.status }),
          ...(appliedFilters.dateFrom && { dateFrom: appliedFilters.dateFrom }),
          ...(appliedFilters.dateTo && { dateTo: appliedFilters.dateTo }),
          ...(appliedFilters.minAmount && { minAmount: appliedFilters.minAmount }),
          ...(appliedFilters.maxAmount && { maxAmount: appliedFilters.maxAmount }),
        };

        const res = await applicationService.getTraderApplications(params);
        if (res && res.success) {
          setApplications(res.data || []);
          if (res.pagination) {
            setPagination(res.pagination);
          }
        }
      } catch (err) {
        if (!isBackground) {
          setError(err.message || 'Failed to load applications.');
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, sortBy, sortOrder, appliedFilters]
  );

  // Initial fetch and on filter/sort/pagination change
  useEffect(() => {
    fetchApplications(false);
  }, [fetchApplications]);

  // Phase 4: Auto-refresh every 15 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Pause polling if the tab is hidden to save network resources
      if (document.hidden) return;
      fetchApplications(true);
    }, 15000);

    return () => clearInterval(intervalId);
  }, [fetchApplications]);

  // Manual Refresh Handler
  const handleManualRefresh = async () => {
    setFeedback({ type: 'info', text: 'Refreshing applications...' });
    await fetchApplications(false);
    setTimeout(() => setFeedback(null), 2000);
  };

  // Sort toggle for Created column (and other columns)
  const handleToggleSort = (columnKey = 'createdAt') => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Apply Filters
  const handleApplyFilters = () => {
    setAppliedFilters({
      applicationId: filterAppId,
      orderId: filterOrderId,
      utr: filterUtr,
      payerName: filterPayerName,
      status: filterStatus,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      minAmount: filterMinAmount,
      maxAmount: filterMaxAmount,
    });
    setPage(1);
    setFilterOpen(false);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setFilterAppId('');
    setFilterOrderId('');
    setFilterUtr('');
    setFilterPayerName('');
    setFilterStatus('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMinAmount('');
    setFilterMaxAmount('');

    setAppliedFilters({
      applicationId: '',
      orderId: '',
      utr: '',
      payerName: '',
      status: 'ALL',
      dateFrom: '',
      dateTo: '',
      minAmount: '',
      maxAmount: '',
    });
    setPage(1);
    setFilterOpen(false);
  };

  const hasActiveFilters =
    appliedFilters.applicationId ||
    appliedFilters.orderId ||
    appliedFilters.utr ||
    appliedFilters.payerName ||
    appliedFilters.status !== 'ALL' ||
    appliedFilters.dateFrom ||
    appliedFilters.dateTo ||
    appliedFilters.minAmount ||
    appliedFilters.maxAmount;

  // Phase 7: CSV Download
  const handleDownloadCsv = async () => {
    try {
      setExporting(true);
      const params = {
        sortBy,
        sortOrder,
        ...(appliedFilters.applicationId && { applicationId: appliedFilters.applicationId }),
        ...(appliedFilters.orderId && { orderId: appliedFilters.orderId }),
        ...(appliedFilters.utr && { utr: appliedFilters.utr }),
        ...(appliedFilters.payerName && { payerName: appliedFilters.payerName }),
        ...(appliedFilters.status !== 'ALL' && { status: appliedFilters.status }),
      };

      const blob = await applicationService.exportTraderApplicationsCsv(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `applications_payin_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      setFeedback({ type: 'success', text: 'CSV export downloaded successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to download CSV export.' });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  // Copy UTR to clipboard helper
  const handleCopy = (text, id) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedUtr(id);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 2.3 & 2.4 TOP HEADER & ACTION TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Page Heading matching screenshot */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            My Applications (PayIn)
          </h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${refreshing ? 'bg-blue-400 animate-ping' : 'bg-emerald-400'}`} />
            <span>Auto-refreshing every 15 seconds</span>
          </p>
        </div>

        {/* 2.4 Top-Right Action Toolbar (Exact order from screenshot):
            1. Download icon
            2. Column visibility icon
            3. Filters button (Blue outline, blue icon, "Filters", dark bg, rounded)
            4. Refresh icon
        */}
        <div className="flex items-center gap-2 relative self-start sm:self-auto">
          {/* 1. Download icon */}
          <button
            onClick={handleDownloadCsv}
            disabled={exporting}
            title="Download CSV"
            className="w-9 h-9 rounded-lg bg-[#111827] border border-[#1F293D] flex items-center justify-center text-blue-400 hover:text-blue-300 hover:border-blue-500/40 hover:bg-[#161F33] transition-colors disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
          </button>

          {/* 2. Column visibility icon & dropdown */}
          <div ref={colDropdownRef} className="relative">
            <button
              onClick={() => setColVisibilityOpen((prev) => !prev)}
              title="Column visibility"
              className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                colVisibilityOpen
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-[#111827] border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#161F33]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {colVisibilityOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-[#111827] border border-[#1F293D] rounded-xl shadow-2xl p-3 z-50 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-[#1F293D]">
                  <span className="text-xs font-semibold text-white">Toggle Columns</span>
                  <button
                    onClick={() => setColVisibilityOpen(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {[
                    { key: 'applicationId', label: 'Application ID' },
                    { key: 'orderId', label: 'Order ID' },
                    { key: 'utr', label: 'UTR' },
                    { key: 'payerName', label: 'Payer Name' },
                    { key: 'requisite', label: 'Requisite' },
                    { key: 'amount', label: 'Amount' },
                    { key: 'status', label: 'Status' },
                    { key: 'created', label: 'Created' },
                    { key: 'actions', label: 'Actions' },
                  ].map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#1A2338] cursor-pointer text-xs text-gray-300"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key]}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-[#1F293D] bg-[#0B0F19] text-blue-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Filters button (Blue outline, blue filter icon, Text: Filters, dark background, rounded corners) */}
          <div ref={filterDropdownRef} className="relative">
            <button
              onClick={() => setFilterOpen((prev) => !prev)}
              className={`h-9 px-3.5 rounded-lg border flex items-center gap-2 text-xs font-medium transition-all ${
                filterOpen || hasActiveFilters
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm shadow-blue-500/20'
                  : 'bg-[#111827] border-blue-500 text-blue-400 hover:bg-blue-500/10'
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>

            {/* Filter Popover Panel */}
            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#111827] border border-[#1F293D] rounded-xl shadow-2xl p-4 z-50 space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#1F293D] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-white">Filter Applications</span>
                  </div>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Application ID</label>
                    <input
                      type="text"
                      placeholder="e.g. PIN-..."
                      value={filterAppId}
                      onChange={(e) => setFilterAppId(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Order ID</label>
                    <input
                      type="text"
                      placeholder="e.g. ORD-..."
                      value={filterOrderId}
                      onChange={(e) => setFilterOrderId(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">UTR</label>
                    <input
                      type="text"
                      placeholder="12-digit UTR..."
                      value={filterUtr}
                      onChange={(e) => setFilterUtr(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Payer Name</label>
                    <input
                      type="text"
                      placeholder="Payer Name..."
                      value={filterPayerName}
                      onChange={(e) => setFilterPayerName(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-gray-400 mb-1">Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PENDING">PENDING</option>
                      <option value="PROCESSING">PROCESSING</option>
                      <option value="CONFIRMED">CONFIRMED</option>
                      <option value="DECLINED">DECLINED</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Date From</label>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Date To</label>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Min Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={filterMinAmount}
                      onChange={(e) => setFilterMinAmount(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Max Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="100000.00"
                      value={filterMaxAmount}
                      onChange={(e) => setFilterMaxAmount(e.target.value)}
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-[#1F293D]">
                  <button
                    onClick={handleResetFilters}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
                  >
                    Reset Filters
                  </button>
                  <button
                    onClick={handleApplyFilters}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition-all"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Refresh icon */}
          <button
            onClick={handleManualRefresh}
            title="Refresh Applications"
            className="w-9 h-9 rounded-lg bg-[#111827] border border-[#1F293D] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#161F33] transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${loading || refreshing ? 'animate-spin text-blue-400' : ''}`} />
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

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchApplications(false)}
            className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600/50 rounded text-[11px] font-semibold text-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* PHASE 3 — FULL-WIDTH DARK APPLICATIONS TABLE */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto min-w-full">
          <table className="w-full text-left text-xs border-collapse">
            {/* Header: Dark charcoal header background */}
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] text-[11px] font-medium tracking-wider select-none">
                {visibleColumns.applicationId && (
                  <th className="py-3 px-4 font-semibold text-gray-300">Application ID</th>
                )}
                {visibleColumns.orderId && (
                  <th className="py-3 px-4 font-semibold text-gray-300">Order ID</th>
                )}
                {visibleColumns.utr && (
                  <th className="py-3 px-4 font-semibold text-gray-300">UTR</th>
                )}
                {visibleColumns.payerName && (
                  <th className="py-3 px-4 font-semibold text-gray-300">Payer Name</th>
                )}
                {visibleColumns.requisite && (
                  <th className="py-3 px-4 font-semibold text-gray-300">Requisite</th>
                )}
                {visibleColumns.amount && (
                  <th className="py-3 px-4 font-semibold text-gray-300">Amount</th>
                )}
                {visibleColumns.status && (
                  <th className="py-3 px-4 font-semibold text-gray-300">Status</th>
                )}
                {visibleColumns.created && (
                  <th
                    onClick={() => handleToggleSort('createdAt')}
                    className="py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Created</span>
                      {sortBy === 'createdAt' && sortOrder === 'desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                      ) : sortBy === 'createdAt' && sortOrder === 'asc' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-gray-600" />
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.actions && (
                  <th className="py-3 px-4 font-semibold text-gray-300 text-right">Actions</th>
                )}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-[#1F293D]">
              {loading && applications.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RotateCw className="w-5 h-5 animate-spin text-blue-500" />
                      <span className="text-xs">Loading applications...</span>
                    </div>
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                /* EXACT EMPTY STATE REQUIRED BY PROMPT: "No applications found" */
                <tr>
                  <td colSpan={9} className="py-14 text-center text-gray-400 font-normal">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <FileText className="w-6 h-6 text-gray-600 mb-1" />
                      <span className="text-sm font-medium text-gray-300">No applications found</span>
                      <span className="text-xs text-gray-500">
                        {hasActiveFilters
                          ? 'Try resetting active filters to view all applications.'
                          : 'You do not have any PayIn applications recorded yet.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr
                    key={app._id}
                    className="hover:bg-[#161F33]/60 transition-colors duration-100 text-gray-200"
                  >
                    {/* 1. Application ID */}
                    {visibleColumns.applicationId && (
                      <td className="py-3 px-4 font-mono text-[11px] text-white font-medium">
                        {app.applicationId}
                      </td>
                    )}

                    {/* 2. Order ID */}
                    {visibleColumns.orderId && (
                      <td className="py-3 px-4 font-mono text-[11px] text-gray-300">
                        {app.orderId}
                      </td>
                    )}

                    {/* 3. UTR */}
                    {visibleColumns.utr && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className={app.utr && app.utr !== '-' ? 'text-gray-200' : 'text-gray-500'}>
                            {app.utr || '-'}
                          </span>
                          {app.utr && app.utr !== '-' && (
                            <button
                              onClick={() => handleCopy(app.utr, app._id)}
                              title="Copy UTR"
                              className="text-gray-500 hover:text-blue-400 transition-colors"
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
                    )}

                    {/* 4. Payer Name */}
                    {visibleColumns.payerName && (
                      <td className="py-3 px-4 text-gray-300">
                        {app.payerName || '-'}
                      </td>
                    )}

                    {/* 5. Requisite */}
                    {visibleColumns.requisite && (
                      <td className="py-3 px-4 text-gray-300">
                        <div className="truncate max-w-[180px]" title={app.requisite}>
                          {app.requisite || '-'}
                        </div>
                      </td>
                    )}

                    {/* 6. Amount */}
                    {visibleColumns.amount && (
                      <td className="py-3 px-4 font-semibold text-white">
                        {formatAmount(app.amount, app.currency)}
                      </td>
                    )}

                    {/* 7. Status */}
                    {visibleColumns.status && (
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status} />
                      </td>
                    )}

                    {/* 8. Created */}
                    {visibleColumns.created && (
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap text-[11px]">
                        {formatDate(app.createdAt)}
                      </td>
                    )}

                    {/* 9. Actions */}
                    {visibleColumns.actions && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setDetailsModal({ open: true, application: app })}
                          title="View Application Details"
                          className="p-1.5 rounded-lg bg-[#0B0F19] border border-[#1F293D] text-gray-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-[#161F33] transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PHASE 9 — PAGINATION MATCHING SCREENSHOT:
            Below the table, aligned to the right.
            Rows per page: 20
            0–0 of 0 (or X–Y of Z)
            Previous and Next arrows.
        */}
        <div className="flex flex-col sm:flex-row items-center justify-between sm:justify-end gap-3 px-4 py-3 bg-[#0E1524] border-t border-[#1F293D] text-xs text-gray-400">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Rows per page selector */}
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
                <option value={100}>100</option>
              </select>
            </div>

            {/* X–Y of Z Count */}
            <div className="text-[11px] font-mono text-gray-300">
              {pagination.total === 0
                ? '0–0 of 0'
                : `${pagination.from}–${pagination.to} of ${pagination.total}`}
            </div>

            {/* Previous and Next Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                title="Previous page"
                className="p-1 rounded border border-[#1F293D] bg-[#0B0F19] text-gray-400 hover:text-white hover:bg-[#161F33] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || pagination.total === 0 || loading}
                title="Next page"
                className="p-1 rounded border border-[#1F293D] bg-[#0B0F19] text-gray-400 hover:text-white hover:bg-[#161F33] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PHASE 10 — APPLICATION DETAILS MODAL */}
      <Modal
        isOpen={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, application: null })}
        title="Application Details"
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
                  Order ID
                </span>
                <span className="font-mono text-gray-200">
                  {detailsModal.application.orderId || '-'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  UTR Reference
                </span>
                <span className="font-mono text-gray-200">
                  {detailsModal.application.utr || '-'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Payer Name
                </span>
                <span className="text-gray-200">
                  {detailsModal.application.payerName || '-'}
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

              <div className="col-span-2">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">
                  Requisite / Merchant
                </span>
                <span className="text-gray-200">
                  {detailsModal.application.requisite || '-'}
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

            {detailsModal.application.clientNotes && (
              <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-1">
                  Client Submission Notes
                </span>
                <p className="text-gray-300 text-xs">{detailsModal.application.clientNotes}</p>
              </div>
            )}

            {detailsModal.application.reviewNotes && (
              <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded-xl">
                <span className="text-[10px] uppercase text-blue-400 font-semibold block mb-1">
                  Administrative Review Notes
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
    </div>
  );
};
