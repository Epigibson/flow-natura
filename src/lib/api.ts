/**
 * Flow Natura - Direct Supabase Client
 * Completely replaces the legacy FastAPI backend calls with direct 
 * @supabase/supabase-js SDK usage.
 */
import { supabase } from './supabase';

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────
export const dashboard = {
  getData: async () => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 1. Fetch Orders
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*, customers(*), order_items(*, products(*))')
      .eq('consultant_id', userId)
      .gte('created_at', startOfMonth)
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;
    const allOrders = ordersData || [];
    const validOrders = allOrders.filter(o => o.status !== 'cancelled');

    // 2. Fetch Inventory
    const { data: inventoryData, error: invError } = await supabase
      .from('inventory')
      .select('*, products(*)')
      .eq('consultant_id', userId);
    if (invError) throw invError;
    const inventory = inventoryData || [];

    // 3. KPIs
    const totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const outOfStock = inventory.filter(inv => inv.quantity <= 0).length;

    let totalDebt = 0;
    validOrders.forEach(o => {
      if (o.payment_method === 'abonos' && o.notes) {
        try {
          const t = typeof o.notes === 'string' ? JSON.parse(o.notes) : o.notes;
          const enganche = Number(t.enganche || 0);
          const historial = t.historial_abonos || [];
          const totalAbonado = historial.reduce((acc: number, curr: any) => acc + Number(curr.monto || 0), 0);
          const debt = Number(o.total_amount) - enganche - totalAbonado;
          if (debt > 0) totalDebt += debt;
        } catch(e) {}
      }
    });

    const kpis = {
      total_revenue: totalRevenue,
      total_orders: validOrders.length,
      pending_debt: totalDebt,
      out_of_stock: outOfStock
    };

    // 4. Recent Orders
    const recent_orders = allOrders.slice(0, 5).map(o => ({
      id: o.id,
      customer_name: o.customers?.full_name || 'Cliente',
      items_summary: o.order_items?.map((i: any) => i.products?.name).join(', ') || '—',
      total_amount: o.total_amount,
      payment_method: o.payment_method,
      status: o.status,
      created_at: o.created_at
    }));

    // 5. Top Clients
    const clientSpend: Record<string, any> = {};
    validOrders.forEach(o => {
      const cid = o.customer_id;
      if (cid) {
        if (!clientSpend[cid]) clientSpend[cid] = { name: o.customers?.full_name || 'Cliente', total: 0 };
        clientSpend[cid].total += Number(o.total_amount);
      }
    });
    const top_clients = Object.entries(clientSpend)
      .map(([id, d]) => ({ customer_id: id, name: d.name, total: d.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // 6. Stock Alerts
    const stock_alerts = inventory
      .filter(inv => inv.quantity <= 3)
      .map(inv => ({
        product_name: inv.products?.name || '?',
        category: inv.products?.category,
        stock: inv.quantity,
        is_out: inv.quantity <= 0
      }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5);

    // 7. Top Products
    const prodSales: Record<string, any> = {};
    validOrders.forEach(o => {
      o.order_items?.forEach((item: any) => {
        const pid = item.product_id;
        if (pid) {
          if (!prodSales[pid]) prodSales[pid] = { name: item.products?.name || 'Producto', qty: 0, rev: 0 };
          prodSales[pid].qty += item.quantity;
          prodSales[pid].rev += item.quantity * Number(item.unit_price);
        }
      });
    });
    const top_products = Object.values(prodSales)
      .map(d => ({ product_name: d.name, units_sold: d.qty, revenue: d.rev }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // 8. Upcoming Payments
    const upcoming_payments: any[] = [];
    validOrders.forEach(o => {
      if (o.payment_method === 'abonos' && o.notes) {
        try {
          const t = typeof o.notes === 'string' ? JSON.parse(o.notes) : o.notes;
          const enganche = Number(t.enganche || 0);
          const historial = t.historial_abonos || [];
          const totalAbonado = historial.reduce((acc: number, curr: any) => acc + Number(curr.monto || 0), 0);
          const debt = Number(o.total_amount) - enganche - totalAbonado;
          
          if (debt > 0) {
            const cuotas = Number(t.pagos || 1);
            const remaining = Number(o.total_amount) - enganche;
            const per_cuota = remaining / cuotas;
            upcoming_payments.push({
              id: o.id,
              customer_name: o.customers?.full_name || 'Cliente',
              items_summary: `Abono Sugerido: $${Math.min(debt, per_cuota).toFixed(2)}`,
              total_amount: o.total_amount,
              payment_method: 'abonos',
              status: o.status,
              created_at: o.created_at
            });
          }
        } catch(e) {}
      }
    });

    return { kpis, recent_orders, top_clients, stock_alerts, top_products, upcoming_payments };
  }
};

// ─────────────────────────────────────────────
// Consultant / Profile
// ─────────────────────────────────────────────
export const consultant = {
  getProfile: async () => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('consultant_profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },
  getGrowth: async () => {
    // Stub or fetch from metadata if needed
    return null;
  },
  getReport: async () => ({})
};

// ─────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────
export const products = {
  list: async (params?: { search?: string; category?: string; brand?: string; limit?: number }) => {
    const userId = await getCurrentUserId();
    let query = supabase.from('products').select('*').eq('consultant_id', userId).is('deleted_at', null).order('name');
    if (params?.search) query = query.ilike('name', `%${params.search}%`);
    if (params?.category) query = query.eq('category', params.category);
    if (params?.brand) query = query.eq('brand', params.brand);
    if (params?.limit) query = query.limit(params.limit);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  listAll: async (includeDeleted: boolean = true) => {
    const userId = await getCurrentUserId();
    let query = supabase.from('products').select('*').eq('consultant_id', userId).order('name');
    if (!includeDeleted) query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  get: async (id: string) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  create: async (data: any) => {
    const userId = await getCurrentUserId();
    const { data: res, error } = await supabase.from('products').insert({ ...data, consultant_id: userId }).select().single();
    if (error) throw error;
    return res;
  },
  update: async (id: string, data: any) => {
    const { data: res, error } = await supabase.from('products').update(data).eq('id', id).select().single();
    if (error) throw error;
    return res;
  },
  delete: async (id: string) => {
    const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return true;
  },
  restore: async (id: string) => {
    const { error } = await supabase.from('products').update({ deleted_at: null }).eq('id', id);
    if (error) throw error;
    return true;
  }
};

// ─────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────
export const customers = {
  list: async (search?: string) => {
    const userId = await getCurrentUserId();
    let query = supabase.from('customers').select('*').eq('consultant_id', userId).order('full_name');
    if (search) query = query.ilike('full_name', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  get: async (id: string) => {
    const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  getStats: async (id: string) => {
    const { data, error } = await supabase.from('orders').select('total_amount, status').eq('customer_id', id);
    if (error) throw error;
    const total_spent = data.filter(o => o.status !== 'cancelled').reduce((acc, o) => acc + Number(o.total_amount), 0);
    return { total_orders: data.length, total_spent };
  },
  create: async (data: any) => {
    const userId = await getCurrentUserId();
    const { data: res, error } = await supabase.from('customers').insert({ ...data, consultant_id: userId }).select().single();
    if (error) throw error;
    return res;
  },
  update: async (id: string, data: any) => {
    const { data: res, error } = await supabase.from('customers').update(data).eq('id', id).select().single();
    if (error) throw error;
    return res;
  },
  delete: async (id: string) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};

// ─────────────────────────────────────────────
// Orders / Ventas
// ─────────────────────────────────────────────
export const orders = {
  list: async (params?: { status?: string; customer_id?: string }) => {
    const userId = await getCurrentUserId();
    let query = supabase.from('orders').select('*, customers(*)').eq('consultant_id', userId).order('created_at', { ascending: false });
    if (params?.status) query = query.eq('status', params.status);
    if (params?.customer_id) query = query.eq('customer_id', params.customer_id);
    const { data, error } = await query;
    if (error) throw error;
    return data.map(o => ({
      ...o,
      customer_name: o.customers?.full_name
    }));
  },
  get: async (id: string) => {
    const { data, error } = await supabase.from('orders').select('*, customers(*), order_items(*, products(*))').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  cancel: async (id: string) => {
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id);
    if (error) throw error;
    return true;
  },
  deliver: async (id: string) => {
    const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', id);
    if (error) throw error;
    return true;
  },
  updateNotes: async (id: string, notes: string) => {
    const { error } = await supabase.from('orders').update({ notes }).eq('id', id);
    if (error) throw error;
    return true;
  }
};

// ─────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────
export const inventory = {
  list: async (params?: { search?: string; category?: string; limit?: number }) => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('inventory').select('*, products(*)').eq('consultant_id', userId);
    if (error) throw error;
    
    let items = data || [];
    if (params?.search) {
      const s = params.search.toLowerCase();
      items = items.filter(i => i.products?.name?.toLowerCase().includes(s));
    }
    if (params?.category) {
      items = items.filter(i => i.products?.category === params.category);
    }
    
    return items.map(row => ({
      product_id: row.product_id,
      product_name: row.products?.name,
      product_code: row.products?.code,
      category: row.products?.category,
      price: row.products?.price,
      quantity: row.quantity,
      image_url: row.products?.image_url
    }));
  },
  add: async (items: any[]) => {
    const userId = await getCurrentUserId();
    for (const item of items) {
      const { data: existing } = await supabase.from('inventory').select('id, quantity').eq('product_id', item.product_id).eq('consultant_id', userId).single();
      if (existing) {
        await supabase.from('inventory').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id);
      } else {
        await supabase.from('inventory').insert({ product_id: item.product_id, quantity: item.quantity, consultant_id: userId });
      }
    }
    return true;
  },
  adjust: async (data: any) => {
    const userId = await getCurrentUserId();
    const { data: existing } = await supabase.from('inventory').select('id').eq('product_id', data.product_id).eq('consultant_id', userId).single();
    if (existing) {
      await supabase.from('inventory').update({ quantity: data.quantity }).eq('id', existing.id);
    } else {
      await supabase.from('inventory').insert({ product_id: data.product_id, quantity: data.quantity, consultant_id: userId });
    }
    // Record adjustment
    await supabase.from('inventory_adjustments').insert({
      product_id: data.product_id,
      consultant_id: userId,
      type: data.type || 'manual',
      quantity_change: data.quantity,
      reason: data.reason
    });
    return true;
  },
  getAdjustments: async (limit: number = 50) => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('inventory_adjustments').select('*, products(*)').eq('consultant_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data.map(a => ({ ...a, product_name: a.products?.name }));
  },
  getCategories: async () => {
    return ['Perfumería', 'Maquillaje', 'Rostro', 'Cuerpo', 'Cabello', 'Hombre'];
  }
};

// ─────────────────────────────────────────────
// Community / Mentorship (Stubs for direct data mapping)
// ─────────────────────────────────────────────
export const community = {
  getPosts: async () => [],
  createPost: async () => true,
  deletePost: async () => true,
  toggleReaction: async () => true,
  getComments: async () => [],
  createComment: async () => true,
  getStats: async () => ({})
};

export const mentorship = {
  getModules: async () => [],
  getSessions: async () => [],
  getProgress: async () => ({})
};

const api = {
  dashboard, consultant, products, customers, orders, inventory,
  community, mentorship, getCurrentUserId,
};
export default api;
