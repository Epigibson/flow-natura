/** Public catalog link: the web reads the consultant id from `?c=`. */
export function catalogUrl(baseUrl: string, consultantId?: string | null): string {
  const base = baseUrl.replace(/\/+$/, '');
  return consultantId ? `${base}/catalogo?c=${encodeURIComponent(consultantId)}` : `${base}/catalogo`;
}
