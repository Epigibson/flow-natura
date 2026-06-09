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
    const { data, error } = await supabase.from('consultant_profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },
  updateProfile: async (updates: any) => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('consultant_profiles').upsert({ id: userId, ...updates }).select().single();
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
  create: async (data: any) => {
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
    const { data: res, error } = await supabase.from('products').update(data).eq('id', id).select().single();
    if (error) throw error;
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
    const userId = await getCurrentUserId();
    
    // Fetch order items to restore inventory
    const { data: order } = await supabase.from('orders').select('status, order_items(product_id, quantity)').eq('id', id).single();
    if (order && order.status !== 'cancelled') {
      for (const item of (order.order_items || [])) {
        // Atomic inventory restore: increment quantity directly in SQL
        // This avoids the read-then-write race condition
        const { error: restoreError } = await supabase.rpc('restore_inventory_on_cancel', {
          p_consultant_id: userId,
          p_product_id: item.product_id,
          p_quantity: item.quantity
        });
        // Fallback: if RPC doesn't exist yet, use read-then-write
        if (restoreError?.code === '42883') {
          const { data: inv } = await supabase.from('inventory')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .eq('consultant_id', userId)
            .single();
          if (inv) {
            await supabase.from('inventory')
              .update({ quantity: inv.quantity + item.quantity })
              .eq('id', inv.id);
          }
        }
      }
    }

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
      brand: row.products?.brand,
      price: row.products?.price,
      cost: row.products?.cost,
      quantity: row.quantity,
      image_url: row.products?.image_url,
      description: row.products?.description,
      points: row.products?.points
    }));
  },
  add: async (items: any[]) => {
    const userId = await getCurrentUserId();
    for (const item of items) {
      const { data: existing } = await supabase.from('inventory').select('id, quantity').eq('product_id', item.product_id).eq('consultant_id', userId).maybeSingle();
      if (existing) {
        await supabase.from('inventory').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id);
      } else {
        await supabase.from('inventory').insert({ product_id: item.product_id, quantity: item.quantity, consultant_id: userId });
      }
    }
    return true;
  },
  applyAdjustment: async (data: { product_id: string; adjustment_type: string; quantity: number; previous_quantity: number; reason: string; notes?: string }) => {
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
  getPosts: async () => {
    // Left join with comments and reactions to get counts (for now we'll fetch them separately or do a simple select if views aren't set up)
    // To keep it fast, we'll fetch posts and then count reactions/comments. In production, a Supabase View is better.
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // For MVP, we'll return posts with 0 likes/comments if we don't have the counts grouped.
    // Let's fetch all reactions and comments to calculate.
    const { data: reactions } = await supabase.from('community_reactions').select('post_id');
    const { data: comments } = await supabase.from('community_comments').select('post_id');
    
    const reactionCounts = (reactions || []).reduce((acc: any, curr) => {
      acc[curr.post_id] = (acc[curr.post_id] || 0) + 1;
      return acc;
    }, {});
    
    const commentCounts = (comments || []).reduce((acc: any, curr) => {
      acc[curr.post_id] = (acc[curr.post_id] || 0) + 1;
      return acc;
    }, {});

    return (posts || []).map(p => ({
      ...p,
      likes: reactionCounts[p.id] || 0,
      comments: commentCounts[p.id] || 0
    }));
  },
  createPost: async (content: string, topic: string = 'general') => {
    const userId = await getCurrentUserId();
    const { data: profile } = await supabase.from('consultant_profiles').select('full_name').eq('id', userId).single();
    
    const { data, error } = await supabase.from('community_posts').insert({
      author_id: userId,
      author_name: profile?.full_name || 'Consultor Natura',
      content,
      topic
    }).select().single();
    
    if (error) throw error;
    return data;
  },
  deletePost: async (id: string) => {
    const { error } = await supabase.from('community_posts').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
  toggleReaction: async (postId: string, reactionType: string = 'love') => {
    const userId = await getCurrentUserId();
    const { data: existing } = await supabase.from('community_reactions')
      .select('id').eq('post_id', postId).eq('user_id', userId).eq('reaction_type', reactionType).maybeSingle();
      
    if (existing) {
      await supabase.from('community_reactions').delete().eq('id', existing.id);
      return false; // Removed
    } else {
      await supabase.from('community_reactions').insert({ post_id: postId, user_id: userId, reaction_type: reactionType });
      return true; // Added
    }
  },
  getComments: async (postId: string) => {
    const { data, error } = await supabase.from('community_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  createComment: async (postId: string, content: string) => {
    const userId = await getCurrentUserId();
    const { data: profile } = await supabase.from('consultant_profiles').select('full_name').eq('id', userId).single();
    const { error } = await supabase.from('community_comments').insert({
      post_id: postId,
      author_id: userId,
      author_name: profile?.full_name || 'Consultor Natura',
      content
    });
    if (error) throw error;
    return true;
  },
  getStats: async () => ({})
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
  }
};

const api = {
  dashboard, consultant, products, customers, orders, inventory,
  community, mentorship, getCurrentUserId,
};
export default api;
