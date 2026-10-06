/**
 * Flow Natura - Direct Supabase Client
 * Completely replaces the legacy FastAPI backend calls with direct 
 * @supabase/supabase-js SDK usage.
 */
import { supabase } from './supabase';
import { summarizeOrder, MONEY_EPSILON } from './orders';

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

    // 1. Fetch Orders (this month, for revenue / activity)
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

    // 2b. Open balances: ALL non-cancelled orders (debt does not expire with the month)
    const { data: openData, error: openError } = await supabase
      .from('orders')
      .select('id, total_amount, status, payment_method, installments, created_at, customers(full_name), order_payments(id, amount, kind, paid_at)')
      .eq('consultant_id', userId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true });
    if (openError) throw openError;
    const withBalance = (openData || [])
      .map((o: any) => ({ order: o, summary: summarizeOrder(o) }))
      .filter(({ summary }) => summary.balance > MONEY_EPSILON);

    // 3. KPIs
    const totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const outOfStock = inventory.filter(inv => inv.quantity <= 0).length;
    const totalDebt = withBalance.reduce((sum, { summary }) => sum + summary.balance, 0);

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

    // 8. Upcoming Payments (oldest debt first)
    const upcoming_payments = withBalance.map(({ order: o, summary }) => ({
      id: o.id,
      customer_name: o.customers?.full_name || 'Cliente',
      items_summary: `Abono Sugerido: $${summary.suggestedPayment.toFixed(2)}`,
      total_amount: o.total_amount,
      balance: summary.balance,
      suggested: summary.suggestedPayment,
      payment_method: o.payment_method,
      status: o.status,
      created_at: o.created_at
    }));

    return { kpis, recent_orders, top_clients, stock_alerts, top_products, upcoming_payments };
  }
};

