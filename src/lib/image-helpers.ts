/**
 * Image Helpers — Canvas-based image utilities and upload functions
 * shared across inventory pages (edit, create, etc.)
 */

import { authFetch } from './auth-fetch';

/**
 * Detect and crop black letterbox bars from an image using Canvas API.
 * Returns a base64 JPEG of the cropped image with white background.
 */
export function cropBlackBars(imageSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      const threshold = 35;
      const isDark = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        return data[i] < threshold && data[i + 1] < threshold && data[i + 2] < threshold;
      };

      // Scan edges for dark columns/rows
      let left = 0;
      for (let x = 0; x < w * 0.4; x++) {
        let darkCount = 0;
        for (let y = 0; y < h; y += 3) { if (isDark(x, y)) darkCount++; }
        if (darkCount > h / 3 / 2) left = x + 1; else break;
      }
      let right = w;
      for (let x = w - 1; x > w * 0.6; x--) {
        let darkCount = 0;
        for (let y = 0; y < h; y += 3) { if (isDark(x, y)) darkCount++; }
        if (darkCount > h / 3 / 2) right = x; else break;
      }
      let top = 0;
      for (let y = 0; y < h * 0.4; y++) {
        let darkCount = 0;
        for (let x = 0; x < w; x += 3) { if (isDark(x, y)) darkCount++; }
        if (darkCount > w / 3 / 2) top = y + 1; else break;
      }
      let bottom = h;
      for (let y = h - 1; y > h * 0.6; y--) {
        let darkCount = 0;
        for (let x = 0; x < w; x += 3) { if (isDark(x, y)) darkCount++; }
        if (darkCount > w / 3 / 2) bottom = y; else break;
      }

      const cropW = right - left;
      const cropH = bottom - top;

      const out = document.createElement('canvas');
      if (cropW > 50 && cropH > 50 && !(left === 0 && right === w && top === 0 && bottom === h)) {
        out.width = cropW;
        out.height = cropH;
        const outCtx = out.getContext('2d')!;
        outCtx.fillStyle = '#FFFFFF';
        outCtx.fillRect(0, 0, out.width, out.height);
        outCtx.drawImage(img, left, top, cropW, cropH, 0, 0, cropW, cropH);
      } else {
        out.width = w;
        out.height = h;
        const outCtx = out.getContext('2d')!;
        outCtx.drawImage(img, 0, 0);
      }

      resolve(out.toDataURL('image/jpeg', 0.95));
    };

    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = imageSrc;
  });
}

/**
 * Upload a base64 image to Supabase Storage via the upload API.
 * Returns the public URL of the uploaded image, or null on failure.
 */
export async function uploadBase64Image(
  base64: string,
  fileName: string,
  mimeType: string = 'image/jpeg'
): Promise<string | null> {
  try {
    const res = await authFetch('/api/upload-product-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, fileName, mimeType }),
    });
    const data = await res.json();
    return data.url || null;
  } catch {
    console.warn('[image-helpers] Upload failed');
    return null;
  }
}

/**
 * Process "Fondo Blanco": crop black bars → send to Gemini for professional enhancement.
 * Returns the final image URL or base64 preview.
 */
export async function processWhiteBackground(
  imageSrc: string,
  productName?: string,
  onProgress?: (step: string) => void
): Promise<{ url?: string; base64?: string; error?: string }> {
  try {
    // Step 1: Canvas crop
    onProgress?.('Paso 1/2: Recortando bordes oscuros...');
    const croppedBase64 = await cropBlackBars(imageSrc);

    // Step 2: Send to Gemini for professional enhancement
    onProgress?.('Paso 2/2: Generando foto profesional con IA...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await authFetch('/api/gemini-generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: croppedBase64,
        mimeType: 'image/jpeg',
        productName: productName || undefined,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await res.json();

    if (result.imageUrl) {
      return { url: result.imageUrl, base64: result.imageBase64 };
    } else if (result.imageBase64) {
      return { base64: result.imageBase64 };
    }

    // Fallback: upload the canvas-cropped version
    const fallbackUrl = await uploadBase64Image(croppedBase64, `whitebg_${Date.now()}.jpg`);
    return fallbackUrl ? { url: fallbackUrl } : { base64: croppedBase64 };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { error: 'La generación tardó demasiado (30s). Intenta de nuevo.' };
    }
    return { error: err.message || 'Error procesando imagen' };
  }
}
