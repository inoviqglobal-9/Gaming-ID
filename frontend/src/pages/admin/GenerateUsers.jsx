import React, { useState } from 'react';
import { UserPlus, Copy, Check, ShieldAlert, Sparkles } from 'lucide-react';
import { adminService } from '../../services/api';

export const GenerateUsers = () => {
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState('TRADER');
  const [notes, setNotes] = useState('Batch bulk generation');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [allCopied, setAllCopied] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    try {
      setGenerating(true);
      setError('');
      setResults(null);
      const res = await adminService.bulkGenerateUsers({
        count: parseInt(count, 10),
        prefix,
        notes,
      });
      if (res.success) {
        setResults(res.accounts);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate bulk client accounts.');
    } finally {
      setGenerating(false);
    }
  };

  const copyRow = (acc, idx) => {
    const pwd = acc.permanentPassword || acc.password || acc.temporaryPassword;
    navigator.clipboard.writeText(`Client ID: ${acc.username} | Password: ${pwd}`);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAll = () => {
    if (!results) return;
    const text = results
      .map((acc) => {
        const pwd = acc.permanentPassword || acc.password || acc.temporaryPassword;
        return `Client ID: ${acc.username} | Password: ${pwd}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Bulk User Generation</h1>
        <p className="text-xs text-gray-400 mt-1">
          Generate multiple collision-resistant client accounts with permanent credentials for direct login.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-xs text-rose-400">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generation Form */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#1F293D] text-sm font-semibold text-white">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span>Batch Parameters</span>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Number of Accounts to Generate *
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">Configured maximum: 50 accounts per batch.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Client ID Prefix
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="TRADER"
                maxLength={10}
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">Example: "TRADER" will yield TRADER_849201.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Batch Description / Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. October Trading Desk Batch"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{generating ? 'Generating Accounts in DB...' : 'Generate Accounts'}</span>
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1F293D] rounded-xl p-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#1F293D]">
            <div>
              <h3 className="text-sm font-semibold text-white">Generated Account Credentials</h3>
              <p className="text-[11px] text-gray-400">
                Passwords are shown only once in this view.
              </p>
            </div>
            {results && results.length > 0 && (
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-600/30 transition-colors"
              >
                {allCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{allCopied ? 'All Copied' : 'Copy All'}</span>
              </button>
            )}
          </div>

          {!results ? (
            <div className="p-16 text-center text-gray-500 text-xs">
              Configure parameters on the left and click "Generate Accounts" to create a fresh batch.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-xs text-emerald-300 mb-4">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Permanent credentials configured. Generated accounts can log in directly to the Client Portal without being forced to change their password.
                </span>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-[#1F293D] border border-[#1F293D] rounded-xl">
                {results.map((acc, index) => (
                  <div
                    key={acc.id}
                    className="p-3 flex items-center justify-between hover:bg-[#151D2F] font-mono text-xs transition-colors"
                  >
                    <div>
                      <span className="text-white font-bold">{acc.username}</span>
                      <span className="text-gray-500 mx-2">•</span>
                      <span className="text-emerald-400 font-semibold">{acc.permanentPassword || acc.password || acc.temporaryPassword}</span>
                    </div>

                    <button
                      onClick={() => copyRow(acc, index)}
                      className="p-1.5 rounded-lg bg-[#0B0F19] border border-[#1F293D] text-gray-400 hover:text-white"
                      title="Copy credentials"
                    >
                      {copiedIndex === index ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