// ─────────────────────────────────────────────
// Consultant / Profile
// ─────────────────────────────────────────────
export const consultant = {
  getProfile: async () => {
    const userId = await getCurrentUserId();
    // Explicit columns: never ship natura_password_encrypted to the client
    const { data, error } = await supabase
      .from('consultant_profiles')
      .select('id, full_name, natura_code, level, natura_email, is_natura_connected, latest_growth_data, growth_sync_date, avatar_url, phone, business_name, city')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  updateProfile: async (updates: any) => {
    const userId = await getCurrentUserId();
    // UPDATE (the profile row is created by the signup trigger); an upsert would fail on NOT NULL full_name
    const { data, error } = await supabase
      .from('consultant_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, full_name, natura_code, natura_email, avatar_url, phone, business_name, city')
      .single();
    if (error) throw error;
    return data;
  },
  uploadAvatar: async (uri: string, base64Data?: string) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');

    const fileExt = uri.split('.').pop() || 'jpeg';
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    let fileBody: any;
    if (base64Data) {
      // Browser-compatible base64 to ArrayBuffer (no require())
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      fileBody = bytes.buffer;
    } else {
      const response = await fetch(uri);
      fileBody = await response.blob();
    }

    // Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, fileBody, { 
        upsert: true,
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    
    // Update profile
    await consultant.updateProfile({ avatar_url: data.publicUrl });
    
    return data.publicUrl;
  },
  getSubscription: async () => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('subscriptions').select('*').eq('consultant_id', userId).maybeSingle();
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
    let query = supabase.from('products').select('*').is('deleted_at', null).order('name');
    if (params?.search) {
      // Sanitize PostgREST special characters to prevent filter injection
      const safe = params.search.replace(/[%_.,()]/g, '');
      query = query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`);
    }
    if (params?.category) query = query.eq('category', params.category);
    if (params?.brand) query = query.eq('brand', params.brand);
    if (params?.limit) query = query.limit(params.limit);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  listAll: async (includeDeleted: boolean = true) => {
    const { data, error } = await supabase.rpc('list_all_products', { p_include_deleted: includeDeleted });
    if (error) throw error;
    return data;
  },
  get: async (id: string) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  /**
   * Resolves a scanned code to a catalog product: first an EAN linked in product_barcodes,
   * then the Natura product code. Same lookup on web and mobile.
   */
  findByBarcode: async (code: string) => {
    const value = code.trim();
    if (!value) return null;
    const { data: linked, error: linkErr } = await supabase
      .from('product_barcodes')
      .select('product_id, products ( id, name, code, brand, category, price, cost, points, image_url, description )')
      .eq('ean', value)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (linked?.products) return linked.products as any;

    const { data: byCode, error } = await supabase
      .from('products')
      .select('id, name, code, brand, category, price, cost, points, image_url, description')
      .eq('code', value)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return byCode;
  },
  create: async (data: any, _level?: string) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user authenticated');

    const { stock, consultant_id, ...productData } = data;

    // Check if product with the same code exists in catalog (active or soft-deleted)
    const { data: existing, error: searchError } = await supabase
      .rpc('list_all_products', { p_include_deleted: true })
      .eq('code', productData.code)
      .maybeSingle();

    if (searchError) throw searchError;

    let product;
    if (existing) {
      const matched = existing as { id: string; deleted_at: string | null; [key: string]: any };
      product = matched;
      if (matched.deleted_at) {
        // Restore soft-deleted product
        await products.restore(matched.id);
      }
      // Update catalog details to keep it fresh
      product = await products.update(matched.id, productData);
    } else {
      // Create new catalog product
      const { data: res, error } = await supabase.from('products').insert(productData).select().single();
      if (error) throw error;
      product = res;
    }

    // Bind to consultant's inventory
    const qty = parseInt(stock) || 0;
    if (qty > 0) {
      await inventory.add([{
        product_id: product.id,
        quantity: qty
      }]);
    }

    return product;
  },
  update: async (id: string, data: any) => {
    const { data: res, error } = await supabase.from('products').update(data).eq('id', id).select().maybeSingle();
    if (error) throw error;
    // RLS hides rows other consultants also stock: 0 rows updated, no error
    if (!res) throw new Error('No se pudo modificar el producto: no existe o lo usan otras consultoras.');
    return res;
  },
  delete: async (id: string) => {
    const { error } = await supabase.rpc('soft_delete_product', { p_product_id: id });
    if (error) throw error;
    return true;
  },
  restore: async (id: string) => {
    const { error } = await supabase.rpc('restore_product', { p_product_id: id });
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
    if (search) {
      // Sanitize PostgREST special characters to prevent filter injection
      const safe = search.replace(/[%_.,()]/g, '');
      query = query.ilike('full_name', `%${safe}%`);
    }
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
    const { data, error } = await supabase
      .from('orders')
      .select('total_amount, status, created_at, payment_method, installments, order_payments(id, amount, kind, paid_at)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const active = data.filter(o => o.status !== 'cancelled');
    const total_spent = active.reduce((acc, o) => acc + Number(o.total_amount), 0);
    const last_order = active.length > 0 ? active[0].created_at : null;
    const total_debt = active.reduce((acc, o) => acc + summarizeOrder(o as any).balance, 0);

    return { total_orders: data.length, total_spent, total_debt, last_order };
  },
  getOrders: async (customerId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, total_amount, status, created_at, payment_method, installments, order_payments(id, amount, kind, paid_at)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data;
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
    if (error) {
      // 23503 = foreign_key_violation: the customer still has sales (orders.customer_id is ON DELETE RESTRICT)
      if (error.code === '23503') throw new Error('Este cliente tiene ventas registradas y no se puede eliminar. Cancela o reasigna sus ventas primero.');
      throw error;
    }
    return true;
  }
};

// ─────────────────────────────────────────────
// Orders / Ventas
// ─────────────────────────────────────────────
export interface CreateOrderInput {
  customer_id: string | null;
  payment_method: 'contado' | 'abonos';
  items: { product_id: string; quantity: number; unit_price: number }[];
  enganche?: number;
  installments?: number;
  frequency?: string;
  notes?: string;
  meta?: Record<string, any>;
  /** Global discount in currency, applied on top of the per-unit prices. */
  global_discount?: number;
}

const ORDER_SELECT = '*, customers(*), order_items(*, products(*)), order_payments(id, amount, kind, paid_at)';

export const orders = {
  list: async (params?: { status?: string; customer_id?: string }) => {
    const userId = await getCurrentUserId();
    let query = supabase
      .from('orders')
      .select('*, customers(*), order_payments(id, amount, kind, paid_at)')
      .eq('consultant_id', userId)
      .order('created_at', { ascending: false });
    if (params?.status) query = query.eq('status', params.status);
    if (params?.customer_id) query = query.eq('customer_id', params.customer_id);
    const { data, error } = await query;
    if (error) throw error;
    return data.map(o => ({
      ...o,
      customer_name: o.customers?.full_name,
      summary: summarizeOrder(o as any)
    }));
  },
  get: async (id: string) => {
    const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).single();
    if (error) throw error;
    return { ...data, summary: summarizeOrder(data as any) };
  },
  /** Atomic: order + items + stock deduction + initial payment, or nothing. Returns the new order id. */
  create: async (input: CreateOrderInput): Promise<string> => {
    const { data, error } = await supabase.rpc('create_order', {
      p_customer_id: input.customer_id,
      p_payment_method: input.payment_method,
      p_items: input.items,
      p_enganche: input.enganche || 0,
      p_installments: input.payment_method === 'abonos' ? (input.installments || 1) : null,
      p_frequency: input.payment_method === 'abonos' ? (input.frequency || null) : null,
      p_notes: input.notes || null,
      p_meta: input.meta || {},
      p_global_discount: input.global_discount || 0
    });
    if (error) throw error;
    return data as string;
  },
  cancel: async (id: string) => {
    const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
    if (error) throw error;
    return true;
  },
  deliver: async (id: string) => {
    const { error } = await supabase.rpc('deliver_order', { p_order_id: id });
    if (error) throw error;
    return true;
  },
  addPayment: async (orderId: string, amount: number, kind: 'abono' | 'enganche' = 'abono') => {
    const { data, error } = await supabase.rpc('add_payment', { p_order_id: orderId, p_amount: amount, p_kind: kind });
    if (error) throw error;
    return data as { paid_amount: number; balance: number };
  },
  deletePayment: async (paymentId: string) => {
    const { error } = await supabase.rpc('delete_payment', { p_payment_id: paymentId });
    if (error) throw error;
    return true;
  },
  updateNotes: async (id: string, notes: string) => {
    const { data, error } = await supabase.from('orders').update({ notes: notes.trim() || null }).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se pudo guardar la nota (venta no encontrada).');
    return true;
  },
  changeCustomer: async (id: string, customerId: string) => {
    const { data, error } = await supabase.from('orders').update({ customer_id: customerId }).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se pudo cambiar el cliente (venta no encontrada).');
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
    
    // ── Deduplicate by product_id ──
    // If multiple inventory rows exist for the same product, merge them (sum quantities, keep first ID)
    const deduped = new Map<string, any>();
    for (const row of items) {
      const pid = row.product_id;
      if (deduped.has(pid)) {
        const existing = deduped.get(pid);
        existing.quantity += row.quantity;
        existing._duplicateIds.push(row.id);
      } else {
        deduped.set(pid, { ...row, _duplicateIds: [] });
      }
    }
    
    return Array.from(deduped.values()).map(row => ({
      product_id: row.product_id,
      inventory_id: row.id,
      product_name: row.products?.name,
      product_code: row.products?.code,
      category: row.products?.category,
      brand: row.products?.brand,
      price: row.products?.price,
      cost: row.products?.cost,
      quantity: row.quantity,
      image_url: row.products?.image_url,
      description: row.products?.description,
      points: row.products?.points
    }));
  },
  /** Atomic increment of the caller's stock. Items: [{ product_id, quantity > 0 }] */
  add: async (items: { product_id: string; quantity: number }[]) => {
    const { error } = await supabase.rpc('add_stock', { p_items: items });
    if (error) throw error;
    return true;
  },
  /** Directly SET the quantity for a product in inventory (does NOT accumulate) */
  setQuantity: async (productId: string, newQty: number) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');
    const { data: existing } = await supabase
      .from('inventory')
      .select('id')
      .eq('product_id', productId)
      .eq('consultant_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from('inventory')
        .update({ quantity: newQty })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      throw new Error('El producto no está en tu inventario.');
    }
    return true;
  },
  applyAdjustment: async (data: { product_id: string; adjustment_type: string; quantity: number; previous_quantity: number; reason: string; notes?: string | null }) => {
    const userId = await getCurrentUserId();
    
    const { data: result, error } = await supabase.rpc('apply_inventory_adjustment', {
      p_consultant_id: userId,
      p_product_id: data.product_id,
      p_adjustment_type: data.adjustment_type,
      p_quantity: data.quantity,
      p_previous_quantity: data.previous_quantity,
      p_reason: data.reason,
      p_notes: data.notes || null
    });
    if (error) throw error;
    return result;
  },
  /** Merge duplicate inventory records for the current user */
  cleanupDuplicates: async () => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('inventory')
      .select('id, product_id, quantity, created_at')
      .eq('consultant_id', userId)
      .order('created_at', { ascending: true });
    
    if (error || !data) return 0;
    
    // Group by product_id
    const groups = new Map<string, any[]>();
    for (const row of data) {
      const pid = row.product_id;
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid)!.push(row);
    }
    
    let cleaned = 0;
    for (const [productId, rows] of groups) {
      if (rows.length <= 1) continue;
      
      // Keep the first record, sum all quantities into it
      const [keeper, ...duplicates] = rows;
      const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);
      
      // Update keeper with total quantity
      await supabase.from('inventory')
        .update({ quantity: totalQuantity })
        .eq('id', keeper.id);
      
      // Delete duplicates
      const dupIds = duplicates.map(d => d.id);
      await supabase.from('inventory')
        .delete()
        .in('id', dupIds);
      
      cleaned += duplicates.length;
    }
    
    return cleaned;
  },
  getAdjustments: async (limit: number = 50) => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('inventory_adjustments').select('*, products(*)').eq('consultant_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data.map(a => ({ ...a, product_name: a.products?.name }));
  },
  /** Links an EAN to a catalog product. Throws a 23505 error if the EAN is already linked. */
  addBarcode: async (input: { product_id: string; barcode: string }) => {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from('product_barcodes').insert({
      product_id: input.product_id,
      ean: input.barcode.trim(),
      created_by: userId
    });
    if (error) throw error;
    return true;
  },
  /** Bulk upsert of catalog products by code. Returns how many rows were saved / failed. */
  importProducts: async (rows: { code: string; name: string; brand?: string; category?: string | null; price?: number; cost?: number; points?: number; image_url?: string | null }[]) => {
    const valid = rows.filter(r => r.code && r.name);
    let errors = rows.length - valid.length;
    if (!valid.length) return { imported: 0, errors };
    // Do not overwrite an existing image with null
    const payload = valid.map(r => {
      const { image_url, ...rest } = r;
      return image_url ? { ...rest, image_url } : rest;
    });
    const { data, error } = await supabase.from('products').upsert(payload, { onConflict: 'code' }).select('id');
    if (error) throw error;
    const imported = data?.length || 0;
    errors += valid.length - imported;
    return { imported, errors };
  },
  getCategories: async () => {
    return ['Perfumería', 'Maquillaje', 'Rostro', 'Cuerpo', 'Cabello', 'Hombre'];
  }
};

// ─────────────────────────────────────────────
// Community / Mentorship (Stubs for direct data mapping)
// ─────────────────────────────────────────────
type ReactionType = 'love' | 'fire' | 'clap' | 'save';

export const community = {
  getPosts: async (topic?: string) => {
    const userId = await getCurrentUserId();
    let query = supabase.from('community_posts').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    if (topic && topic !== 'all') query = query.eq('topic', topic);
    const { data: posts, error } = await query;
    if (error) throw error;

    const ids = (posts || []).map(p => p.id);
    if (!ids.length) return [];

    const [{ data: reactions, error: rErr }, { data: comments, error: cErr }] = await Promise.all([
      supabase.from('community_reactions').select('post_id, user_id, reaction_type').in('post_id', ids),
      supabase.from('community_comments').select('post_id').in('post_id', ids)
    ]);
    if (rErr) throw rErr;
    if (cErr) throw cErr;

    const reactionCounts: Record<string, Record<string, number>> = {};
    const mine: Record<string, string[]> = {};
    for (const r of reactions || []) {
      (reactionCounts[r.post_id] ||= {})[r.reaction_type] = (reactionCounts[r.post_id]?.[r.reaction_type] || 0) + 1;
      if (r.user_id === userId) (mine[r.post_id] ||= []).push(r.reaction_type);
    }
    const commentCounts: Record<string, number> = {};
    for (const c of comments || []) commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;

    return (posts || []).map(p => ({
      ...p,
      reactions: reactionCounts[p.id] || {},
      user_reactions: mine[p.id] || [],
      likes: reactionCounts[p.id]?.love || 0,
      comments: commentCounts[p.id] || 0,
      comment_count: commentCounts[p.id] || 0
    }));
  },
  createPost: async (input: string | { content: string; topic?: string; author_name?: string }, topic: string = 'general') => {
    const content = (typeof input === 'string' ? input : input.content).trim();
    const finalTopic = (typeof input === 'string' ? topic : input.topic) || 'general';
    if (!content) throw new Error('El post no puede estar vacío');
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');
    const { data: profile } = await supabase.from('consultant_profiles').select('full_name').eq('id', userId).maybeSingle();

    const { data, error } = await supabase.from('community_posts').insert({
      author_id: userId,
      author_name: profile?.full_name || 'Consultor Natura',
      content,
      topic: finalTopic
    }).select().single();

    if (error) throw error;
    return data;
  },
  deletePost: async (id: string) => {
    const { error } = await supabase.from('community_posts').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
  /** Accepts (postId, type) or ({ post_id, reaction_type }). Returns true when added, false when removed. */
  toggleReaction: async (arg: string | { post_id: string; reaction_type?: string }, reactionType: string = 'love') => {
    const postId = typeof arg === 'string' ? arg : arg.post_id;
    const type = ((typeof arg === 'string' ? reactionType : arg.reaction_type) || 'love') as ReactionType;
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');

    const { data: existing, error: findErr } = await supabase.from('community_reactions')
      .select('id').eq('post_id', postId).eq('user_id', userId).eq('reaction_type', type).maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      const { error } = await supabase.from('community_reactions').delete().eq('id', existing.id);
      if (error) throw error;
      return false;
    }
    const { error } = await supabase.from('community_reactions').insert({ post_id: postId, user_id: userId, reaction_type: type });
    if (error) throw error;
    return true;
  },
  getComments: async (postId: string) => {
    const { data, error } = await supabase.from('community_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  createComment: async (arg: string | { post_id: string; content: string; author_name?: string }, content?: string) => {
    const postId = typeof arg === 'string' ? arg : arg.post_id;
    const text = ((typeof arg === 'string' ? content : arg.content) || '').trim();
    if (!text) throw new Error('El comentario no puede estar vacío');
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');
    const { data: profile } = await supabase.from('consultant_profiles').select('full_name').eq('id', userId).maybeSingle();
    const { error } = await supabase.from('community_comments').insert({
      post_id: postId,
      author_id: userId,
      author_name: profile?.full_name || 'Consultor Natura',
      content: text
    });
    if (error) throw error;
    return true;
  },
  getStats: async () => {
    const [posts, reactions, comments] = await Promise.all([
      supabase.from('community_posts').select('author_id, author_name'),
      supabase.from('community_reactions').select('id', { count: 'exact', head: true }),
      supabase.from('community_comments').select('id', { count: 'exact', head: true })
    ]);
    if (posts.error) throw posts.error;
    const byAuthor = new Map<string, { author_name: string; count: number }>();
    for (const p of posts.data || []) {
      const cur = byAuthor.get(p.author_id) || { author_name: p.author_name || 'Consultora', count: 0 };
      cur.count += 1;
      byAuthor.set(p.author_id, cur);
    }
    return {
      unique_authors: byAuthor.size,
      post_count: posts.data?.length || 0,
      reaction_count: reactions.count || 0,
      comment_count: comments.count || 0,
      top_contributors: [...byAuthor.values()].sort((a, b) => b.count - a.count).slice(0, 3)
    };
  }
};

export const mentorship = {
  getModules: async () => {
    const { data: modules, error: modError } = await supabase.from('mentorship_modules').select('*').order('sort_order', { ascending: true });
    if (modError) throw modError;

    const { data: lessons, error: lesError } = await supabase.from('mentorship_lessons').select('*').order('sort_order', { ascending: true });
    if (lesError) throw lesError;

    return (modules || []).map(m => ({
      ...m,
      lessons: (lessons || []).filter(l => l.module_id === m.id)
    }));
  },
  getSessions: async () => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('mentorship_sessions').select('*').eq('user_id', userId).order('session_date', { ascending: true });
    if (error) throw error;
    return data;
  },
  getProgress: async () => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('mentorship_progress').select('*').eq('user_id', userId);
    if (error) throw error;
    return data;
  },
  /** Marks (completed=true) or unmarks a lesson. Idempotent. */
  saveProgress: async (input: { lesson_id: string; completed: boolean; module_id?: string }) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user');
    if (input.completed) {
      const { error } = await supabase.from('mentorship_progress')
        .upsert({ user_id: userId, lesson_id: input.lesson_id }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('mentorship_progress').delete().eq('user_id', userId).eq('lesson_id', input.lesson_id);
      if (error) throw error;
    }
    return true;
  },
  completeLesson: async (lessonId: string) => mentorship.saveProgress({ lesson_id: lessonId, completed: true })
};

const api = {
  dashboard, consultant, products, customers, orders, inventory,
  community, mentorship, getCurrentUserId,
};
export default api;
