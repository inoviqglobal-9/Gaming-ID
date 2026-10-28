import React, { useState, useEffect } from 'react';

import {
  LayoutDashboard,
  Users,
  UserPlus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Coins,
  QrCode,
  ShieldCheck,
  Settings,
  X,
  FileText,
  CreditCard,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export const Sidebar = ({
  currentRoute,
  navigate,
  mobileMenuOpen = false,
  setMobileMenuOpen,
}) => {
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // ADMIN NAVIGATION LINKS
  const adminLinks = [
    {
      label: 'Admin Dashboard',
      icon: LayoutDashboard,
      route: '/admin/dashboard',
    },
    {
      label: 'Manage Traders',
      icon: Users,
      route: '/admin/clients',
    },
    {
      label: 'Generate Users',
      icon: UserPlus,
      route: '/admin/generate-users',
    },
    {
      label: 'Applications (PayIn)',
      icon: ArrowDownToLine,
      route: '/admin/applications',
    },
    {
      label: 'Payout Requests',
      icon: ArrowUpFromLine,
      route: '/admin/payouts',
    },
    {
      label: 'Deposit Requests',
      icon: Landmark,
      route: '/admin/deposits',
    },
    {
      label: 'Requisites Desk',
      icon: CreditCard,
      route: '/admin/requisites',
    },
    {
      label: 'Wallet Check Desk',
      icon: Wallet,
      route: '/admin/wallet-check',
    },
    {
      label: 'Crypto Management',
      icon: Coins,
      route: '/admin/crypto',
    },
    {
      label: 'Scanner Config',
      icon: QrCode,
      route: '/admin/scanner',
    },
    {
      label: 'Audit Logs',
      icon: ShieldCheck,
      route: '/admin/audit-logs',
    },
    {
      label: 'System Settings',
      icon: Settings,
      route: '/admin/settings',
    },
  ];

  // TRADER NAVIGATION LINKS
  const traderLinks = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      route: '/dashboard',
    },
    {
      label: 'Payouts',
      icon: ArrowUpFromLine,
      route: '/payouts',
    },
    {
      label: 'Applications',
      icon: FileText,
      route: '/trader/applications',
    },
    {
      label: 'Deposit Requests',
      icon: Landmark,
      route: '/deposit-requests',
    },
    {
      label: 'Requisites',
      icon: CreditCard,
      route: '/requisites',
    },
    {
      label: 'Wallet Check',
      icon: Wallet,
      route: '/wallet-check',
    },
    {
      label: 'Crypto',
      icon: Coins,
      route: '/trader/crypto',
    },
  ];

  const links = isAdmin ? adminLinks : traderLinks;

  // CLOSE MOBILE MENU ON ESCAPE
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === 'Escape' &&
        mobileMenuOpen &&
        setMobileMenuOpen
      ) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen, setMobileMenuOpen]);

  // LOCK BODY SCROLL ON MOBILE
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // HANDLE NAVIGATION
  const handleLinkClick = (route) => {
    navigate(route);

    if (setMobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  };

  // SHARED NAVIGATION CONTENT
  const renderNavContent = (isMobile = false) => {
    const isCollapsed = !isMobile && collapsed;

    return (
      <>
        <div className="space-y-1 overflow-y-auto flex-1 pr-1">

          {/* SIDEBAR BRAND HEADER */}
          <div className="flex items-center justify-between px-2 pb-3 mb-2 border-b border-[#1F293D]">

            <div className="flex items-center gap-2.5">

              {/* UPDATED RISEPAY LOGO */}
              <img
                src="/R.jpg.jpeg"
                alt="RisePay Logo"
                className="w-8 h-8 rounded-lg object-contain shrink-0"
              />

              {!isCollapsed && (
                <div>
                  <span className="font-extrabold text-white tracking-wider text-sm block">
                    RisePay
                  </span>

                  <span className="text-[9px] uppercase font-bold tracking-widest text-blue-400">
                    {isAdmin ? 'ADMIN PANEL' : 'TRADER PANEL'}
                  </span>
                </div>
              )}
            </div>

            {/* DESKTOP COLLAPSE BUTTON */}
            {!isMobile && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                title={
                  collapsed
                    ? 'Expand sidebar'
                    : 'Collapse sidebar'
                }
                className="hidden lg:flex p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#111827] transition-colors"
              >
                {collapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            )}

            {/* MOBILE CLOSE BUTTON */}
            {isMobile && (
              <button
                onClick={() =>
                  setMobileMenuOpen?.(false)
                }
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#111827] transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            )}

          </div>

          {/* NAVIGATION HEADING */}
          {!isCollapsed && (
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {isAdmin
                ? 'Administration'
                : 'Trader Navigation'}
            </p>
          )}

          {/* NAVIGATION LINKS */}
          {links.map((link) => {
            const Icon = link.icon;

            const isActive =
              currentRoute === link.route ||

              (
                link.route === '/dashboard' &&
                currentRoute === '/trader/dashboard'
              ) ||

              (
                link.route === '/payouts' &&
                currentRoute === '/trader/payouts'
              ) ||

              (
                link.route === '/trader/applications' &&
                (
                  currentRoute === '/applications' ||
                  currentRoute === '/payin-requests' ||
                  currentRoute === '/trader/applications'
                )
              ) ||

              (
                link.route === '/applications' &&
                (
                  currentRoute === '/applications' ||
                  currentRoute === '/payin-requests' ||
                  currentRoute === '/trader/applications'
                )
              ) ||

              (
                link.route === '/deposit-requests' &&
                (
                  currentRoute === '/deposit' ||
                  currentRoute === '/deposit-requests' ||
                  currentRoute === '/trader/deposit-requests'
                )
              ) ||

              (
                link.route === '/requisites' &&
                (
                  currentRoute === '/requisites' ||
                  currentRoute === '/trader/requisites'
                )
              ) ||

              (
                link.route === '/wallet-check' &&
                (
                  currentRoute === '/wallet-check' ||
                  currentRoute === '/trader/wallet-check'
                )
              ) ||

              (
                link.route === '/admin/wallet-check' &&
                currentRoute === '/admin/wallet-check'
              ) ||

              (
                link.route === '/admin/clients' &&
                currentRoute === '/admin/traders'
              ) ||

              (
                link.route === '/admin/deposits' &&
                (
                  currentRoute === '/admin/deposits' ||
                  currentRoute === '/admin/deposit-requests'
                )
              ) ||

              (
                link.route === '/admin/requisites' &&
                currentRoute === '/admin/requisites'
              ) ||

              (
                link.route === '/admin/crypto' &&
                currentRoute?.startsWith('/admin/crypto')
              ) ||

              (
                link.route === '/trader/crypto' &&
                (
                  currentRoute === '/trader/crypto' ||
                  currentRoute === '/crypto' ||
                  currentRoute?.startsWith('/trader/crypto')
                )
              ) ||

              (
                link.route === '/admin/applications' &&
                (
                  currentRoute === '/admin/applications' ||
                  currentRoute === '/admin/payins'
                )
              );

            return (
              <button
                key={link.route}
                onClick={() => handleLinkClick(link.route)}
                title={isCollapsed ? link.label : ''}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 text-left min-h-[40px] ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-gray-400 hover:text-white hover:bg-[#111827]'
                } ${
                  isCollapsed
                    ? 'justify-center px-0'
                    : ''
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-400'
                  }`}
                />

                {!isCollapsed && (
                  <span className="truncate">
                    {link.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* SECURITY BADGE */}
        {!isCollapsed && (
          <div className="p-3 bg-[#111827] border border-[#1F293D] rounded-xl text-xs text-gray-400 mt-4 shrink-0">

            <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />

              <span className="text-[11px]">
                Encrypted Session
              </span>
            </div>

            <p className="text-[10px] text-gray-500 leading-snug">
              Protected against unauthorized role elevation.
            </p>

          </div>
        )}
      </>
    );
  };

  return (
    <>

      {/* DESKTOP SIDEBAR */}
      <aside
        className="hidden lg:flex w-64 bg-[#0B0F19] border-r border-[#1F293D] min-h-[calc(100vh-4rem)] p-4 flex-col justify-between shrink-0"
      >
        {renderNavContent(false)}
      </aside>

      {/* MOBILE BACKDROP */}
      <div
        className={`fixed inset-0 bg-black/75 backdrop-blur-sm z-50 transition-opacity duration-300 lg:hidden ${
          mobileMenuOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={() =>
          setMobileMenuOpen?.(false)
        }
        aria-hidden="true"
      />

      {/* MOBILE SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[#0B0F19] border-r border-[#1F293D] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileMenuOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
        aria-label="Mobile Navigation Drawer"
      >
        {renderNavContent(true)}
      </aside>

    </>
  );
};
