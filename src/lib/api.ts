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
  /** List all products including soft-deleted (admin view) */
  listAll: (includeDeleted: boolean = true) =>
    apiFetch(`/api/v1/products/all?include_deleted=${includeDeleted}`),
  get: (id: string) => apiFetch(`/api/v1/products/${id}`),
  create: (data: any, level: string = 'Bronce') =>
    apiFetch(`/api/v1/products?level=${level}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch(`/api/v1/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch(`/api/v1/products/${id}`, { method: 'DELETE' }),
  restore: (id: string) =>
    apiFetch(`/api/v1/products/${id}/restore`, { method: 'PATCH' }),
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
  deliver: (id: string) =>
    apiFetch(`/api/v1/orders/${id}/deliver`, { method: 'PATCH' }),
  pay: (id: string, amount: number) =>
    apiFetch(`/api/v1/orders/${id}/pay`, { method: 'PATCH', body: JSON.stringify({ amount }) }),
  updateNotes: (id: string, notes: string) =>
    apiFetch(`/api/v1/orders/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
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
    apiFetch('/api/v1/inventory/add', { method: 'POST', body: JSON.stringify(items) }),
  adjust: (data: any) =>
    apiFetch('/api/v1/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
  getPerformance: () => apiFetch('/api/v1/inventory/performance'),
  getCategories: () => apiFetch('/api/v1/inventory/categories'),
  /** Apply adjustment with history recording (replaces RPC) */
  applyAdjustment: (data: any) =>
    apiFetch('/api/v1/inventory/apply-adjustment', { method: 'POST', body: JSON.stringify(data) }),
  /** Get adjustment history */
  getAdjustments: (limit: number = 50) =>
    apiFetch(`/api/v1/inventory/adjustments?limit=${limit}`),
  /** Register a product barcode */
  addBarcode: (data: { product_id: string; barcode: string }) =>
    apiFetch('/api/v1/inventory/barcode', { method: 'POST', body: JSON.stringify(data) }),
  /** Batch import products and create inventory entries */
  importProducts: (products: any[]) =>
    apiFetch('/api/v1/inventory/import-products', { method: 'POST', body: JSON.stringify({ products }) }),
};

// ─────────────────────────────────────────────
// Community
// ─────────────────────────────────────────────
export const community = {
  getPosts: (topic?: string) => {
    const query = topic && topic !== 'all' ? `?topic=${encodeURIComponent(topic)}` : '';
    return apiFetch(`/api/v1/community/posts${query}`);
  },
  createPost: (data: { content: string; author_name: string; topic?: string }) =>
    apiFetch('/api/v1/community/posts', { method: 'POST', body: JSON.stringify(data) }),
  deletePost: (id: string) =>
    apiFetch(`/api/v1/community/posts/${id}`, { method: 'DELETE' }),
  toggleReaction: (data: { post_id: string; reaction_type: string }) =>
    apiFetch('/api/v1/community/reactions', { method: 'POST', body: JSON.stringify(data) }),
  getComments: (postId: string) =>
    apiFetch(`/api/v1/community/posts/${postId}/comments`),
  createComment: (data: { post_id: string; author_name: string; content: string }) =>
    apiFetch('/api/v1/community/comments', { method: 'POST', body: JSON.stringify(data) }),
  getStats: () => apiFetch('/api/v1/community/stats'),
};

// ─────────────────────────────────────────────
// Mentorship
// ─────────────────────────────────────────────
export const mentorship = {
  getModules: () => apiFetch('/api/v1/mentorship/modules'),
  getSessions: () => apiFetch('/api/v1/mentorship/sessions'),
  createSession: (data: any) =>
    apiFetch('/api/v1/mentorship/sessions', { method: 'POST', body: JSON.stringify(data) }),
  cancelSession: (id: string) =>
    apiFetch(`/api/v1/mentorship/sessions/${id}/cancel`, { method: 'PATCH' }),
  getProgress: () => apiFetch('/api/v1/mentorship/progress'),
  saveProgress: (data: { module_id: string; lesson_id: string; completed?: boolean }) =>
    apiFetch('/api/v1/mentorship/progress', { method: 'POST', body: JSON.stringify(data) }),
  clearProgress: (moduleId: string) =>
    apiFetch(`/api/v1/mentorship/progress?module_id=${moduleId}`, { method: 'DELETE' }),
};

// Default export with all modules
const api = {
  dashboard, consultant, products, customers, orders, inventory,
  community, mentorship, getCurrentUserId,
};
export default api;
