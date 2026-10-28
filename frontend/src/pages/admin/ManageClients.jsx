import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Plus,
  Download,
  RefreshCw,
  UserCheck,
  UserX,
  KeyRound,
  Trash2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Eye,
  EyeOff,
  AlertCircle,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Lock,
  Landmark,
  CheckCheck,
} from 'lucide-react';
import { adminService, depositService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const ManageClients = () => {
  const [clients, setClients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    fullName: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    mobile: '',
    status: 'ACTIVE',
    notes: '',
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Temporary credentials popup
  const [tempCredsModal, setTempCredsModal] = useState({ open: false, username: '', password: '', title: '' });
  const [copied, setCopied] = useState(false);

  // Action confirmations
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', errorMsg: '', onConfirm: null, isProcessing: false });

  // Trader USDT Wallet & Adjustment Management State (Phase 6, 7, 8, 10)
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [traderWalletModalOpen, setTraderWalletModalOpen] = useState(false);
  const [traderWalletData, setTraderWalletData] = useState(null);
  const [traderWalletLoading, setTraderWalletLoading] = useState(false);
  const [traderWalletTab, setTraderWalletTab] = useState('transactions'); // 'transactions' | 'adjustments' | 'deposits' | 'activities'
  const [traderTransactions, setTraderTransactions] = useState([]);
  const [traderAdjustments, setTraderAdjustments] = useState([]);
  const [traderDeposits, setTraderDeposits] = useState([]);
  const [traderActivities, setTraderActivities] = useState([]);

  // Add / Deduct Adjustment Modal State
  const [adjustmentModal, setAdjustmentModal] = useState({
    open: false,
    type: 'CREDIT', // 'CREDIT' | 'DEBIT'
    amount: '',
    reason: '',
    referenceId: '',
    error: '',
    loading: false,
  });

  // Approval / Rejection Decision Modal State
  const [decisionModal, setDecisionModal] = useState({
    open: false,
    adjustment: null,
    action: 'APPROVE', // 'APPROVE' | 'REJECT'
    notes: '',
    reason: '',
    error: '',
    loading: false,
  });

  const loadTraderWalletData = useCallback(async (trader) => {
    if (!trader) return;
    const traderId = trader.id || trader._id;
    try {
      setTraderWalletLoading(true);
      const [walletRes, txRes, adjRes, depRes, actRes] = await Promise.all([
        adminService.getTraderUsdtWallet(traderId).catch(() => null),
        adminService.getTraderUsdtTransactions(traderId, { limit: 50 }).catch(() => null),
        adminService.getWalletAdjustments({ traderId, limit: 50 }).catch(() => null),
        depositService.getAllAdmin({ traderId, limit: 50 }).catch(() => null),
        adminService.getActivities({ traderId, limit: 50 }).catch(() => null),
      ]);

      if (walletRes && (walletRes.success || walletRes.availableBalance !== undefined)) {
        setTraderWalletData(walletRes);
      }
      if (txRes && txRes.success) {
        setTraderTransactions(txRes.data || []);
      }
      if (adjRes && adjRes.success) {
        setTraderAdjustments(adjRes.data || []);
      }
      if (depRes && depRes.success) {
        setTraderDeposits(depRes.data || []);
      }
      if (actRes && actRes.success) {
        setTraderActivities(actRes.data || []);
      }
    } catch (err) {
      console.warn('[loadTraderWalletData Error]:', err.message);
    } finally {
      setTraderWalletLoading(false);
    }
  }, []);

  const openTraderWalletModal = (trader) => {
    setSelectedTrader(trader);
    setTraderWalletModalOpen(true);
    setTraderWalletTab('transactions');
    loadTraderWalletData(trader);
  };

  const handleOpenAdjustmentModal = (type) => {
    setAdjustmentModal({
      open: true,
      type,
      amount: '',
      reason: '',
      referenceId: '',
      error: '',
      loading: false,
    });
  };

  const handleSubmitAdjustment = async (e) => {
    e.preventDefault();
    if (!selectedTrader) return;
    const numAmount = parseFloat(adjustmentModal.amount);
    if (!numAmount || numAmount <= 0) {
      setAdjustmentModal((prev) => ({ ...prev, error: 'Please enter a valid amount greater than zero.' }));
      return;
    }
    if (!adjustmentModal.reason || adjustmentModal.reason.trim().length < 3) {
      setAdjustmentModal((prev) => ({ ...prev, error: 'Mandatory reason must be at least 3 characters.' }));
      return;
    }
    if (!adjustmentModal.referenceId || adjustmentModal.referenceId.trim().length < 3) {
      setAdjustmentModal((prev) => ({ ...prev, error: 'Mandatory reference/tx ID must be at least 3 characters.' }));
      return;
    }

    try {
      setAdjustmentModal((prev) => ({ ...prev, loading: true, error: '' }));
      const traderId = selectedTrader.id || selectedTrader._id;
      const res = await adminService.createWalletAdjustment({
        traderId,
        type: adjustmentModal.type,
        amount: numAmount,
        reason: adjustmentModal.reason.trim(),
        referenceId: adjustmentModal.referenceId.trim(),
      });

      if (res.success) {
        setAdjustmentModal({ open: false, type: 'CREDIT', amount: '', reason: '', referenceId: '', error: '', loading: false });
        await loadTraderWalletData(selectedTrader);
        setTraderWalletTab('adjustments');
      } else {
        setAdjustmentModal((prev) => ({ ...prev, error: res.message || 'Failed to submit adjustment request.', loading: false }));
      }
    } catch (err) {
      setAdjustmentModal((prev) => ({ ...prev, error: err.message || 'Error creating adjustment.', loading: false }));
    }
  };

  const handleExecuteDecision = async (e) => {
    e.preventDefault();
    if (!decisionModal.adjustment) return;
    const adjId = decisionModal.adjustment._id || decisionModal.adjustment.id || decisionModal.adjustment.adjustmentId;

    try {
      setDecisionModal((prev) => ({ ...prev, loading: true, error: '' }));
      let res;
      if (decisionModal.action === 'APPROVE') {
        res = await adminService.approveWalletAdjustment(adjId, { decisionNotes: decisionModal.notes });
      } else {
        if (!decisionModal.reason || decisionModal.reason.trim().length < 3) {
          setDecisionModal((prev) => ({ ...prev, error: 'Rejection reason must be at least 3 characters.', loading: false }));
          return;
        }
        res = await adminService.rejectWalletAdjustment(adjId, { reason: decisionModal.reason.trim() });
      }

      if (res.success) {
        setDecisionModal({ open: false, adjustment: null, action: 'APPROVE', notes: '', reason: '', error: '', loading: false });
        await loadTraderWalletData(selectedTrader);
        await fetchClients(pagination.page, pagination.limit, searchQuery, statusFilter);
      } else {
        setDecisionModal((prev) => ({ ...prev, error: res.message || 'Failed to process decision.', loading: false }));
      }
    } catch (err) {
      setDecisionModal((prev) => ({ ...prev, error: err.message || 'Action failed.', loading: false }));
    }
  };

  // Debounce search input so typing doesn't thrash API
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const fetchClients = useCallback(async (page = 1, limit = pagination.limit, query = searchQuery, status = statusFilter) => {
    try {
      setLoading(true);
      setError('');
      const res = await adminService.getClients({
        page,
        limit,
        search: query,
        status,
      });
      if (res.success) {
        setClients(res.data);
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, searchQuery, statusFilter]);

  // Trigger fetch when searchQuery or statusFilter changes
  useEffect(() => {
    fetchClients(1, pagination.limit, searchQuery, statusFilter);
  }, [searchQuery, statusFilter]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    fetchClients(1, pagination.limit, searchInput.trim(), statusFilter);
  };

  // Handle Select All
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(clients.map((c) => c.id || c._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Create Client / Trader Submit
  const handleCreateClient = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!createForm.username || createForm.username.trim().length < 3) {
      setCreateError('Permanent Username / Trader ID must be at least 3 characters.');
      return;
    }

    if (createForm.password && createForm.confirmPassword && createForm.password !== createForm.confirmPassword) {
      setCreateError('Password and Confirm Password do not match.');
      return;
    }

    try {
      setCreating(true);
      const res = await adminService.createTrader({
        fullName: createForm.fullName ? createForm.fullName.trim() : '',
        username: createForm.username.trim(),
        password: createForm.password ? createForm.password.trim() : '',
        confirmPassword: createForm.confirmPassword ? createForm.confirmPassword.trim() : '',
        email: createForm.email ? createForm.email.trim() : '',
        mobile: createForm.mobile ? createForm.mobile.trim() : '',
        status: createForm.status || 'ACTIVE',
        notes: createForm.notes ? createForm.notes.trim() : '',
      });

      if (res.success) {
        setCreateModalOpen(false);
        setCreateForm({
          fullName: '',
          username: '',
          password: '',
          confirmPassword: '',
          email: '',
          mobile: '',
          status: 'ACTIVE',
          notes: '',
        });
        setShowCreatePassword(false);
        setCreateError('');
        fetchClients(1, pagination.limit, searchQuery, statusFilter);

        // Show permanent credentials modal for admin to copy once
        setTempCredsModal({
          open: true,
          title: 'Trader Account Created (Permanent Credentials)',
          username: res.client.username,
          password: res.permanentPassword || res.password || res.temporaryPassword,
        });
      }
    } catch (err) {
      setCreateError(err.message || 'Failed to create trader account.');
    } finally {
      setCreating(false);
    }
  };

  // Status Change (Activate / Suspend / Deactivate)
  const handleStatusChange = async (client, targetStatus) => {
    setConfirmModal({
      open: true,
      title: `${targetStatus === 'SUSPENDED' ? 'Suspend' : targetStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'} Client`,
      message: `Are you sure you want to mark '${client.username}' as ${targetStatus}? ${
        targetStatus === 'SUSPENDED' ? 'Active sessions will be immediately invalidated.' : ''
      }`,
      errorMsg: '',
      isProcessing: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isProcessing: true, errorMsg: '' }));
          const clientId = client.id || client._id;
          await adminService.updateStatus(clientId, targetStatus);
          setConfirmModal({ open: false, title: '', message: '', errorMsg: '', onConfirm: null, isProcessing: false });
          fetchClients(pagination.page, pagination.limit, searchQuery, statusFilter);
        } catch (err) {
          setConfirmModal((prev) => ({ ...prev, isProcessing: false, errorMsg: err.message || 'Status update failed.' }));
        }
      },
    });
  };

  // Password Reset
  const handleResetPassword = async (client) => {
    setConfirmModal({
      open: true,
      title: 'Reset Client Password',
      message: `Generate a new cryptographically secure temporary password for '${client.username}'? Their existing sessions will be instantly terminated.`,
      errorMsg: '',
      isProcessing: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isProcessing: true, errorMsg: '' }));
          const clientId = client.id || client._id;
          const res = await adminService.resetPassword(clientId);
          setConfirmModal({ open: false, title: '', message: '', errorMsg: '', onConfirm: null, isProcessing: false });
          setTempCredsModal({
            open: true,
            title: 'Password Reset Successful',
            username: client.username,
            password: res.temporaryPassword,
          });
          fetchClients(pagination.page, pagination.limit, searchQuery, statusFilter);
        } catch (err) {
          setConfirmModal((prev) => ({ ...prev, isProcessing: false, errorMsg: err.message || 'Password reset failed.' }));
        }
      },
    });
  };

  // Delete Client
  const handleDeleteClient = (client) => {
    setConfirmModal({
      open: true,
      title: 'Delete Client Account',
      message: `Are you sure you want to permanently delete '${client.username}'? Note: Accounts with financial transactions (PayIn, Payout, Deposit, Crypto, or Ledger balances) cannot be deleted and must remain deactivated to preserve the financial audit trail.`,
      errorMsg: '',
      isProcessing: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isProcessing: true, errorMsg: '' }));
          const clientId = client.id || client._id;
          await adminService.deleteClient(clientId);
          setConfirmModal({ open: false, title: '', message: '', errorMsg: '', onConfirm: null, isProcessing: false });
          fetchClients(pagination.page, pagination.limit, searchQuery, statusFilter);
        } catch (err) {
          setConfirmModal((prev) => ({ ...prev, isProcessing: false, errorMsg: err.message || 'Client deletion failed.' }));
        }
      },
    });
  };

  // CSV Export
  const handleExportCsv = async () => {
    try {
      const blob = await adminService.exportCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fichaspot_clients_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`CSV Export failed: ${err.message}`);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Client Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Real MongoDB persistence • FICHASPOT Enterprise Architecture
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => fetchClients(pagination.page, pagination.limit, searchQuery, statusFilter)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#1A2338] transition-colors text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#1A2338] transition-colors text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              setCreateError('');
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Client</span>
          </button>
        </div>
      </div>

      {/* Global page error banner */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-xs text-rose-400">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar (Matching FICHASPOT Layout) */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Client ID / Username..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </form>

        {/* Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Show:</span>
            <select
              value={pagination.limit}
              onChange={(e) => {
                const newLimit = parseInt(e.target.value, 10);
                fetchClients(1, newLimit, searchQuery, statusFilter);
              }}
              className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left border-collapse">
            <thead>
              <tr className="bg-[#0E1524] border-b border-[#1F293D] text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={clients.length > 0 && selectedIds.length === clients.length}
                    className="rounded bg-[#0B0F19] border-[#1F293D] text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-4">Client ID</th>
                <th className="p-4">Role</th>
                <th className="p-4">Status</th>
                <th className="p-4">Credentials Status</th>
                <th className="p-4">Created Date</th>
                <th className="p-4">Last Login</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading verified clients...</span>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-gray-500">
                    No clients found matching the query. Click "Create Client" to add one.
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const id = client.id || client._id;
                  const isSelected = selectedIds.includes(id);

                  return (
                    <tr
                      key={id}
                      className={`hover:bg-[#151D2F] transition-colors ${
                        isSelected ? 'bg-blue-600/5' : ''
                      }`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(id)}
                          className="rounded bg-[#0B0F19] border-[#1F293D] text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 font-mono font-medium text-white flex items-center gap-2">
                        <button
                          onClick={() => openTraderWalletModal(client)}
                          title="Open USDT Wallet & Details"
                          className="hover:text-blue-400 text-left font-semibold transition-colors flex items-center gap-1.5 focus:outline-none"
                        >
                          <Wallet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{client.username}</span>
                        </button>
                        {client.notes && (
                          <span
                            title={client.notes}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 max-w-[120px] truncate"
                          >
                            {client.notes}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          {client.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={client.status} />
                      </td>
                      <td className="p-4 text-gray-400">
                        <span className="text-emerald-400 font-medium">Permanent</span>
                      </td>
                      <td className="p-4 text-gray-400">
                        {new Date(client.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-gray-400">
                        {client.lastLoginAt
                          ? new Date(client.lastLoginAt).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* USDT Wallet & Details Modal Button (Phase 6) */}
                          <button
                            onClick={() => openTraderWalletModal(client)}
                            title="Manage Trader USDT Wallet, History & Adjustments"
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/30 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                          >
                            <Wallet className="w-3.5 h-3.5 text-blue-400" />
                            <span className="hidden sm:inline">USDT Wallet</span>
                          </button>

                          {/* Toggle status: Activate / Suspend */}
                          {client.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleStatusChange(client, 'SUSPENDED')}
                              title="Suspend Client"
                              className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(client, 'ACTIVE')}
                              title="Activate Client"
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Reset Password */}
                          <button
                            onClick={() => handleResetPassword(client)}
                            title="Reset Password"
                            className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Deactivate Account */}
                          {client.status !== 'DEACTIVATED' && (
                            <button
                              onClick={() => handleStatusChange(client, 'DEACTIVATED')}
                              title="Deactivate Client"
                              className="p-1.5 rounded-lg bg-amber-600/10 text-amber-500 hover:bg-amber-600/20 border border-amber-500/20 transition-colors"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Permanent Delete */}
                          <button
                            onClick={() => handleDeleteClient(client)}
                            title="Delete Client (Requires Zero Transactions)"
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-[#0E1524] border-t border-[#1F293D] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div>
            Showing{' '}
            <strong className="text-white">
              {pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}
            </strong>{' '}
            to{' '}
            <strong className="text-white">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </strong>{' '}
            of <strong className="text-white">{pagination.total}</strong> clients
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchClients(pagination.page - 1, pagination.limit, searchQuery, statusFilter)}
              className="p-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A2338]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-white">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchClients(pagination.page + 1, pagination.limit, searchQuery, statusFilter)}
              className="p-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A2338]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Create Trader */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setCreateError('');
        }}
        title="Add New Trader Account"
      >
        <form onSubmit={handleCreateClient} className="space-y-3.5">
          {createError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Full Name (Optional)
            </label>
            <input
              type="text"
              value={createForm.fullName}
              onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
              placeholder="e.g. John Doe / Rajesh Kumar"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Permanent Username / Trader ID */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Permanent Username / Trader ID *
            </label>
            <input
              type="text"
              required
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              placeholder="e.g. Trader001"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">Permanent login username. Letters, numbers, hyphens, and underscores.</p>
          </div>

          {/* Permanent Password & Confirm Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Permanent Password
              </label>
              <div className="relative">
                <input
                  type={showCreatePassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Min. 6 chars (or blank to auto-generate)"
                  minLength={6}
                  className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-3 pr-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-200"
                >
                  {showCreatePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                type={showCreatePassword ? 'text' : 'password'}
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                placeholder="Re-enter password"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Email & Mobile Number (Optional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="trader@example.com"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Mobile Number (Optional)
              </label>
              <input
                type="tel"
                value={createForm.mobile}
                onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Account Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Account Status
            </label>
            <select
              value={createForm.status}
              onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ACTIVE">Active (Can log in immediately)</option>
              <option value="SUSPENDED">Suspended (Access blocked)</option>
            </select>
          </div>

          {/* Internal Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Internal Notes (Optional)
            </label>
            <input
              type="text"
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              placeholder="e.g. VIP trader from North zone"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => {
                setCreateModalOpen(false);
                setCreateError('');
              }}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {creating ? 'Creating Trader...' : 'Create Trader'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Temporary Credentials Viewer */}
      <Modal
        isOpen={tempCredsModal.open}
        onClose={() => setTempCredsModal({ open: false, username: '', password: '', title: '' })}
        title={tempCredsModal.title || 'Client Credentials'}
      >
        <div className="space-y-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-xs text-emerald-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Permanent credentials configured. The client can log in directly using this Client ID and Password without any forced password change.
            </span>
          </div>

          <div className="space-y-3 bg-[#0B0F19] border border-[#1F293D] p-4 rounded-xl font-mono text-xs">
            <div>
              <span className="text-gray-400 text-[11px] uppercase tracking-wider block mb-1">
                Client ID
              </span>
              <span className="text-white font-bold text-sm">{tempCredsModal.username}</span>
            </div>
            <div>
              <span className="text-gray-400 text-[11px] uppercase tracking-wider block mb-1">
                Permanent Password
              </span>
              <span className="text-emerald-400 font-bold text-base tracking-wider">
                {tempCredsModal.password}
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              onClick={() =>
                copyToClipboard(
                  `Client ID: ${tempCredsModal.username}\nPassword: ${tempCredsModal.password}`
                )
              }
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard' : 'Copy Credentials'}</span>
            </button>
            <button
              onClick={() => setTempCredsModal({ open: false, username: '', password: '', title: '' })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, title: '', message: '', errorMsg: '', onConfirm: null, isProcessing: false })}
        title={confirmModal.title}
      >
        <div className="space-y-4">
          {confirmModal.errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{confirmModal.errorMsg}</span>
            </div>
          )}

          <p className="text-xs text-gray-300 leading-relaxed">{confirmModal.message}</p>
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              disabled={confirmModal.isProcessing}
              onClick={() => setConfirmModal({ open: false, title: '', message: '', errorMsg: '', onConfirm: null, isProcessing: false })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs font-medium hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={confirmModal.isProcessing}
              onClick={confirmModal.onConfirm}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              {confirmModal.isProcessing ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm</span>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Trader USDT Wallet & Financial Ledger Management (Phase 6, 7, 8, 10) */}
      <Modal
        isOpen={traderWalletModalOpen}
        onClose={() => {
          setTraderWalletModalOpen(false);
          setSelectedTrader(null);
        }}
        maxWidth="max-w-5xl"
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-wide">
                Trader USDT Wallet & Ledger
              </span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono font-semibold">
                {selectedTrader?.username}
              </span>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Trader Details Header Strip */}
          <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white font-bold text-base shadow-sm">
                {selectedTrader?.username ? selectedTrader.username.slice(0, 2).toUpperCase() : 'TR'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-white text-sm font-mono">{selectedTrader?.username}</h4>
                  <StatusBadge status={selectedTrader?.status || 'ACTIVE'} />
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {selectedTrader?.role || 'TRADER'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedTrader?.fullName ? `${selectedTrader.fullName} • ` : ''}
                  Registered: {selectedTrader?.createdAt ? new Date(selectedTrader.createdAt).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>

            {/* Platform Rate & Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-[#111827] border border-[#1F293D] px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono">
                <span className="text-gray-400">Rate:</span>
                <span className="text-blue-400 font-bold">1 USDT = ₹105</span>
                <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1 rounded uppercase font-semibold">FIXED</span>
              </div>

              <button
                onClick={() => handleOpenAdjustmentModal('CREDIT')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add USDT (Credit)</span>
              </button>

              <button
                onClick={() => handleOpenAdjustmentModal('DEBIT')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-md shadow-amber-600/20 transition-all"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>Deduct USDT (Debit)</span>
              </button>

              <button
                onClick={() => loadTraderWalletData(selectedTrader)}
                disabled={traderWalletLoading}
                title="Refresh Wallet & Ledger Data"
                className="p-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#1A2338] transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${traderWalletLoading ? 'animate-spin text-blue-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* 4 Financial Ledger Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Available USDT */}
            <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>USDT Available</span>
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-emerald-400">
                {traderWalletLoading ? '...' : `${Number(traderWalletData?.availableBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Verified ledger available</p>
            </div>

            {/* 2. Locked USDT */}
            <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>USDT Locked</span>
                <Lock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-gray-300">
                {traderWalletLoading ? '...' : `${Number(traderWalletData?.lockedBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Pending order holds</p>
            </div>

            {/* 3. Total USDT */}
            <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>USDT Total</span>
                <TrendingUp className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-white">
                {traderWalletLoading ? '...' : `${Number(traderWalletData?.totalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Available + Locked</p>
            </div>

            {/* 4. INR Equivalent */}
            <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl p-4 shadow-sm border-l-2 border-l-blue-500">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>INR Equivalent</span>
                <span className="text-[10px] font-mono text-blue-400 font-bold">@ ₹105</span>
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-white">
                {traderWalletLoading ? '...' : `₹${Number(traderWalletData?.inrEquivalent || ((Number(traderWalletData?.availableBalance || 0)) * 105)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              <p className="text-[10px] text-blue-400/80 mt-1">Fixed Valuation Display</p>
            </div>
          </div>

          {/* Sub-Tabs Bar */}
          <div className="flex items-center gap-1 border-b border-[#1F293D] pb-1 overflow-x-auto">
            <button
              onClick={() => setTraderWalletTab('transactions')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                traderWalletTab === 'transactions'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-[#151D2F]'
              }`}
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>Wallet Transactions ({traderTransactions.length})</span>
            </button>

            <button
              onClick={() => setTraderWalletTab('adjustments')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                traderWalletTab === 'adjustments'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-[#151D2F]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Adjustments & Approvals</span>
              {traderAdjustments.filter((a) => a.status === 'PENDING').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-bold text-[10px]">
                  {traderAdjustments.filter((a) => a.status === 'PENDING').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setTraderWalletTab('deposits')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                traderWalletTab === 'deposits'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-[#151D2F]'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Deposit Requests ({traderDeposits.length})</span>
            </button>

            <button
              onClick={() => setTraderWalletTab('activities')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                traderWalletTab === 'activities'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-[#151D2F]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Client Activity Logs ({traderActivities.length})</span>
            </button>
          </div>

          {/* Sub-Tab Contents */}
          <div className="min-h-[220px]">
            {/* Tab 1: Wallet Transactions */}
            {traderWalletTab === 'transactions' && (
              <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#111827] text-gray-400 border-b border-[#1F293D] text-[10px] uppercase font-mono tracking-wider">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Entry Type</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Amount (USDT)</th>
                        <th className="p-3">Balance After</th>
                        <th className="p-3">Valuation (@ ₹105)</th>
                        <th className="p-3">Reference</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F293D] font-mono text-[11px]">
                      {traderTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500 font-sans">
                            No verified USDT ledger entries for this trader.
                          </td>
                        </tr>
                      ) : (
                        traderTransactions.map((tx) => (
                          <tr key={tx.id || tx._id} className="hover:bg-[#151D2F]">
                            <td className="p-3 text-gray-400 font-sans">{new Date(tx.createdAt).toLocaleString()}</td>
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">
                                {tx.entryType}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                tx.type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className={`p-3 font-bold ${tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tx.amountDisplay || `${tx.amount} USDT`}
                            </td>
                            <td className="p-3 text-white">{tx.balanceAfter} USDT</td>
                            <td className="p-3 text-gray-300">₹{Number(tx.inrEquivalent || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-gray-400 truncate max-w-[120px]">{tx.referenceRequestId}</td>
                            <td className="p-3 text-gray-400 font-sans truncate max-w-[160px]">{tx.notes || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Adjustments & Approvals */}
            {traderWalletTab === 'adjustments' && (
              <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full min-w-[760px] text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#111827] text-gray-400 border-b border-[#1F293D] text-[10px] uppercase font-mono tracking-wider">
                      <tr>
                        <th className="p-3">Adjustment ID</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">INR Valuation (@ ₹105)</th>
                        <th className="p-3">Reason & Ref</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Requested By</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F293D] font-mono text-[11px]">
                      {traderAdjustments.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500 font-sans">
                            No adjustment records found for this trader. Use "Add USDT" or "Deduct USDT" to create one.
                          </td>
                        </tr>
                      ) : (
                        traderAdjustments.map((adj) => (
                          <tr key={adj._id || adj.adjustmentId} className="hover:bg-[#151D2F]">
                            <td className="p-3 font-semibold text-white">{adj.adjustmentId}</td>
                            <td className="p-3">
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                adj.type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {adj.type}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-white">{adj.amount} USDT</td>
                            <td className="p-3 text-emerald-400">
                              ₹{(adj.amount * 105).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-gray-300 font-sans max-w-[160px]">
                              <p className="truncate font-medium">{adj.reason}</p>
                              <p className="text-[10px] text-gray-500 font-mono truncate">Ref: {adj.referenceId}</p>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                adj.status === 'APPROVED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : adj.status === 'REJECTED'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse'
                              }`}>
                                {adj.status}
                              </span>
                            </td>
                            <td className="p-3 text-gray-400 font-sans">
                              {adj.requestedBy?.username || 'Admin'}
                            </td>
                            <td className="p-3 text-right">
                              {adj.status === 'PENDING' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setDecisionModal({ open: true, adjustment: adj, action: 'APPROVE', notes: '', reason: '', error: '', loading: false })}
                                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] shadow transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => setDecisionModal({ open: true, adjustment: adj, action: 'REJECT', notes: '', reason: '', error: '', loading: false })}
                                    className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-semibold text-[10px] shadow transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-gray-500 font-sans">Finalized</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 3: Deposit Requests */}
            {traderWalletTab === 'deposits' && (
              <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full min-w-[650px] text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#111827] text-gray-400 border-b border-[#1F293D] text-[10px] uppercase font-mono tracking-wider">
                      <tr>
                        <th className="p-3">Request ID</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">TX Hash</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F293D] font-mono text-[11px]">
                      {traderDeposits.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-500 font-sans">
                            No deposit requests found for this trader.
                          </td>
                        </tr>
                      ) : (
                        traderDeposits.map((dep) => (
                          <tr key={dep._id || dep.requestId} className="hover:bg-[#151D2F]">
                            <td className="p-3 font-semibold text-white">{dep.requestId}</td>
                            <td className="p-3 text-gray-300 font-sans">{dep.depositTypeLabel || dep.depositType}</td>
                            <td className="p-3 font-bold text-emerald-400">{dep.amount} {dep.currency || 'USDT'}</td>
                            <td className="p-3 text-gray-400 truncate max-w-[150px]">{dep.txHash || '-'}</td>
                            <td className="p-3">
                              <StatusBadge status={dep.status} />
                            </td>
                            <td className="p-3 text-gray-400 font-sans">{new Date(dep.createdAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 4: Client Activity Logs */}
            {traderActivities && traderWalletTab === 'activities' && (
              <div className="bg-[#0E1524] border border-[#1F293D] rounded-xl p-4 max-h-72 overflow-y-auto space-y-2.5">
                {traderActivities.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-8">No logged client activities found.</p>
                ) : (
                  traderActivities.map((act) => (
                    <div key={act.activityId || act._id} className="text-xs border-b border-[#1F293D]/60 pb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-blue-400 font-mono text-[11px]">{act.eventType}</span>
                          <span className="text-[10px] text-gray-500">by {act.actorUsername}</span>
                        </div>
                        <p className="text-gray-300 mt-0.5">{act.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-gray-500 font-mono">{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal: Request USDT Credit / Debit Adjustment (Phase 7 & 8) */}
      <Modal
        isOpen={adjustmentModal.open}
        onClose={() => setAdjustmentModal({ open: false, type: 'CREDIT', amount: '', reason: '', referenceId: '', error: '', loading: false })}
        title={`Request USDT ${adjustmentModal.type === 'CREDIT' ? 'Credit (+)' : 'Debit (-)'}`}
      >
        <form onSubmit={handleSubmitAdjustment} className="space-y-4">
          {adjustmentModal.error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{adjustmentModal.error}</span>
            </div>
          )}

          {/* Trader & Balance Summary */}
          <div className="bg-[#0E1524] border border-[#1F293D] p-3 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-gray-400">Target Trader:</span>
              <p className="font-bold text-white font-mono mt-0.5">{selectedTrader?.username}</p>
            </div>
            <div className="text-right">
              <span className="text-gray-400">Current Available:</span>
              <p className="font-bold text-emerald-400 font-mono mt-0.5">
                {Number(traderWalletData?.availableBalance || 0).toFixed(2)} USDT
              </p>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Adjustment Amount (USDT) *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              required
              value={adjustmentModal.amount}
              onChange={(e) => setAdjustmentModal({ ...adjustmentModal, amount: e.target.value, error: '' })}
              placeholder="e.g. 50.00"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono font-semibold"
            />
          </div>

          {/* Dynamic Valuation Calculation Preview */}
          {parseFloat(adjustmentModal.amount) > 0 && (
            <div className="bg-[#0B0F19] border border-[#1F293D] p-3 rounded-xl space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between text-gray-400">
                <span>Fixed Rate:</span>
                <span className="text-blue-400 font-semibold">₹105 / USDT</span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>Adjustment INR Value:</span>
                <span className="text-emerald-400 font-bold">
                  ₹{(parseFloat(adjustmentModal.amount) * 105).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-1.5 border-t border-[#1F293D] flex items-center justify-between">
                <span className="text-gray-300 font-semibold">Resulting Balance:</span>
                <span className="font-bold text-white">
                  {(
                    Number(traderWalletData?.availableBalance || 0) +
                    (adjustmentModal.type === 'CREDIT' ? 1 : -1) * parseFloat(adjustmentModal.amount)
                  ).toFixed(2)} USDT
                </span>
              </div>
            </div>
          )}

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Mandatory Adjustment Reason *
            </label>
            <textarea
              required
              rows={2}
              value={adjustmentModal.reason}
              onChange={(e) => setAdjustmentModal({ ...adjustmentModal, reason: e.target.value, error: '' })}
              placeholder="e.g. Manual settlement adjustment verified against blockchain hash..."
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Mandatory Supporting Reference ID */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Supporting Transaction / Reference ID *
            </label>
            <input
              type="text"
              required
              value={adjustmentModal.referenceId}
              onChange={(e) => setAdjustmentModal({ ...adjustmentModal, referenceId: e.target.value, error: '' })}
              placeholder="e.g. TX-TRON-889123 or BANK-REF-99120"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            <p className="text-[10px] text-gray-500 mt-1">Must be a unique verifiable proof/settlement identifier.</p>
          </div>

          {/* Policy Notice */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300">
            <strong>Security Policy:</strong> Request will be recorded with PENDING status. Independent administrator authorization is required before ledger balances are committed.
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              disabled={adjustmentModal.loading}
              onClick={() => setAdjustmentModal({ open: false, type: 'CREDIT', amount: '', reason: '', referenceId: '', error: '', loading: false })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjustmentModal.loading}
              className={`px-5 py-2 rounded-xl text-white font-semibold text-xs shadow-md flex items-center gap-2 ${
                adjustmentModal.type === 'CREDIT' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              {adjustmentModal.loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting Request...</span>
                </>
              ) : (
                <span>Submit {adjustmentModal.type} Request</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adjustment Decision (Approve / Reject) */}
      <Modal
        isOpen={decisionModal.open}
        onClose={() => setDecisionModal({ open: false, adjustment: null, action: 'APPROVE', notes: '', reason: '', error: '', loading: false })}
        title={`${decisionModal.action === 'APPROVE' ? 'Approve' : 'Reject'} USDT Adjustment`}
      >
        <form onSubmit={handleExecuteDecision} className="space-y-4">
          {decisionModal.error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{decisionModal.error}</span>
            </div>
          )}

          {decisionModal.adjustment && (
            <div className="bg-[#0E1524] border border-[#1F293D] p-3.5 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Adjustment ID:</span>
                <span className="text-white font-bold">{decisionModal.adjustment.adjustmentId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Trader:</span>
                <span className="text-blue-400 font-bold">{decisionModal.adjustment.clientId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Operation:</span>
                <span className={`font-bold ${decisionModal.adjustment.type === 'CREDIT' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {decisionModal.adjustment.type} {decisionModal.adjustment.amount} USDT
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Valuation (@ ₹105):</span>
                <span className="text-white font-bold">
                  ₹{(decisionModal.adjustment.amount * 105).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Reference:</span>
                <span className="text-gray-300">{decisionModal.adjustment.referenceId}</span>
              </div>
              <div className="pt-2 border-t border-[#1F293D] text-gray-300 font-sans">
                <span className="text-gray-500">Reason: </span>
                {decisionModal.adjustment.reason}
              </div>
            </div>
          )}

          {decisionModal.action === 'APPROVE' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Approval Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={decisionModal.notes}
                onChange={(e) => setDecisionModal({ ...decisionModal, notes: e.target.value })}
                placeholder="Evidence verified and approved for ledger settlement..."
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Mandatory Rejection Reason *
              </label>
              <textarea
                required
                rows={2}
                value={decisionModal.reason}
                onChange={(e) => setDecisionModal({ ...decisionModal, reason: e.target.value })}
                placeholder="State why this adjustment request is rejected..."
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              disabled={decisionModal.loading}
              onClick={() => setDecisionModal({ open: false, adjustment: null, action: 'APPROVE', notes: '', reason: '', error: '', loading: false })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={decisionModal.loading}
              className={`px-5 py-2 rounded-xl text-white font-semibold text-xs shadow-md flex items-center gap-2 ${
                decisionModal.action === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              {decisionModal.loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm {decisionModal.action === 'APPROVE' ? 'Approval' : 'Rejection'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
