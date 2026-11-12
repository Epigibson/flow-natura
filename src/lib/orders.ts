/**
 * Single source of truth for sale / payment math.
 * Payments live in the `order_payments` table (see migration 20261001000000);
 * orders.notes is plain user text and never holds payment data.
 */

export type PaymentKind = 'contado' | 'enganche' | 'abono';

export interface OrderPayment {
  id: string;
  amount: number | string;
  kind: PaymentKind;
  paid_at: string;
}

export interface OrderLike {
  total_amount: number | string;
  status: string;
  payment_method?: string | null;
  installments?: number | null;
  frequency?: string | null;
  order_payments?: OrderPayment[] | null;
}

export interface OrderSummary {
  total: number;
  paid: number;
  balance: number;
  enganche: number;
  isAbonos: boolean;
  isCancelled: boolean;
  isFullyPaid: boolean;
  installments: number;
  /** Suggested next abono: one installment, never more than the balance. */
  suggestedPayment: number;
  payments: OrderPayment[];
}

/** Amounts are cents-accurate; compare with this tolerance. */
export const MONEY_EPSILON = 0.005;

/** Default payment frequency for abonos (web + mobile). */
export const DEFAULT_FREQUENCY = 'Semanal';

/** Inventory adjustment reasons (value = DB code, label = short display label). */
export const ADJUSTMENT_REASONS: { value: string; label: string }[] = [
  { value: 'restock', label: 'Reposición' },
  { value: 'return', label: 'Devolución' },
  { value: 'damaged', label: 'Envase dañado' },
  { value: 'demo', label: 'Demostración' },
  { value: 'personal', label: 'Uso personal' },
  { value: 'incentive', label: 'Incentivo cliente' },
  { value: 'count', label: 'Conteo cíclico' },
  { value: 'expired', label: 'Producto vencido' },
  { value: 'other', label: 'Otro' },
];

export function summarizeOrder(order: OrderLike): OrderSummary {
  const payments = [...(order.order_payments || [])].sort(
    (a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()
  );
  const total = Number(order.total_amount) || 0;
  const paid = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const isCancelled = order.status === 'cancelled';
  const balance = isCancelled ? 0 : Math.max(total - paid, 0);
  const enganche = payments
    .filter((p) => p.kind === 'enganche')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const installments = Math.max(1, Number(order.installments) || 1);
  const perInstallment = Math.max(total - enganche, 0) / installments;

  return {
    total,
    paid,
    balance,
    enganche,
    isAbonos: (order.payment_method || '').toLowerCase() === 'abonos',
    isCancelled,
    isFullyPaid: balance <= MONEY_EPSILON,
    installments,
    suggestedPayment: Math.min(balance, perInstallment),
    payments,
  };
}

export function formatMoney(n: number): string {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parses a user-typed amount ("1,250.50"); returns NaN when invalid. */
export function parseAmount(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** Postgres/PostgREST errors carry the RAISE EXCEPTION text in `message`. */
export function errorMessage(e: unknown, fallback = 'Error desconocido'): string {
  const msg = (e as any)?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

/** Same folio everywhere (web, mobile, WhatsApp tickets): NF-XXXXXXXX */
export function formatFolio(id: string): string {
  return 'NF-' + String(id).split('-')[0].toUpperCase();
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface StatusChip { label: string; tone: StatusTone }

/**
 * Two independent dimensions, always shown the same way:
 *  - delivery: Pendiente de entrega / Entregada / Cancelada
 *  - payment:  Pagada / Con saldo (null when cancelled)
 */
export function orderStatusChips(order: OrderLike): { delivery: StatusChip; payment: StatusChip | null } {
  const sum = summarizeOrder(order);
  const delivery: StatusChip =
    order.status === 'cancelled' ? { label: 'Cancelada', tone: 'danger' }
    : order.status === 'delivered' ? { label: 'Entregada', tone: 'success' }
    : { label: 'Pendiente de entrega', tone: 'warning' };
  const payment: StatusChip | null = sum.isCancelled ? null
    : sum.isFullyPaid ? { label: 'Pagada', tone: 'success' }
    : { label: 'Con saldo ' + formatMoney(sum.balance), tone: 'warning' };
  return { delivery, payment };
}

/** WhatsApp ticket text sent from the sale detail (identical on web and mobile). */
export function buildTicketMessage(order: any, sum: any, customerName: string): string {
  const s: OrderSummary = sum || summarizeOrder(order);
  const total = Number(order.total_amount) || 0;

  let message = '¡Hola ' + customerName + '! 👋 Espero que estés teniendo un excelente día.\n\n';
  message += 'Te comparto el detalle de tu compra 🛍️:\n\n';
  message += '🏷️ *Total de la compra:* $' + total.toFixed(2) + ' MXN\n';

  if (s.isAbonos || s.paid < total) {
    message += '💸 *Llevas pagado:* $' + s.paid.toFixed(2) + ' MXN\n';
    if (!s.isFullyPaid) message += '📌 *Saldo pendiente:* $' + s.balance.toFixed(2) + ' MXN\n';
    else message += '✨ ¡Tu cuenta ya está totalmente pagada! 🎉\n';
  } else {
    message += '✨ ¡Tu compra fue de contado y ya está totalmente pagada! 🎉\n';
  }

  message += '\n';

  if (order.status === 'delivered') {
    if (s.isFullyPaid) {
      message += 'Tu pedido ya fue entregado. ¡Espero que lo disfrutes mucho! 🥰\n\n';
    } else {
      message += '✅ *Pedido Entregado* 🌿\n\n';
    }
  } else {
    message += 'Tu pedido está *Pendiente de Entrega*. Te avisaré en cuanto lo tenga listo para entregártelo. 🌿\n\n';
  }

  message += '¡Muchísimas gracias por tu confianza! Cualquier duda, aquí estoy a la orden. ✨';
  message += '\n\n_(Folio: #' + formatFolio(String(order.id)) + ')_';
  return message;
}
