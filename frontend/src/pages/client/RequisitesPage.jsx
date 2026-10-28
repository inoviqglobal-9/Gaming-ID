import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  Edit2,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Check,
  ShieldCheck,
  ArrowUpDown,
  Building,
  User,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { requisiteService } from '../../services/api';

export const RequisitesPage = () => {
  const { user } = useAuth();
  const [requisites, setRequisites] = useState([]);
  const [summary, setSummary] = useState({ totalRequisites: 0, active: 0, totalDailyLimit: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filters State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [payinFilter, setPayinFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);

  // Selected Requisite for Edit or Stats
  const [selectedRequisite, setSelectedRequisite] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Add Form State (Screenshot 2)
  const [type, setType] = useState('UPI'); // 'UPI' or 'IMPS'
  const [accountHolderName, setAccountHolderName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [dailyLimit, setDailyLimit] = useState('500000');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit Form State
  const [editNote, setEditNote] = useState('');
  const [editName, setEditName] = useState('');
  const [editBank, setEditBank] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Toggling payin in-progress
  const [togglingId, setTogglingId] = useState(null);

  // Live IST Clock
  const [istTime, setIstTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(
        `${now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })} IST`
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Requisites and Summary
  const loadData = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) setIsRefreshing(true);
        else setLoading(true);

        const [sumRes, reqsRes] = await Promise.all([
          requisiteService.getSummary().catch(() => null),
          requisiteService
            .getRequisites({
              search,
              status: statusFilter,
              payin: payinFilter,
              sortBy,
              limit: 50,
            })
            .catch(() => null),
        ]);

        if (sumRes && sumRes.success) {
          setSummary(sumRes.data);
        }
        if (reqsRes && reqsRes.success) {
          setRequisites(reqsRes.data || []);
        }
      } catch (err) {
        console.error('[RequisitesPage] Load error:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [search, statusFilter, payinFilter, sortBy]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setType('UPI');
    setAccountHolderName('');
    setUpiId('');
    setBankName('');
    setAccountNumber('');
    setConfirmAccountNumber('');
    setIfsc('');
    setDailyLimit('500000');
    setNote('');
    setFormError('');
    setAddModalOpen(true);
  };

  // Submit Add Requisite Form
  const handleCreateRequisite = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!accountHolderName.trim()) {
      setFormError('Account Holder Name is required.');
      return;
    }
    if (!bankName.trim()) {
      setFormError('Bank Name is required.');
      return;
    }

    const numLimit = parseFloat(dailyLimit);
    if (isNaN(numLimit) || numLimit <= 0) {
      setFormError('Please enter a valid positive daily limit.');
      return;
    }

    if (type === 'UPI') {
      if (!upiId.trim()) {
        setFormError('UPI ID is required.');
        return;
      }
      if (!/^[\w.-]+@[\w.-]+$/.test(upiId.trim())) {
        setFormError('Invalid UPI ID format (e.g. phonenumber@paytm, name@oksbi).');
        return;
      }
    } else {
      if (!accountNumber.trim()) {
        setFormError('Account Number is required.');
        return;
      }
      if (accountNumber.trim() !== confirmAccountNumber.trim()) {
        setFormError('Account Number and Confirm Account Number do not match.');
        return;
      }
      if (!ifsc.trim()) {
        setFormError('IFSC Code is required.');
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase())) {
        setFormError('Invalid IFSC Code format (e.g. HDFC0001234).');
        return;
      }
    }

    try {
      setCreating(true);
      const payload = {
        type,
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        dailyLimit: numLimit,
        note: note.trim(),
      };

      if (type === 'UPI') {
        payload.upiId = upiId.trim();
      } else {
        payload.accountNumber = accountNumber.trim();
        payload.confirmAccountNumber = confirmAccountNumber.trim();
        payload.ifsc = ifsc.trim().toUpperCase();
      }

      const res = await requisiteService.createRequisite(payload);
      if (res.success) {
        setAddModalOpen(false);
        await loadData();
        alert(res.message || 'Requisite created successfully. Waiting for administrator approval.');
      } else {
        setFormError(res.message || 'Failed to create requisite.');
      }
    } catch (err) {
      setFormError(err.message || 'Failed to submit requisite.');
    } finally {
      setCreating(false);
    }
  };

  // Toggle PayIn Switch (Task 12)
  const handleTogglePayIn = async (item) => {
    const targetState = !item.payinEnabled;

    if (targetState === true && item.status !== 'ACTIVE') {
      alert(
        'Cannot enable PayIn on an inactive requisite. Requisite must be approved and activated by administrator first.'
      );
      return;
    }

    try {
      setTogglingId(item._id);
      const res = await requisiteService.togglePayIn(item._id, targetState);
      if (res.success) {
        setRequisites((prev) =>
          prev.map((r) => (r._id === item._id ? { ...r, payinEnabled: targetState } : r))
        );
        await loadData();
      } else {
        alert(res.message || 'Failed to update PayIn.');
      }
    } catch (err) {
      alert(err.message || 'Error updating PayIn.');
    } finally {
      setTogglingId(null);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (item) => {
    setSelectedRequisite(item);
    setEditName(item.accountHolderName);
    setEditBank(item.bankName);
    setEditNote(item.note !== '-' ? item.note : '');
    setEditModalOpen(true);
  };

  // Save Edit Requisite
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!selectedRequisite) return;

    try {
      setSavingEdit(true);
      const res = await requisiteService.updateRequisite(selectedRequisite._id, {
        accountHolderName: editName.trim(),
        bankName: editBank.trim(),
        note: editNote.trim(),
      });
      if (res.success) {
        setEditModalOpen(false);
        loadData();
      } else {
        alert(res.message || 'Failed to update requisite.');
      }
    } catch (err) {
      alert(err.message || 'Error updating requisite.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Statistics Modal (Task 14)
  const handleOpenStats = async (item) => {
    setSelectedRequisite(item);
    setStatsModalOpen(true);
    setLoadingStats(true);
    try {
      const res = await requisiteService.getStatistics(item._id);
      if (res.success) {
        setStatsData(res.data);
      }
    } catch (err) {
      console.error('[Statistics Error]:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Clear Filters
  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setPayinFilter('ALL');
    setSortBy('NEWEST');
  };

  // Render Status Badge matching Screenshot 1
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Active
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/15 text-gray-400 border border-gray-500/30">
            Inactive
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Pending Review
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/15 text-gray-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* ========================================================= */}
      {/* TASK 2: EXACT TRADER REQUISITES PAGE DESIGN (SCREENSHOT 1)*/}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">My Requisites</h1>
            {user?.username && (
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-[#162032] text-gray-300 border border-[#22334F] font-mono">
                {user.username}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Manage your UPI and IMPS bank requisites for receiving payments
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Live IST Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-xs font-mono text-gray-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{istTime || 'Loading IST...'}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white transition-colors"
            title="Refresh Requisites"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`}
            />
          </button>

          {/* Blue + Add Requisite Button (Matching Screenshot 1) */}
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Requisite</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TASK 3: REQUISITES SUMMARY CARDS (MATCHING SCREENSHOT 1)  */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Requisites (Dark-grey background) */}
        <div className="p-4 bg-[#111827] border border-[#1F293D] rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Total Requisites
            </p>
            <p className="text-2xl font-bold font-mono text-white mt-1">
              {summary.totalRequisites}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#162032] border border-[#22334F] flex items-center justify-center text-gray-300">
            <CreditCard className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* Card 2: Active (Light-green background) */}
        <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Active
            </p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {summary.active}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Total Daily Limit (Light-blue background) */}
        <div className="p-4 bg-blue-950/20 border border-blue-500/30 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Total Daily Limit
            </p>
            <p className="text-2xl font-bold font-mono text-blue-400 mt-1">
              ₹{Number(summary.totalDailyLimit || 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TASK 4: SEARCH AND FILTER BAR (MATCHING SCREENSHOT 1)     */}
      {/* ========================================================= */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-3 sm:p-4 flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or UPI ID..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 flex-wrap w-full lg:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* PayIn Filter */}
          <select
            value={payinFilter}
            onChange={(e) => setPayinFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All PayIn</option>
            <option value="ON">PayIn ON</option>
            <option value="OFF">PayIn OFF</option>
          </select>

          {/* Sorting */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="NEWEST">Newest First</option>
            <option value="OLDEST">Oldest First</option>
            <option value="NAME">Sort by Name</option>
            <option value="HIGHEST_LIMIT">Highest Daily Limit</option>
            <option value="LOWEST_LIMIT">Lowest Daily Limit</option>
          </select>

          {/* Clear Button */}
          <button
            onClick={handleClearFilters}
            className="px-3 py-1.5 rounded-lg border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#162032] text-xs font-medium transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TASK 5: REQUISITES TABLE (13 COLUMNS MATCHING SCREENSHOT 1) */}
      {/* ========================================================= */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px] text-xs">
            <thead>
              <tr className="border-b border-[#1F293D] bg-[#0E1524] text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Account Holder</th>
                <th className="py-3 px-4">Account/UPI</th>
                <th className="py-3 px-4">IFSC</th>
                <th className="py-3 px-4">Bank</th>
                <th className="py-3 px-4">Note</th>
                <th className="py-3 px-4">Daily Limit</th>
                <th className="py-3 px-4">Amount Range</th>
                <th className="py-3 px-4">Today (IST)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">PayIn</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D] text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan="13" className="py-12 text-center text-gray-400 font-mono">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading requisites...
                  </td>
                </tr>
              ) : requisites.length === 0 ? (
                <tr>
                  <td colSpan="13" className="py-12 text-center text-gray-500">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    No requisites found. Click "+ Add Requisite" to register your bank or UPI details.
                  </td>
                </tr>
              ) : (
                requisites.map((item) => (
                  <tr
                    key={item._id}
                    className="hover:bg-[#162032] transition-colors duration-150"
                  >
                    {/* 1. ID */}
                    <td className="py-3.5 px-4 font-mono font-medium text-white">
                      {item.requisiteId}
                    </td>

                    {/* 2. Type */}
                    <td className="py-3.5 px-4">
                      {item.type === 'UPI' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          UPI
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          IMPS
                        </span>
                      )}
                    </td>

                    {/* 3. Account Holder */}
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {item.accountHolderName}
                    </td>

                    {/* 4. Account/UPI */}
                    <td className="py-3.5 px-4 font-mono text-gray-200">
                      {item.accountOrUpi}
                    </td>

                    {/* 5. IFSC */}
                    <td className="py-3.5 px-4 font-mono text-gray-400">
                      {item.ifsc}
                    </td>

                    {/* 6. Bank */}
                    <td className="py-3.5 px-4 text-gray-300">
                      {item.bankName}
                    </td>

                    {/* 7. Note */}
                    <td className="py-3.5 px-4 text-gray-400 text-[11px]">
                      {item.note}
                    </td>

                    {/* 8. Daily Limit */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-semibold text-white">
                        ₹{Number(item.dailyLimit).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        Used: ₹{Number(item.usedToday || 0).toLocaleString('en-IN')}
                      </div>
                    </td>

                    {/* 9. Amount Range */}
                    <td className="py-3.5 px-4 font-mono text-gray-400 text-[11px]">
                      {item.amountRange}
                    </td>

                    {/* 10. Today (IST) */}
                    <td className="py-3.5 px-4">
                      <div className="text-gray-400 text-[11px]">
                        {item.todayTxCount || 0} tx
                      </div>
                      <div className="font-mono font-bold text-emerald-400">
                        ₹{Number(item.todayVerifiedAmount || 0).toLocaleString('en-IN')}
                      </div>
                    </td>

                    {/* 11. Status */}
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(item.status)}
                    </td>

                    {/* 12. PayIn Toggle (Task 12) */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          id={`payin-toggle-${item.requisiteId}`}
                          data-testid={`payin-toggle-${item.requisiteId}`}
                          onClick={() => handleTogglePayIn(item)}
                          disabled={togglingId === item._id}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            item.payinEnabled
                              ? 'bg-blue-600'
                              : 'bg-gray-700 hover:bg-gray-600'
                          } ${item.status !== 'ACTIVE' ? 'opacity-60 cursor-not-allowed' : ''}`}
                          title={
                            item.status !== 'ACTIVE'
                              ? 'Requisite must be Active to enable PayIn'
                              : item.payinEnabled
                              ? 'Click to turn PayIn OFF'
                              : 'Click to turn PayIn ON'
                          }
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              item.payinEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span
                          className={`text-[10px] font-bold font-mono ${
                            item.payinEnabled ? 'text-blue-400' : 'text-gray-500'
                          }`}
                        >
                          {item.payinEnabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                    </td>

                    {/* 13. Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Statistics Icon */}
                        <button
                          onClick={() => handleOpenStats(item)}
                          className="p-1.5 rounded-lg bg-[#162032] hover:bg-[#22334F] text-blue-400 hover:text-white transition-colors"
                          title="View Requisite Statistics"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>

                        {/* Edit Icon */}
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 rounded-lg bg-[#162032] hover:bg-[#22334F] text-gray-300 hover:text-white transition-colors"
                          title="Edit Requisite"
                        >
                          <Edit2 className="w-4 h-4" />
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

      {/* ========================================================= */}
      {/* TASK 6-9: ADD NEW REQUISITE MODAL (SCREENSHOT 2 EXACT)     */}
      {/* ========================================================= */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in">
          <div className="bg-[#121824] border border-[#1F293D] rounded-2xl w-full max-w-xl my-auto p-5 sm:p-7 shadow-2xl text-left space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1F293D] pb-3">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Add New Requisite
              </h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Info Banner (Matching Screenshot 2) */}
            <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-center gap-3 text-xs text-blue-300">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                Choose requisite type (IMPS or UPI) and fill in the required details. All data will
                be stored securely.
              </span>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            {/* Requisite Type Selector (Matching Screenshot 2) */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                Requisite Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('IMPS')}
                  className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all text-center ${
                    type === 'IMPS'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10'
                      : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                  }`}
                >
                  IMPS (BANK TRANSFER)
                </button>
                <button
                  type="button"
                  onClick={() => setType('UPI')}
                  className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all text-center ${
                    type === 'UPI'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10'
                      : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                  }`}
                >
                  UPI
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateRequisite} className="space-y-3.5 pt-1">
              {/* Common Field: Account Holder Name ** */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Account Holder Name **
                </label>
                <input
                  type="text"
                  required
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="Enter account holder name"
                  className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Full name as per bank account or UPI
                </p>
              </div>

              {/* UPI Form Fields (Screenshot 2) */}
              {type === 'UPI' ? (
                <>
                  {/* Field 2: UPI ID ** */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      UPI ID **
                    </label>
                    <input
                      type="text"
                      required
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="Enter UPI ID"
                      className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Your UPI ID (e.g. phonenumber@paytm, name@oksbi)
                    </p>
                  </div>

                  {/* Field 3: Bank Name ** */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Bank Name **
                    </label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Enter bank name"
                      className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Bank name linked to the UPI ID
                    </p>
                  </div>

                  {/* Field 4: Daily Limit (₹) ** */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Daily Limit (₹) **
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)}
                      placeholder="500000"
                      className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Maximum daily transaction limit
                    </p>
                  </div>
                </>
              ) : (
                /* IMPS Form Fields (Task 8) */
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Bank Name **
                    </label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Enter bank name"
                      className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        Account Number **
                      </label>
                      <input
                        type="text"
                        required
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="Enter bank account number"
                        className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        Confirm Account Number **
                      </label>
                      <input
                        type="text"
                        required
                        value={confirmAccountNumber}
                        onChange={(e) => setConfirmAccountNumber(e.target.value)}
                        placeholder="Re-enter bank account number"
                        className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        IFSC Code **
                      </label>
                      <input
                        type="text"
                        required
                        value={ifsc}
                        onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                        placeholder="e.g. HDFC0001234"
                        className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        Daily Limit (₹) **
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        step="any"
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(e.target.value)}
                        placeholder="500000"
                        className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Optional Note
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Internal reference note (optional)"
                      className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              {/* Bottom Info Banner (Matching Screenshot 2) */}
              <div className="p-3 bg-[#162032] border border-[#22334F] rounded-xl text-xs text-gray-300 leading-relaxed">
                <span className="font-semibold text-white">Note: </span>
                Requisite status (Active/Inactive) is controlled by admin. You can control PayIn
                (receiving payments) using the toggle in the requisites list.
              </div>

              {/* Bottom Action Buttons (Matching Screenshot 2) */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#162032] text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {creating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Requisite</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TASK 13: EDIT REQUISITE MODAL                             */}
      {/* ========================================================= */}
      {editModalOpen && selectedRequisite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121824] border border-[#1F293D] rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-left space-y-4">
            <button
              onClick={() => setEditModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-base font-bold text-white">Edit Requisite</h2>
              <p className="text-xs text-gray-400">
                ID: <span className="font-mono text-white">{selectedRequisite.requisiteId}</span> ({selectedRequisite.type})
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  required
                  value={editBank}
                  onChange={(e) => setEditBank(e.target.value)}
                  className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Optional Note
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Reference note"
                  className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TASK 14: REQUISITE STATISTICS MODAL                       */}
      {/* ========================================================= */}
      {statsModalOpen && selectedRequisite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-xl p-6 shadow-2xl relative text-left space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setStatsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-white">Requisite Statistics</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#162032] text-blue-300 border border-[#22334F]">
                  {selectedRequisite.requisiteId}
                </span>
                {renderStatusBadge(selectedRequisite.status)}
              </div>
              <p className="text-xs text-gray-400">
                {selectedRequisite.accountHolderName} | {selectedRequisite.bankName} ({selectedRequisite.type})
              </p>
            </div>

            {loadingStats ? (
              <div className="py-12 text-center text-gray-400">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading verified statistics...
              </div>
            ) : statsData ? (
              <div className="space-y-4">
                {/* Metrics 4-grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#162032] border border-[#22334F] rounded-xl text-center">
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block">
                      Daily Limit
                    </span>
                    <span className="font-mono font-bold text-white text-sm mt-1 block">
                      ₹{Number(statsData.dailyLimit).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="p-3 bg-[#162032] border border-[#22334F] rounded-xl text-center">
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block">
                      Used Today
                    </span>
                    <span className="font-mono font-bold text-amber-400 text-sm mt-1 block">
                      ₹{Number(statsData.usedToday).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="p-3 bg-[#162032] border border-[#22334F] rounded-xl text-center">
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block">
                      Remaining Limit
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm mt-1 block">
                      ₹{Number(statsData.remainingDailyLimit).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="p-3 bg-[#162032] border border-[#22334F] rounded-xl text-center">
                    <span className="text-[10px] uppercase font-semibold text-gray-400 block">
                      Today's Volume
                    </span>
                    <span className="font-mono font-bold text-blue-400 text-sm mt-1 block">
                      ₹{Number(statsData.todayVerifiedVolume).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Recent Transactions List */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Recent Authorized Transactions
                  </h4>
                  {(!statsData.recentTransactions || statsData.recentTransactions.length === 0) ? (
                    <div className="p-4 bg-[#162032] border border-[#22334F] rounded-xl text-center text-gray-500 text-xs">
                      No transactions processed on this requisite yet.
                    </div>
                  ) : (
                    <div className="border border-[#22334F] bg-[#162032] rounded-xl overflow-hidden divide-y divide-[#22334F] text-xs">
                      {statsData.recentTransactions.map((tx, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between">
                          <div>
                            <span className="font-mono font-semibold text-white block">
                              {tx.orderId || 'TX-REF'}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              UTR: {tx.utr || '-'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-400 block">
                              +₹{Number(tx.amount).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {new Date(tx.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
