import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_BASE_URL || '';

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(opts.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listProducts:    ()             => request('/api/products'),
  createProduct:   (body)         => request('/api/products', { method: 'POST', body: JSON.stringify(body) }),
  updateProduct:   (id, body)     => request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  inventoryStatus: ()             => request('/api/inventory'),
  alerts:          ()             => request('/api/inventory/alerts'),
  dailyUpdate:     (updates)      => request('/api/inventory/daily-update', { method: 'POST', body: JSON.stringify({ updates }) }),

  listTransactions:(q='')         => request(`/api/transactions${q ? `?${q}` : ''}`),
  createTransaction:(body)        => request('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),

  spending: (params={}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/reports/spending${qs ? `?${qs}` : ''}`);
  },
  dashboard:        ()                  => request('/api/reports/dashboard'),
  aiSummary:        (refresh = false)   => request(`/api/reports/ai-summary${refresh ? '?refresh=true' : ''}`),
  aiSummaryHistory: ()                  => request('/api/reports/ai-summary/history'),

  listUsers:    ()                => request('/api/admin/users'),
  setUserRole:  (userId, role)    => request(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  createUser:   (body)            => request('/api/admin/users/create', { method: 'POST', body: JSON.stringify(body) }),
  inviteUser:   (body)            => request('/api/admin/users/invite', { method: 'POST', body: JSON.stringify(body) }),

  submitRequest:   (raw_text)        => request('/api/requests', { method: 'POST', body: JSON.stringify({ raw_text }) }),
  getRequest:      (id)              => request(`/api/requests/${id}`),
  listRequests:    (status='')       => request(`/api/requests${status ? `?status=${status}` : ''}`),
  setRequestStatus:(id, status, live_status, notes) =>
    request(`/api/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, live_status, notes }) }),
  rateRequest: (id, body) => request(`/api/requests/${id}/rate`, { method: 'POST', body: JSON.stringify(body) }),

  extractBill: (file_url) => request('/api/bills/extract', { method: 'POST', body: JSON.stringify({ file_url }) }),
  listBills: () => request('/api/bills'),
  updateBillStatus: (id, body) => request(`/api/bills/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Cafeteria
  cafeteriaItems:  ()     => request('/api/cafeteria/items'),
  quickOrder:      (body) => request('/api/requests', { method: 'POST', body: JSON.stringify(body) }),
  addCafeteriaItem:(body) => request('/api/cafeteria/items', { method: 'POST', body: JSON.stringify(body) }),
  updateCafeteriaItem: (id, body) => request(`/api/cafeteria/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  listMonthlyExpenses: () => request('/api/reports/monthly-expenses'),
  addMonthlyExpense: (body) => request('/api/reports/monthly-expenses', { method: 'POST', body: JSON.stringify(body) }),
  deleteMonthlyExpense: (id) => request(`/api/reports/monthly-expenses/${id}`, { method: 'DELETE' }),
};
