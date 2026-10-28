import React, { useState, useEffect, useCallback } from 'react';
import {
  QrCode,
  Upload,
  Check,
  Power,
  AlertCircle,
  Eye,
  Edit,
  RefreshCw,
  Plus,
  Trash2,
  Archive,
  History,
  CheckCircle,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Store,
  ArrowRightLeft,
  RotateCcw,
} from 'lucide-react';
import { scannerService } from '../../services/api';
import { Modal } from '../../components/Modal';

export const ScannerConfigPage = () => {
  const [scanners, setScanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState('ALL'); // 'ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Modal States
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState({ open: false, scanner: null });
  const [editModal, setEditModal] = useState({ open: false, scanner: null });
  const [replaceModal, setReplaceModal] = useState({ open: false, oldScanner: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, scanner: null, loading: false });
  const [historyModal, setHistoryModal] = useState({ open: false, scanner: null });

  // Form State for Add / Edit / Replace
  const [formData, setFormData] = useState({
    scannerName: '',
    merchantName: '',
    merchantIdentifier: '',
    paymentProvider: 'PhonePe Business',
    mode: 'LIVE',
    paymentPurpose: 'Trader Deposit / PayIn',
    instructions: 'Scan this official PhonePe QR code. Verify the merchant name, pay the exact amount, and submit your 12-digit UTR/Reference ID.',
    authorizationDetails: 'Authorized PhonePe Business Account verified by Administrator.',
    file: null,
    previewUrl: '',
    autoPublish: false,
    archiveOld: false,
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchScanners = useCallback(async () => {
    try {
      setLoading(true);
      const res = await scannerService.getAllAdmin();
      if (res.success) {
        setScanners(res.scanners || []);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch scanners.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScanners();
  }, [fetchScanners]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit.');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      scannerName: '',
      merchantName: '',
      merchantIdentifier: '',
      paymentProvider: 'USDT TRC20',
      mode: 'LIVE',
      paymentPurpose: 'Trader Crypto Deposit / PayIn',
      instructions: 'Transfer exact USDT to this official TRON (TRC20) wallet address. Verify transaction hash (TXID) after sending.',
      authorizationDetails: 'RisePay USDT TRC20 Vault',
      file: null,
      previewUrl: '',
      autoPublish: false,
      archiveOld: false,
    });
  };

  // Add New Scanner (USDT TRC20 — Exactly 2 fields: Wallet Address + QR Image; saved as DRAFT)
  const handleAddScanner = async (e) => {
    e.preventDefault();
    const cleanAddr = (formData.merchantIdentifier || '').trim();
    if (!cleanAddr) {
      alert('Wallet Address (TRC20) is required.');
      return;
    }

    const tronRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    if (!tronRegex.test(cleanAddr)) {
      alert('Invalid TRON (TRC20) wallet address. Must start with "T" and contain exactly 34 base58 characters.');
      return;
    }

    if (!formData.file) {
      alert('Please upload a USDT TRC20 QR Scanner image.');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      data.append('walletAddress', cleanAddr);
      data.append('merchantIdentifier', cleanAddr);
      data.append('scannerName', `USDT TRC20 (${cleanAddr.slice(0, 6)}...${cleanAddr.slice(-4)})`);
      data.append('merchantName', 'RisePay USDT TRC20 Vault');
      data.append('paymentProvider', 'USDT TRC20');
      data.append('mode', 'LIVE');
      data.append('paymentPurpose', 'Trader Crypto Deposit / PayIn');
      data.append('instructions', 'Transfer exact USDT to this official TRON (TRC20) wallet address. Verify transaction hash (TXID) after sending.');
      data.append('authorizationDetails', 'RisePay Official TRC20 Receiving Vault');
      data.append('autoPublish', 'false'); // Saved as DRAFT by default
      if (formData.file) {
        data.append('asset', formData.file);
      }

      const res = await scannerService.createConfig(data);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'USDT TRC20 Scanner saved successfully as DRAFT.' });
        setAddModalOpen(false);
        resetForm();
        fetchScanners();
      }
    } catch (err) {
      alert(`Error creating scanner: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Option A — Replace QR Now Workflow
  const handleReplaceScanner = async (e) => {
    e.preventDefault();
    if (!replaceModal.oldScanner) return;
    if (!formData.scannerName.trim() || !formData.merchantName.trim()) {
      alert('Scanner Name and Merchant Name are required.');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      data.append('scannerName', formData.scannerName.trim());
      data.append('merchantName', formData.merchantName.trim());
      data.append('merchantIdentifier', formData.merchantIdentifier.trim());
      data.append('paymentProvider', formData.paymentProvider.trim());
      data.append('mode', formData.mode);
      data.append('paymentPurpose', formData.paymentPurpose.trim());
      data.append('instructions', formData.instructions.trim());
      data.append('authorizationDetails', formData.authorizationDetails.trim());
      data.append('archiveOld', formData.archiveOld);
      if (formData.file) {
        data.append('asset', formData.file);
      }

      const res = await scannerService.replace(replaceModal.oldScanner._id, data);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setReplaceModal({ open: false, oldScanner: null });
        resetForm();
        fetchScanners();
      }
    } catch (err) {
      alert(`Replacement failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Scanner
  const handleEditScanner = async (e) => {
    e.preventDefault();
    if (!editModal.scanner) return;

    try {
      setSubmitting(true);
      const data = new FormData();
      data.append('scannerName', formData.scannerName.trim());
      data.append('merchantName', formData.merchantName.trim());
      data.append('merchantIdentifier', formData.merchantIdentifier.trim());
      data.append('paymentProvider', formData.paymentProvider.trim());
      data.append('mode', formData.mode);
      data.append('paymentPurpose', formData.paymentPurpose.trim());
      data.append('instructions', formData.instructions.trim());
      data.append('authorizationDetails', formData.authorizationDetails.trim());
      if (formData.file) {
        data.append('asset', formData.file);
      }

      const res = await scannerService.updateConfig(editModal.scanner._id, data);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Scanner updated successfully.' });
        setEditModal({ open: false, scanner: null });
        resetForm();
        fetchScanners();
      }
    } catch (err) {
      alert(`Edit failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Publish
  const handlePublish = async (id) => {
    try {
      const res = await scannerService.publish(id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        fetchScanners();
      }
    } catch (err) {
      alert(`Publish error: ${err.message}`);
    }
  };

  // Unpublish
  const handleUnpublish = async (id) => {
    try {
      const res = await scannerService.unpublish(id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        fetchScanners();
      }
    } catch (err) {
      alert(`Unpublish error: ${err.message}`);
    }
  };

  // Activate (Atomic)
  const handleActivate = async (id) => {
    try {
      const res = await scannerService.activate(id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        fetchScanners();
      }
    } catch (err) {
      alert(`Activation failed: ${err.message}`);
    }
  };

  // Deactivate
  const handleDeactivate = async (id) => {
    try {
      const res = await scannerService.deactivate(id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        fetchScanners();
      }
    } catch (err) {
      alert(`Deactivation failed: ${err.message}`);
    }
  };

  // Option B — Delete / Archive Scanner
  const handleDeleteOrArchive = async () => {
    if (!deleteModal.scanner) return;
    try {
      setDeleteModal((prev) => ({ ...prev, loading: true }));
      const res = await scannerService.deleteOrArchive(deleteModal.scanner._id, true);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setDeleteModal({ open: false, scanner: null, loading: false });
        fetchScanners();
      }
    } catch (err) {
      alert(`Action failed: ${err.message}`);
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Restore Archived Scanner
  const handleRestore = async (id) => {
    try {
      const res = await scannerService.restore(id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        fetchScanners();
      }
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    }
  };

  // Filtered scanners
  const filteredScanners = scanners.filter((s) => {
    if (tabFilter === 'ACTIVE') return s.isActive;
    if (tabFilter === 'DRAFT') return s.status === 'DRAFT';
    if (tabFilter === 'ARCHIVED') return s.status === 'ARCHIVED';
    return true; // 'ALL'
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">USDT TRC20 QR Scanner Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Manage official USDT TRC20 receiving scanners, publish active deposit QRs, and audit wallet destinations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchScanners}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Scanner</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback.message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback({ type: '', message: '' })} className="text-xs font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1F293D] pb-3 text-xs">
        {[
          { key: 'ALL', label: `All Scanners (${scanners.length})` },
          { key: 'ACTIVE', label: `Active (${scanners.filter((s) => s.isActive).length})` },
          { key: 'DRAFT', label: `Drafts (${scanners.filter((s) => s.status === 'DRAFT').length})` },
          { key: 'ARCHIVED', label: `Archived (${scanners.filter((s) => s.status === 'ARCHIVED').length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTabFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              tabFilter === tab.key
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scanners Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-4">Scanner ID</th>
                <th className="p-4">Name / Provider</th>
                <th className="p-4">Merchant Name</th>
                <th className="p-4">QR Preview</th>
                <th className="p-4">Mode</th>
                <th className="p-4">Status</th>
                <th className="p-4">Active State</th>
                <th className="p-4">Payments Bound</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-gray-400">Loading scanners...</td>
                </tr>
              ) : filteredScanners.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-gray-500">
                    No scanners found in this category. Click "+ Add New Scanner" above to upload one.
                  </td>
                </tr>
              ) : (
                filteredScanners.map((sc) => (
                  <tr
                    key={sc._id}
                    className={`hover:bg-[#151D2F] transition-colors ${
                      sc.isActive ? 'bg-blue-600/5' : sc.status === 'ARCHIVED' ? 'opacity-60 bg-gray-900/40' : ''
                    }`}
                  >
                    <td className="p-4 font-mono font-bold text-white">
                      {sc.scannerId}
                      <span className="text-[10px] text-gray-500 block font-normal">v{sc.version}</span>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-white">{sc.scannerName}</p>
                      <p className="text-[10px] text-gray-400">{sc.paymentProvider}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 font-medium text-white">
                        <Store className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{sc.merchantName}</span>
                      </div>
                      {sc.merchantIdentifier && (
                        <span className="text-[10px] text-gray-500 block font-mono">{sc.merchantIdentifier}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {sc.qrImageUrl || sc.assetUrl ? (
                        <img
                          src={sc.qrImageUrl || sc.assetUrl}
                          alt={sc.scannerName}
                          className="w-10 h-10 object-contain rounded bg-white p-0.5 border border-gray-300"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[#0B0F19] border border-[#1F293D] flex items-center justify-center text-gray-600">
                          <QrCode className="w-5 h-5" />
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sc.mode === 'DEMO_ONLY'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {sc.mode === 'DEMO_ONLY' ? 'DEMO' : 'LIVE'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          sc.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : sc.status === 'PUBLISHED'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : sc.status === 'DRAFT'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : sc.status === 'ARCHIVED'
                            ? 'bg-zinc-600/30 text-zinc-400 border border-zinc-600/40'
                            : 'bg-gray-700/30 text-gray-400'
                        }`}
                      >
                        {sc.status}
                      </span>
                    </td>
                    <td className="p-4">
                      {sc.isActive ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          ACTIVE (In-Use)
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">Inactive</span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-[11px]">
                      <span className="text-amber-400 font-bold">{sc.pendingPaymentsCount || 0}</span> pending /{' '}
                      <span className="text-gray-400">{sc.totalPaymentsCount || 0} total</span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Button */}
                        <button
                          onClick={() => setViewModal({ open: true, scanner: sc })}
                          title="View Scanner Details"
                          className="p-1.5 rounded-lg bg-[#0E1524] hover:bg-[#151D2F] border border-[#1F293D] text-gray-300 hover:text-white"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        {sc.status !== 'ARCHIVED' && (
                          <button
                            onClick={() => {
                              setFormData({
                                scannerName: sc.scannerName,
                                merchantName: sc.merchantName,
                                merchantIdentifier: sc.merchantIdentifier || '',
                                paymentProvider: sc.paymentProvider,
                                mode: sc.mode,
                                paymentPurpose: sc.paymentPurpose || 'Trader Deposit / PayIn',
                                instructions: sc.instructions,
                                authorizationDetails: sc.authorizationDetails || '',
                                file: null,
                                previewUrl: sc.qrImageUrl || sc.assetUrl,
                                autoPublish: false,
                                archiveOld: false,
                              });
                              setEditModal({ open: true, scanner: sc });
                            }}
                            title="Edit Scanner"
                            className="p-1.5 rounded-lg bg-[#0E1524] hover:bg-[#151D2F] border border-[#1F293D] text-blue-400"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Option A: Replace QR Button */}
                        {sc.status !== 'ARCHIVED' && (
                          <button
                            onClick={() => {
                              resetForm();
                              setReplaceModal({ open: true, oldScanner: sc });
                            }}
                            title="Replace with QR-2 (Option A: Replace Now)"
                            className="px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-400 font-semibold text-[10px] flex items-center gap-1"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Replace</span>
                          </button>
                        )}

                        {/* Publish / Unpublish */}
                        {sc.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePublish(sc._id)}
                            className="px-2 py-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 text-[10px] font-semibold"
                          >
                            Publish
                          </button>
                        )}

                        {/* Activate / Deactivate */}
                        {sc.status !== 'ARCHIVED' && (
                          <>
                            {!sc.isActive ? (
                              <button
                                onClick={() => handleActivate(sc._id)}
                                title="Set as Active receiving QR"
                                className="px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 text-[10px] font-bold"
                              >
                                Activate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeactivate(sc._id)}
                                title="Deactivate"
                                className="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30 text-[10px] font-semibold"
                              >
                                Deactivate
                              </button>
                            )}
                          </>
                        )}

                        {/* Option B: Delete / Archive */}
                        {sc.status !== 'ARCHIVED' ? (
                          <button
                            onClick={() => setDeleteModal({ open: true, scanner: sc, loading: false })}
                            title="Delete or Archive (Option B: Delete First)"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestore(sc._id)}
                            title="Restore Archived Scanner"
                            className="px-2 py-1 rounded-lg bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 border border-teal-500/30 text-[10px] font-semibold flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
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
      </div>

      {/* MODAL 1: ADD NEW SCANNER (USDT TRC20 — STRICTLY 2 FIELDS) */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Upload USDT TRC20 QR Scanner">
        <form onSubmit={handleAddScanner} className="space-y-4">
          <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl text-xs space-y-1">
            <p className="text-blue-300 font-bold">USDT TRC20 Receiving Scanner Configuration</p>
            <p className="text-gray-400 text-[11px]">
              Enter the TRON TRC20 receiving wallet address and upload the wallet QR code image. The scanner is saved as DRAFT and can be activated to publish live to all traders.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Wallet Address (TRC20) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.merchantIdentifier}
              onChange={(e) => setFormData({ ...formData, merchantIdentifier: e.target.value })}
              placeholder="e.g. TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P"
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">Must start with &quot;T&quot; and contain exactly 34 alphanumeric characters.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Upload QR Scanner (USDT TRC20) <span className="text-rose-400">*</span>
            </label>
            <input
              type="file"
              required
              accept="image/png, image/jpeg, image/jpg, image/webp"
              onChange={handleFileSelect}
              className="w-full text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/20 file:text-blue-400 hover:file:bg-blue-600/30 cursor-pointer"
            />
            <p className="text-[10px] text-gray-500 mt-1">Accepts PNG, JPG, JPEG, and WebP images up to 5 MB.</p>
          </div>

          {formData.previewUrl && (
            <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl text-center">
              <p className="text-[10px] text-gray-400 mb-2 font-semibold">QR Code Preview:</p>
              <img src={formData.previewUrl} alt="Preview" className="w-36 h-36 object-contain mx-auto rounded-lg bg-white p-2 border border-gray-700 shadow-md" />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Scanner'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: OPTION A — REPLACE QR WORKFLOW */}
      <Modal
        isOpen={replaceModal.open}
        onClose={() => setReplaceModal({ open: false, oldScanner: null })}
        title="Option A — Replace Published QR Scanner"
      >
        <form onSubmit={handleReplaceScanner} className="space-y-4">
          <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl text-xs space-y-1">
            <p className="text-blue-300 font-bold">Currently Replacing:</p>
            <p className="text-white font-semibold">
              {replaceModal.oldScanner?.scannerId} — {replaceModal.oldScanner?.scannerName} (Merchant: {replaceModal.oldScanner?.merchantName})
            </p>
            <p className="text-[11px] text-gray-400">
              When you submit, QR-2 will be saved, published, and activated immediately. QR-1 will be deactivated for all new payment requests.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">New Scanner Name (e.g. PhonePe QR-2) *</label>
              <input
                type="text"
                required
                value={formData.scannerName}
                onChange={(e) => setFormData({ ...formData, scannerName: e.target.value })}
                placeholder="PhonePe QR-2"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">New Merchant Name (Merchant B) *</label>
              <input
                type="text"
                required
                value={formData.merchantName}
                onChange={(e) => setFormData({ ...formData, merchantName: e.target.value })}
                placeholder="e.g. Merchant B Global Ltd."
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Upload QR-2 Image *</label>
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileSelect}
              className="w-full text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/20 file:text-blue-400"
            />
          </div>

          {formData.previewUrl && (
            <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl text-center">
              <img src={formData.previewUrl} alt="Preview" className="w-32 h-32 object-contain mx-auto rounded" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="archiveOld"
              checked={formData.archiveOld}
              onChange={(e) => setFormData({ ...formData, archiveOld: e.target.checked })}
              className="rounded border-[#1F293D]"
            />
            <label htmlFor="archiveOld" className="text-xs text-gray-300 cursor-pointer">
              Also archive QR-1 safely (Keeps historical payment records intact)
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setReplaceModal({ open: false, oldScanner: null })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>{submitting ? 'Replacing...' : 'Replace & Activate QR-2 Now'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: OPTION B — DELETE / ARCHIVE CONFIRMATION POPUP */}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, scanner: null, loading: false })}
        title="Remove / Archive This Scanner?"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-300">
            This scanner will be removed from the active scanner list. Existing payment and verification history will be
            strictly preserved.
          </p>

          <div className="p-3 bg-[#0B0F19] border border-[#1F293D] rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Scanner ID:</span>
              <span className="font-mono font-bold text-white">{deleteModal.scanner?.scannerId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Scanner Name:</span>
              <span className="font-semibold text-white">{deleteModal.scanner?.scannerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Merchant Name:</span>
              <span className="font-semibold text-blue-400">{deleteModal.scanner?.merchantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Current Status:</span>
              <span className="font-bold text-white">{deleteModal.scanner?.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Pending Payments Count:</span>
              <span className="font-bold text-amber-400">{deleteModal.scanner?.pendingPaymentsCount || 0}</span>
            </div>
          </div>

          {deleteModal.scanner?.isActive && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Warning:</strong> This scanner is currently ACTIVE. Deactivating will cause clients to see
                "Payments Unavailable" until another scanner is activated.
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setDeleteModal({ open: false, scanner: null, loading: false })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteOrArchive}
              disabled={deleteModal.loading}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{deleteModal.loading ? 'Archiving...' : 'Deactivate & Archive Safely'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: VIEW SCANNER DETAILS */}
      <Modal
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, scanner: null })}
        title={`Scanner Details: ${viewModal.scanner?.scannerId}`}
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-center p-4 bg-white rounded-2xl w-48 h-48 mx-auto shadow-md">
            {viewModal.scanner?.qrImageUrl || viewModal.scanner?.assetUrl ? (
              <img
                src={viewModal.scanner.qrImageUrl || viewModal.scanner.assetUrl}
                alt="QR"
                className="w-full h-full object-contain"
              />
            ) : (
              <QrCode className="w-16 h-16 text-gray-400" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 bg-[#0B0F19] p-3 rounded-xl border border-[#1F293D]">
            <div>
              <p className="text-[10px] text-gray-400">Scanner Name:</p>
              <p className="font-bold text-white text-xs">{viewModal.scanner?.scannerName}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Merchant Name:</p>
              <p className="font-bold text-blue-400 text-xs">{viewModal.scanner?.merchantName}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Payment Provider:</p>
              <p className="font-semibold text-gray-200 text-xs">{viewModal.scanner?.paymentProvider}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Mode:</p>
              <p className="font-bold text-emerald-400 text-xs">{viewModal.scanner?.mode}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Current Status:</p>
              <p className="font-bold text-white text-xs">{viewModal.scanner?.status}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Version:</p>
              <p className="font-bold text-gray-300 text-xs">v{viewModal.scanner?.version}</p>
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-[11px] font-semibold mb-1">Payment Instructions:</p>
            <p className="p-2.5 rounded-xl bg-[#0B0F19] border border-[#1F293D] text-gray-300 text-[11px]">
              {viewModal.scanner?.instructions}
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setViewModal({ open: false, scanner: null })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: EDIT SCANNER */}
      <Modal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, scanner: null })}
        title={`Edit Scanner: ${editModal.scanner?.scannerId}`}
      >
        <form onSubmit={handleEditScanner} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Scanner Profile Name</label>
            <input
              type="text"
              required
              value={formData.scannerName}
              onChange={(e) => setFormData({ ...formData, scannerName: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Merchant Display Name</label>
            <input
              type="text"
              required
              value={formData.merchantName}
              onChange={(e) => setFormData({ ...formData, merchantName: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Replace QR Image (Optional)</label>
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileSelect}
              className="w-full text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600/20 file:text-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Payment Instructions</label>
            <textarea
              rows={2}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl p-2.5 text-xs text-white"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setEditModal({ open: false, scanner: null })}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
            >
              {submitting ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
