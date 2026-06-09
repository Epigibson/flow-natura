/**
 * POST /api/enhance-product-image
 *
 * Multi-strategy image enhancement pipeline:
 *
 * Strategy 1a: Gemini 3 Pro Image (best quality, primary)
 *   → Premium model for high-fidelity product photos with accurate text/logos
 *
 * Strategy 1b: Gemini 3.1 Flash Image (fallback if Pro fails)
 *   → Fast, cost-effective alternative with good quality
 *
 * Strategy 2: Imagen 4 Background Removal (fallback if Gemini fails)
 *   → Uses BKG_REMOVAL edit mode to cleanly remove background
 *   → Note: produces lower quality results for angled/cluttered photos
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

    // ═══════════ STRATEGY 1: Gemini Native Image Generation (with fallback) ═══════════
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      // Pro (best quality) → Flash (fast fallback)
      const IMAGE_MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image'];

      for (const model of IMAGE_MODELS) {
        try {
          const prompt = `Remove the background from this product photo and place the product on a pure white background. This is for an e-commerce product listing.

STRICT RULES:
- The background MUST be pure white (#FFFFFF). Nothing else. No colors, no gradients, no textures, no patterns, no decorations
- Do NOT add any branding elements, logos, medallions, ribbons, or watermarks that are not already on the product itself
- Do NOT add any surface, table, reflection, or shadow on the background
- Only a very subtle contact shadow directly under the product base is acceptable
- Product must be front-facing, centered, filling about 75% of the frame height
- If the product has a box or packaging visible in the photo, include it

FIDELITY:
- Keep the EXACT same product — do not change, redesign, or reimagine it
- Preserve all text, labels, logos on the product packaging exactly as they appear
- Match the original colors precisely
- Keep proportions, shape, and cap orientation identical

OUTPUT: Square 1:1, sharp focus, white background only
${productName ? `\nThe product is: "${productName}"` : ''}`;

          const response = await ai.models.generateContent({
            model,
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
                  confidence: 'high',
                  strategy: `gemini_image_gen_${model.includes('pro') ? 'pro' : 'flash'}`,
                  notes: `Imagen profesional generada con ${model.includes('pro') ? 'Gemini Pro' : 'Gemini Flash'}.`,
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
            }
          }
          console.warn(`[enhance] ${model} returned no image`);
        } catch (err: any) {
          console.warn(`[enhance] ${model} failed:`, err.message || err);
        }
      }

      // ═══════════ STRATEGY 2: Imagen 4 Background Removal (fallback) ═══════════
      try {

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
              confidence: 'medium',
              strategy: 'imagen_bkg_removal',
              notes: 'Fondo removido con Imagen 4.',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
        console.warn('[enhance] Imagen 4 returned no images');
      } catch (err: any) {
        console.warn('[enhance] Imagen 4 BKG_REMOVAL failed:', err.message || err);
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
      model: 'gemini-3.5-flash',
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
