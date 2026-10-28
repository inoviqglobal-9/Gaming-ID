import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, LogOut, Wallet, User as UserIcon, Bell, Check, Clock, AlertCircle, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { notificationService } from '../services/api';

export const Navbar = ({ mobileMenuOpen, setMobileMenuOpen }) => {
  const { user, balances, logout, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [istTime, setIstTime] = useState('');
  const dropdownRef = useRef(null);

  // Live IST Clock ticking every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await notificationService.getMine({ limit: 10 });
      if (res.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err) {
      // Quiet fail on polling
    }
  }, [user]);

  // Initial fetch & polling fallback every 12 seconds (only for authenticated users)
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 12000);
    return () => clearInterval(interval);
  }, [fetchNotifications, user]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await notificationService.markRead(id);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await notificationService.markAllRead();
      if (res.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 bg-[#0E1524]/90 backdrop-blur-md border-b border-[#1F293D] flex items-center justify-between px-3.5 sm:px-6">
      {/* Brand logo & mobile hamburger toggle */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Mobile Hamburger Drawer Button */}
        {setMobileMenuOpen && (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            title={mobileMenuOpen ? 'Close Menu' : 'Open Navigation Menu'}
            className="lg:hidden p-2 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#151D2F] transition-colors focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-blue-400" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        
        <img
          src="/R.jpg.jpeg"
          alt="Navbar logo"
          className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0"
        />

        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-extrabold text-white tracking-wide text-sm sm:text-base">
              {isAdmin ? 'RisePay' : 'RisePay'}
            </span>
            <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {isAdmin ? 'ADMIN' : 'TRADER PANEL'}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 font-medium hidden sm:block">
            {isAdmin ? 'Enterprise Encrypted Private Network' : 'Scanner-Trader Secure Gateway'}
          </p>
        </div>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-2 sm:gap-3.5">
        {/* Live Indian Standard Time (IST) Clock */}
        <div className="flex items-center gap-1.5 bg-[#111827] border border-[#1F293D] px-2.5 py-1.5 rounded-lg text-xs font-mono text-gray-300">
          <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="font-semibold text-white tracking-wide">{istTime || '12:00:00 PM'}</span>
          <span className="text-[9px] uppercase font-bold text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded border border-blue-500/20">
            IST
          </span>
        </div>

        {/* If client/trader, show verified USDT balance (Phase 4) */}
        {!isAdmin && (
          <div
            className="hidden lg:flex items-center gap-2 bg-[#111827] border border-[#1F293D] px-3 py-1.5 rounded-lg text-xs"
            title={`Fixed Platform Rate: ₹105 / USDT | INR Equivalent: ₹${((Number(balances?.USDT) || 0) * 105).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          >
            <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex items-center gap-2 font-mono">
              <span className="text-gray-300">
                USDT: <strong className="text-emerald-400 font-bold">{(Number(balances?.USDT) || 0).toFixed(2)}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Real-time Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setBellOpen(!bellOpen)}
            title="Notifications"
            className="p-2 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white hover:bg-[#151D2F] transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Popover */}
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-96 max-w-sm bg-[#0E1524] border border-[#1F293D] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3.5 border-b border-[#1F293D] flex items-center justify-between bg-[#111827]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-[#1F293D]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs">
                    <Bell className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                    <span>No notifications right now</span>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n._id}
                      className={`p-3 text-xs transition-colors hover:bg-[#151D2F] ${
                        !n.isRead ? 'bg-blue-600/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            {!n.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            )}
                            <h5 className="font-semibold text-white text-[12px] leading-tight">
                              {n.title}
                            </h5>
                          </div>
                          <p className="text-gray-300 text-[11px] leading-relaxed">{n.message}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {n.paymentId && (
                              <span className="font-mono text-gray-400">{n.paymentId}</span>
                            )}
                          </div>
                        </div>

                        {!n.isRead && (
                          <button
                            onClick={(e) => handleMarkAsRead(n._id, e)}
                            title="Mark as read"
                            className="p-1 rounded text-gray-400 hover:text-emerald-400 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User profile capsule with circular avatar */}
        <div className="flex items-center gap-2.5 bg-[#111827] border border-[#1F293D] px-2.5 py-1.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white font-bold text-xs shadow-sm">
            {user?.username ? user.username.slice(0, 2).toUpperCase() : 'TR'}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-semibold text-white leading-none font-mono">{user?.username}</p>
            <p className="text-[9px] text-gray-400 leading-none mt-1 uppercase font-bold tracking-wider">
              {isAdmin ? 'ADMIN' : 'TRADER'}
            </p>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={logout}
          title="Sign out securely"
          className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
