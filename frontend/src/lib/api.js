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
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // products
  listProducts: ()           => request('/api/products'),
  createProduct: (body)      => request('/api/products', { method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (id, body)  => request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // inventory
  inventoryStatus: ()        => request('/api/inventory'),
  alerts: ()                 => request('/api/inventory/alerts'),
  dailyUpdate: (updates)     => request('/api/inventory/daily-update', { method: 'POST', body: JSON.stringify({ updates }) }),

  // transactions
  listTransactions: (q='')   => request(`/api/transactions${q ? `?${q}` : ''}`),
  createTransaction: (body)  => request('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),

  // reports
  spending: (params={})      => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/reports/spending${qs ? `?${qs}` : ''}`);
  },
  dashboard: ()              => request('/api/reports/dashboard'),
};
