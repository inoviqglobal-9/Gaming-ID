import React, { useState } from 'react';
import { UserCheck, Key, Shield, LogOut, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';

export const ProfilePage = () => {
  const { user, logout, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    try {
      setLoading(true);
      const res = await authService.changePassword(currentPassword, newPassword);
      if (res.success) {
        setMessage('Your password was updated successfully. Other active sessions have been revoked.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        if (refreshUser) refreshUser();
      }
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Profile & Security</h1>
        <p className="text-xs text-gray-400 mt-1">
          Manage your account credentials and examine security parameters.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Details */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#1F293D]">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Account Details</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Client ID / Username</span>
              <span className="text-white font-mono font-bold text-sm">{user?.username}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Account Role</span>
              <span className="text-blue-400 font-bold uppercase">{user?.role}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Status</span>
              <span className="text-emerald-400 font-bold uppercase">{user?.status}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1F293D]/50">
              <span className="text-gray-400">Created Date</span>
              <span className="text-gray-300">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-400">Last Login</span>
              <span className="text-gray-300">
                {user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'First Session'}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-xs font-semibold transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out of Account</span>
            </button>
          </div>
        </div>

        {/* Change Password Form */}
        <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#1F293D]">
            <Key className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Change Password</h3>
          </div>

          {message && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Current Password *</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">New Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Confirm New Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              {loading ? 'Updating Password...' : 'Update Password Securely'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
