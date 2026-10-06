/**
 * Shared sales report: one query + one calculation used by web (/reportes) and mobile.
 * Money definitions (kept identical on both platforms):
 *  - Ventas      = total_amount of non-cancelled orders created in the period
 *  - Cobrado     = payments received in the period (any order)
 *  - Por cobrar  = open balance of the orders created in the period
 *  - Tasa cobro  = (Ventas - Por cobrar) / Ventas
 */
import { supabase } from './supabase';
import { summarizeOrder } from './orders';

export type ReportPeriod = 'month' | '3months' | '6months' | 'year' | 'all';

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'month', label: 'Este mes' },
  { value: '3months', label: 'Últimos 3 meses' },
  { value: '6months', label: 'Últimos 6 meses' },
  { value: 'year', label: 'Este año' },
  { value: 'all', label: 'Todo' },
];

export function periodStart(period: ReportPeriod, now = new Date()): Date {
  switch (period) {
    case '3months': return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case '6months': return new Date(now.getFullYear(), now.getMonth() - 6, 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    case 'all': return new Date(2020, 0, 1);
    default: return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

export interface ReportData {
  kpis: {
    revenue: number;
    orders: number;
    avgTicket: number;
    newClients: number;
    collected: number;
    pending: number;
    collectionRate: number;
  };
  /** Last 14 days with sales: [label, amount] */
  daily: { label: string; amount: number }[];
  categories: { name: string; amount: number; pct: number }[];
  methods: { name: 'Contado' | 'Abonos'; amount: number; count: number; pct: number }[];
  reorder: { productId: string; name: string; sold: number; stock: number }[];
  clientPredictions: { customerId: string; name: string; daysSince: number; avgDays: number; overdue: boolean }[];
}

const DAY_MS = 86_400_000;

export async function loadReport(period: ReportPeriod): Promise<ReportData> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('No user');

  const now = new Date();
  const start = periodStart(period, now);
  // Purchase-frequency predictions need history beyond a short period
  const historyStart = new Date(Math.min(start.getTime(), now.getTime() - 365 * DAY_MS));

  const [ordersRes, customersRes, paymentsRes, inventoryRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, customer_id, total_amount, status, payment_method, installments, created_at, customers(full_name), order_items(product_id, quantity, unit_price, products(name, category)), order_payments(id, amount, kind, paid_at)')
      .eq('consultant_id', userId)
      .neq('status', 'cancelled')
      .gte('created_at', historyStart.toISOString()),
    supabase.from('customers').select('id, created_at').eq('consultant_id', userId).gte('created_at', start.toISOString()),
    supabase
      .from('order_payments')
      .select('amount, paid_at, orders!inner(status)')
      .eq('consultant_id', userId)
      .neq('orders.status', 'cancelled')
      .gte('paid_at', start.toISOString()),
    supabase.from('inventory').select('product_id, quantity').eq('consultant_id', userId),
  ]);
  for (const r of [ordersRes, customersRes, paymentsRes, inventoryRes]) if (r.error) throw r.error;

  const history = (ordersRes.data || []) as any[];
  const valid = history.filter(o => new Date(o.created_at) >= start);

  const revenue = valid.reduce((s, o) => s + Number(o.total_amount), 0);
  const pending = valid.reduce((s, o) => s + summarizeOrder(o).balance, 0);
  const collected = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  // Daily (last 14 days that have sales)
  const byDay = new Map<string, { label: string; amount: number }>();
  [...valid].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(o => {
    const d = new Date(o.created_at);
    const key = d.toISOString().slice(0, 10);
    const cur = byDay.get(key) || { label: d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), amount: 0 };
    cur.amount += Number(o.total_amount);
    byDay.set(key, cur);
  });
  const daily = [...byDay.values()].slice(-14);

  // Categories (by item value)
  const cat = new Map<string, number>();
  valid.forEach(o => (o.order_items || []).forEach((i: any) => {
    const name = i.products?.category || 'Sin categoría';
    cat.set(name, (cat.get(name) || 0) + i.quantity * Number(i.unit_price));
  }));
  const catTotal = [...cat.values()].reduce((a, b) => a + b, 0) || 1;
  const categories = [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount, pct: (amount / catTotal) * 100 }));

  // Payment methods
  const abonos = valid.filter(o => (o.payment_method || '').toLowerCase() === 'abonos');
  const contado = valid.filter(o => (o.payment_method || '').toLowerCase() !== 'abonos');
  const abonoAmount = abonos.reduce((s, o) => s + Number(o.total_amount), 0);
  const contadoAmount = contado.reduce((s, o) => s + Number(o.total_amount), 0);
  const payTotal = abonoAmount + contadoAmount || 1;
  const methods: ReportData['methods'] = [
    { name: 'Contado', amount: contadoAmount, count: contado.length, pct: (contadoAmount / payTotal) * 100 },
    { name: 'Abonos', amount: abonoAmount, count: abonos.length, pct: (abonoAmount / payTotal) * 100 },
  ];

  // Reorder suggestions: stock <= 30% of what sold in the period
  const stockByProduct = new Map<string, number>();
  (inventoryRes.data || []).forEach((i: any) => stockByProduct.set(i.product_id, (stockByProduct.get(i.product_id) || 0) + i.quantity));
  const sold = new Map<string, { name: string; sold: number }>();
  valid.forEach(o => (o.order_items || []).forEach((i: any) => {
    const cur = sold.get(i.product_id) || { name: i.products?.name || 'Producto', sold: 0 };
    cur.sold += i.quantity;
    sold.set(i.product_id, cur);
  }));
  const reorder = [...sold.entries()]
    .map(([productId, d]) => ({ productId, name: d.name, sold: d.sold, stock: stockByProduct.get(productId) || 0 }))
    .filter(p => p.stock <= p.sold * 0.3)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);

  // Client repurchase predictions (uses the 12-month history)
  const perClient = new Map<string, { name: string; dates: number[] }>();
  history.forEach(o => {
    const cur: { name: string; dates: number[] } = perClient.get(o.customer_id) || { name: o.customers?.full_name || 'Cliente', dates: [] as number[] };
    cur.dates.push(new Date(o.created_at).getTime());
    perClient.set(o.customer_id, cur);
  });
  const clientPredictions = [...perClient.entries()]
    .filter(([, c]) => c.name !== 'Cliente Mostrador')
    .map(([customerId, c]) => {
      const dates = c.dates.sort((a, b) => a - b);
      const avgDays = dates.length >= 2
        ? (dates[dates.length - 1] - dates[0]) / DAY_MS / (dates.length - 1)
        : 30;
      const daysSince = (now.getTime() - dates[dates.length - 1]) / DAY_MS;
      return { customerId, name: c.name, daysSince, avgDays, overdue: daysSince > avgDays };
    })
    .filter(c => c.daysSince > c.avgDays * 0.8)
    .sort((a, b) => b.daysSince / b.avgDays - a.daysSince / a.avgDays)
    .slice(0, 5);

  return {
    kpis: {
      revenue,
      orders: valid.length,
      avgTicket: valid.length ? revenue / valid.length : 0,
      newClients: customersRes.data?.length || 0,
      collected,
      pending,
      collectionRate: revenue > 0 ? Math.max(0, Math.min(100, ((revenue - pending) / revenue) * 100)) : 0,
    },
    daily, categories, methods, reorder, clientPredictions,
  };
}
