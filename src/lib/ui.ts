/**
 * Thin wrappers over the global Toast / ConfirmDialog mounted by DashboardLayout.
 * Use these instead of window.alert / window.confirm so every screen looks the same.
 */
type ToastType = 'success' | 'error' | 'warning' | 'info';

export const toast = {
  success: (m: string) => show('success', m),
  error: (m: string) => show('error', m),
  warning: (m: string) => show('warning', m),
  info: (m: string) => show('info', m),
};

function show(type: ToastType, message: string) {
  const t = (window as any).toast;
  if (t?.[type]) t[type](message);
  else console[type === 'error' ? 'error' : 'log'](message);
}

export interface ConfirmOptions {
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

/** Resolves true when the user confirms. Falls back to the browser dialog if the layout has none. */
export async function confirmAction(title: string, options: ConfirmOptions = {}): Promise<boolean> {
  const fn = (window as any).confirmDialog;
  if (typeof fn === 'function') return fn(title, options);
  return window.confirm(options.description ? `${title}\n\n${options.description}` : title);
}

import type { StatusChip, StatusTone } from './orders';

const CHIP_TONES: Record<StatusTone, string> = {
  success: 'bg-secondary-container/60 text-secondary',
  warning: 'bg-primary-fixed text-on-primary-fixed-variant',
  danger: 'bg-error-container text-error',
  neutral: 'bg-surface-container-highest text-on-surface-variant',
};

/** Status pill used by every order list/detail. `label` is escaped. */
export function chipHtml(chip: StatusChip): string {
  const label = chip.label.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return `<span class="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${CHIP_TONES[chip.tone]}">${label}</span>`;
}

export interface PaymentPromptInput {
  orderId: string;
  customerName: string;
  balance: number;
  suggested: number;
}

/**
 * Self-contained "Cobrar" dialog so a payment can be registered from any list
 * without opening the sale. Resolves true when a payment was saved.
 */
export function promptPayment(input: PaymentPromptInput): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'p-0 rounded-3xl shadow-2xl border-none backdrop:bg-on-surface/50 backdrop:backdrop-blur-sm m-auto w-full max-w-sm bg-transparent';
    const fmt = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const form = document.createElement('form');
    form.className = 'bg-surface-container-lowest p-8 rounded-3xl space-y-4 border border-outline-variant/20';
    form.innerHTML = `
      <h3 class="text-xl font-bold text-on-surface text-center">Registrar abono</h3>
      <p class="text-sm text-on-surface-variant text-center" data-role="who"></p>
      <div class="bg-surface-container rounded-2xl p-4">
        <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Monto a cobrar</label>
        <div class="flex items-center gap-1 border-b border-primary/30 focus-within:border-primary pb-1 mt-1">
          <span class="text-primary font-black text-xl">$</span>
          <input data-role="amount" type="number" inputmode="decimal" step="0.01" min="0.01" class="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-primary font-black text-2xl p-0" />
        </div>
      </div>
      <p class="hidden text-sm font-semibold text-error" data-role="error"></p>
      <div class="flex gap-3">
        <button type="button" data-role="cancel" class="flex-1 py-3 rounded-xl bg-surface-container font-bold">Cancelar</button>
        <button type="submit" data-role="save" class="flex-1 py-3 rounded-xl bg-primary text-white font-bold">Cobrar</button>
      </div>`;
    (form.querySelector('[data-role="who"]') as HTMLElement).textContent = `${input.customerName} · saldo ${fmt(input.balance)}`;
    const amount = form.querySelector('[data-role="amount"]') as HTMLInputElement;
    const error = form.querySelector('[data-role="error"]') as HTMLElement;
    const save = form.querySelector('[data-role="save"]') as HTMLButtonElement;
    amount.value = input.suggested.toFixed(2);
    amount.max = input.balance.toFixed(2);
    dlg.appendChild(form);
    document.body.appendChild(dlg);

    let saved = false;
    const finish = () => { dlg.close(); };
    dlg.addEventListener('close', () => { dlg.remove(); resolve(saved); });
    form.querySelector('[data-role="cancel"]')!.addEventListener('click', finish);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = Number(amount.value);
      error.classList.add('hidden');
      if (!Number.isFinite(value) || value <= 0) { error.textContent = 'Ingresa un monto mayor a 0.'; error.classList.remove('hidden'); return; }
      if (value > input.balance + 0.005) { error.textContent = `El monto no puede ser mayor al saldo (${fmt(input.balance)}).`; error.classList.remove('hidden'); return; }
      save.disabled = true;
      save.textContent = 'Guardando...';
      try {
        const { default: api } = await import('./api');
        await api.orders.addPayment(input.orderId, value);
        saved = true;
        toast.success(`Abono de ${fmt(value)} registrado`);
        finish();
      } catch (err: any) {
        error.textContent = err?.message || 'No se pudo registrar el abono.';
        error.classList.remove('hidden');
        save.disabled = false;
        save.textContent = 'Cobrar';
      }
    });

    dlg.showModal();
    amount.select();
  });
}
