import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  UserX,
  CreditCard,
  Send,
  Eye,
  ArrowUpFromLine,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { payoutService, adminService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const AdminPayouts = () => {
  // Payouts list & pagination
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Dashboard Stats
  const [stats, setStats] = useState({
    totalPayouts: 0,
    activePayouts: 0,
    pendingPayouts: 0,
    claimedPayouts: 0,
    completedPayouts: 0,
    failedPayouts: 0,
    disabledTraders: 0,
  });

  // Traders list for assignment and permission management
  const [traders, setTraders] = useState([]);
  const [selectedTraderId, setSelectedTraderId] = useState('');
  const [traderSettings, setTraderSettings] = useState(null);
  const [updatingPermission, setUpdatingPermission] = useState(false);

  // Assign Payout Modal
  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    traderId: '',
    amount: '',
    currency: 'INR',
    beneficiaryName: '',
    accountNumber: '',
    ifscOrUpi: '',
    notes: '',
    expiresInHours: '24',
  });
  const [assigning, setAssigning] = useState(false);

  // Status Review Modal
  const [reviewModal, setReviewModal] = useState({
    open: false,
    payout: null,
    status: 'PROCESSING',
    decisionNotes: '',
    reference: '',
  });
  const [processing, setProcessing] = useState(false);

  // Feedback banner
  const [banner, setBanner] = useState(null);

  // Fetch all payouts & dashboard stats
  const fetchPayouts = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        const res = await payoutService.getAllAdmin({
          page,
          limit: pagination.limit,
          search,
          status: statusFilter,
        });
        if (res && res.success) {
          setRequests(res.data || []);
          if (res.stats) setStats(res.stats);
          if (res.pagination) setPagination(res.pagination);
        }
      } catch (err) {
        console.warn('[AdminPayouts] fetch error:', err.message);
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, search, statusFilter]
  );

  // Fetch selected trader's payout settings
  const fetchTraderSettings = useCallback(async (traderId) => {
    if (!traderId) return;
    try {
      const res = await payoutService.getTraderPayoutSettings(traderId);
      if (res && res.success) {
        setTraderSettings(res.trader);
      }
    } catch (err) {
      console.warn('[AdminPayouts] fetch trader settings error:', err.message);
    }
  }, []);

  // Fetch traders list for controls
  const fetchTraders = useCallback(async () => {
    try {
      const res = await adminService.getTraders({ limit: 100 });
      if (res && res.success) {
        const list = res.data || [];
        setTraders(list);
        if (list.length > 0) {
          const firstId = list[0]._id || list[0].id;
          setSelectedTraderId((prev) => prev || firstId);
        }
      }
    } catch (err) {
      console.warn('[AdminPayouts] fetch traders error:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchPayouts(1);
    fetchTraders();
  }, [fetchPayouts, fetchTraders]);

  useEffect(() => {
    if (selectedTraderId) {
      fetchTraderSettings(selectedTraderId);
    }
  }, [selectedTraderId, fetchTraderSettings]);

  // Handle Toggle Trader Payout Permission
  const handleTogglePayoutPermission = async () => {
    if (!traderSettings || !selectedTraderId) return;
    const newStatus = !traderSettings.payoutEnabled;

    try {
      setUpdatingPermission(true);
      const res = await payoutService.updateTraderPayoutSettings(
        selectedTraderId,
        newStatus,
        `Admin toggled payout permission to ${newStatus ? 'ENABLED' : 'DISABLED'}`
      );
      if (res && res.success) {
        setTraderSettings((prev) => ({ ...prev, payoutEnabled: newStatus }));
        setBanner({
          type: 'success',
          text: `Trader ${traderSettings.username} payouts ${newStatus ? 'ENABLED' : 'DISABLED'} successfully.`,
        });
        fetchPayouts(pagination.page);
      } else {
        alert(res?.message || 'Failed to update payout permission.');
      }
    } catch (err) {
      alert(err.message || 'Error updating payout permission.');
    } finally {
      setUpdatingPermission(false);
      setTimeout(() => setBanner(null), 3500);
    }
  };

  // Handle Assign Payout
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignForm.traderId) {
      alert('Please select a Trader.');
      return;
    }
    const numAmount = parseFloat(assignForm.amount);
    if (!numAmount || numAmount <= 0) {
      alert('Please enter a valid payout amount.');
      return;
    }

    try {
      setAssigning(true);
      const res = await payoutService.assignPayout(assignForm);
      if (res && res.success) {
        setAssignModal(false);
        setAssignForm({
          traderId: selectedTraderId || '',
          amount: '',
          currency: 'INR',
          beneficiaryName: '',
          accountNumber: '',
          ifscOrUpi: '',
          notes: '',
          expiresInHours: '24',
        });
        setBanner({
          type: 'success',
          text: `Payout successfully assigned to Trader!`,
        });
        fetchPayouts(1);
        if (selectedTraderId) fetchTraderSettings(selectedTraderId);
      } else {
        alert(res?.message || 'Failed to assign payout.');
      }
    } catch (err) {
      alert(err.message || 'Error assigning payout.');
    } finally {
      setAssigning(false);
      setTimeout(() => setBanner(null), 3500);
    }
  };

  // Handle Review Payout
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewModal.payout) return;

    try {
      setProcessing(true);
      const res = await payoutService.reviewAdmin(
        reviewModal.payout._id || reviewModal.payout.requestId,
        reviewModal.status,
        reviewModal.decisionNotes,
        reviewModal.reference
      );
      if (res && res.success) {
        setReviewModal({
          open: false,
          payout: null,
          status: 'PROCESSING',
          decisionNotes: '',
          reference: '',
        });
        setBanner({
          type: 'success',
          text: `Payout ${reviewModal.payout.requestId} updated to ${reviewModal.status}.`,
        });
        fetchPayouts(pagination.page);
      } else {
        alert(res?.message || 'Status update failed.');
      }
    } catch (err) {
      alert(`Payout update failed: ${err.message}`);
    } finally {
      setProcessing(false);
      setTimeout(() => setBanner(null), 3500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Payout Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Assign payouts to traders, manage trader permissions, and verify execution settlements.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setAssignForm((prev) => ({ ...prev, traderId: selectedTraderId }));
              setAssignModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Payout</span>
          </button>

          <button
            onClick={() => {
              fetchPayouts(pagination.page);
              if (selectedTraderId) fetchTraderSettings(selectedTraderId);
            }}
            className="p-2.5 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{banner.text}</span>
        </div>
      )}

      {/* 6.1 ADMIN PAYOUT DASHBOARD METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="p-3.5 bg-[#111827] border border-[#1F293D] rounded-xl">
          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Total Payouts</span>
          <span className="text-xl font-bold text-white font-mono mt-1 block">{stats.totalPayouts}</span>
        </div>
        <div className="p-3.5 bg-[#111827] border border-blue-500/20 rounded-xl">
          <span className="text-[10px] text-blue-400 uppercase font-semibold block">Active</span>
          <span className="text-xl font-bold text-blue-400 font-mono mt-1 block">{stats.activePayouts}</span>
        </div>
        <div className="p-3.5 bg-[#111827] border border-amber-500/20 rounded-xl">
          <span className="text-[10px] text-amber-400 uppercase font-semibold block">Pending / Assigned</span>
          <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">{stats.pendingPayouts}</span>
        </div>
        <div className="p-3.5 bg-[#111827] border border-indigo-500/20 rounded-xl">
          <span className="text-[10px] text-indigo-400 uppercase font-semibold block">Claimed</span>
          <span className="text-xl font-bold text-indigo-400 font-mono mt-1 block">{stats.claimedPayouts}</span>
        </div>
        <div className="p-3.5 bg-[#111827] border border-emerald-500/20 rounded-xl">
          <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Completed</span>
          <span className="text-xl font-bold text-emerald-400 font-mono mt-1 block">{stats.completedPayouts}</span>
        </div>
        <div className="p-3.5 bg-[#111827] border border-rose-500/20 rounded-xl">
          <span className="text-[10px] text-rose-400 uppercase font-semibold block">Failed / Cancelled</span>
          <span className="text-xl font-bold text-rose-400 font-mono mt-1 block">{stats.failedPayouts}</span>
        </div>
        <div className="p-3.5 bg-[#111827] border border-red-500/30 rounded-xl">
          <span className="text-[10px] text-red-400 uppercase font-semibold block">Disabled Traders</span>
          <span className="text-xl font-bold text-red-400 font-mono mt-1 block">{stats.disabledTraders}</span>
        </div>
      </div>

      {/* 6.2 TRADER PAYOUT CONTROL CARD */}
      <div className="p-5 bg-[#111827] border border-[#1F293D] rounded-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1F293D] pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Trader Payout Permissions & Control</h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Select Trader:</span>
            <select
              value={selectedTraderId}
              onChange={(e) => setSelectedTraderId(e.target.value)}
              className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            >
              {traders.map((t) => {
                const tid = t.id || t._id;
                return (
                  <option key={tid} value={tid}>
                    {t.username} {t.fullName ? `(${t.fullName})` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {traderSettings ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <div>
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Trader Identity</span>
              <p className="text-sm font-bold text-white font-mono mt-0.5">{traderSettings.username}</p>
              <p className="text-xs text-gray-400">{traderSettings.fullName || 'No display name'}</p>
            </div>

            <div>
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Account Status</span>
              <div className="mt-1">
                <StatusBadge status={traderSettings.status} />
              </div>
            </div>

            <div>
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Active / Total Payouts</span>
              <p className="text-xs font-mono text-gray-300 mt-1">
                <span className="text-blue-400 font-bold">{traderSettings.activePayoutCount || 0}</span> Active /{' '}
                <span className="text-gray-400">{traderSettings.totalPayoutCount || 0}</span> Total
              </p>
            </div>

            {/* Payouts Enabled / Disabled Control */}
            <div className="flex items-center justify-end">
              <button
                onClick={handleTogglePayoutPermission}
                disabled={updatingPermission}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border shadow-lg ${
                  traderSettings.payoutEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                }`}
              >
                {traderSettings.payoutEnabled ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Payouts Enabled (Click to Disable)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Payouts Disabled (Click to Enable)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Select a trader above to view and modify payout permissions.</p>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Payout ID, Trader, Recipient..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="CLAIMED">CLAIMED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="FAILED">FAILED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-4">Payout ID</th>
                <th className="p-4">Trader</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Beneficiary & Account</th>
                <th className="p-4">Status</th>
                <th className="p-4">Assigned / Created</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400">
                    Loading payout records...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    No payout records found. Click "Assign Payout" to issue a payout to a trader.
                  </td>
                </tr>
              ) : (
                requests.map((item) => (
                  <tr key={item._id} className="hover:bg-[#151D2F] transition-colors">
                    <td className="p-4 font-mono font-semibold text-white">{item.requestId}</td>
                    <td className="p-4 text-gray-300">
                      <div className="font-medium font-mono text-white">{item.clientId}</div>
                      <div className="text-[10px] text-gray-500">{item.userId?.fullName || ''}</div>
                    </td>
                    <td className="p-4 font-bold text-rose-400 font-mono">
                      ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-gray-300">
                      <div className="font-medium text-white">{item.recipientDetails?.accountHolder}</div>
                      <div className="text-[11px] text-gray-400 font-mono">
                        {item.recipientDetails?.accountNumberMasked ||
                          item.recipientDetails?.ifscOrUpi ||
                          '-'}
                      </div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-4 text-gray-400 text-[11px] font-mono">
                      {new Date(item.assignedAt || item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      {!['COMPLETED', 'REJECTED', 'CANCELLED'].includes(item.status) ? (
                        <button
                          onClick={() =>
                            setReviewModal({
                              open: true,
                              payout: item,
                              status: item.status === 'CLAIMED' ? 'COMPLETED' : 'PROCESSING',
                              decisionNotes: '',
                              reference: '',
                            })
                          }
                          className="px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 font-semibold text-[11px]"
                        >
                          Update Status
                        </button>
                      ) : (
                        <span className="text-gray-500 text-[11px] font-mono">Finalized</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ASSIGN PAYOUT */}
      <Modal
        isOpen={assignModal}
        onClose={() => setAssignModal(false)}
        title="Assign Payout to Trader"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Target Trader *</label>
            <select
              required
              value={assignForm.traderId}
              onChange={(e) => setAssignForm({ ...assignForm, traderId: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            >
              <option value="">Select Trader Account</option>
              {traders.map((t) => {
                const tid = t.id || t._id;
                return (
                  <option key={tid} value={tid}>
                    {t.username} {t.fullName ? `(${t.fullName})` : ''} - [Status: {t.status}]
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Currency</label>
              <input
                type="text"
                disabled
                value="INR (₹)"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-gray-400 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Amount (₹) *</label>
              <input
                type="number"
                required
                min={1}
                step="any"
                value={assignForm.amount}
                onChange={(e) => setAssignForm({ ...assignForm, amount: e.target.value })}
                placeholder="50000"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Beneficiary Name *</label>
            <input
              type="text"
              required
              value={assignForm.beneficiaryName}
              onChange={(e) => setAssignForm({ ...assignForm, beneficiaryName: e.target.value })}
              placeholder="e.g. Ramesh Chandra"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Account Number</label>
              <input
                type="text"
                value={assignForm.accountNumber}
                onChange={(e) => setAssignForm({ ...assignForm, accountNumber: e.target.value })}
                placeholder="e.g. 981273910283"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">IFSC / UPI ID</label>
              <input
                type="text"
                value={assignForm.ifscOrUpi}
                onChange={(e) => setAssignForm({ ...assignForm, ifscOrUpi: e.target.value })}
                placeholder="e.g. SBIN0001234 / ramesh@upi"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Expiry (Hours)</label>
              <input
                type="number"
                min={1}
                value={assignForm.expiresInHours}
                onChange={(e) => setAssignForm({ ...assignForm, expiresInHours: e.target.value })}
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Assignment Notes</label>
              <input
                type="text"
                value={assignForm.notes}
                onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                placeholder="e.g. High priority payout"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setAssignModal(false)}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={assigning}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30"
            >
              {assigning ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: UPDATE / REVIEW STATUS */}
      <Modal
        isOpen={reviewModal.open}
        onClose={() =>
          setReviewModal({
            open: false,
            payout: null,
            status: 'PROCESSING',
            decisionNotes: '',
            reference: '',
          })
        }
        title={`Process Payout: ${reviewModal.payout?.requestId || ''}`}
      >
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1 text-xs">
            <p className="text-gray-400">
              Trader: <strong className="text-white">{reviewModal.payout?.clientId}</strong>
            </p>
            <p className="text-gray-400">
              Beneficiary: <strong className="text-white">{reviewModal.payout?.recipientDetails?.accountHolder}</strong>
            </p>
            <p className="text-gray-400">
              Amount to Transfer:{' '}
              <strong className="text-rose-400">
                ₹{Number(reviewModal.payout?.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Execution Status</label>
            <select
              value={reviewModal.status}
              onChange={(e) => setReviewModal({ ...reviewModal, status: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="PROCESSING">PROCESSING (Wired / Transfer in progress)</option>
              <option value="COMPLETED">COMPLETED (Settlement verified & record ledger entry)</option>
              <option value="FAILED">FAILED (Transfer failed)</option>
              <option value="CANCELLED">CANCELLED (Cancelled by admin)</option>
              <option value="REJECTED">REJECTED (Decline payout)</option>
            </select>
          </div>

          {reviewModal.status === 'COMPLETED' && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Bank / IMPS / UTR Reference *
              </label>
              <input
                type="text"
                required
                value={reviewModal.reference}
                onChange={(e) => setReviewModal({ ...reviewModal, reference: e.target.value })}
                placeholder="e.g. UTR / Ref: 48920192849"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Administrative Notes</label>
            <input
              type="text"
              value={reviewModal.decisionNotes}
              onChange={(e) => setReviewModal({ ...reviewModal, decisionNotes: e.target.value })}
              placeholder="e.g. Transfer verified via HDFC Corporate Portal"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() =>
                setReviewModal({
                  open: false,
                  payout: null,
                  status: 'PROCESSING',
                  decisionNotes: '',
                  reference: '',
                })
              }
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
            >
              {processing ? 'Saving...' : 'Confirm Status Update'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
