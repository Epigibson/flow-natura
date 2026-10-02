/**
 * WhatsApp needs the international format without "+" or spaces.
 * Customers are stored as typed ("55 1234 5678"); 10-digit numbers are Mexican (+52).
 */
export function whatsappPhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return '52' + digits;
  // Legacy mobile format 52 1 XXXXXXXXXX -> 52 XXXXXXXXXX
  if (digits.length === 13 && digits.startsWith('521')) return '52' + digits.slice(3);
  return digits.length >= 11 ? digits : null;
}
