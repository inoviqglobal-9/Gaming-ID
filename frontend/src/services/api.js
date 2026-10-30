const API_BASE = '/api';

export const tokenStorage = {
  get: () => {
    try {
      return localStorage.getItem('fichaspot_session_token') || sessionStorage.getItem('fichaspot_session_token');
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      if (token) {
        localStorage.setItem('fichaspot_session_token', token);
      }
    } catch {}
  },
  clear: () => {
    try {
      localStorage.removeItem('fichaspot_session_token');
      sessionStorage.removeItem('fichaspot_session_token');
      if (typeof document !== 'undefined') {
        document.cookie = 'scanner_trader_has_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      }
    } catch {}
  },
  hasToken: () => {
    try {
      const stored = localStorage.getItem('fichaspot_session_token') || sessionStorage.getItem('fichaspot_session_token');
      const hasCookieHint = typeof document !== 'undefined' && document.cookie.includes('scanner_trader_has_session=1');
      return Boolean(stored || hasCookieHint);
    } catch {
      return false;
    }
  },
};

export const apiFetch = async (endpoint, options = {}) => {
  const isFormData = options.body instanceof FormData;

  const defaultHeaders = isFormData
    ? {}
    : {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  // Safe timeout to prevent hanging network requests
  const timeoutMs = options.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Attach session token in Authorization header if present
  const storedToken = tokenStorage.get();
  const authHeaders = storedToken ? { Authorization: `Bearer ${storedToken}` } : {};

  const config = {
    ...options,
    signal: options.signal || controller.signal,
    headers: {
      ...defaultHeaders,
      ...authHeaders,
      ...(options.headers || {}),
    },
    credentials: 'include', // Send and receive HTTP-only session cookies
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutError = new Error('Request timed out. Please check your network connection.');
      timeoutError.status = 408;
      throw timeoutError;
    }
    const networkError = new Error('Unable to connect to backend server. Please check your connection.');
    networkError.status = 503;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }

  // If receiving a blob or download (e.g. CSV export)
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/csv')) {
    if (!response.ok) {
      throw new Error('Failed to download CSV export.');
    }
    return response.blob();
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    data = { success: false, message: response.statusText || 'Server returned an invalid response.' };
  }

  if (!response.ok) {
    if (response.status === 401) {
      tokenStorage.clear();
    }
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

// API Services
export const authService = {
  login: async (username, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data && data.token) {
      tokenStorage.set(data.token);
    }
    return data;
  },
  adminLogin: async (username, password) => {
    const data = await apiFetch('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data && data.token) {
      tokenStorage.set(data.token);
    }
    return data;
  },
  traderLogin: async (username, password) => {
    const data = await apiFetch('/auth/trader/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data && data.token) {
      tokenStorage.set(data.token);
    }
    return data;
  },
  getMe: async () => {
    try {
      const data = await apiFetch('/auth/me');
      return data;
    } catch (err) {
      if (err.status === 401) {
        tokenStorage.clear();
        return { success: false, unauthenticated: true, user: null };
      }
      throw err;
    }
  },
  logout: async () => {
    try {
      return await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      tokenStorage.clear();
    }
  },
  changePassword: (currentPassword, newPassword) =>
    apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

export const adminService = {
  getClients: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/clients${query ? `?${query}` : ''}`);
  },
  createClient: (clientData) => apiFetch('/admin/clients', { method: 'POST', body: JSON.stringify(clientData) }),
  getTraders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/traders${query ? `?${query}` : ''}`);
  },
  getTraderById: (id) => apiFetch(`/admin/traders/${id}`),
  createTrader: (traderData) => apiFetch('/admin/traders', { method: 'POST', body: JSON.stringify(traderData) }),
  updateTrader: (id, data) => apiFetch(`/admin/traders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  bulkGenerateUsers: (data) => apiFetch('/admin/generate-users', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, status) => apiFetch(`/admin/clients/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateTraderStatus: (id, status) => apiFetch(`/admin/traders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  resetPassword: (id, newPassword) => apiFetch(`/admin/clients/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  resetTraderPassword: (id, newPassword) => apiFetch(`/admin/traders/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  revokeTraderSessions: (id) => apiFetch(`/admin/traders/${id}/revoke-sessions`, { method: 'POST' }),
  deleteClient: (id) => apiFetch(`/admin/clients/${id}`, { method: 'DELETE' }),
  exportCsv: () => apiFetch('/admin/clients/export-csv'),
  getAnalytics: (days = 7) => apiFetch(`/admin/analytics?days=${days}`),
  // USDT Wallet & Adjustments (Phase 6, 7, 8, 10, 13)
  getTraderUsdtWallet: (id) => apiFetch(`/admin/traders/${id}/wallet/usdt`),
  getTraderUsdtTransactions: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/traders/${id}/transactions${query ? `?${query}` : ''}`);
  },
  getActivities: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/activities${query ? `?${query}` : ''}`);
  },
  getWalletAdjustments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/wallet-adjustments${query ? `?${query}` : ''}`);
  },
  createWalletAdjustment: (data) =>
    apiFetch('/admin/wallet-adjustments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveWalletAdjustment: (id, data = {}) =>
    apiFetch(`/admin/wallet-adjustments/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  rejectWalletAdjustment: (id, data = {}) =>
    apiFetch(`/admin/wallet-adjustments/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // USDT Valuation Rate Management (Admin controlled)
  getWalletRate: () => apiFetch('/admin/wallet-rate'),
  updateWalletRate: (data) =>
    apiFetch('/admin/wallet-rate', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getCryptoSettings: () => apiFetch('/admin/crypto/settings'),
  updateCryptoSettings: (data) =>
    apiFetch('/admin/crypto/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getCryptoSettingsHistory: () => apiFetch('/admin/crypto/settings/history'),
};

export const payinService = {
  create: (data) => apiFetch('/payin', { method: 'POST', body: JSON.stringify(data) }),
  getMyPayIns: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/payin/my${query ? `?${query}` : ''}`);
  },
  submitReference: (id, referenceId, notes) => apiFetch(`/payin/${id}/submit-reference`, { method: 'POST', body: JSON.stringify({ referenceId, notes }) }),
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/payin/admin${query ? `?${query}` : ''}`);
  },
  reviewAdmin: (id, action, decisionNotes, verificationEvidence) =>
    apiFetch(`/payin/admin/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ action, decisionNotes, verificationEvidence }),
    }),
};

export const applicationService = {
  // Trader Applications
  getTraderApplications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/applications${query ? `?${query}` : ''}`);
  },
  getTraderApplicationById: (id) => apiFetch(`/trader/applications/${id}`),
  exportTraderApplicationsCsv: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/applications/export${query ? `?${query}` : ''}`);
  },

  // Admin Applications
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/applications${query ? `?${query}` : ''}`);
  },
  getByIdAdmin: (id) => apiFetch(`/admin/applications/${id}`),
  reviewAdmin: (id, action, decisionNotes, verificationEvidence) =>
    apiFetch(`/admin/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, decisionNotes, verificationEvidence }),
    }),
  getHistoryAdmin: (id) => apiFetch(`/admin/applications/${id}/history`),
  exportAdminCsv: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/applications/export${query ? `?${query}` : ''}`);
  },
};

