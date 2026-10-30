import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Landmark,
  Plus,
  RefreshCw,
  Clock,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Info,
  ShieldCheck,
  Eye,
  ArrowRight,
  Upload,
  X,
  FileCheck,
  FileText,
  AlertCircle,
  QrCode,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { depositService } from '../../services/api';

export const DepositPage = () => {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settings, setSettings] = useState(null);

  // Live IST Clock
  const [istTime, setIstTime] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // Selected request for payment or view
  const [activeRequest, setActiveRequest] = useState(null);
  const [viewRequest, setViewRequest] = useState(null);
  const [isExistingActiveAlert, setIsExistingActiveAlert] = useState(false);

  // Create Form State
  const [depositType, setDepositType] = useState('WORKING_DEPOSIT');
  const [amount, setAmount] = useState('1000');
  const [currency, setCurrency] = useState('USDT');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Payment Form State
  const [txHash, setTxHash] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  // Expiration countdown
  const [timeLeftSec, setTimeLeftSec] = useState(0);

  // Auto-refresh countdown (15s)
  const [refreshCountdown, setRefreshCountdown] = useState(15);
  const fileInputRef = useRef(null);

  // Format IST Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      };
      setIstTime(`${new Intl.DateTimeFormat('en-IN', options).format(now)} IST`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch deposit settings and records
  const loadData = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const [settingsRes, depositsRes] = await Promise.all([
        depositService.getTraderSettings().catch(() => null),
        depositService.getTraderDeposits().catch(() => null),
      ]);

      if (settingsRes && settingsRes.success) {
        setSettings(settingsRes.data);
      }
      if (depositsRes && depositsRes.success) {
        setDeposits(depositsRes.data || []);
      }
    } catch (err) {
      console.error('[DepositPage] Failed to fetch deposits:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setRefreshCountdown(15);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Socket.IO real-time listener for active scanner and deposit status updates
    let socket = null;
    if (user && user._id) {
      try {
        socket = io('/', { transports: ['websocket', 'polling'] });
        socket.emit('join_trader_room', user._id);

        socket.on('deposit_scanner_updated', () => {
          loadData(true);
        });
        socket.on('scanner_config_updated', () => {
          loadData(true);
        });
        socket.on('deposit_status_update', (payload) => {
          loadData(true);
          if (payload && payload.requestId) {
            setActiveRequest((prev) =>
              prev && prev.requestId === payload.requestId ? { ...prev, status: payload.status } : prev
            );
          }
        });
        socket.on('deposit_updated', () => {
          loadData(true);
        });
      } catch (err) {
        console.warn('[DepositPage Socket.IO Error]:', err);
      }
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [loadData, user]);

  // 15-second Auto-refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          loadData();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Expiration countdown ticker for Payment Modal
  useEffect(() => {
    if (!paymentModalOpen || !activeRequest?.expiresAt) {
      setTimeLeftSec(0);
      return;
    }

    const calcTimeLeft = () => {
      const expMs = new Date(activeRequest.expiresAt).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.ceil((expMs - nowMs) / 1000));
      return diffSec;
    };

    const initial = calcTimeLeft();
    setTimeLeftSec(initial);
    if (initial <= 0 && activeRequest.status !== 'EXPIRED') {
      setActiveRequest((prev) => (prev ? { ...prev, status: 'EXPIRED' } : null));
    }

    const timer = setInterval(() => {
      const remaining = calcTimeLeft();
      setTimeLeftSec(remaining);
      if (remaining <= 0) {
        // Expired!
        setActiveRequest((prev) => (prev ? { ...prev, status: 'EXPIRED' } : null));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [paymentModalOpen, activeRequest?.expiresAt, activeRequest?.status]);

  const formatTimer = (seconds) => {
    if (seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Format IST dates helper
  const formatISTDate = (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', {
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

  // Open Create Modal handler
  const handleOpenCreateModal = () => {
    setCreateError('');
    // Check if trader already has an active draft
    const existingDraft = deposits.find(
      (d) =>
        (d.status === 'DRAFT' || d.status === 'AWAITING_PAYMENT') &&
        (!d.expiresAt || new Date(d.expiresAt) > new Date())
    );

    if (existingDraft) {
      setActiveRequest(existingDraft);
      setIsExistingActiveAlert(true);
      setPaymentModalOpen(true);
      return;
    }

    setDepositType('WORKING_DEPOSIT');
    setAmount('1000');
    setCurrency('USDT');
    setCreateModalOpen(true);
  };

  // Submit Create Deposit Request
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setCreateError('Please enter a valid positive deposit amount.');
      return;
    }

    if (currency === 'USDT') {
      const min = settings?.minDepositAmountUsdt || 50;
      const max = settings?.maxDepositAmountUsdt || 100000;
      if (numAmount < min || numAmount > max) {
        setCreateError(`USDT amount must be between ${min} and ${max}.`);
        return;
      }
    }

    try {
      setCreating(true);
      const res = await depositService.createTraderDeposit({
        depositType,
        amount: numAmount,
        currency,
      });

      if (res.success && res.data) {
        setCreateModalOpen(false);
        setActiveRequest(res.data);
        setIsExistingActiveAlert(Boolean(res.isExistingActive));
        setTxHash('');
        setScreenshotFile(null);
        setScreenshotPreview(null);
        setSubmitError('');
        setPaymentModalOpen(true);
        loadData();
      } else {
        setCreateError(res.message || 'Failed to initialize deposit request.');
      }
    } catch (err) {
      setCreateError(err.message || 'Unable to create deposit request.');
    } finally {
      setCreating(false);
    }
  };

  // Open Continue Payment Modal
  const handleContinuePayment = (reqItem) => {
    setActiveRequest(reqItem);
    setIsExistingActiveAlert(false);
    setTxHash(reqItem.txHash !== '-' ? reqItem.txHash : '');
    setScreenshotFile(null);
    setScreenshotPreview(
      reqItem.screenshot && reqItem.screenshot !== '-' ? reqItem.screenshot : null
    );
    setSubmitError('');
    setPaymentModalOpen(true);
  };

  // Open View Details Modal
  const handleViewDetails = (reqItem) => {
    setViewRequest(reqItem);
    setViewModalOpen(true);
  };

  // Copy to clipboard helper
  const handleCopy = (text, type = 'wallet') => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
    if (type === 'wallet') {
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    } else {
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  };

  // Handle Screenshot file change
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype) && !allowed.includes(file.type)) {
      setSubmitError('Only JPEG, PNG, and WEBP image files are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSubmitError('Screenshot must be 5MB or less.');
      return;
    }

    setSubmitError('');
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Validate TRON TX hash (64 hex characters)
  const isTxHashValid = /^[a-fA-F0-9]{64}$/.test(txHash.trim());

  // Finish Deposit Submission
  const handleFinishDeposit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!activeRequest) return;

    if (timeLeftSec <= 0 || activeRequest.status === 'EXPIRED') {
      setSubmitError('This deposit request has expired. Please create a new request.');
      return;
    }

    const cleanTx = txHash.trim();
    if (!isTxHashValid) {
      setSubmitError('TRON transaction hash must be exactly 64 hexadecimal characters.');
      return;
    }

    if (!screenshotFile && !activeRequest.screenshot) {
      setSubmitError('Please attach a screenshot showing the FINAL confirmed transaction status.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('txHash', cleanTx);
      if (screenshotFile) {
        formData.append('screenshot', screenshotFile);
      }

      const res = await depositService.submitEvidence(activeRequest._id, formData);
      if (res.success) {
        setPaymentModalOpen(false);
        setActiveRequest(null);
        setScreenshotFile(null);
        setScreenshotPreview(null);
        setTxHash('');
        await loadData();
        alert('Evidence submitted successfully! Your deposit is now under administrative review.');
      } else {
        setSubmitError(res.message || 'Evidence submission failed.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit deposit evidence.');
    } finally {
      setSubmitting(false);
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'DRAFT':
      case 'AWAITING_PAYMENT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Draft
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Submitted
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Under Review
          </span>
        );
      case 'APPROVED':
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Rejected
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            {status}
          </span>
        );
    }
  };

  // Render Verification Badge
  const renderVerificationBadge = (verification) => {
    switch (verification) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Verified
          </span>
        );
      case 'CHECKING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Checking
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Failed
          </span>
        );
      case 'NOT_CHECKED':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
            Not checked
          </span>
        );
    }
  };

  // Destination wallet address resolution
  const assignedWalletAddress =
    activeRequest?.destinationWalletSnapshot?.address ||
    activeRequest?.wallet ||
    settings?.activeScanner?.walletAddress ||
    '';

  const assignedQrImageUrl =
    activeRequest?.destinationWalletSnapshot?.qrImageUrl ||
    activeRequest?.qrImageUrl ||
    settings?.activeScanner?.qrImageUrl ||
    '';

  return (
    <div className="space-y-6">
      {/* Top Header matching Screenshot 1 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Deposit Requests</h1>
            {user?.username && (
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-[#162032] text-gray-300 border border-[#22334F] font-mono">
                {user.username}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Working and security deposit request history
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Live IST Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-xs font-mono text-gray-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{istTime || 'Loading IST...'}</span>
          </div>

          {/* Auto-refresh indicator & button */}
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-xs text-gray-400 hover:text-white transition-colors"
            title="Click to refresh table now"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-gray-400 ${
                isRefreshing ? 'animate-spin text-blue-400' : ''
              }`}
            />
            <span className="hidden sm:inline">Auto-refreshing every 15s</span>
            <span className="font-mono text-gray-500">({refreshCountdown}s)</span>
          </button>

          {/* Blue Create Deposit Button */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create deposit</span>
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="border-b border-[#1F293D] bg-[#0E1524] text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Deposit type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Wallet</th>
                <th className="py-3 px-4">TX Hash</th>
                <th className="py-3 px-4">Screenshot</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4">Created at</th>
                <th className="py-3 px-4">Submitted at</th>
                <th className="py-3 px-4">Approved at</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D] text-xs text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan="12" className="py-12 text-center text-gray-400 font-mono">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading deposit requests...
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan="12" className="py-12 text-center text-gray-500">
                    <Landmark className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    No deposit requests recorded yet. Click "+ Create deposit" to initiate.
                  </td>
                </tr>
              ) : (
                deposits.map((item) => {
                  const isDraft = item.status === 'DRAFT' || item.status === 'AWAITING_PAYMENT';
                  const isExpired = item.status === 'EXPIRED';

                  return (
                    <tr
                      key={item._id}
                      className="hover:bg-[#162032] transition-colors duration-150"
                    >
                      {/* 1. Request ID */}
                      <td className="py-3 px-4 font-mono font-medium text-white">
                        {item.requestId}
                      </td>

                      {/* 2. Deposit type */}
                      <td className="py-3 px-4 text-gray-200">
                        {item.depositTypeLabel ||
                          (item.depositType === 'SECURITY_DEPOSIT'
                            ? 'Security deposit'
                            : 'Working deposit')}
                      </td>

                      {/* 3. Amount */}
                      <td className="py-3 px-4 font-mono font-semibold text-white">
                        {Number(item.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="text-gray-400 font-normal">{item.currency || 'USDT'}</span>
                      </td>

                      {/* 4. Wallet */}
                      <td className="py-3 px-4 font-mono text-xs text-gray-400">
                        {item.wallet && item.wallet !== '-' ? (
                          <div className="flex items-center gap-1.5" title={item.wallet}>
                            <span>
                              {item.wallet.length > 14
                                ? `${item.wallet.slice(0, 6)}...${item.wallet.slice(-6)}`
                                : item.wallet}
                            </span>
                            <button
                              onClick={() => handleCopy(item.wallet, 'wallet')}
                              className="p-1 hover:text-white transition-colors"
                              title="Copy wallet address"
                            >
                              <Copy className="w-3 h-3 text-gray-400 hover:text-white" />
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      {/* 5. TX Hash */}
                      <td className="py-3 px-4 font-mono text-xs text-gray-400">
                        {item.txHash && item.txHash !== '-' ? (
                          <div className="flex items-center gap-1.5" title={item.txHash}>
                            <span>{`${item.txHash.slice(0, 6)}...${item.txHash.slice(-6)}`}</span>
                            <button
                              onClick={() => handleCopy(item.txHash, 'tx')}
                              className="p-1 hover:text-white transition-colors"
                              title="Copy transaction hash"
                            >
                              <Copy className="w-3 h-3 text-gray-400 hover:text-white" />
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      {/* 6. Screenshot */}
                      <td className="py-3 px-4">
                        {item.screenshot && item.screenshot !== '-' ? (
                          <a
                            href={item.screenshot}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs hover:underline"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>View</span>
                          </a>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-4">{renderStatusBadge(item.status)}</td>

                      {/* 8. Verification */}
                      <td className="py-3 px-4">{renderVerificationBadge(item.verification)}</td>

                      {/* 9. Created at */}
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                        {formatISTDate(item.createdAt)}
                      </td>

                      {/* 10. Submitted at */}
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                        {formatISTDate(item.submittedAt)}
                      </td>

                      {/* 11. Approved at */}
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                        {formatISTDate(item.approvedAt)}
                      </td>

                      {/* 12. Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {isDraft && (
                            <button
                              onClick={() => handleContinuePayment(item)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition-colors flex items-center gap-1"
                            >
                              <span>Continue</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          <button
                            onClick={() => handleViewDetails(item)}
                            className="p-1.5 rounded-lg bg-[#1F293D] hover:bg-[#2B3A52] text-gray-300 hover:text-white transition-colors"
                            title="View request details"
                          >
                            <Eye className="w-4 h-4" />
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
      </div>

      {/* ========================================================= */}
      {/* TASK 3: CREATE DEPOSIT MODAL                               */}
      {/* ========================================================= */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-1">Create Deposit Request</h2>
            <p className="text-xs text-gray-400 mb-5">
              Select deposit type and enter the desired funding amount.
            </p>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Field 1: Deposit Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  Deposit Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositType('WORKING_DEPOSIT')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      depositType === 'WORKING_DEPOSIT'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                    }`}
                  >
                    Working Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositType('SECURITY_DEPOSIT')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      depositType === 'SECURITY_DEPOSIT'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-[#162032] border-[#22334F] text-gray-400 hover:text-white'
                    }`}
                  >
                    Security Deposit
                  </button>
                </div>
              </div>

              {/* Field 2 & 3: Deposit Amount & Currency */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  Deposit Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1000"
                    required
                    className="w-full bg-[#162032] border border-[#22334F] rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500 pr-24"
                  />
                  <div className="absolute right-2 top-2 bottom-2 flex items-center">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="bg-[#111827] border border-[#1F293D] text-gray-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-semibold"
                    >
                      <option value="USDT">USDT (TRC20)</option>
                      {settings?.inrDepositEnabled && <option value="INR">INR (Bank/Escrow)</option>}
                    </select>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-500 mt-1.5">
                  <span>
                    Min: {settings?.minDepositAmountUsdt || 50} {currency}
                  </span>
                  <span>
                    Max: {(settings?.maxDepositAmountUsdt || 100000).toLocaleString()} {currency}
                  </span>
                </div>
              </div>

              {/* Summary Box */}
              <div className="p-3.5 bg-[#162032] rounded-xl border border-[#22334F] space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>Selected Type</span>
                  <span className="text-white font-medium">
                    {depositType === 'SECURITY_DEPOSIT' ? 'Security Deposit' : 'Working Deposit'}
                  </span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Destination Network</span>
                  <span className="text-emerald-400 font-medium font-mono">TRON (TRC20)</span>
                </div>
                {settings?.activeScanner ? (
                  <div className="flex justify-between text-gray-400">
                    <span>Active Destination</span>
                    <span className="text-blue-400 font-medium font-mono">
                      {settings.activeScanner.walletAddress.slice(0, 6)}...{settings.activeScanner.walletAddress.slice(-4)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between text-amber-400 text-[11px]">
                    <span>Active Destination</span>
                    <span className="font-semibold text-rose-400">Unavailable</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-400 border-t border-[#22334F] pt-1.5">
                  <span className="font-semibold text-gray-300">Total Payable</span>
                  <span className="font-mono font-bold text-white">
                    {parseFloat(amount || 0).toFixed(2)} {currency}
                  </span>
                </div>
              </div>

              {!settings?.activeScanner && currency === 'USDT' && (
                <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Deposit payment destination is currently unavailable. Admin has not activated a payment scanner.</span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#162032] text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || (currency === 'USDT' && !settings?.activeScanner)}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Payment</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TASK 4-9: DEPOSIT PAYMENT INTERFACE (SCREENSHOT 2 EXACT)  */}
      {/* ========================================================= */}
      {paymentModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in">
          <div className="bg-[#121824] border border-[#1F293D] rounded-2xl w-full max-w-2xl my-auto p-5 sm:p-7 shadow-2xl text-left space-y-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#1F293D] pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-white tracking-tight">Deposit payment</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-[#162032] text-blue-300 border border-[#22334F]">
                    {activeRequest.requestId}
                  </span>
                  {renderStatusBadge(activeRequest.status)}
                  {renderVerificationBadge(activeRequest.verification)}
                </div>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* THREE INFORMATIONAL BANNERS */}
            {/* Banner 1: Existing Active Request Notice (Task 5) */}
            {isExistingActiveAlert && (
              <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-center gap-3 text-xs text-blue-300">
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  You already have an active deposit request. Continue payment for the existing
                  request.
                </span>
              </div>
            )}

            {/* Banner 2: TRC20 Network Warning (Task 5) */}
            <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center gap-3 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Send only USDT via the TRC20 network (TRON) to this address. Other assets or networks
                may result in permanent loss.
              </span>
            </div>

            {/* Banner 3: Wallet Check Link (Task 5) */}
            <div className="p-2.5 bg-[#162032] border border-[#22334F] rounded-xl flex items-center justify-between text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Check the sending wallet first:</span>
              </div>
              <a
                href="/wallet-check"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold text-xs hover:underline"
              >
                <span>Wallet Check</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* FOUR PAYMENT DETAILS CARDS (Task 6 - 2 Column Layout) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {/* Card 1: Deposit Type */}
              <div className="bg-[#162032] border border-[#22334F] rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Deposit type
                </span>
                <span className="text-sm font-bold text-white mt-1">
                  {activeRequest.depositTypeLabel ||
                    (activeRequest.depositType === 'SECURITY_DEPOSIT'
                      ? 'Security deposit'
                      : 'Working deposit')}
                </span>
              </div>

              {/* Card 2: Amount */}
              <div className="bg-[#162032] border border-[#22334F] rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Amount
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    {Number(activeRequest.amount).toFixed(2)}
                  </span>
                  <span className="text-xs font-semibold text-gray-400">
                    {activeRequest.currency || 'USDT'}
                  </span>
                </div>
              </div>

              {/* Card 3: Expiration Timer */}
              <div className="bg-[#162032] border border-[#22334F] rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Expiration timer
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span
                    className={`text-xl font-bold font-mono tracking-wider ${
                      timeLeftSec > 300
                        ? 'text-white'
                        : timeLeftSec > 0
                        ? 'text-amber-400 animate-pulse'
                        : 'text-rose-500'
                    }`}
                  >
                    {formatTimer(timeLeftSec)}
                  </span>
                  {timeLeftSec <= 0 && (
                    <span className="text-xs text-rose-400 font-semibold">(Expired)</span>
                  )}
                </div>
              </div>

              {/* Card 4: QR Code & Wallet Address */}
              <div className="bg-[#162032] border border-[#22334F] rounded-xl p-3.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                  Deposit wallet address — USDT TRC20
                </span>
                {assignedWalletAddress && assignedWalletAddress !== '-' ? (
                  <div className="flex items-center gap-3">
                    {/* Uploaded QR Image from active scanner, or SVG fallback */}
                    <div className="p-1 bg-white rounded-lg shrink-0 shadow-md w-18 h-18 flex items-center justify-center overflow-hidden">
                      {assignedQrImageUrl ? (
                        <img
                          src={assignedQrImageUrl}
                          alt="USDT TRC20 QR Code"
                          className="w-16 h-16 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = document.getElementById(`qr-svg-fallback-${activeRequest?._id}`);
                            if (fallback) fallback.style.display = 'block';
                          }}
                        />
                      ) : null}
                      <div
                        id={`qr-svg-fallback-${activeRequest?._id}`}
                        style={{ display: assignedQrImageUrl ? 'none' : 'block' }}
                      >
                        <QRCodeSVG
                          value={assignedWalletAddress}
                          size={64}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[11px] text-gray-200 break-all select-all leading-snug">
                        {assignedWalletAddress}
                      </p>
                      <button
                        onClick={() => handleCopy(assignedWalletAddress, 'wallet')}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {copiedWallet ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Address copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy wallet address</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Payment destination unavailable. Please wait for an active scanner to be assigned by administrator.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Error banner if any */}
            {submitError && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Form Inputs: TX Hash & Screenshot Upload */}
            <form onSubmit={handleFinishDeposit} className="space-y-3.5 pt-1">
              {/* TASK 7: Transaction Hash Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Transaction hash
                  </label>
                  {txHash.trim() && (
                    <span
                      className={`text-[11px] font-mono ${
                        isTxHashValid ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {txHash.trim().length}/64 characters
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value.trim())}
                  placeholder="Paste 64-character TRON transaction identifier"
                  className={`w-full bg-[#162032] border rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:outline-none transition-colors ${
                    txHash.trim()
                      ? isTxHashValid
                        ? 'border-emerald-500/50 focus:border-emerald-500'
                        : 'border-amber-500/50 focus:border-amber-500'
                      : 'border-[#22334F] focus:border-blue-500'
                  }`}
                  disabled={timeLeftSec <= 0 || activeRequest.status === 'EXPIRED'}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  TRON transaction hash must be 64 hex characters
                </p>
              </div>

              {/* TASK 8: Upload Screenshot (Blue Outlined Control Matching Screenshot 2) */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Upload screenshot
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />

                {!screenshotPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-500/40 hover:border-blue-500/80 bg-blue-950/10 hover:bg-blue-950/20 rounded-xl p-4 text-center cursor-pointer transition-all duration-150"
                  >
                    <Upload className="w-6 h-6 text-blue-400 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-blue-300">
                      Click to browse or drop transaction receipt screenshot
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Supported formats: PNG, JPG, JPEG, WEBP (Max 5MB)
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#22334F] bg-[#162032] rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={screenshotPreview}
                        alt="Preview"
                        className="w-12 h-12 object-cover rounded-lg border border-[#22334F] shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {screenshotFile ? screenshotFile.name : 'Attached screenshot'}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {screenshotFile
                            ? `${(screenshotFile.size / 1024).toFixed(1)} KB`
                            : 'Ready for submission'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveScreenshot}
                      className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-[#1F293D] rounded-lg transition-colors"
                      title="Remove screenshot"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-gray-500 mt-1">
                  Please upload screenshot with FINAL transaction status
                </p>
              </div>

              {/* TASK 9: Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F293D]">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#1F293D] text-gray-400 hover:text-white hover:bg-[#162032] text-xs font-semibold transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    !isTxHashValid ||
                    (!screenshotFile && !activeRequest.screenshot) ||
                    timeLeftSec <= 0 ||
                    activeRequest.status === 'EXPIRED'
                  }
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-[#1F293D] disabled:text-gray-500 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Finish deposit</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW DETAILS MODAL                                        */}
      {/* ========================================================= */}
      {viewModalOpen && viewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] border border-[#1F293D] rounded-2xl w-full max-w-xl p-6 shadow-2xl relative text-left space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1F293D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Deposit Request Details</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#162032] text-blue-300 border border-[#22334F]">
                  {viewRequest.requestId}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {renderStatusBadge(viewRequest.status)}
                {renderVerificationBadge(viewRequest.verification)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#162032] p-4 rounded-xl border border-[#22334F]">
              <div>
                <span className="text-gray-400 block text-[11px]">Deposit Type</span>
                <span className="text-white font-medium">
                  {viewRequest.depositTypeLabel || viewRequest.depositType}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Amount</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  {Number(viewRequest.amount).toFixed(2)} {viewRequest.currency}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Created At</span>
                <span className="text-gray-200">{formatISTDate(viewRequest.createdAt)}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Submitted At</span>
                <span className="text-gray-200">{formatISTDate(viewRequest.submittedAt)}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Approved At</span>
                <span className="text-gray-200">{formatISTDate(viewRequest.approvedAt)}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Expiration</span>
                <span className="text-gray-200">{formatISTDate(viewRequest.expiresAt)}</span>
              </div>
            </div>

            {/* Wallet Address */}
            <div className="bg-[#162032] p-3 rounded-xl border border-[#22334F] text-xs">
              <span className="text-gray-400 block text-[11px] mb-1">Assigned Wallet Address</span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-white break-all select-all">
                  {viewRequest.wallet || '-'}
                </span>
                {viewRequest.wallet && viewRequest.wallet !== '-' && (
                  <button
                    onClick={() => handleCopy(viewRequest.wallet, 'wallet')}
                    className="p-1 hover:text-white text-gray-400 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* TX Hash */}
            <div className="bg-[#162032] p-3 rounded-xl border border-[#22334F] text-xs">
              <span className="text-gray-400 block text-[11px] mb-1">Submitted TX Hash</span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-white break-all select-all">
                  {viewRequest.txHash || '-'}
                </span>
                {viewRequest.txHash && viewRequest.txHash !== '-' && (
                  <button
                    onClick={() => handleCopy(viewRequest.txHash, 'tx')}
                    className="p-1 hover:text-white text-gray-400 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Screenshot if available */}
            {viewRequest.screenshot && viewRequest.screenshot !== '-' && (
              <div className="bg-[#162032] p-3 rounded-xl border border-[#22334F] text-xs">
                <span className="text-gray-400 block text-[11px] mb-2">Payment Evidence</span>
                <a
                  href={viewRequest.screenshot}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group relative rounded-lg overflow-hidden border border-[#22334F] max-h-52"
                >
                  <img
                    src={viewRequest.screenshot}
                    alt="Payment Screenshot"
                    className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1.5">
                    <ExternalLink className="w-4 h-4" />
                    <span>Open full image</span>
                  </div>
                </a>
              </div>
            )}

            {/* Rejection / Decision Notes */}
            {(viewRequest.rejectionReason || viewRequest.adminDecisionNotes) && (
              <div className="bg-rose-950/30 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300">
                <span className="font-semibold block mb-0.5">Administrative Note / Reason:</span>
                <span>{viewRequest.rejectionReason || viewRequest.adminDecisionNotes}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1F293D] hover:bg-[#2B3A52] text-white text-xs font-medium transition-colors"
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
