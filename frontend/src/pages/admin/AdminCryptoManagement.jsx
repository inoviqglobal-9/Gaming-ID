import React, { useState, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  RefreshCw,
  Eye,
  Filter,
  Search,
  Check,
  X,
  FileText,
  Clock,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { cryptoService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const AdminCryptoManagement = () => {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [overview, setOverview] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [qrs, setQrs] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [depositFilter, setDepositFilter] = useState('ALL');
  const [withdrawalFilter, setWithdrawalFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [depositDecisionNotes, setDepositDecisionNotes] = useState('');
  const [depositActionLoading, setDepositActionLoading] = useState(false);
  const [depositConfirmAction, setDepositConfirmAction] = useState(null); // 'ACCEPT' | 'REJECT' | null
  const [depositRejectionReason, setDepositRejectionReason] = useState('');

  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [payoutReference, setPayoutReference] = useState('');
  const [withdrawalDecisionNotes, setWithdrawalDecisionNotes] = useState('');
  const [withdrawalActionLoading, setWithdrawalActionLoading] = useState(false);

  const [uploadQrModalOpen, setUploadQrModalOpen] = useState(false);
  const [qrWalletAddress, setQrWalletAddress] = useState('');
  const [qrFile, setQrFile] = useState(null);
  const [qrPreview, setQrPreview] = useState('');
  const [qrDecodedAddress, setQrDecodedAddress] = useState('');
  const [qrDecoding, setQrDecoding] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [overRes, depRes, wdRes, qrRes, txRes, actRes] = await Promise.all([
        cryptoService.getAdminOverview().catch(() => null),
        cryptoService.getAdminDeposits().catch(() => null),
        cryptoService.getAdminWithdrawals().catch(() => null),
        cryptoService.getAdminQRs().catch(() => null),
        cryptoService.getAdminTransactions().catch(() => null),
        cryptoService.getAdminActivities().catch(() => null),
      ]);

      if (overRes && overRes.success) setOverview(overRes.data);
      if (depRes && depRes.success) setDeposits(depRes.data || []);
      if (wdRes && wdRes.success) setWithdrawals(wdRes.data || []);
      if (qrRes && qrRes.success) setQrs(qrRes.data || []);
      if (txRes && txRes.success) setTransactions(txRes.data || []);
      if (actRes && actRes.success) setActivityLogs(actRes.data || []);
    } catch (err) {
      console.error('[Admin Crypto Load Error]:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Live Server-Sent Events (SSE) synchronization for QR updates
    let es = null;
    try {
      es = new EventSource('/api/crypto/live-qr-stream');
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'ACTIVE_QR_UPDATE') {
            loadData();
          }
        } catch (e) {
          console.error('[Admin SSE Parse Error]:', e);
        }
      };
    } catch (err) {
      console.warn('[Admin SSE Setup Error]:', err);
    }

    return () => {
      if (es) es.close();
    };
  }, [loadData]);

  // Deposit Actions (Accept with 3% Bonus & Reject with Reason)
  const handleConfirmApproveDeposit = async () => {
    if (!selectedDeposit) return;
    try {
      setDepositActionLoading(true);
      const res = await cryptoService.approveDeposit(selectedDeposit._id, depositDecisionNotes);
      if (res.success) {
        const depAmt = selectedDeposit.depositAmountUSDT || selectedDeposit.usdtAmount || 0;
        const bonusAmt = selectedDeposit.bonusAmountUSDT !== undefined && selectedDeposit.bonusAmountUSDT !== null && selectedDeposit.bonusAmountUSDT > 0
          ? selectedDeposit.bonusAmountUSDT
          : Math.round(depAmt * 0.03 * 1000000) / 1000000;
        const credAmt = selectedDeposit.totalCreditUSDT !== undefined && selectedDeposit.totalCreditUSDT > 0
          ? selectedDeposit.totalCreditUSDT
          : Math.round((depAmt + bonusAmt) * 1000000) / 1000000;
        const inrEq = selectedDeposit.inrEquivalent !== undefined ? selectedDeposit.inrEquivalent : depAmt * 105;

        alert(`Deposit approved! Total ${credAmt.toFixed(2)} USDT (${depAmt.toFixed(2)} USDT + 3% bonus: ${bonusAmt.toFixed(2)} USDT) credited to ${selectedDeposit.traderUsername}'s wallet.`);
        setDepositModalOpen(false);
        setDepositConfirmAction(null);
        setDepositRejectionReason('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to approve deposit.');
    } finally {
      setDepositActionLoading(false);
    }
  };

  const handleConfirmRejectDeposit = async () => {
    if (!selectedDeposit) return;
    const reason = depositRejectionReason.trim();
    if (!reason) {
      alert('Rejection reason is required.');
      return;
    }

    try {
      setDepositActionLoading(true);
      const res = await cryptoService.rejectDeposit(selectedDeposit._id, reason);
      if (res.success) {
        alert(`Deposit request ${selectedDeposit.requestId} rejected.`);
        setDepositModalOpen(false);
        setDepositConfirmAction(null);
        setDepositRejectionReason('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to reject deposit.');
    } finally {
      setDepositActionLoading(false);
    }
  };

  // Withdrawal Actions
  const handleApproveWithdrawal = async () => {
    if (!selectedWithdrawal) return;
    try {
      setWithdrawalActionLoading(true);
      const res = await cryptoService.approveWithdrawal(
        selectedWithdrawal._id,
        withdrawalDecisionNotes
      );
      if (res.success) {
        alert(`Withdrawal ${selectedWithdrawal.requestId} approved. Reserved balance remains locked pending payout completion.`);
        setWithdrawalModalOpen(false);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to approve withdrawal.');
    } finally {
      setWithdrawalActionLoading(false);
    }
  };

  const handleVerifyWithdrawalPayout = async () => {
    if (!selectedWithdrawal) return;
    if (!payoutReference || payoutReference.trim().length < 4) {
      alert('Please enter the bank UTR / transaction reference for the INR payout.');
      return;
    }

    const debitAmt = selectedWithdrawal.balanceDebitUSDT || (selectedWithdrawal.usdtAmount * 0.99).toFixed(2);
    try {
      setWithdrawalActionLoading(true);
      const res = await cryptoService.completeWithdrawal(
        selectedWithdrawal._id,
        payoutReference.trim(),
        withdrawalDecisionNotes
      );
      if (res.success) {
        alert(`Payout of ₹${selectedWithdrawal.finalInrPayout.toLocaleString('en-IN')} confirmed. Actual debit of ${debitAmt} USDT finalized (+1% bonus funded by platform).`);
        setWithdrawalModalOpen(false);
        setPayoutReference('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to complete payout.');
    } finally {
      setWithdrawalActionLoading(false);
    }
  };

  const handleRejectWithdrawal = async () => {
    if (!selectedWithdrawal) return;
    const debitAmt = selectedWithdrawal.balanceDebitUSDT || (selectedWithdrawal.usdtAmount * 0.99).toFixed(2);
    const reason = prompt(
      `Please enter rejection reason (The reserved ${debitAmt} USDT will be restored to the trader):`
    );
    if (!reason || !reason.trim()) return;

    try {
      setWithdrawalActionLoading(true);
      const res = await cryptoService.rejectWithdrawal(selectedWithdrawal._id, reason.trim());
      if (res.success) {
        alert(`Withdrawal rejected. ${debitAmt} USDT restored to trader available balance.`);
        setWithdrawalModalOpen(false);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to reject withdrawal.');
    } finally {
      setWithdrawalActionLoading(false);
    }
  };

  // QR Actions
  const handleQrFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit. Please select an image under 5MB.');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WebP).');
      return;
    }

    setQrFile(file);
    const previewUrl = URL.createObjectURL(file);
    setQrPreview(previewUrl);
    setQrDecoding(true);

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          const raw = code.data.trim();
          const extracted = raw.replace(/^(ethereum:|tron:)/i, '').split('?')[0].trim();
          setQrDecodedAddress(extracted);
          if (!qrWalletAddress) {
            setQrWalletAddress(extracted);
          }
        } else {
          setQrDecodedAddress('');
        }
      } catch (err) {
        console.warn('QR decode failed:', err);
        setQrDecodedAddress('');
      } finally {
        setQrDecoding(false);
      }
    };
    img.onerror = () => {
      setQrDecoding(false);
    };
    img.src = previewUrl;
  };

  const handleUploadQr = async (e) => {
    e.preventDefault();
    const address = qrWalletAddress.trim();

    if (!address) {
      alert('Please enter a valid USDT Wallet Address.');
      return;
    }

    const isTron = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isTron && !isEvm) {
      alert('Invalid USDT wallet address. TRC-20 addresses must start with "T" (34 characters) and ERC-20 must start with "0x" (42 characters).');
      return;
    }

    if (!qrFile) {
      alert('Please select and upload a USDT QR code image.');
      return;
    }

    if (qrDecodedAddress) {
      const decodedClean = qrDecodedAddress.toLowerCase();
      const addrClean = address.toLowerCase();
      if (!decodedClean.includes(addrClean) && !addrClean.includes(decodedClean)) {
        const proceed = confirm(
          `QR Verification Warning: The uploaded QR image appears to encode "${qrDecodedAddress}", which does not match your entered wallet address "${address}". Do you still wish to publish?`
        );
        if (!proceed) return;
      }
    }

    try {
      setUploadingQr(true);
      const formData = new FormData();
      formData.append('walletAddress', address);
      formData.append('network', isTron ? 'TRC20' : 'ERC20');
      formData.append('qrImage', qrFile);
      if (qrDecodedAddress) {
        formData.append('qrDecodedAddress', qrDecodedAddress);
      }

      const res = await cryptoService.uploadAdminQR(formData);
      if (res.success) {
        alert('USDT Payment QR uploaded and published successfully! It is now the active deposit wallet for all traders.');
        setUploadQrModalOpen(false);
        setQrWalletAddress('');
        setQrFile(null);
        setQrPreview('');
        setQrDecodedAddress('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to upload and publish QR.');
    } finally {
      setUploadingQr(false);
    }
  };

  const handleSetActiveQr = async (id) => {
    try {
      const res = await cryptoService.setActiveQR(id);
      if (res.success) {
        alert('QR code set as active for all trader deposits.');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to set active QR.');
    }
  };

  const handleDeleteQr = async (id) => {
    if (!confirm('Are you sure you want to delete this payment QR scanner? If active, traders will see "No active USDT deposit wallet is currently available." until a new scanner is published.')) return;
    try {
      const res = await cryptoService.deleteAdminQR(id);
      if (res.success) {
        alert('QR code deleted successfully.');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to delete QR.');
    }
  };

  // Filtered Deposits
  const filteredDeposits = deposits.filter((d) => {
    if (depositFilter !== 'ALL' && d.status !== depositFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.requestId.toLowerCase().includes(q) ||
        d.traderUsername.toLowerCase().includes(q) ||
        (d.utr && d.utr.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered Withdrawals
  const filteredWithdrawals = withdrawals.filter((w) => {
    if (withdrawalFilter !== 'ALL' && w.status !== withdrawalFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        w.requestId.toLowerCase().includes(q) ||
        w.traderUsername.toLowerCase().includes(q) ||
        (w.traderUpiId && w.traderUpiId.toLowerCase().includes(q)) ||
        (w.payoutReference && w.payoutReference.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">CRYPTO MANAGEMENT</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Enterprise cryptocurrency settlement desk, PhonePe QR control & ledger reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>1 USDT = ₹105 Fixed</span>
          </div>

          <button
            onClick={loadData}
            disabled={refreshing}
            className="p-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-400 hover:text-white transition-all disabled:opacity-50"
            title="Refresh records"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Pending Deposits</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {overview?.pendingDeposits ?? 0}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 font-mono">
            Total Deposits: {overview?.totalDeposits ?? 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">USDT Credited</span>
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-blue-400 font-mono">
            {overview?.totalUsdtCredited?.toFixed(2) ?? '0.00'} USDT
          </div>
          <div className="text-[11px] text-gray-500 mt-1 font-mono">
            INR Received: ₹{overview?.totalInrReceived?.toLocaleString('en-IN') ?? '0'}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Pending Withdrawals</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {overview?.pendingWithdrawals ?? 0}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 font-mono">
            Total Requests: {overview?.totalWithdrawals ?? 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">USDT Paid Out</span>
            <ArrowUpRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-400 font-mono">
            {overview?.totalUsdtDebited?.toFixed(2) ?? '0.00'} USDT
          </div>
          <div className="text-[11px] text-gray-500 mt-1 font-mono">
            INR Paid: ₹{overview?.totalInrPaidOut?.toLocaleString('en-IN') ?? '0'}
          </div>
        </div>
      </div>

      {/* 3. Sub-section Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1F293D] pb-3 overflow-x-auto">
        {[
          { id: 'OVERVIEW', label: 'Crypto Overview' },
          { id: 'DEPOSITS', label: `Deposit Requests (${deposits.filter((d) => d.status === 'PENDING_VERIFICATION').length} Pending)` },
          { id: 'WITHDRAWALS', label: `Withdrawal Requests (${withdrawals.filter((w) => w.status === 'PENDING_REVIEW').length} Pending)` },
          { id: 'QR_MANAGEMENT', label: `Admin QR Scanners (${qrs.length})` },
          { id: 'TRANSACTIONS', label: 'Transaction History' },
          { id: 'ACTIVITIES', label: 'Crypto Activity Logs' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-gray-400 hover:text-white hover:bg-[#111827]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. OVERVIEW TAB */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quick Actions & Policy Card */}
            <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Commercial Crypto Rates & Policy</span>
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div className="p-3 bg-[#0B0F19] rounded-xl flex justify-between items-center">
                  <span className="text-gray-400">Withdrawal Settlement Base Rate:</span>
                  <span className="text-white font-bold">1 USDT = ₹105.00 INR</span>
                </div>
                <div className="p-3 bg-[#0B0F19] rounded-xl flex justify-between items-center">
                  <span className="text-gray-400">Crypto Deposit Crediting:</span>
                  <span className="text-emerald-400 font-bold">+3% Bonus Benefit (1 USDT = ₹105)</span>
                </div>
                <div className="p-3 bg-[#0B0F19] rounded-xl flex justify-between items-center">
                  <span className="text-gray-400">Crypto Withdrawal Bonus:</span>
                  <span className="text-purple-400 font-bold">+1% Bonus (99% Debit, 100% Payout)</span>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  onClick={() => setActiveTab('DEPOSITS')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/20"
                >
                  Review Deposit Requests
                </button>
                <button
                  onClick={() => setActiveTab('WITHDRAWALS')}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all shadow-md shadow-purple-600/20"
                >
                  Process Withdrawals
                </button>
                <button
                  onClick={() => setActiveTab('QR_MANAGEMENT')}
                  className="px-4 py-2.5 rounded-xl bg-[#0B0F19] border border-[#1F293D] hover:bg-[#1A2338] text-gray-300 font-semibold text-xs transition-all"
                >
                  Manage Payment QRs
                </button>
              </div>
            </div>

            {/* Currently Active Deposit QR Card */}
            <div className="bg-[#111827] border border-[#1F293D] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-blue-400" />
                  <span>Currently Published Deposit QR</span>
                </h3>
                <button
                  onClick={() => setActiveTab('QR_MANAGEMENT')}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Change QR
                </button>
              </div>

              {overview?.activeQR ? (
                <div className="flex items-center gap-4 p-4 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                  <div className="w-20 h-20 bg-white p-1 rounded-lg shrink-0 flex items-center justify-center">
                    <QrCode className="w-12 h-12 text-gray-800" />
                  </div>
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-white block text-sm">{overview.activeQR.title}</span>
                    <span className="text-gray-400 block">Payee: {overview.activeQR.merchantName}</span>
                    {overview.activeQR.upiId && (
                      <span className="text-blue-400 font-mono block">UPI: {overview.activeQR.upiId}</span>
                    )}
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      LIVE ON TRADER PANEL
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500 border border-dashed border-[#1F293D] rounded-xl text-xs space-y-2">
                  <AlertTriangle className="w-6 h-6 mx-auto text-amber-400" />
                  <span>No payment QR code is currently active. Traders will see a notice to contact admin.</span>
                  <button
                    onClick={() => {
                      setActiveTab('QR_MANAGEMENT');
                      setUploadQrModalOpen(true);
                    }}
                    className="mt-2 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs"
                  >
                    Upload & Publish QR Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. DEPOSIT REQUESTS TAB */}
      {activeTab === 'DEPOSITS' && (
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl space-y-4 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-semibold uppercase">Filter Status:</span>
              {['ALL', 'PENDING_VERIFICATION', 'COMPLETED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setDepositFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    depositFilter === st
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0B0F19] text-gray-400 hover:text-white'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search request or trader..."
                className="bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-56"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                  <th className="p-4">Request ID</th>
                  <th className="p-4">Trader</th>
                  <th className="p-4">Deposit USDT</th>
                  <th className="p-4">3% Bonus</th>
                  <th className="p-4">Credited USDT</th>
                  <th className="p-4">Fixed Rate</th>
                  <th className="p-4">INR Equivalent</th>
                  <th className="p-4">Network</th>
                  <th className="p-4">TXID</th>
                  <th className="p-4">Proof</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F293D]">
                {filteredDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-gray-500">
                      No deposit requests matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredDeposits.map((dep) => {
                    const depAmt = dep.depositAmountUSDT || dep.usdtAmount || 0;
                    const bonusAmt = dep.bonusAmountUSDT !== undefined && dep.bonusAmountUSDT !== null && dep.bonusAmountUSDT > 0
                      ? dep.bonusAmountUSDT
                      : Math.round(depAmt * 0.03 * 1000000) / 1000000;
                    const credAmt = dep.totalCreditUSDT !== undefined && dep.totalCreditUSDT > 0
                      ? dep.totalCreditUSDT
                      : Math.round((depAmt + bonusAmt) * 1000000) / 1000000;
                    const fixedRate = dep.fixedRate || 105;
                    const inrEq = dep.inrEquivalent !== undefined ? dep.inrEquivalent : Math.round(depAmt * fixedRate * 100) / 100;

                    return (
                      <tr key={dep._id} className="hover:bg-[#151D2F]">
                        <td className="p-4 font-mono font-semibold text-white">{dep.requestId}</td>
                        <td className="p-4 font-semibold text-gray-200">{dep.traderUsername}</td>
                        <td className="p-4 font-mono font-bold text-white">{depAmt.toFixed(2)} USDT</td>
                        <td className="p-4 font-mono font-bold text-emerald-400">+{bonusAmt.toFixed(2)} USDT (+3%)</td>
                        <td className="p-4 font-mono font-bold text-emerald-300">
                          {credAmt.toFixed(2)} USDT
                        </td>
                        <td className="p-4 font-mono text-blue-400 font-bold">₹{fixedRate}</td>
                        <td className="p-4 font-mono text-emerald-300 font-bold">
                          ₹{inrEq.toLocaleString('en-IN')}
                        </td>
                        <td className="p-4 font-mono text-gray-300">{dep.network || 'TRC20'}</td>
                        <td className="p-4 font-mono text-gray-300 max-w-[120px] truncate" title={dep.txHash || dep.utr}>
                          {dep.txHash || dep.utr || 'N/A'}
                        </td>
                        <td className="p-4">
                          {dep.paymentProofUrl ? (
                            <a
                              href={dep.paymentProofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Proof</span>
                            </a>
                          ) : (
                            <span className="text-gray-500">None</span>
                          )}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={dep.status} />
                        </td>
                        <td className="p-4 text-gray-400">{new Date(dep.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedDeposit(dep);
                              setDepositDecisionNotes('');
                              setDepositModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. WITHDRAWAL REQUESTS TAB */}
      {activeTab === 'WITHDRAWALS' && (
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl space-y-4 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs text-gray-400 font-semibold uppercase shrink-0">Filter Status:</span>
              {['ALL', 'PENDING_REVIEW', 'APPROVED', 'COMPLETED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setWithdrawalFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    withdrawalFilter === st
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-[#0B0F19] text-gray-400 hover:text-white'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search request or trader..."
                className="bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 w-56"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                  <th className="p-4">Request ID</th>
                  <th className="p-4">Trader</th>
                  <th className="p-4">Requested USDT</th>
                  <th className="p-4">Bonus (+1%)</th>
                  <th className="p-4">Balance Debit (99%)</th>
                  <th className="p-4">Full INR Payout</th>
                  <th className="p-4">Trader UPI / QR</th>
                  <th className="p-4">Payout Ref</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F293D]">
                {filteredWithdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-gray-500">
                      No withdrawal requests matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredWithdrawals.map((wd) => {
                    const reqUsdt = wd.requestedUSDT || wd.usdtAmount || 0;
                    const bonusUsdt = wd.bonusUSDT !== undefined ? wd.bonusUSDT : reqUsdt * 0.01;
                    const debitUsdt = wd.balanceDebitUSDT !== undefined ? wd.balanceDebitUSDT : reqUsdt * 0.99;

                    return (
                      <tr key={wd._id} className="hover:bg-[#151D2F]">
                        <td className="p-4 font-mono font-semibold text-white">{wd.requestId}</td>
                        <td className="p-4 font-semibold text-gray-200">{wd.traderUsername}</td>
                        <td className="p-4 font-mono font-bold text-white">{reqUsdt.toFixed(2)} USDT</td>
                        <td className="p-4 font-mono font-bold text-purple-400">
                          +{bonusUsdt.toFixed(2)} USDT (+1%)
                        </td>
                        <td className="p-4 font-mono font-bold text-amber-300">
                          {debitUsdt.toFixed(2)} USDT (99%)
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-400">
                          ₹{wd.finalInrPayout.toLocaleString('en-IN')}
                        </td>
                        <td className="p-4">
                          {wd.traderQrImageUrl ? (
                            <a
                              href={wd.traderQrImageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-purple-400 hover:underline"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Scan QR</span>
                            </a>
                          ) : (
                            <span className="text-gray-300 font-mono text-[11px]">{wd.traderUpiId || wd.upiId || 'None'}</span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-gray-300">{wd.payoutReference || 'Pending'}</td>
                        <td className="p-4">
                          <StatusBadge status={wd.status} />
                        </td>
                        <td className="p-4 text-gray-400">{new Date(wd.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedWithdrawal(wd);
                              setPayoutReference(wd.payoutReference || '');
                              setWithdrawalDecisionNotes('');
                              setWithdrawalModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-sm"
                          >
                            Review / Process
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. ADMIN QR MANAGEMENT TAB */}
      {activeTab === 'QR_MANAGEMENT' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Admin Payment QR Scanners</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Upload PhonePe / UPI QR codes for receiving INR payments in Crypto Deposits.
              </p>
            </div>

            <button
              onClick={() => setUploadQrModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-600/30 transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Upload New QR Scanner</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {qrs.length === 0 ? (
              <div className="col-span-full p-10 text-center text-gray-500 border border-dashed border-[#1F293D] rounded-2xl">
                No payment QR codes uploaded yet. Click above to upload.
              </div>
            ) : (
              qrs.map((qr) => (
                <div
                  key={qr._id}
                  className={`bg-[#111827] border rounded-2xl p-5 space-y-4 shadow-xl transition-all relative ${
                    qr.isActive ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-[#1F293D]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{qr.title}</span>
                    {qr.isActive ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Active Scanner
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-400 border border-gray-500/20">
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* QR Image */}
                  <div className="w-48 h-48 bg-white p-3 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
                    <img src={qr.qrImageUrl} alt={qr.title} className="w-full h-full object-contain" />
                  </div>

                  <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1 text-xs">
                    <div className="flex justify-between text-gray-400">
                      <span>Merchant:</span>
                      <span className="text-white font-semibold">{qr.merchantName}</span>
                    </div>
                    {qr.upiId && (
                      <div className="flex justify-between text-gray-400 font-mono">
                        <span>UPI ID:</span>
                        <span className="text-blue-400 font-bold">{qr.upiId}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#1F293D]">
                    {!qr.isActive && (
                      <button
                        onClick={() => handleSetActiveQr(qr._id)}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all"
                      >
                        Set as Active
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteQr(qr._id)}
                      className="p-2 rounded-xl bg-[#0B0F19] hover:bg-rose-500/10 border border-[#1F293D] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 transition-colors"
                      title="Delete QR"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 8. TRANSACTION HISTORY TAB */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Unified Crypto Transaction Ledger</h3>
            <span className="text-xs text-gray-400">{transactions.length} records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                  <th className="p-4">Request ID</th>
                  <th className="p-4">Trader</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">USDT Amount</th>
                  <th className="p-4">Bonus Benefit</th>
                  <th className="p-4">Balance Impact</th>
                  <th className="p-4">Settlement / INR Valuation</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F293D]">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-500">
                      No crypto transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isWd = tx.transactionType === 'WITHDRAWAL';
                    const numAmt = tx.usdtAmount || tx.depositAmountUSDT || tx.requestedUSDT || 0;
                    const bonusUsdt = tx.bonusUSDT !== undefined ? tx.bonusUSDT : isWd ? numAmt * 0.01 : 0;
                    const debitUsdt = tx.balanceDebitUSDT !== undefined ? tx.balanceDebitUSDT : isWd ? numAmt * 0.99 : numAmt;
                    const creditUsdt = tx.creditedAmountUSDT !== undefined ? tx.creditedAmountUSDT : (tx.totalCreditUSDT !== undefined ? tx.totalCreditUSDT : numAmt);
                    const inrVal = tx.inrEquivalent !== undefined ? tx.inrEquivalent : Math.round(numAmt * (tx.fixedRate || 105) * 100) / 100;

                    return (
                      <tr key={tx._id} className="hover:bg-[#151D2F]">
                        <td className="p-4 font-mono font-semibold text-white">{tx.requestId}</td>
                        <td className="p-4 font-semibold text-gray-200">{tx.traderUsername}</td>
                        <td className="p-4">
                          <span
                            className={`font-semibold ${
                              isWd ? 'text-purple-400' : 'text-emerald-400'
                            }`}
                          >
                            {tx.transactionType}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-bold text-white">{numAmt.toFixed(2)} USDT</td>
                        <td className="p-4 font-mono">
                          {isWd ? (
                            <span className="text-purple-400 font-bold">+1% (+{bonusUsdt.toFixed(2)} USDT)</span>
                          ) : (
                            <span className="text-gray-400">0% (Exact Credit)</span>
                          )}
                        </td>
                        <td className="p-4 font-mono">
                          {isWd ? (
                            <span className="text-amber-300 font-bold">-{debitUsdt.toFixed(2)} USDT (99% Debit)</span>
                          ) : (
                            <span className="text-emerald-400 font-bold">+{creditUsdt.toFixed(2)} USDT (Credit)</span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-400">
                          {isWd ? `₹${(tx.finalAmount || numAmt * 105).toLocaleString('en-IN')}` : `${creditUsdt.toFixed(2)} USDT (₹${inrVal.toLocaleString('en-IN')})`}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={tx.status} />
                        </td>
                        <td className="p-4 text-gray-400">{new Date(tx.createdAt).toLocaleDateString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. ACTIVITY LOGS TAB */}
      {activeTab === 'ACTIVITIES' && (
        <div className="bg-[#111827] border border-[#1F293D] rounded-2xl overflow-hidden shadow-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Crypto Audit & Activity Logs</h3>
            <span className="text-xs text-gray-400">{activityLogs.length} events</span>
          </div>

          <div className="divide-y divide-[#1F293D]">
            {activityLogs.length === 0 ? (
              <p className="p-8 text-center text-gray-500 text-xs">No activity logs recorded yet.</p>
            ) : (
              activityLogs.map((log) => (
                <div key={log._id} className="py-3 flex items-center justify-between text-xs hover:bg-[#151D2F] px-2 rounded-lg">
                  <div className="space-y-0.5">
                    <span className="text-white font-medium block">{log.description}</span>
                    <span className="text-[11px] text-gray-500 font-mono">
                      Actor: {log.actorRole} ({log.actorId?.username || 'System'}) | Action: {log.actionType}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 10. MODAL: REVIEW DEPOSIT REQUEST */}
      {selectedDeposit && (
        <Modal
          isOpen={depositModalOpen}
          onClose={() => {
            setDepositModalOpen(false);
            setDepositConfirmAction(null);
            setDepositRejectionReason('');
          }}
          title={`Review Deposit Request (${selectedDeposit.requestId})`}
        >
          {(() => {
            const depAmt = selectedDeposit.depositAmountUSDT || selectedDeposit.usdtAmount || 0;
            const bonusAmt = selectedDeposit.bonusAmountUSDT !== undefined && selectedDeposit.bonusAmountUSDT !== null && selectedDeposit.bonusAmountUSDT > 0
              ? selectedDeposit.bonusAmountUSDT
              : Math.round(depAmt * 0.03 * 1000000) / 1000000;
            const credAmt = selectedDeposit.totalCreditUSDT !== undefined && selectedDeposit.totalCreditUSDT > 0
              ? selectedDeposit.totalCreditUSDT
              : Math.round((depAmt + bonusAmt) * 1000000) / 1000000;
            const fixedRate = selectedDeposit.fixedRate || 105;
            const inrEq = selectedDeposit.inrEquivalent !== undefined
              ? selectedDeposit.inrEquivalent
              : Math.round(depAmt * fixedRate * 100) / 100;

            return (
              <div className="space-y-4 text-xs font-mono">
                {/* Summary Grid */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D]">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Trader Username</span>
                    <span className="text-white font-bold">{selectedDeposit.traderUsername}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Current Status</span>
                    <StatusBadge status={selectedDeposit.status} />
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Deposit Amount</span>
                    <span className="text-white font-bold font-mono">
                      {depAmt.toFixed(2)} USDT
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">3% Deposit Bonus</span>
                    <span className="text-emerald-400 font-bold font-mono">
                      +{bonusAmt.toFixed(2)} USDT (3%)
                    </span>
                  </div>
                  <div className="col-span-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                    <span className="text-emerald-300 font-bold text-xs">Total USDT to Credit:</span>
                    <span className="text-emerald-400 font-bold font-mono text-sm">
                      {credAmt.toFixed(2)} USDT
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Fixed Platform Rate</span>
                    <span className="text-blue-400 font-bold font-mono">
                      ₹{fixedRate} / USDT
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Platform INR Valuation</span>
                    <span className="text-blue-300 font-bold font-mono">
                      ₹{inrEq.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Blockchain Details */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D]">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Blockchain Network</span>
                    <span className="text-white font-bold font-mono">{selectedDeposit.network || 'TRC20'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Destination Wallet</span>
                    <span
                      className="text-emerald-400 font-mono text-[11px] truncate block"
                      title={selectedDeposit.destinationWalletAddress || selectedDeposit.qrSnapshot?.walletAddress}
                    >
                      {selectedDeposit.destinationWalletAddress || selectedDeposit.qrSnapshot?.walletAddress || 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P'}
                    </span>
                  </div>
                </div>

                {/* TXID */}
                {(selectedDeposit.txHash || selectedDeposit.utr) && (
                  <div className="p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D] space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[11px]">Transaction Hash / TXID</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedDeposit.txHash || selectedDeposit.utr);
                          alert('TXID copied to clipboard.');
                        }}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Copy TXID
                      </button>
                    </div>
                    <div className="font-mono text-white text-xs break-all bg-[#111827] p-2 rounded-lg border border-[#1F293D]">
                      {selectedDeposit.txHash || selectedDeposit.utr}
                    </div>
                  </div>
                )}

                {/* Proof screenshot if uploaded */}
                {selectedDeposit.paymentProofUrl && (
                  <div>
                    <span className="text-gray-400 block text-[11px] mb-1">Payment Proof Screenshot</span>
                    <div className="max-h-56 rounded-xl overflow-hidden border border-[#1F293D] bg-black">
                      <img
                        src={selectedDeposit.paymentProofUrl}
                        alt="Payment Proof"
                        className="w-full object-contain max-h-56"
                      />
                    </div>
                  </div>
                )}

                {/* If already completed or rejected */}
                {selectedDeposit.status === 'COMPLETED' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1 text-emerald-300">
                    <span className="block font-bold text-xs">Deposit Approved & Credited</span>
                    <p className="text-[11px] text-gray-300">
                      Credited <span className="text-emerald-400 font-bold">{credAmt.toFixed(2)} USDT</span> ({depAmt.toFixed(2)} USDT + 3% bonus: {bonusAmt.toFixed(2)} USDT) on {selectedDeposit.approvedAt || selectedDeposit.verifiedAt ? new Date(selectedDeposit.approvedAt || selectedDeposit.verifiedAt).toLocaleString() : 'N/A'}.
                    </p>
                  </div>
                )}

                {selectedDeposit.status === 'REJECTED' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-rose-300">
                    <span className="block font-bold text-xs">Deposit Request Rejected</span>
                    <p className="text-[11px] text-gray-300">
                      Reason: <span className="text-white font-medium">{selectedDeposit.rejectionReason || 'No reason specified'}</span>
                    </p>
                  </div>
                )}

                {/* Verification / Audit Notes */}
                {selectedDeposit.status === 'PENDING_VERIFICATION' && !depositConfirmAction && (
                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1">
                      Verification / Audit Notes (Optional)
                    </label>
                    <input
                      type="text"
                      value={depositDecisionNotes}
                      onChange={(e) => setDepositDecisionNotes(e.target.value)}
                      placeholder="e.g. Verified on TronScan, 20 confirmations"
                      className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                {/* ACTION FLOWS (PENDING_VERIFICATION) */}
                {selectedDeposit.status === 'PENDING_VERIFICATION' && (
                  <>
                    {depositConfirmAction === 'ACCEPT' ? (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm Deposit Approval (+3% Bonus)</span>
                        </div>
                        <p className="text-gray-300 text-xs">
                          Are you sure you want to approve request <span className="font-bold text-white">{selectedDeposit.requestId}</span>?
                        </p>
                        <div className="space-y-1 text-[11px] text-gray-300 bg-[#0B0F19] p-2.5 rounded-lg border border-[#1F293D]">
                          <div className="flex justify-between">
                            <span>Trader:</span>
                            <span className="text-white font-bold">{selectedDeposit.traderUsername}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Base Deposit Amount:</span>
                            <span className="text-white font-bold">{depAmt.toFixed(2)} USDT</span>
                          </div>
                          <div className="flex justify-between">
                            <span>3% Bonus Benefit:</span>
                            <span className="text-emerald-400 font-bold">+{bonusAmt.toFixed(2)} USDT</span>
                          </div>
                          <div className="flex justify-between font-bold text-emerald-300 border-t border-[#1F293D] pt-1">
                            <span>Total Credited USDT:</span>
                            <span>{credAmt.toFixed(2)} USDT</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setDepositConfirmAction(null)}
                            className="px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            disabled={depositActionLoading}
                            onClick={handleConfirmApproveDeposit}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-600/30"
                          >
                            {depositActionLoading ? 'Crediting Wallet...' : 'Confirm Approval & Credit Wallet'}
                          </button>
                        </div>
                      </div>
                    ) : depositConfirmAction === 'REJECT' ? (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                          <XCircle className="w-4 h-4" />
                          <span>Reject Deposit Request</span>
                        </div>
                        <p className="text-gray-300 text-xs">
                          Please enter the rejection reason for request <span className="font-bold text-white">{selectedDeposit.requestId}</span>:
                        </p>
                        <textarea
                          rows={2}
                          value={depositRejectionReason}
                          onChange={(e) => setDepositRejectionReason(e.target.value)}
                          placeholder="Rejection reason (Required, e.g. Transaction Hash not verified on blockchain explorer)"
                          className="w-full bg-[#0B0F19] border border-rose-500/40 rounded-xl p-2.5 text-white text-xs font-mono focus:outline-none focus:border-rose-400"
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDepositConfirmAction(null);
                              setDepositRejectionReason('');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            disabled={depositActionLoading || !depositRejectionReason.trim()}
                            onClick={handleConfirmRejectDeposit}
                            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/30 disabled:opacity-50"
                          >
                            {depositActionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#1F293D]">
                        <button
                          type="button"
                          disabled={depositActionLoading}
                          onClick={() => {
                            setDepositRejectionReason('');
                            setDepositConfirmAction('REJECT');
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-semibold text-xs transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                        <button
                          type="button"
                          disabled={depositActionLoading}
                          onClick={() => setDepositConfirmAction('ACCEPT')}
                          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept (+3% Bonus)</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 11. MODAL: PROCESS WITHDRAWAL REQUEST */}
      {selectedWithdrawal && (
        <Modal
          isOpen={withdrawalModalOpen}
          onClose={() => setWithdrawalModalOpen(false)}
          title={`Process Withdrawal (${selectedWithdrawal.requestId})`}
        >
          <div className="space-y-4 text-xs font-mono">
            {/* Request Summary Grid */}
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-[#0B0F19] rounded-xl border border-[#1F293D]">
              <div>
                <span className="text-gray-400 block text-[11px]">Trader Username</span>
                <span className="text-white font-bold text-sm">{selectedWithdrawal.traderUsername}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Request Status</span>
                <StatusBadge status={selectedWithdrawal.status} />
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Requested USDT Amount</span>
                <span className="text-white font-bold">
                  {(selectedWithdrawal.requestedUSDT || selectedWithdrawal.usdtAmount).toFixed(2)} USDT
                </span>
              </div>
              <div>
                <span className="text-purple-400 block text-[11px]">Withdrawal Bonus (+1%)</span>
                <span className="text-purple-300 font-bold">
                  +{(selectedWithdrawal.bonusUSDT !== undefined ? selectedWithdrawal.bonusUSDT : ((selectedWithdrawal.requestedUSDT || selectedWithdrawal.usdtAmount) * 0.01)).toFixed(2)} USDT Benefit
                </span>
              </div>
              <div>
                <span className="text-amber-300 block text-[11px]">Actual USDT Balance Debit</span>
                <span className="text-amber-300 font-bold text-sm">
                  {(selectedWithdrawal.balanceDebitUSDT !== undefined ? selectedWithdrawal.balanceDebitUSDT : ((selectedWithdrawal.requestedUSDT || selectedWithdrawal.usdtAmount) * 0.99)).toFixed(2)} USDT (99%)
                </span>
              </div>
              <div>
                <span className="text-emerald-400 block text-[11px]">Admin Full Payout Obligation</span>
                <span className="text-emerald-400 font-bold text-sm">
                  ₹{selectedWithdrawal.finalInrPayout.toLocaleString('en-IN')} (₹105/USDT)
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Submission Date</span>
                <span className="text-gray-300">{new Date(selectedWithdrawal.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Settlement Method</span>
                <span className="text-white font-semibold">PhonePe / UPI INR</span>
              </div>
            </div>

            {/* Platform Bonus Note */}
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 font-sans">
              <strong>1% Platform Bonus Rule:</strong> Trader requested {(selectedWithdrawal.requestedUSDT || selectedWithdrawal.usdtAmount)} USDT. Trader receives 100% full payout obligation (₹{selectedWithdrawal.finalInrPayout.toLocaleString('en-IN')}). Only {(selectedWithdrawal.balanceDebitUSDT || (selectedWithdrawal.usdtAmount * 0.99)).toFixed(2)} USDT is debited from their balance. Never reduce payout amount!
            </div>

            {/* Payment Destinations: QR and/or UPI ID */}
            {selectedWithdrawal.traderQrImageUrl ? (
              <div className="p-4 bg-[#0B0F19] rounded-xl border border-[#1F293D] text-center space-y-2">
                <span className="text-gray-300 block font-semibold">
                  Trader PhonePe / UPI QR Code Scanner:
                </span>
                <div className="w-56 h-56 bg-white p-3 rounded-2xl mx-auto border border-[#1F293D] shadow-inner">
                  <img
                    src={selectedWithdrawal.traderQrImageUrl}
                    alt="Trader QR"
                    className="w-full h-full object-contain"
                  />
                </div>
                {(selectedWithdrawal.traderUpiId || selectedWithdrawal.upiId) && (
                  <div className="pt-1">
                    <span className="text-gray-400 text-[11px] block">UPI ID / Payment Address:</span>
                    <span className="text-purple-400 font-mono text-xs font-bold">
                      {selectedWithdrawal.traderUpiId || selectedWithdrawal.upiId}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl">
                <span className="text-gray-400 block text-[11px] mb-1">Trader UPI ID / Payment Address:</span>
                <span className="text-purple-400 font-mono text-sm font-bold">
                  {selectedWithdrawal.traderUpiId || selectedWithdrawal.upiId || 'Not provided'}
                </span>
              </div>
            )}

            {/* Actions for PENDING_REVIEW or PENDING status */}
            {(selectedWithdrawal.status === 'PENDING_REVIEW' || selectedWithdrawal.status === 'PENDING') && (
              <div className="space-y-3 pt-2 border-t border-[#1F293D]">
                <div className="flex items-center justify-between text-xs text-gray-400 font-sans">
                  <span>Step 1: Approve request to verify payment destination, or Reject to refund reserved USDT.</span>
                </div>
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    disabled={withdrawalActionLoading}
                    onClick={handleRejectWithdrawal}
                    className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-semibold text-xs font-sans transition-all"
                  >
                    Reject & Restore Balance
                  </button>
                  <button
                    type="button"
                    disabled={withdrawalActionLoading}
                    onClick={handleApproveWithdrawal}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs font-sans shadow-md shadow-blue-600/30 transition-all"
                  >
                    {withdrawalActionLoading ? 'Approving...' : 'Approve Request'}
                  </button>
                </div>
              </div>
            )}

            {/* Actions for APPROVED status: UTR Payout Completion */}
            {selectedWithdrawal.status === 'APPROVED' && (
              <div className="space-y-3 pt-2 border-t border-[#1F293D]">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-gray-300 font-semibold font-sans">
                      Bank UTR / Payout Transaction Reference *
                    </label>
                    <span className="text-[10px] text-amber-400 font-sans">
                      Verify transfer before completing!
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={payoutReference}
                    onChange={(e) => setPayoutReference(e.target.value)}
                    placeholder="Enter 12-digit UTR from your PhonePe transfer..."
                    className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={withdrawalActionLoading}
                    onClick={handleRejectWithdrawal}
                    className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-semibold text-xs font-sans"
                  >
                    Reject & Restore Balance
                  </button>
                  <button
                    type="button"
                    disabled={withdrawalActionLoading || !payoutReference.trim()}
                    onClick={handleVerifyWithdrawalPayout}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs font-sans shadow-md shadow-purple-600/30 disabled:opacity-50"
                  >
                    {withdrawalActionLoading ? 'Finalizing Debit...' : 'Mark Payment Completed (Finalize 99% Debit)'}
                  </button>
                </div>
              </div>
            )}

            {/* Details when COMPLETED */}
            {selectedWithdrawal.status === 'COMPLETED' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1 text-emerald-300">
                <div className="flex justify-between">
                  <span className="font-bold">Payout Reference / UTR:</span>
                  <span className="text-white font-mono">{selectedWithdrawal.payoutReference}</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400">
                  <span>Verified At:</span>
                  <span className="text-gray-300">
                    {selectedWithdrawal.payoutVerifiedAt ? new Date(selectedWithdrawal.payoutVerifiedAt).toLocaleString() : 'Recorded'}
                  </span>
                </div>
              </div>
            )}

            {/* Details when REJECTED */}
            {selectedWithdrawal.status === 'REJECTED' && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-rose-300">
                <span className="font-bold block">Rejection Reason:</span>
                <span>{selectedWithdrawal.rejectionReason}</span>
                <span className="text-[11px] text-gray-400 block pt-1">
                  The reserved 99% balance was restored to the trader's available USDT balance.
                </span>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 12. MODAL: UPLOAD NEW ADMIN QR SCANNER */}
      <Modal
        isOpen={uploadQrModalOpen}
        onClose={() => {
          if (!uploadingQr) {
            setUploadQrModalOpen(false);
            setQrPreview('');
            setQrFile(null);
            setQrWalletAddress('');
            setQrDecodedAddress('');
          }
        }}
        title="Upload Admin Payment QR Scanner"
      >
        <form onSubmit={handleUploadQr} className="space-y-4 text-xs">
          {/* Field 1: Wallet Address * */}
          <div>
            <label className="block text-gray-300 font-semibold mb-1">
              Wallet Address *
            </label>
            <input
              type="text"
              required
              value={qrWalletAddress}
              onChange={(e) => setQrWalletAddress(e.target.value)}
              placeholder="Enter official USDT wallet address (e.g. TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P)"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              TRC-20 (starts with 'T', 34 characters) or ERC-20 (starts with '0x', 42 characters). Copy/paste supported.
            </p>
          </div>

          {/* Field 2: Upload QR Code * */}
          <div>
            <label className="block text-gray-300 font-semibold mb-1">
              Upload QR Code *
            </label>
            <div className="border-2 border-dashed border-[#1F293D] hover:border-blue-500/50 rounded-xl p-4 text-center cursor-pointer bg-[#0B0F19] transition-colors">
              <input
                type="file"
                required={!qrFile}
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleQrFileChange}
                className="hidden"
                id="admin-qr-file-input"
              />
              <label htmlFor="admin-qr-file-input" className="cursor-pointer block space-y-1">
                <Upload className="w-6 h-6 mx-auto text-blue-400" />
                <span className="text-gray-300 block font-medium">
                  {qrFile ? qrFile.name : 'Click to select or drop USDT Wallet QR code image'}
                </span>
                <span className="text-[10px] text-gray-500 block">
                  PNG, JPG, JPEG, WebP • Max 5 MB
                </span>
              </label>
            </div>

            {qrPreview && (
              <div className="mt-3 p-3 bg-[#0B0F19] rounded-xl border border-[#1F293D] flex items-center gap-4">
                <div className="w-24 h-24 bg-white p-2 rounded-lg shrink-0 border border-gray-300 flex items-center justify-center">
                  <img src={qrPreview} alt="QR Preview" className="w-full h-full object-contain" />
                </div>
                <div className="space-y-1 text-xs flex-1 min-w-0">
                  <div className="text-gray-300 font-semibold truncate">
                    {qrFile?.name}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {qrFile ? (qrFile.size / 1024).toFixed(1) : '0'} KB
                  </div>
                  {qrDecoding ? (
                    <div className="text-blue-400 text-[11px]">Verifying QR code data...</div>
                  ) : qrDecodedAddress ? (
                    <div className="flex items-center gap-1 text-emerald-400 text-[11px] truncate">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Decoded: {qrDecodedAddress}</span>
                    </div>
                  ) : (
                    <div className="text-gray-400 text-[11px]">Ready to publish</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              disabled={uploadingQr}
              onClick={() => {
                setUploadQrModalOpen(false);
                setQrPreview('');
                setQrFile(null);
                setQrWalletAddress('');
                setQrDecodedAddress('');
              }}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadingQr || !qrWalletAddress.trim() || !qrFile}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-600/30 disabled:opacity-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>{uploadingQr ? 'Uploading & Publishing...' : 'Upload & Publish QR'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
