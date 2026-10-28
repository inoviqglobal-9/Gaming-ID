import React from 'react';
import { Shield, Key, Database, RefreshCw, Cpu, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AdminSettings = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">System Settings & Architecture</h1>
        <p className="text-xs text-gray-400 mt-1">
          Cryptographic security controls, session settings, and operational configurations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Security Controls */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#1F293D]">
            <Lock className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Security & Enclave Status</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Authentication Protocol</span>
              <span className="text-emerald-400 font-mono font-bold">HTTP-Only Signed Cookies (Lax)</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Password Hashing Algorithm</span>
              <span className="text-emerald-400 font-mono font-bold">bcrypt (12 rounds)</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Public User Self-Registration</span>
              <span className="text-rose-400 font-mono font-bold">DISABLED (Enforced)</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Session Revocation on Suspension</span>
              <span className="text-emerald-400 font-mono font-bold">INSTANT (Active Invalidation)</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-400">Session Lifetime</span>
              <span className="text-white font-mono">24 Hours (Rolling Expiration)</span>
            </div>
          </div>
        </div>

        {/* Financial Rules */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#1F293D]">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Financial Ledger Configuration</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Ledger Currency Separation</span>
              <span className="text-emerald-400 font-bold">STRICT (INR & USDT Isolated)</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Unverified Deposit Credit Rule</span>
              <span className="text-rose-400 font-bold">NEVER (Verification Mandatory)</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">PayIn Expiry Time</span>
              <span className="text-white font-mono">60 Minutes</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Maximum User Bulk Batch</span>
              <span className="text-white font-mono">50 Accounts Per Batch</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-400">Duplicate Reference Protection</span>
              <span className="text-emerald-400 font-bold">ACTIVE (Unique Index & Lock)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