export const payoutService = {
  create: (data) => apiFetch('/payout', { method: 'POST', body: JSON.stringify(data) }),
  getMyPayouts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/payout/my${query ? `?${query}` : ''}`);
  },
  // Trader endpoints
  getSettings: () => apiFetch('/trader/payouts/settings'),
  getActivePayout: () => apiFetch('/trader/payouts/active'),
  getHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/payouts/history${query ? `?${query}` : ''}`);
  },
  claimPayout: (id) => apiFetch(`/trader/payouts/${id}/claim`, { method: 'POST' }),
  exportCsvUrl: (status = 'ALL') => `/api/trader/payouts/history/export?status=${status}`,

  // Admin endpoints
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/payouts${query ? `?${query}` : ''}`);
  },
  getByIdAdmin: (id) => apiFetch(`/admin/payouts/${id}`),
  assignPayout: (data) => apiFetch('/admin/payouts/assign', { method: 'POST', body: JSON.stringify(data) }),
  reviewAdmin: (id, status, decisionNotes, reference) =>
    apiFetch(`/admin/payouts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decisionNotes, reference }),
    }),
  getTraderPayoutSettings: (traderId) => apiFetch(`/admin/traders/${traderId}/payout-settings`),
  updateTraderPayoutSettings: (traderId, payoutEnabled, reason) =>
    apiFetch(`/admin/traders/${traderId}/payout-settings`, {
      method: 'PATCH',
      body: JSON.stringify({ payoutEnabled, reason }),
    }),
};

