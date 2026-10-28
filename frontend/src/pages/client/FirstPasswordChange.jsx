import React, { useState } from 'react';
import { Shield, Key, Lock, Eye, EyeOff, AlertCircle, CheckCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';

export const FirstPasswordChange = ({ onComplete }) => {
  const { user, logout, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Please enter your current temporary password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from your temporary password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await authService.changePassword(currentPassword, newPassword);
      if (res.success) {
        setSuccess('Password updated successfully! Unlocking your trading terminal...');
        // Refresh authenticated profile so mustChangePassword becomes false in AuthContext
        if (refreshUser) {
          await refreshUser();
        }
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0F19] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-600/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-lg bg-[#111827] border border-[#1F293D] rounded-2xl shadow-2xl p-6 sm:p-8 relative z-10 backdrop-blur-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 shadow-lg shadow-amber-500/25 mb-4">
            <div className="w-full h-full bg-[#111827] rounded-[14px] flex items-center justify-center">
              <Key className="w-7 h-7 text-amber-400" />
            </div>
          </div>
          <span className="inline-block text-[10px] font-bold tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase mb-2">
            Security Compliance Protocol
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Mandatory Password Setup
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Welcome to FICHASPOT, <span className="text-blue-400 font-mono font-bold">{user?.username}</span>. Your account was created with a temporary password and requires a private password change before accessing trading features.
          </p>
        </div>

        {/* Security Notification Banner */}
        <div className="mb-5 p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3 text-xs text-blue-300">
          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
          <span>
            Please set a secure, confidential password. Once updated, your trading dashboard, PayIn scanner, and wallet features will be immediately activated.
          </span>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start gap-3 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success notification */}
        {success && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-start gap-3 text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Temporary Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Current Temporary Password *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter password assigned by admin"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-10 pr-11 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              New Confidential Password *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-10 pr-11 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Must be at least 8 characters long.</p>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Confirm New Password *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-10 pr-11 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Encrypting & Updating...</span>
              </>
            ) : (
              <span>Update Password & Enter Dashboard</span>
            )}
          </button>
        </form>

        {/* Sign out link */}
        <div className="mt-6 pt-4 border-t border-[#1F293D] flex items-center justify-between text-xs text-gray-400">
          <span>Need to sign out?</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
