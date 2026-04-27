/**
 * POST /api/enhance-product-image
 *
 * Multi-strategy image enhancement pipeline:
 *
 * Strategy 1: Imagen 4 Background Removal (if user provided a photo)
 *   → Uses BKG_REMOVAL edit mode to cleanly remove background
 *   → Uploads the result to Supabase Storage
 *
 * Strategy 2: Gemini 2.5 Flash Image (fallback if Imagen fails)
 *   → Uses native image generation to recreate the product on white background
 *   → Uploads the result to Supabase Storage
 *
 * Strategy 3: Gemini Text Search (if no photo, or both image strategies fail)
 *   → Uses Gemini to identify the product and find official catalog image URL
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../../lib/api-auth';
import { getServiceSupabase } from '../../lib/supabase-server';

/** Upload a base64 image to Supabase Storage and return the public URL */
async function uploadToStorage(base64Data: string, mimeType: string, prefix = 'enhanced'): Promise<string | null> {
  try {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const supabase = getServiceSupabase();
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = `${prefix}_${Date.now()}.${ext}`;
    const filePath = `user-uploads/${fileName}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(filePath, bytes, { contentType: mimeType, upsert: true });

    if (error) {
      console.warn(`[enhance] Storage upload failed:`, error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  } catch (e) {
    console.warn('[enhance] Upload error:', e);
    return null;
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Auth guard
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Falta GEMINI_API_KEY' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    let { imageBase64, mimeType = 'image/jpeg', productName, productCode, productDesc, imageUrl } = body;

    if (!imageBase64 && !imageUrl && !productName && !productDesc) {
      return new Response(JSON.stringify({ error: 'Se requiere imageBase64, imageUrl, productName o productDesc' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Download image if URL was provided instead of base64
    if (imageUrl && !imageBase64) {
      try {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error('No se pudo descargar la imagen');
        const buffer = await imgRes.arrayBuffer();
        imageBase64 = Buffer.from(buffer).toString('base64');
        mimeType = imgRes.headers.get('content-type') || mimeType;
      } catch (e) {
        console.warn('[enhance] Could not fetch imageUrl, proceeding text-only:', e);
      }
    }

    // ═══════════ STRATEGY 1: Imagen 4 Background Removal ═══════════
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      try {
        console.log('[enhance] Attempting Imagen 4 BKG_REMOVAL...');
        const response = await ai.models.generateImages({
          model: 'imagen-4.0-fast-generate-001',
          prompt: 'the exact original foreground subject, keeping all its exact original pixels, texts, and original packaging identical',
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            sourceImage: {
              imageBytes: cleanBase64,
              mimeType: mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
            },
            editConfig: {
              editMode: 'BKG_REMOVAL'
            }
          } as any
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
          const generatedBase64 = response.generatedImages[0].image?.imageBytes;
          if (generatedBase64) {
            const publicUrl = await uploadToStorage(generatedBase64, 'image/png', 'bkg_removed');

            return new Response(JSON.stringify({
              identified_name: productName || 'Producto Editado con IA',
              identified_code: productCode || null,
              suggested_image_url: publicUrl,
              image_base64: `data:image/png;base64,${generatedBase64}`,
              confidence: 'high',
              strategy: 'imagen_bkg_removal',
              notes: 'Fondo removido exitosamente con Imagen 4 sin alterar el producto original.',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
        console.warn('[enhance] Imagen 4 returned no images');
      } catch (err: any) {
        console.warn('[enhance] Imagen 4 BKG_REMOVAL failed:', err.message || err);
      }

      // ═══════════ STRATEGY 2: Gemini Native Image Generation ═══════════
      try {
        console.log('[enhance] Falling back to Gemini 2.5 Flash Image...');
        const prompt = `Look at this photo of a cosmetics/beauty product. Generate a CLEAN, PROFESSIONAL product photograph:
- Pure white background (#FFFFFF), no shadows on background
- Same exact product, same packaging, logos, and text — do NOT change any detail
- Soft studio lighting, product centered, 3/4 angle
- E-commerce catalog quality, like Amazon or Natura.com.mx listings
- If it's a kit/set, show box AND items arranged professionally
${productName ? `\nThe product is: "${productName}"` : ''}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: cleanBase64 } },
            ],
          }],
          config: { responseModalities: ['IMAGE', 'TEXT'] },
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
          const parts = candidates[0].content?.parts || [];
          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              const genMime = part.inlineData.mimeType || 'image/png';
              const publicUrl = await uploadToStorage(part.inlineData.data, genMime, 'ai_studio');

              return new Response(JSON.stringify({
                identified_name: productName || 'Producto generado con IA',
                identified_code: productCode || null,
                suggested_image_url: publicUrl,
                image_base64: `data:${genMime};base64,${part.inlineData.data}`,
                confidence: 'medium',
                strategy: 'gemini_image_gen',
                notes: 'Imagen profesional generada con Gemini IA.',
              }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
          }
        }
        console.warn('[enhance] Gemini image gen returned no image');
      } catch (err: any) {
        console.warn('[enhance] Gemini image gen failed:', err.message || err);
      }
    }

    // ═══════════ STRATEGY 3: Text-based catalog search ═══════════
    const context = [
      productName ? `Nombre del producto: "${productName}"` : '',
      productCode ? `Código: ${productCode}` : '',
      productDesc ? `Descripción: "${productDesc}"` : '',
    ].filter(Boolean).join('. ');

    const parts: any[] = [{
      text: `Eres un experto en productos de belleza de Natura y Avon.
Contexto: ${context}

Tu tarea:
1. Identifica el producto EXACTO de Natura (nombre completo, código si es posible).
2. Busca la URL de la imagen oficial de estudio en el CDN de Natura: https://gspstatic.natura.com/static/MX/producto/500x500/
   Formato típico: .../500x500/XXXXX.jpg donde XXXXX es el código de 5 dígitos.
3. Si no puedes encontrar la URL exacta, devuelve null.

Responde EXCLUSIVAMENTE en JSON:
{
  "identified_name": "nombre completo real del producto",
  "identified_code": "código de 5 dígitos o null",
  "suggested_image_url": "URL del CDN o null",
  "confidence": "high" | "medium" | "low",
  "notes": "explicación breve"
}
NO incluyas markdown, SOLO JSON crudo.`
    }];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({ inlineData: { data: cleanBase64, mimeType } });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.1 },
    });

    const responseText = (response.text || '').trim();

    let jsonStr = responseText;
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let result;
    try {
      result = JSON.parse(jsonStr.trim());
      result.strategy = 'text_catalog_search';
    } catch {
      result = { identified_name: null, suggested_image_url: null, confidence: 'low', strategy: 'text_catalog_search', notes: responseText };
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[enhance] Unhandled error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Error del servidor' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