export const depositService = {
  // Trader endpoints
  getTraderSettings: () => apiFetch('/trader/deposit-settings'),
  getTraderDeposits: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/deposit-requests${query ? `?${query}` : ''}`);
  },
  createTraderDeposit: (data) =>
    apiFetch('/trader/deposit-requests', { method: 'POST', body: JSON.stringify(data) }),
  getTraderDepositById: (id) => apiFetch(`/trader/deposit-requests/${id}`),
  submitEvidence: (id, formData) =>
    apiFetch(`/trader/deposit-requests/${id}/submit-evidence`, {
      method: 'POST',
      body: formData,
    }),

  // Backward-compat aliases
  create: (data) => apiFetch('/trader/deposit-requests', { method: 'POST', body: JSON.stringify(data) }),
  getMyDeposits: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/deposit-requests${query ? `?${query}` : ''}`);
  },

  // Admin endpoints
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/deposit-requests${query ? `?${query}` : ''}`);
  },
  getByIdAdmin: (id) => apiFetch(`/admin/deposit-requests/${id}`),
  reviewAdmin: (id, data) =>
    apiFetch(`/admin/deposit-requests/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  verifyAdmin: (id, data = {}) =>
    apiFetch(`/admin/deposit-requests/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveAdmin: (id, data = {}) =>
    apiFetch(`/admin/deposit-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  rejectAdmin: (id, reason) =>
    apiFetch(`/admin/deposit-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getAdminSettings: () => apiFetch('/admin/deposit-settings'),
  updateAdminSettings: (data) =>
    apiFetch('/admin/deposit-settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export const cryptoService = {
  // Rates & Quotations
  getRates: () => apiFetch('/crypto/rates'),
  getQuote: (type, amount) => apiFetch(`/crypto/quote?type=${type}&amount=${amount}`),
  getWithdrawalConfig: () => apiFetch('/crypto/withdrawal-config'),
  getActiveQR: () => apiFetch('/crypto/deposit-qr'),

  // Trader Deposit & Withdrawal
  submitDeposit: (formData) => apiFetch('/crypto/deposits', { method: 'POST', body: formData }),
  getTraderDeposits: () => apiFetch('/crypto/deposits'),
  submitWithdrawal: (formData) => apiFetch('/crypto/withdrawals', { method: 'POST', body: formData }),
  getTraderWithdrawals: () => apiFetch('/crypto/withdrawals'),
  getTraderTransactions: () => apiFetch('/crypto/transactions'),
  getWallet: () => apiFetch('/crypto/wallet'),

  // Admin Crypto Management
  getAdminOverview: () => apiFetch('/crypto/admin/overview'),
  getAdminDeposits: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/crypto/admin/deposits${query ? `?${query}` : ''}`);
  },
  approveDeposit: (id, notes) =>
    apiFetch(`/crypto/admin/deposits/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  rejectDeposit: (id, reason) =>
    apiFetch(`/crypto/admin/deposits/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getAdminWithdrawals: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/crypto/admin/withdrawals${query ? `?${query}` : ''}`);
  },
  approveWithdrawal: (id, notes) =>
    apiFetch(`/crypto/admin/withdrawals/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
  verifyWithdrawalPayout: (id, payoutReference, notes) =>
    apiFetch(`/crypto/admin/withdrawals/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ payoutReference, notes }),
    }),
  completeWithdrawal: (id, payoutReference, notes) =>
    apiFetch(`/crypto/admin/withdrawals/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ payoutReference, notes }),
    }),
  rejectWithdrawal: (id, reason) =>
    apiFetch(`/crypto/admin/withdrawals/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  getAdminQRs: () => apiFetch('/crypto/admin/qrs'),
  uploadAdminQR: (formData) => apiFetch('/crypto/admin/qrs', { method: 'POST', body: formData }),
  setActiveQR: (id) => apiFetch(`/crypto/admin/qrs/${id}/active`, { method: 'PATCH' }),
  deleteAdminQR: (id) => apiFetch(`/crypto/admin/qrs/${id}`, { method: 'DELETE' }),

  getAdminTransactions: () => apiFetch('/crypto/admin/transactions'),
  getAdminActivities: () => apiFetch('/crypto/admin/activities'),

  // Commercial Settings
  getCryptoSettings: () => apiFetch('/crypto/admin/settings'),
  updateCryptoSettings: (data) =>
    apiFetch('/crypto/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getCryptoSettingsHistory: () => apiFetch('/crypto/admin/settings/history'),

  // Legacy compatibility
  getConfig: () => apiFetch('/crypto/config'),
  createRequest: (data) => apiFetch('/crypto/request', { method: 'POST', body: JSON.stringify(data) }),
  getMyRequests: () => apiFetch('/crypto/my'),
  getAllAdmin: () => apiFetch('/crypto/admin'),
  reviewAdmin: (id, status, decisionNotes, txHash) =>
    apiFetch(`/crypto/admin/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decisionNotes, txHash }),
    }),
};


