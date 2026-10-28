import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowDownToLine,
  QrCode,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  AlertCircle,
  Plus,
  Send,
  Building2,
  Store,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { payinService, scannerService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';

export const PayInPage = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Scanner info from backend
  const [activeScannerInfo, setActiveScannerInfo] = useState({
    configured: false,
    isAvailable: false,
    scanner: null,
    loading: true,
  });

  // Create PayIn Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [clientNotes, setClientNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Active Payment Modal (displayed right after creating request)
  const [activePaymentModal, setActivePaymentModal] = useState({
    open: false,
    payIn: null,
    scanner: null,
  });

  // Reference / UTR Submission Modal
  const [refModal, setRefModal] = useState({ open: false, payIn: null, referenceId: '', notes: '', error: '' });
  const [submittingRef, setSubmittingRef] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch client requests
  const fetchMyPayIns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await payinService.getMyPayIns();
      if (res.success) {
        setRequests(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch active scanner configuration
  const fetchActiveScanner = useCallback(async () => {
    try {
      setActiveScannerInfo((prev) => ({ ...prev, loading: true }));
      const res = await scannerService.getActive();
      if (res.success) {
        setActiveScannerInfo({
          configured: res.configured,
          isAvailable: res.isAvailable,
          scanner: res.scanner,
          loading: false,
        });
      }
    } catch (err) {
      setActiveScannerInfo({
        configured: false,
        isAvailable: false,
        scanner: null,
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    fetchMyPayIns();
    fetchActiveScanner();
  }, [fetchMyPayIns, fetchActiveScanner]);

  const handleCreatePayIn = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!amount || parseFloat(amount) <= 0) {
      setCreateError('Please enter a valid amount greater than zero.');
      return;
    }

    try {
      setCreating(true);
      const res = await payinService.create({
        amount: parseFloat(amount),
        currency,
        clientNotes,
      });

      if (res.success) {
        setCreateModalOpen(false);
        setAmount('');
        setClientNotes('');
        fetchMyPayIns();

        // Open payment instructions modal with bound merchant QR
        setActivePaymentModal({
          open: true,
          payIn: res.payIn,
          scanner: res.scanner,
        });
      }
    } catch (err) {
      setCreateError(err.message || 'Failed to create payment request.');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitReference = async (e) => {
    e.preventDefault();
    setRefModal((prev) => ({ ...prev, error: '' }));
    if (!refModal.referenceId.trim()) {
      setRefModal((prev) => ({ ...prev, error: 'Please enter your payment Reference or UTR number.' }));
      return;
    }

    try {
      setSubmittingRef(true);
      const res = await payinService.submitReference(
        refModal.payIn._id || refModal.payIn.id,
        refModal.referenceId.trim(),
        refModal.notes.trim()
      );
      if (res.success) {
        setRefModal({ open: false, payIn: null, referenceId: '', notes: '', error: '' });
        fetchMyPayIns();
      }
    } catch (err) {
      setRefModal((prev) => ({ ...prev, error: err.message || 'Submission error.' }));
    } finally {
      setSubmittingRef(false);
    }
  };

  const copyText = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Make Payment & QR Deposits</h1>
          <p className="text-xs text-gray-400 mt-1">
            Scan official PhonePe Business QR, submit your 12-digit UTR, and track independent verification.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateError('');
            setCreateModalOpen(true);
          }}
          disabled={!activeScannerInfo.isAvailable}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs shadow-lg transition-all ${
            activeScannerInfo.isAvailable
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Make Payment (New Request)</span>
        </button>
      </div>

      {/* Banner: If payment unavailable */}
      {!activeScannerInfo.loading && !activeScannerInfo.isAvailable && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-xs text-amber-300">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <strong className="font-semibold">Payments Currently Unavailable:</strong> PhonePe payments are
            currently unavailable while administrator configures or replaces the active merchant QR. Please check back
            shortly or contact support.
          </div>
        </div>
      )}

      {/* Banner: If Demo Mode is Active */}
      {!activeScannerInfo.loading && activeScannerInfo.isAvailable && activeScannerInfo.scanner?.isDemo && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <div>
              <strong className="font-bold text-white">DEMO MODE ACTIVE — DO NOT PAY:</strong> This portal is
              currently operating with a non-payable demo scanner for simulation and testing.
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold border border-rose-500/30 shrink-0">
            TEST ENVIRONMENT
          </span>
        </div>
      )}

      {/* Active Merchant Quick Card */}
      {activeScannerInfo.isAvailable && activeScannerInfo.scanner && (
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Receiving Merchant:</span>
                <span className="text-xs font-bold text-white">{activeScannerInfo.scanner.merchantName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {activeScannerInfo.scanner.paymentProvider}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Scanner ID: <span className="font-mono text-gray-400">{activeScannerInfo.scanner.scannerId}</span> (v{activeScannerInfo.scanner.version})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Direct Payment Provider:</span>
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified PhonePe Business
            </span>
          </div>
        </div>
      )}

      {/* Payment History Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Payment Requests & Verification History</h3>
          </div>
          <span className="text-xs text-gray-400">{requests.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-4">Payment Request ID</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Original Merchant</th>
                <th className="p-4">Scanner ID</th>
                <th className="p-4">Client UTR / Ref</th>
                <th className="p-4">Status</th>
                <th className="p-4">Created Date</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-gray-400">Loading payment history...</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-gray-500">
                    No payment requests yet. Click "Make Payment" above to generate a PhonePe QR.
                  </td>
                </tr>
              ) : (
                requests.map((item) => (
                  <tr key={item._id} className="hover:bg-[#151D2F]">
                    <td className="p-4 font-mono font-semibold text-white">{item.requestId}</td>
                    <td className="p-4 font-bold text-emerald-400 font-mono">
                      {item.currency} {item.amount.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 font-medium text-white">
                        <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{item.merchantName || 'Authorized Merchant'}</span>
                      </div>
                      {item.isDemo && (
                        <span className="text-[9px] text-rose-400 font-bold block mt-0.5">DEMO ONLY</span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-gray-400">
                      {item.scannerId || 'QR-001'} (v{item.scannerVersion || 1})
                    </td>
                    <td className="p-4 font-mono">
                      {item.referenceId ? (
                        <span className="text-blue-400 font-semibold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                          {item.referenceId}
                        </span>
                      ) : (
                        <span className="text-amber-400 text-[11px] font-medium">Awaiting UTR submission</span>
                      )}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-4 text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="p-4 text-right">
                      {!item.referenceId && ['PENDING'].includes(item.status) ? (
                        <button
                          onClick={() => setRefModal({ open: true, payIn: item, referenceId: '', notes: '', error: '' })}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 text-[11px] font-semibold"
                        >
                          Submit UTR
                        </button>
                      ) : (
                        <span className="text-gray-500 text-[11px] font-mono">
                          {item.verificationStatus === 'VERIFIED' ? 'Verified' : 'Claimed'}
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

      {/* Modal: Create PayIn Request */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create PhonePe Payment Request"
      >
        <form onSubmit={handleCreatePayIn} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {/* Bound Merchant Banner */}
          <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl flex items-center justify-between text-xs">
            <div>
              <p className="text-[11px] text-gray-400">Authorized Merchant:</p>
              <p className="font-bold text-white text-xs mt-0.5">{activeScannerInfo.scanner?.merchantName}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Payment Provider:</p>
              <p className="font-semibold text-blue-400 text-xs mt-0.5">{activeScannerInfo.scanner?.paymentProvider}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Currency *</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="INR">INR (Indian Rupee - PhonePe UPI / Banking)</option>
              <option value="USDT">USDT (Tether USD)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Payment Amount *</label>
            <input
              type="number"
              required
              min={1}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Client Notes / Purpose (Optional)</label>
            <input
              type="text"
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="e.g. Trading account fund deposit"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/30"
            >
              {creating ? 'Creating Request...' : 'Proceed to PhonePe QR'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Active QR & Make Payment Display */}
      <Modal
        isOpen={activePaymentModal.open}
        onClose={() => setActivePaymentModal({ open: false, payIn: null, scanner: null })}
        title="PhonePe Payment Terminal"
      >
        <div className="space-y-4 text-center">
          {/* Top Payment Info Header */}
          <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl grid grid-cols-2 gap-2 text-left text-xs">
            <div>
              <p className="text-[10px] text-gray-400">Payment Request ID:</p>
              <p className="font-mono font-bold text-white text-[11px]">{activePaymentModal.payIn?.requestId}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Receiving Merchant:</p>
              <p className="font-semibold text-blue-400 text-[11px]">{activePaymentModal.payIn?.merchantName}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Client ID:</p>
              <p className="font-mono text-gray-300 text-[11px]">{user?.username}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Amount to Transfer:</p>
              <p className="font-mono font-extrabold text-emerald-400 text-sm">
                {activePaymentModal.payIn?.currency} {activePaymentModal.payIn?.amount.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Demo Warning Banner if Demo Mode */}
          {activePaymentModal.scanner?.isDemo && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 font-bold text-[11px] tracking-wide uppercase">
              DEMO ONLY — DO NOT PAY (SIMULATION ONLY)
            </div>
          )}

          {/* Dynamic QR Code Display */}
          <div className="p-4 bg-white rounded-2xl w-60 h-60 mx-auto flex items-center justify-center shadow-xl border border-gray-200">
            {activePaymentModal.scanner?.qrImageUrl ? (
              <img
                src={activePaymentModal.scanner.qrImageUrl}
                alt="PhonePe Business QR"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-gray-900 text-center p-2">
                <QrCode className="w-16 h-16 mx-auto mb-2 text-blue-600" />
                <p className="text-[11px] font-bold">Awaiting Scanner Asset</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-white">
              {activePaymentModal.scanner?.scannerName || 'PhonePe Business Scanner'}
            </p>
            <p className="text-[11px] text-gray-400 max-w-sm mx-auto leading-relaxed">
              {activePaymentModal.scanner?.instructions ||
                'Scan this official QR using your PhonePe application. Verify the merchant name, pay the exact amount, and submit your UTR.'}
            </p>
          </div>

          <div className="pt-4 flex items-center justify-center gap-3 border-t border-[#1F293D]">
            <button
              onClick={() => {
                const payIn = activePaymentModal.payIn;
                setActivePaymentModal({ open: false, payIn: null, scanner: null });
                setRefModal({ open: true, payIn, referenceId: '', notes: '', error: '' });
              }}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>I Have Paid — Submit for Verification</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Client Payment Claim (I Have Paid — Submit for Verification) */}
      <Modal
        isOpen={refModal.open}
        onClose={() => setRefModal({ open: false, payIn: null, referenceId: '', notes: '', error: '' })}
        title="Submit Payment Claim for Administrative Audit"
      >
        <form onSubmit={handleSubmitReference} className="space-y-4">
          {refModal.error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{refModal.error}</span>
            </div>
          )}

          <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Payment Request ID:</span>
              <span className="font-mono font-bold text-white">{refModal.payIn?.requestId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Receiving Merchant:</span>
              <span className="font-semibold text-blue-400">{refModal.payIn?.merchantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount Paid:</span>
              <span className="font-mono font-bold text-emerald-400">
                {refModal.payIn?.currency} {refModal.payIn?.amount?.toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              12-Digit UPI UTR / Transaction Reference ID *
            </label>
            <input
              type="text"
              required
              value={refModal.referenceId}
              onChange={(e) => setRefModal({ ...refModal, referenceId: e.target.value })}
              placeholder="e.g. 489201948201"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Found on your PhonePe payment confirmation receipt.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Sender Bank / Account Remarks (Optional)
            </label>
            <input
              type="text"
              value={refModal.notes}
              onChange={(e) => setRefModal({ ...refModal, notes: e.target.value })}
              placeholder="e.g. Paid from HDFC account ending in 4102"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setRefModal({ open: false, payIn: null, referenceId: '', notes: '', error: '' })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingRef}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submittingRef ? 'Submitting...' : 'Submit Claim for Verification'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
