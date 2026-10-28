import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  Building2,
  ShieldCheck,
  Store,
  Check,
  Send,
  Eye,
} from 'lucide-react';
import { payinService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const AdminPayIns = () => {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Review / "₹ Received — Confirm Payment" Modal
  const [reviewModal, setReviewModal] = useState({
    open: false,
    payIn: null,
    action: 'CONFIRM',
    notes: 'Payment verified with PhonePe Business merchant settlement',
    verificationEvidence: 'Settlement matched on merchant statement',
  });
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const fetchPayIns = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        const res = await payinService.getAllAdmin({
          page,
          limit: pagination.limit,
          search,
          status: statusFilter,
          mode: modeFilter,
          merchant: merchantFilter,
        });
        if (res.success) {
          setRequests(res.data);
          setPagination(res.pagination);
        }
      } catch (err) {
        setFeedback({ type: 'error', message: `Error loading PayIns: ${err.message}` });
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, search, statusFilter, modeFilter, merchantFilter]
  );

  useEffect(() => {
    fetchPayIns(1);
  }, [fetchPayIns]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewModal.payIn) return;

    try {
      setProcessing(true);
      const res = await payinService.reviewAdmin(
        reviewModal.payIn._id,
        reviewModal.action,
        reviewModal.notes,
        reviewModal.verificationEvidence
      );
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setReviewModal({
          open: false,
          payIn: null,
          action: 'CONFIRM',
          notes: '',
          verificationEvidence: '',
        });
        fetchPayIns(pagination.page);
      }
    } catch (err) {
      alert(`Review failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">PayIn Verification & Confirmation Desk</h1>
          <p className="text-xs text-gray-400 mt-1">
            Independently audit client UTR claims against receiving PhonePe merchant records and authorize ledger credits.
          </p>
        </div>

        <button
          onClick={() => fetchPayIns(pagination.page)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {feedback.message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback({ type: '', message: '' })} className="font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Request ID, Client, UTR, or Merchant..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending (Awaiting UTR)</option>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="CONFIRMED">Admin Confirmed</option>
              <option value="DEMO_TRANSACTION">Demo Transaction</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-2.5 py-1.5 text-xs text-white"
          >
            <option value="">All Modes</option>
            <option value="LIVE">Live Transactions</option>
            <option value="DEMO_ONLY">Demo Simulated</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-4">Payment ID</th>
                <th className="p-4">Client ID</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Receiving Merchant</th>
                <th className="p-4">Scanner ID</th>
                <th className="p-4">Client Ref / UTR</th>
                <th className="p-4">Mode</th>
                <th className="p-4">Status</th>
                <th className="p-4">Verification</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-gray-400">Loading PayIn requests...</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-gray-500">No PayIn records match this filter.</td>
                </tr>
              ) : (
                requests.map((item) => (
                  <tr key={item._id} className="hover:bg-[#151D2F] transition-colors">
                    <td className="p-4 font-mono font-semibold text-white">{item.requestId}</td>
                    <td className="p-4 text-gray-300 font-medium">{item.clientId}</td>
                    <td className="p-4 font-bold text-emerald-400 font-mono">
                      {item.currency} {item.amount.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 font-medium text-white">
                        <Store className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{item.merchantName || 'Authorized Merchant'}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-gray-400">
                      {item.scannerId || 'QR-001'} (v{item.scannerVersion || 1})
                    </td>
                    <td className="p-4 font-mono">
                      {item.referenceId ? (
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                          {item.referenceId}
                        </span>
                      ) : (
                        <span className="text-gray-500 italic">No UTR submitted</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.isDemo
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {item.isDemo ? 'DEMO' : 'LIVE'}
                      </span>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-4">
                      <span
                        className={`text-[11px] font-semibold ${
                          item.verificationStatus === 'VERIFIED'
                            ? 'text-emerald-400'
                            : item.verificationStatus === 'UNDER_REVIEW'
                            ? 'text-amber-400'
                            : item.verificationStatus === 'REJECTED'
                            ? 'text-rose-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {item.verificationStatus || 'UNVERIFIED'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {!['CONFIRMED', 'REJECTED', 'DEMO_TRANSACTION'].includes(item.status) ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              setReviewModal({
                                open: true,
                                payIn: item,
                                action: 'CONFIRM',
                                notes: `Verified against merchant ${item.merchantName} account`,
                                verificationEvidence: `Bank settlement matched for UTR ${item.referenceId || 'N/A'}`,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 font-bold text-[11px] flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>₹ Received — Confirm Payment</span>
                          </button>
                          <button
                            onClick={() =>
                              setReviewModal({
                                open: true,
                                payIn: item,
                                action: 'REJECT',
                                notes: 'Payment verification failed: no matching receipt found',
                                verificationEvidence: 'No credit found in statement',
                              })
                            }
                            className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 border border-rose-500/30 font-semibold text-[11px]"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-[11px] font-mono">
                          {item.status === 'CONFIRMED' || item.status === 'DEMO_TRANSACTION'
                            ? 'ADMIN_CONFIRMED'
                            : 'FINALIZED'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & "₹ Received — Confirm Payment" Modal */}
      <Modal
        isOpen={reviewModal.open}
        onClose={() =>
          setReviewModal({
            open: false,
            payIn: null,
            action: 'CONFIRM',
            notes: '',
            verificationEvidence: '',
          })
        }
        title={`Audit & Confirm Payment: ${reviewModal.payIn?.requestId}`}
      >
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Client ID:</span>
              <span className="font-bold text-white">{reviewModal.payIn?.clientId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Receiving Merchant:</span>
              <span className="font-bold text-blue-400">{reviewModal.payIn?.merchantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Scanner Used:</span>
              <span className="font-mono text-gray-300">
                {reviewModal.payIn?.scannerId} (v{reviewModal.payIn?.scannerVersion || 1})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Client UTR Reference:</span>
              <span className="font-mono font-bold text-amber-400">
                {reviewModal.payIn?.referenceId || 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount to Credit:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {reviewModal.payIn?.currency} {reviewModal.payIn?.amount?.toFixed(2)}
              </span>
            </div>
          </div>

          {reviewModal.payIn?.isDemo && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold">
              DEMO TRANSACTION: This payment will be marked CONFIRMED but EXCLUDED from real ledger revenue.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Administrative Decision</label>
            <select
              value={reviewModal.action}
              onChange={(e) => setReviewModal({ ...reviewModal, action: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="CONFIRM">CONFIRM (₹ Received — Credit verified balance to ledger)</option>
              <option value="UNDER_REVIEW">UNDER_REVIEW (Hold for further verification)</option>
              <option value="REJECT">REJECT (Decline payment claim)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Verification Evidence / Bank Settlement Match *
            </label>
            <input
              type="text"
              required
              value={reviewModal.verificationEvidence}
              onChange={(e) => setReviewModal({ ...reviewModal, verificationEvidence: e.target.value })}
              placeholder="e.g. Matched PhonePe settlement ID: SETTL-98120 on Axis Bank"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Decision Notes (Visible in Audit Log & History) *
            </label>
            <input
              type="text"
              required
              value={reviewModal.notes}
              onChange={(e) => setReviewModal({ ...reviewModal, notes: e.target.value })}
              placeholder="e.g. Verified and confirmed by administrator"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() =>
                setReviewModal({
                  open: false,
                  payIn: null,
                  action: 'CONFIRM',
                  notes: '',
                  verificationEvidence: '',
                })
              }
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing}
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-lg ${
                reviewModal.action === 'CONFIRM'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{processing ? 'Processing...' : '₹ Received — Confirm Payment'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
