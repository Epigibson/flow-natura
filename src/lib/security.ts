/**
 * Escapes HTML special characters to prevent XSS.
 * This is safe for both text content and attribute values.
 */
export function esc(str: any): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes a URL by blocking dangerous protocols.
 * The result MUST still be escaped with esc() when used in an HTML attribute.
 */
export function sanitizeUrl(url: any): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return '';
  }
  return trimmed;
}
