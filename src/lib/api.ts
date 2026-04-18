/**
 * Flow Natura - API Client
 * Centralized client for the FastAPI backend.
 * Replaces direct Supabase queries with API calls.
 */
import { supabase } from './supabase';

// Backend URL - use Render in production, localhost in dev
const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://flow-natura.onrender.com';

/**
 * Get the current user's JWT token from Supabase Auth session.
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Get the current user ID from Supabase Auth session.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * Make an authenticated API call to the backend.
 */
async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('No hay sesión activa');
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Error ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) return null as T;

  return response.json();
}

/**
 * Make a public (no auth) API call.
 */
async function publicFetch<T = any>(endpoint: string): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────
export const dashboard = {
  /** Get all dashboard data in a single call (replaces 6+ Supabase queries) */
  getData: () => apiFetch('/api/v1/dashboard'),
};

// ─────────────────────────────────────────────
// Consultant / Profile
// ─────────────────────────────────────────────
export const consultant = {
  getProfile: () => apiFetch('/api/v1/consultant/profile'),
  getGrowth: () => apiFetch('/api/v1/consultant/growth'),
  getReport: (period: string = 'month') =>
    apiFetch(`/api/v1/consultant/reports/summary?period=${period}`),
  /** Public endpoint - no auth needed */
  getPricing: (price: number) =>
    publicFetch(`/api/v1/consultant/pricing/${price}`),
};

// ─────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────
export const products = {
  list: (params?: { search?: string; category?: string; brand?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.brand) query.set('brand', params.brand);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return apiFetch(`/api/v1/products?${query}`);
  },
  get: (id: string) => apiFetch(`/api/v1/products/${id}`),
  create: (data: any, level: string = 'Bronce') =>
    apiFetch(`/api/v1/products?level=${level}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch(`/api/v1/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch(`/api/v1/products/${id}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────
export const customers = {
  list: (search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiFetch(`/api/v1/customers${query}`);
  },
  get: (id: string) => apiFetch(`/api/v1/customers/${id}`),
  getStats: (id: string) => apiFetch(`/api/v1/customers/${id}/stats`),
  create: (data: any) =>
    apiFetch('/api/v1/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch(`/api/v1/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch(`/api/v1/customers/${id}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────
// Orders / Ventas
// ─────────────────────────────────────────────
export const orders = {
  list: (params?: { status?: string; customer_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.customer_id) query.set('customer_id', params.customer_id);
    return apiFetch(`/api/v1/orders?${query}`);
  },
  get: (id: string) => apiFetch(`/api/v1/orders/${id}`),
  create: (data: any) =>
    apiFetch('/api/v1/orders', { method: 'POST', body: JSON.stringify(data) }),
  cancel: (id: string) =>
    apiFetch(`/api/v1/orders/${id}/cancel`, { method: 'PATCH' }),
  pay: (id: string, amount: number) =>
    apiFetch(`/api/v1/orders/${id}/pay`, { method: 'PATCH', body: JSON.stringify({ amount }) }),
};

// ─────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────
export const inventory = {
  list: (params?: { search?: string; category?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.limit) query.set('limit', String(params.limit));
    return apiFetch(`/api/v1/inventory?${query}`);
  },
  add: (items: any[]) =>
    apiFetch('/api/v1/inventory/add', { method: 'POST', body: JSON.stringify({ items }) }),
  adjust: (data: any) =>
    apiFetch('/api/v1/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
  getPerformance: () => apiFetch('/api/v1/inventory/performance'),
  getCategories: () => apiFetch('/api/v1/inventory/categories'),
};

// Default export with all modules
const api = { dashboard, consultant, products, customers, orders, inventory, getCurrentUserId };
export default api;
