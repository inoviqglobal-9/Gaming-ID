
import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both your Client ID/Username and password.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please verify your login details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#0B0F19] flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      {/* Background ambient glowing lights */}
      <div className="absolute -top-40 -left-40 w-72 sm:w-96 h-72 sm:h-96 bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-72 sm:w-96 h-72 sm:h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-[#111827] border border-[#1F293D] rounded-2xl shadow-2xl p-5 sm:p-8 relative z-10 backdrop-blur-xl">

        {/* Header with NEW R.jpg.jpeg Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/25 mb-3 sm:mb-4">
            <div className="w-full h-full bg-[#111827] rounded-[14px] flex items-center justify-center">

              {/* NEW LOGIN LOGO */}
              <img
                src="/R.jpg.jpeg"
                alt="INRPay Secure Logo"
                className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
              />

            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            RisePay
          </h1>

          <p className="text-[11px] sm:text-xs text-gray-400 mt-1 font-medium">
            Authorized Trader & Administrator Private Gateway
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start gap-3 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username / Trader ID input */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Username / Trader ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your assigned Trader ID / Username"
                autoComplete="username"
                required
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Password with Show/Hide toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your confidential password"
                autoComplete="current-password"
                required
                className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Authenticating Enclave...</span>
              </>
            ) : (
              <span>Sign In Securely</span>
            )}
          </button>
        </form>

        {/* Security notice footer */}
        <div className="mt-8 pt-5 border-t border-[#1F293D]/80 text-center">
          <p className="text-[11px] text-gray-500">
            Strictly Private Access. Public account registration is disabled. Unauthorized login attempts are logged and reported.
          </p>
        </div>
      </div>
    </div>
  );
};
