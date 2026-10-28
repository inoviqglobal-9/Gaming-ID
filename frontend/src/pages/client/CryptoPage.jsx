import React, { useState, useEffect, useCallback } from 'react';
import { Coins, Copy, Check, AlertTriangle, ShieldCheck, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cryptoService } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const CryptoPage = () => {
  const [cryptoConfig, setCryptoConfig] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState('');

  // Request Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [requestType, setRequestType] = useState('DEPOSIT');
  const [network, setNetwork] = useState('TRC20');
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [txHash, setTxHash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCryptoData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfgRes, reqRes] = await Promise.all([
        cryptoService.getConfig(),
        cryptoService.getMyRequests(),
      ]);
      if (cfgRes.success) setCryptoConfig(cfgRes);
      if (reqRes.success) setRequests(reqRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCryptoData();
  }, [fetchCryptoData]);

  const copyToClipboard = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopiedAddress(txt);
    setTimeout(() => setCopiedAddress(''), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      alert('Please enter a valid crypto amount.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await cryptoService.createRequest({
        type: requestType,
        assetSymbol: 'USDT',
        network,
        amount: numAmount,
        walletAddress: walletAddress.trim(),
        txHash: txHash.trim(),
      });
      if (res.success) {
        setModalOpen(false);
        setAmount('');
        setWalletAddress('');
        setTxHash('');
        fetchCryptoData();
        alert(`Crypto ${requestType.toLowerCase()} request submitted for manual blockchain review.`);
      }
    } catch (err) {
      alert(`Request failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Cryptocurrency Transfer Hub</h1>
          <p className="text-xs text-gray-400 mt-1">
            Official deposit addresses and manual on-chain withdrawal tracking.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <button
            onClick={() => {
              setRequestType('DEPOSIT');
              setModalOpen(true);
            }}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all min-h-[40px]"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Notify Crypto Deposit</span>
          </button>
          <button
            onClick={() => {
              setRequestType('WITHDRAWAL');
              setModalOpen(true);
            }}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#111827] hover:bg-[#1A2338] border border-[#1F293D] text-white font-semibold text-xs transition-all min-h-[40px]"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Request Crypto Payout</span>
          </button>
        </div>
      </div>

      {/* Network Compatibility Warning */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-xs text-amber-300">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <strong className="block text-amber-200">Network Compatibility Notice:</strong>
          <span>
            Always ensure the selected network matches your wallet. Sending USDT to a mismatched network will lead to irreversible loss. All blockchain transactions undergo independent administrative verification before credit.
          </span>
        </div>
      </div>

      {/* Official Configured Networks Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cryptoConfig?.networks?.map((net) => (
          <div
            key={net.network}
            className="bg-[#111827] border border-[#1F293D] rounded-xl p-5 space-y-3 relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-white text-sm">
                  {net.asset} <span className="text-gray-400 text-xs font-normal">({net.network})</span>
                </span>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  net.configured
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}
              >
                {net.configured ? 'Configured' : 'Manual Review'}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Official Deposit Address</span>
              <div className="flex items-center justify-between bg-[#0B0F19] border border-[#1F293D] p-2 rounded-lg font-mono text-[11px] text-gray-300">
                <span className="truncate pr-2">{net.depositAddress}</span>
                {net.configured && (
                  <button
                    onClick={() => copyToClipboard(net.depositAddress)}
                    className="p-1 rounded text-gray-400 hover:text-white"
                  >
                    {copiedAddress === net.depositAddress ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">{net.warning}</p>
          </div>
        ))}
      </div>

      {/* Crypto Requests Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Crypto Transactions & Requests</h3>
          <span className="text-xs text-gray-400">{requests.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-4">Request ID</th>
                <th className="p-4">Type</th>
                <th className="p-4">Asset / Network</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Wallet Address</th>
                <th className="p-4">Tx Hash</th>
                <th className="p-4">Status</th>
                <th className="p-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-gray-400">Loading crypto records...</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-gray-500">
                    No crypto transfers recorded yet.
                  </td>
                </tr>
              ) : (
                requests.map((item) => (
                  <tr key={item._id} className="hover:bg-[#151D2F]">
                    <td className="p-4 font-mono font-semibold text-white">{item.requestId}</td>
                    <td className="p-4">
                      <span
                        className={`font-semibold ${
                          item.type === 'DEPOSIT' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="p-4 text-gray-300 font-mono">
                      {item.assetSymbol} ({item.network})
                    </td>
                    <td className="p-4 font-bold text-white font-mono">
                      {item.amount.toFixed(4)}
                    </td>
                    <td className="p-4 font-mono text-gray-400 text-[11px] max-w-[140px] truncate">
                      {item.walletAddress}
                    </td>
                    <td className="p-4 font-mono text-[11px]">
                      {item.txHash ? (
                        <span className="text-blue-400 truncate max-w-[120px] block" title={item.txHash}>
                          {item.txHash}
                        </span>
                      ) : (
                        <span className="text-gray-500">Manual review</span>
                      )}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-4 text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Notify or Request Crypto */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={requestType === 'DEPOSIT' ? 'Notify Crypto Deposit' : 'Request Crypto Payout'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Network *</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="TRC20">USDT (TRC20 - Tron Network)</option>
                <option value="ERC20">USDT (ERC20 - Ethereum)</option>
                <option value="BEP20">USDT (BEP20 - Binance Smart Chain)</option>
                <option value="BITCOIN">BTC (Bitcoin Native)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Amount *</label>
              <input
                type="number"
                required
                min={0.0001}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              {requestType === 'DEPOSIT' ? 'Your Originating Wallet Address *' : 'Your Destination Wallet Address *'}
            </label>
            <input
              type="text"
              required
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="e.g. TXYZ1234..."
              className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {requestType === 'DEPOSIT' && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Blockchain Transaction Hash (TxID)
              </label>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="e.g. 7f8a9b2c3d4e5f6..."
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          )}

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#1F293D]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
            >
              {submitting ? 'Submitting...' : 'Submit Crypto Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
