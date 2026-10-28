import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';

// Pages
import { LoginPage } from './pages/LoginPage';
import { FirstPasswordChange } from './pages/client/FirstPasswordChange';
import { ClientDashboard } from './pages/client/ClientDashboard';
import { PayInPage } from './pages/client/PayInPage';
import { ApplicationsPage } from './pages/client/ApplicationsPage';
import { PayoutPage } from './pages/client/PayoutPage';
import { DepositPage } from './pages/client/DepositPage';
import { TraderCryptoPage } from './pages/client/TraderCryptoPage';
import { CryptoPage } from './pages/client/CryptoPage';
import { RequisitesPage } from './pages/client/RequisitesPage';
import { WalletCheckPage } from './pages/client/WalletCheckPage';
import { ProfilePage } from './pages/client/ProfilePage';

import { AdminDashboard } from './pages/admin/AdminDashboard';
import { ManageClients } from './pages/admin/ManageClients';
import { GenerateUsers } from './pages/admin/GenerateUsers';
import { AdminPayIns } from './pages/admin/AdminPayIns';
import { AdminApplications } from './pages/admin/AdminApplications';
import { AdminPayouts } from './pages/admin/AdminPayouts';
import { AdminDeposits } from './pages/admin/AdminDeposits';
import { AdminRequisites } from './pages/admin/AdminRequisites';
import { AdminWalletCheck } from './pages/admin/AdminWalletCheck';
import { AdminCryptoManagement } from './pages/admin/AdminCryptoManagement';
import { ScannerConfigPage } from './pages/admin/ScannerConfigPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { AdminSettings } from './pages/admin/AdminSettings';



export const App = () => {
  const { user, loading, isAuthenticated, isAdmin } = useAuth();
  const [currentRoute, setCurrentRoute] = useState(
    window.location.pathname || '/'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentRoute]);

  // Synchronize browser history and navigation
  const navigate = useCallback((path, { replace = false } = {}) => {
    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
    }
    setCurrentRoute((prev) => (prev !== path ? path : prev));
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redirect based on authentication state
  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        if (currentRoute !== '/login' && currentRoute !== '/trader/login' && currentRoute !== '/admin/login') {
          navigate('/login', { replace: true });
        }
      } else {
        // Authenticated: route to proper default portal if on login or root
        if (
          currentRoute === '/login' ||
          currentRoute === '/trader/login' ||
          currentRoute === '/admin/login' ||
          currentRoute === '/' ||
          currentRoute === '/change-password'
        ) {
          navigate(isAdmin ? '/admin/clients' : '/dashboard', { replace: true });
        } else if (!isAdmin && currentRoute.startsWith('/admin')) {
          // Trader/Client cannot view admin routes!
          navigate('/dashboard', { replace: true });
        } else if (isAdmin && !currentRoute.startsWith('/admin') && currentRoute !== '/profile') {
          // Admin redirected to admin dashboard
          navigate('/admin/dashboard', { replace: true });
        }
      }
    }
  }, [isAuthenticated, isAdmin, loading, currentRoute, navigate]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-400 font-mono tracking-wider uppercase">
            Securing Enclave Session...
          </p>
        </div>
      </div>
    );
  }

  // If not authenticated, render Login Page only
  if (!isAuthenticated) {
    return <LoginPage currentRoute={currentRoute} navigate={navigate} />;
  }

  // Routing renderer
  const renderCurrentPage = () => {
    if (isAdmin) {
      switch (currentRoute) {
        case '/admin/dashboard':
          return <AdminDashboard navigate={navigate} />;
        case '/admin/traders':
        case '/admin/clients':
          return <ManageClients />;
        case '/admin/generate-users':
          return <GenerateUsers />;
        case '/admin/applications':
        case '/admin/payins':
          return <AdminApplications />;
        case '/admin/payouts':
          return <AdminPayouts />;
        case '/admin/deposits':
        case '/admin/deposit-requests':
          return <AdminDeposits />;
        case '/admin/requisites':
          return <AdminRequisites />;
        case '/admin/wallet-check':
          return <AdminWalletCheck />;
        case '/admin/crypto':
          return <AdminCryptoManagement navigate={navigate} />;
        case '/admin/scanner':
          return <ScannerConfigPage />;
        case '/admin/audit-logs':
          return <AuditLogsPage />;
        case '/admin/settings':
          return <AdminSettings />;
        case '/profile':
          return <ProfilePage />;
        default:
          return <ManageClients />;
      }
    } else {
      switch (currentRoute) {
        case '/dashboard':
        case '/trader/dashboard':
          return <ClientDashboard navigate={navigate} />;
        case '/payouts':
        case '/trader/payouts':
          return <PayoutPage />;
        case '/applications':
        case '/trader/applications':
        case '/payin-requests':
          return <ApplicationsPage />;
        case '/deposit-requests':
        case '/trader/deposit-requests':
        case '/deposit':
          return <DepositPage />;
        case '/requisites':
        case '/trader/requisites':
          return <RequisitesPage />;
        case '/wallet-check':
        case '/trader/wallet-check':
          return <WalletCheckPage />;
        case '/crypto':
        case '/trader/crypto':
        case '/trader/crypto/deposit':
        case '/trader/crypto/withdrawal':
          return <TraderCryptoPage navigate={navigate} currentRoute={currentRoute} />;
        case '/profile':
          return <ProfilePage />;
        default:
          return <ClientDashboard navigate={navigate} />;
      }
    }

  };

  return (
    <div className="min-h-screen bg-[#0B0F19] flex flex-col text-[#F8FAFC]">
      {/* Top Navbar */}
      <Navbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <div className="flex flex-1 relative overflow-x-hidden">
        {/* Left Sidebar (Desktop persistent + Mobile slide-over drawer) */}
        <Sidebar
          currentRoute={currentRoute}
          navigate={navigate}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-3.5 sm:p-6 md:p-8 max-w-7xl mx-auto w-full overflow-x-hidden min-w-0">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
};