export const scannerService = {
  getActive: () => apiFetch('/scanner/active'),
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/scanner/admin${query ? `?${query}` : ''}`);
  },
  getByIdAdmin: (id) => apiFetch(`/scanner/admin/${id}`),
  createConfig: (formData) => apiFetch('/scanner/admin', { method: 'POST', body: formData }),
  updateConfig: (id, formData) => apiFetch(`/scanner/admin/${id}`, { method: 'PATCH', body: formData }),
  publish: (id) => apiFetch(`/scanner/admin/${id}/publish`, { method: 'POST' }),
  unpublish: (id) => apiFetch(`/scanner/admin/${id}/unpublish`, { method: 'POST' }),
  activate: (id) => apiFetch(`/scanner/admin/${id}/activate`, { method: 'POST' }),
  deactivate: (id) => apiFetch(`/scanner/admin/${id}/deactivate`, { method: 'POST' }),
  replace: (id, formData) => apiFetch(`/scanner/admin/${id}/replace`, { method: 'POST', body: formData }),
  deleteOrArchive: (id, forceArchive = false) =>
    apiFetch(`/scanner/admin/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ forceArchive }),
    }),
  restore: (id) => apiFetch(`/scanner/admin/${id}/restore`, { method: 'POST' }),
};

export const notificationService = {
  getMine: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/notifications${query ? `?${query}` : ''}`);
  },
  markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/notifications/mark-all-read', { method: 'PATCH' }),
};

export const auditService = {
  getLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/audit-logs${query ? `?${query}` : ''}`);
  },
};

export const traderService = {
  getDashboardSummary: (period = '7D') => apiFetch(`/trader/dashboard/summary?period=${period}`),
  getDashboardVolume: (period = '7D') => apiFetch(`/trader/dashboard/volume?period=${period}`),
  getTransactionStatus: (period = '7D') => apiFetch(`/trader/dashboard/transaction-status?period=${period}`),
  getRecentApplications: (limit = 10) => apiFetch(`/trader/dashboard/recent-applications?limit=${limit}`),
  // USDT Wallet & Transactions (Default to NORMAL module subledger)
  getUsdtWallet: (module = 'NORMAL') => apiFetch(`/trader/wallet/usdt${module ? `?module=${encodeURIComponent(module)}` : ''}`),
  getUsdtTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/wallet/transactions${query ? `?${query}` : ''}`);
  },
  getNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/notifications${query ? `?${query}` : ''}`);
  },
  getWalletRate: () => apiFetch('/trader/wallet-rate'),
};

export const requisiteService = {
  // Trader endpoints
  getSummary: () => apiFetch('/trader/requisites/summary'),
  getRequisites: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/requisites${query ? `?${query}` : ''}`);
  },
  createRequisite: (data) =>
    apiFetch('/trader/requisites', { method: 'POST', body: JSON.stringify(data) }),
  getRequisiteById: (id) => apiFetch(`/trader/requisites/${id}`),
  updateRequisite: (id, data) =>
    apiFetch(`/trader/requisites/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  togglePayIn: (id, payinEnabled) =>
    apiFetch(`/trader/requisites/${id}/payin`, {
      method: 'PATCH',
      body: JSON.stringify({ payinEnabled }),
    }),
  getStatistics: (id) => apiFetch(`/trader/requisites/${id}/statistics`),

  // Admin endpoints
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/requisites${query ? `?${query}` : ''}`);
  },
  getByIdAdmin: (id) => apiFetch(`/admin/requisites/${id}`),
  approveAdmin: (id, notes = '') =>
    apiFetch(`/admin/requisites/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  rejectAdmin: (id, reason) =>
    apiFetch(`/admin/requisites/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  updateStatusAdmin: (id, status) =>
    apiFetch(`/admin/requisites/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  updateLimitsAdmin: (id, limits) =>
    apiFetch(`/admin/requisites/${id}/limits`, {
      method: 'PATCH',
      body: JSON.stringify(limits),
    }),
  updatePayInPermissionAdmin: (id, adminPayinAllowed) =>
    apiFetch(`/admin/requisites/${id}/payin-permission`, {
      method: 'PATCH',
      body: JSON.stringify({ adminPayinAllowed }),
    }),
  getSettingsAdmin: () => apiFetch('/admin/requisite-settings'),
  updateSettingsAdmin: (settings) =>
    apiFetch('/admin/requisite-settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
};

export const walletCheckService = {
  // Trader endpoints
  getSettings: () => apiFetch('/trader/wallet-check/settings'),
  getHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/trader/wallet-check/history${query ? `?${query}` : ''}`);
  },
  checkWallet: (data) =>
    apiFetch('/trader/wallet-check', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getById: (id) => apiFetch(`/trader/wallet-check/${id}`),
  getReport: (id) => apiFetch(`/trader/wallet-check/${id}/report`),

  // Admin endpoints
  getAllAdmin: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/admin/wallet-check${query ? `?${query}` : ''}`);
  },
  getByIdAdmin: (id) => apiFetch(`/admin/wallet-check/${id}`),
  getSettingsAdmin: () => apiFetch('/admin/wallet-check/settings'),
  updateSettingsAdmin: (settings) =>
    apiFetch('/admin/wallet-check/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
  getStatisticsAdmin: () => apiFetch('/admin/wallet-check/statistics'),
};


