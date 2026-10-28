import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService, tokenStorage } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [balances, setBalances] = useState({ INR: 0.00, USDT: 0.00 });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const inFlightCheckAuth = useRef(false);

  // Initial authentication check on cold start
  const checkAuth = useCallback(async (isInitial = false) => {
    // Prevent duplicate concurrent requests (e.g. from React StrictMode)
    if (inFlightCheckAuth.current) return;
    inFlightCheckAuth.current = true;

    try {
      if (isInitial) {
        setLoading(true);
      }
      setAuthError(null);

      // If no stored session token or session cookie hint exists, resolve unauthenticated state gracefully
      if (!tokenStorage.hasToken()) {
        setUser(null);
        return null;
      }

      const res = await authService.getMe();
      if (res && res.success && res.user) {
        setUser(res.user);
        if (res.balances) {
          setBalances(res.balances);
        }
        return res.user;
      } else {
        setUser(null);
        return null;
      }
    } catch (err) {
      setUser(null);
      if (err.status !== 401) {
        setAuthError(err.message);
      }
      return null;
    } finally {
      inFlightCheckAuth.current = false;
      if (isInitial) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    checkAuth(true);
  }, [checkAuth]);

  // Login handler
  const login = async (username, password) => {
    setAuthError(null);
    const res = await authService.login(username, password);
    if (res && res.success && res.user) {
      setUser(res.user);
      if (res.balances) {
        setBalances(res.balances);
      }
      return res;
    }
    throw new Error(res?.message || 'Login failed');
  };

  // Logout handler
  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.warn('[AuthContext] Logout request error:', err.message);
    } finally {
      tokenStorage.clear();
      setUser(null);
      setBalances({ INR: 0.00, USDT: 0.00 });
    }
  };

  // Background refresh of user profile and balances without triggering enclave loading spinner
  const refreshUser = useCallback(async () => {
    try {
      const res = await authService.getMe();
      if (res && res.success && res.user) {
        setUser(res.user);
        if (res.balances) {
          setBalances(res.balances);
        }
        return res;
      }
    } catch (err) {
      // Quiet fail on background refresh
    }
  }, []);

  const updateUser = useCallback((updatedUserData) => {
    setUser((prev) => (prev ? { ...prev, ...updatedUserData } : updatedUserData));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        balances,
        loading,
        authError,
        login,
        logout,
        refreshUser,
        updateUser,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === 'ADMIN',
        isClient: user?.role === 'CLIENT' || user?.role === 'TRADER',
        isTrader: user?.role === 'CLIENT' || user?.role === 'TRADER',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
