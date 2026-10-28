import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  Settings,
  ExternalLink,
  Copy,
  Check,
  FileText,
  ShieldCheck,
  X,
  Plus,
  Coins,
  QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { depositService } from '../../services/api';

export const AdminDeposits = () => {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Review & Verification Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [reviewAction, setReviewAction] = useState('APPROVE');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('VERIFIED');
  const [verificationRef, setVerificationRef] = useState('TRON_EXPLORER_FINAL');
  const [processing, setProcessing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Settings Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  // Screenshot viewer modal
  const [previewImage, setPreviewImage] = useState(null);

  // Copied indicator
  const [copiedId, setCopiedId] = useState(null);

  const fetchDeposits = useCallback(
    async (page = 1, isManual = false) => {
      try {
        if (isManual) setIsRefreshing(true);
        else setLoading(true);

        const res = await depositService.getAllAdmin({
          page,
          limit: pagination.limit,
          search: search.trim(),
          status: statusFilter,
          depositType: typeFilter,
          verification: verificationFilter,
        });

        if (res.success) {
          setRequests(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      } catch (err) {
        console.error('[AdminDeposits] Failed to fetch:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [pagination.limit, search, statusFilter, typeFilter, verificationFilter]
  );

  const fetchSettings = useCallback(async () => {
    try {
      const res = await depositService.getAdminSettings();
      if (res.success) {
        setSettings(res.data);
      }
    } catch (err) {
      console.error('[AdminDeposits] Failed to fetch settings:', err);
    }
  }, []);

  useEffect(() => {
    fetchDeposits(1);
    fetchSettings();
  }, [fetchDeposits, fetchSettings]);

  // Open Review Modal
  const handleOpenReview = (deposit, defaultAction = 'APPROVE') => {
    setSelectedDeposit(deposit);
    setReviewAction(defaultAction);
    setDecisionNotes(
      defaultAction === 'APPROVE'
        ? `Deposit confirmed and verified: TX ${deposit.txHash || 'N/A'}`
        : ''
    );
    setRejectionReason('');
    setVerificationStatus(deposit.verification === 'VERIFIED' ? 'VERIFIED' : 'VERIFIED');
    setVerificationRef(deposit.txHash ? `TRONSCAN_BLOCK_${deposit.txHash.slice(0, 10)}` : 'MANUAL_AUDIT');
    setReviewError('');
    setReviewModalOpen(true);
  };

  // Submit Review / Approval / Rejection
  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!selectedDeposit) return;
    setReviewError('');

    if (reviewAction === 'REJECT' && !rejectionReason.trim()) {
      setReviewError('Please provide a specific rejection reason for the trader.');
      return;
    }

    try {
      setProcessing(true);
      const res = await depositService.reviewAdmin(selectedDeposit._id, {
        action: reviewAction,
        decisionNotes: decisionNotes.trim(),
        rejectionReason: rejectionReason.trim(),
        verificationStatus,
        verificationReference: verificationRef.trim(),
      });

      if (res.success) {
        setReviewModalOpen(false);
        setSelectedDeposit(null);
        fetchDeposits(pagination.page);
        alert(
          reviewAction === 'APPROVE'
            ? 'Deposit approved and balance credited to trader ledger successfully.'
            : 'Deposit status updated successfully.'
        );
      } else {
        setReviewError(res.message || 'Operation failed.');
      }
    } catch (err) {
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setProcessing(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSavingSettings(true);
      setSettingsMessage('');
      const res = await depositService.updateAdminSettings(settings);
      if (res.success) {
        setSettings(res.data);
        setSettingsMessage('Deposit settings saved successfully.');
        setTimeout(() => setSettingsMessage(''), 3000);
      } else {
        setSettingsMessage(res.message || 'Failed to update settings.');
      }
    } catch (err) {
      setSettingsMessage(err.message || 'Error updating settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopy = (text, id) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
      case 'DRAFT':
      case 'AWAITING_PAYMENT':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Draft
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Submitted
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Under Review
          </span>
        );
      case 'APPROVED':
      case 'CONFIRMED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Rejected
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            Expired
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-500/10 text-gray-400">
            {status}
          </span>
        );
    }
  };

  const renderVerificationBadge = (verification) => {
    switch (verification) {
      case 'VERIFIED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Verified
          </span>
        );
      case 'CHECKING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Checking
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
            Not checked
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Deposit Requests Desk</h1>
          <p className="text-xs text-gray-400 mt-1">
            Audit TRC20 and bank deposit evidence, verify blockchain transaction hashes, and approve
            ledger balance credits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold hover:border-gray-600 transition-colors"
          >
            <Settings className="w-4 h-4 text-blue-400" />
            <span>Deposit Settings</span>
          </button>

          <button
            onClick={() => fetchDeposits(pagination.page, true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold hover:border-gray-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Request ID, Trader, or TX Hash..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="EXPIRED">Expired</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Deposit Types</option>
            <option value="WORKING_DEPOSIT">Working Deposit</option>
            <option value="SECURITY_DEPOSIT">Security Deposit</option>
          </select>

          {/* Verification Filter */}
          <select
            value={verificationFilter}
            onChange={(e) => setVerificationFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Verification</option>
            <option value="NOT_CHECKED">Not checked</option>
            <option value="CHECKING">Checking</option>
            <option value="VERIFIED">Verified</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Main Admin Requests Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px] text-xs">
            <thead>
              <tr className="border-b border-[#1F293D] bg-[#0E1524] text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Trader</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Wallet</th>
                <th className="py-3 px-4">TX Hash</th>
                <th className="py-3 px-4">Screenshot</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D] text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan="11" className="py-12 text-center text-gray-400">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading deposit records...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-12 text-center text-gray-500">
                    No matching deposit requests found.
                  </td>
                </tr>
              ) : (
                requests.map((item) => (
                  <tr key={item._id} className="hover:bg-[#162032] transition-colors">
                    {/* Request ID */}
                    <td className="py-3 px-4 font-mono font-medium text-white">{item.requestId}</td>

                    {/* Trader */}
                    <td className="py-3 px-4 font-medium text-gray-200">
                      <div>
                        <span>{item.trader?.username || item.clientId}</span>
                        {item.trader?.fullName && (
                          <span className="block text-[10px] text-gray-500">{item.trader.fullName}</span>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-3 px-4 text-gray-300">
                      {item.depositTypeLabel ||
                        (item.depositType === 'SECURITY_DEPOSIT' ? 'Security deposit' : 'Working deposit')}
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                      {Number(item.amount).toFixed(2)} {item.currency || 'USDT'}
                    </td>

                    {/* Wallet */}
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-400">
                      {item.wallet && item.wallet !== '-' ? (
                        <div className="flex items-center gap-1.5" title={item.wallet}>
                          <span>
                            {item.wallet.length > 12
                              ? `${item.wallet.slice(0, 5)}...${item.wallet.slice(-5)}`
                              : item.wallet}
                          </span>
                          <button
                            onClick={() => handleCopy(item.wallet, `w-${item._id}`)}
                            className="p-1 hover:text-white"
                          >
                            {copiedId === `w-${item._id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-400" />
                            )}
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>

                    {/* TX Hash */}
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-400">
                      {item.txHash && item.txHash !== '-' ? (
                        <div className="flex items-center gap-1.5" title={item.txHash}>
                          <a
                            href={`https://tronscan.org/#/transaction/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                          >
                            <span>{`${item.txHash.slice(0, 5)}...${item.txHash.slice(-5)}`}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => handleCopy(item.txHash, `tx-${item._id}`)}
                            className="p-1 hover:text-white"
                          >
                            {copiedId === `tx-${item._id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-400" />
                            )}
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>

                    {/* Screenshot */}
                    <td className="py-3 px-4">
                      {item.screenshot && item.screenshot !== '-' ? (
                        <button
                          onClick={() => setPreviewImage(item.screenshot)}
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs hover:underline font-medium"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">{renderStatusBadge(item.status)}</td>

                    {/* Verification */}
                    <td className="py-3 px-4">{renderVerificationBadge(item.verification)}</td>

                    {/* Created At */}
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                      {formatISTDate(item.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {item.status !== 'APPROVED' && item.status !== 'CONFIRMED' ? (
                          <>
                            <button
                              onClick={() => handleOpenReview(item, 'APPROVE')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 font-semibold text-[11px] transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleOpenReview(item, 'REJECT')}
                              className="px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 border border-rose-500/30 font-semibold text-[11px] transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] font-mono text-emerald-500/80">Credited</span>
                        )}

                        <button
                          onClick={() => handleOpenReview(item, 'UPDATE_VERIFICATION')}
                          className="p-1.5 rounded-lg bg-[#1F293D] hover:bg-[#2B3A52] text-gray-300 hover:text-white transition-colors"
                          title="View / Audit Details"
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
      </div>

      {/* ========================================================= */}
      {/* AUDIT & APPROVAL REVIEW MODAL                            */}
      {/* ========================================================= */}
      {reviewModalOpen && selectedDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-xl p-6 shadow-2xl relative text-left space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setReviewModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-white">Audit Deposit Request</h2>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#162032] text-blue-300 border border-[#22334F]">
                  {selectedDeposit.requestId}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Trader: <strong className="text-white">{selectedDeposit.trader?.username || selectedDeposit.clientId}</strong> |
                Deposit Type: <span className="text-gray-200">{selectedDeposit.depositTypeLabel}</span>
              </p>
            </div>

            {reviewError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            {/* Deposit Info Grid */}
            <div className="p-4 bg-[#162032] border border-[#22334F] rounded-xl grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400 block text-[11px]">Amount</span>
                <span className="text-emerald-400 font-mono font-bold text-base">
                  {Number(selectedDeposit.amount).toFixed(2)} {selectedDeposit.currency}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Current Status</span>
                <span className="mt-0.5 block">{renderStatusBadge(selectedDeposit.status)}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Assigned Wallet</span>
                <span className="font-mono text-gray-200 text-[11px] break-all">
                  {selectedDeposit.wallet || '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Submitted TX Hash</span>
                <span className="font-mono text-gray-200 text-[11px] break-all">
                  {selectedDeposit.txHash || '-'}
                </span>
              </div>
            </div>

            {/* Blockchain Verification Link */}
            {selectedDeposit.txHash && selectedDeposit.txHash !== '-' && (
              <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-300">TRONSCAN Blockchain Verification:</span>
                </div>
                <a
                  href={`https://tronscan.org/#/transaction/${selectedDeposit.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                >
                  <span>Verify TX on Tronscan</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Screenshot preview if available */}
            {selectedDeposit.screenshot && selectedDeposit.screenshot !== '-' && (
              <div>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-1">
                  Attached Payment Screenshot
                </span>
                <div
                  onClick={() => setPreviewImage(selectedDeposit.screenshot)}
                  className="rounded-xl overflow-hidden border border-[#22334F] bg-[#162032] p-2 cursor-pointer group"
                >
                  <img
                    src={selectedDeposit.screenshot}
                    alt="Receipt evidence"
                    className="max-h-48 w-full object-contain rounded-lg group-hover:opacity-90 transition-opacity"
                  />
                  <p className="text-[11px] text-center text-blue-400 mt-1 font-medium">
                    Click to view full image
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-3.5 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Action
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('APPROVE')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      reviewAction === 'APPROVE'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                    }`}
                  >
                    Approve & Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('UNDER_REVIEW')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      reviewAction === 'UNDER_REVIEW'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                    }`}
                  >
                    Under Review
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('REJECT')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      reviewAction === 'REJECT'
                        ? 'bg-rose-600/20 border-rose-500 text-rose-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                    }`}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {/* Verification Status selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Verification Outcome
                  </label>
                  <select
                    value={verificationStatus}
                    onChange={(e) => setVerificationStatus(e.target.value)}
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="VERIFIED">VERIFIED (On-chain match)</option>
                    <option value="CHECKING">CHECKING (Pending confirmations)</option>
                    <option value="NOT_CHECKED">NOT_CHECKED (Awaiting lookup)</option>
                    <option value="FAILED">FAILED (Invalid hash / mismatched)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Verification Reference
                  </label>
                  <input
                    type="text"
                    value={verificationRef}
                    onChange={(e) => setVerificationRef(e.target.value)}
                    placeholder="e.g. TRONSCAN_BLOCK_98273"
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {reviewAction === 'REJECT' && (
                <div>
                  <label className="block text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">
                    Rejection Reason *
                  </label>
                  <input
                    type="text"
                    required
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Invalid transaction hash or receipt does not match destination wallet"
                    className="w-full bg-[#162032] border border-rose-500/50 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Administrative Audit Notes
                </label>
                <input
                  type="text"
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="e.g. Verified 1000 USDT transfer on Tronscan block #6729103"
                  className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                      : reviewAction === 'REJECT'
                      ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                  }`}
                >
                  {processing ? 'Processing...' : 'Execute Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TASK 12: ADMIN DEPOSIT SETTINGS MODAL                     */}
      {/* ========================================================= */}
      {settingsModalOpen && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative text-left space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSettingsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-base font-bold text-white">Deposit Workflow Settings</h2>
              <p className="text-xs text-gray-400">
                Configure deposit rules, minimum & maximum limits, expiration timers, and destination
                wallet addresses.
              </p>
            </div>

            {settingsMessage && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                {settingsMessage}
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              {/* Toggles */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3 bg-[#162032] border border-[#22334F] rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.workingDepositEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, workingDepositEnabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">Working Deposit</span>
                    <span className="text-[10px] text-gray-400">Allow traders to fund working capital</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#162032] border border-[#22334F] rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.securityDepositEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, securityDepositEnabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">Security Deposit</span>
                    <span className="text-[10px] text-gray-400">Allow traders to place security guarantee</span>
                  </div>
                </label>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Min USDT Amount
                  </label>
                  <input
                    type="number"
                    value={settings.minDepositAmountUsdt}
                    onChange={(e) =>
                      setSettings({ ...settings, minDepositAmountUsdt: Number(e.target.value) })
                    }
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Max USDT Amount
                  </label>
                  <input
                    type="number"
                    value={settings.maxDepositAmountUsdt}
                    onChange={(e) =>
                      setSettings({ ...settings, maxDepositAmountUsdt: Number(e.target.value) })
                    }
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Expiry Timer duration */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Deposit Request Expiration Timer (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.depositExpiryMinutes || 60}
                  onChange={(e) =>
                    setSettings({ ...settings, depositExpiryMinutes: Number(e.target.value) })
                  }
                  className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Default is 60 minutes. Countdown will display in the trader's payment modal.
                </p>
              </div>

              {/* Destination Wallets List */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Authorized Destination Wallets
                </span>
                {(settings.destinationWallets || []).map((w, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#162032] border border-[#22334F] rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">
                        {w.walletLabel || 'USDT TRC20 Wallet'} ({w.network})
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={w.isActive !== false}
                          onChange={(e) => {
                            const updated = [...settings.destinationWallets];
                            updated[idx].isActive = e.target.checked;
                            setSettings({ ...settings, destinationWallets: updated });
                          }}
                        />
                        <span>Active</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="p-1 bg-white rounded-md shrink-0">
                        <QRCodeSVG value={w.address} size={48} />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={w.address}
                          onChange={(e) => {
                            const updated = [...settings.destinationWallets];
                            updated[idx].address = e.target.value;
                            setSettings({ ...settings, destinationWallets: updated });
                          }}
                          placeholder="TRON Wallet Address"
                          className="w-full bg-[#0B0F19] border border-[#22334F] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white text-xs font-semibold transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SCREENSHOT PREVIEW MODAL                                   */}
      {/* ========================================================= */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-fade-in"
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 p-1.5 text-white hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="Screenshot full preview"
              className="max-h-[85vh] w-auto object-contain rounded-xl border border-[#1F293D]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
