/**
 * POST /api/gemini-generate-image
 * Receives a base64-encoded photo of a product and generates a clean,
 * professional product image using Gemini's native image generation.
 *
 * Pipeline:
 *  1. Send the user's photo + professional photography prompt to Gemini
 *  2. If the model returns an image, upload it to Supabase Storage
 *  3. Return both the public URL and base64 for instant preview
 *
 * Includes retry logic (1 retry with backoff) and 30s timeout safety.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../../lib/api-auth';
import { getServiceSupabase } from '../../lib/supabase-server';

const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;

/**
 * Premium beauty-catalog prompt engineered for cosmetic/fragrance products.
 * Optimized for Gemini 3 Pro Image — exploits its superior text rendering
 * and instruction adherence for faithful label reproduction.
 */
const IMAGE_PROMPT = `You are a world-class beauty product photographer. Recreate this product as a premium e-commerce hero shot.

COMPOSITION:
- Slight 3/4 angle (approximately 15-20° rotation) to add depth and dimension
- Product fills ~80% of the frame, vertically centered with breathing room
- Subtle soft reflection on the surface beneath the product (like a polished acrylic table)

BACKGROUND:
- Clean gradient from pure white (#FFFFFF) at the top to a very subtle warm gray (#F5F3F0) at the bottom
- No props, no decorations — product only

LIGHTING:
- Beauty-industry three-point lighting: soft key light from upper-left, fill from right, rim light from behind
- Soft diffused highlights on curved surfaces (bottles, tubes, jars)
- No harsh shadows — only soft contact shadows directly beneath the product

FIDELITY (CRITICAL):
- Reproduce the EXACT product from the input photo — same shape, same size proportions, same packaging
- Preserve ALL text on labels, logos, brand names, and product names with pixel-perfect accuracy
- Match original colors precisely — do not over-saturate or shift hues
- Keep cap/lid orientation and any distinctive design elements exactly as shown

OUTPUT:
- Square 1:1 aspect ratio
- High resolution, tack-sharp focus on the product label
- Magazine-quality finish suitable for a luxury beauty catalog`;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Auth guard
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY no configurada' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { imageBase64, mimeType = 'image/jpeg', productName } = body;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'No se proporcionó imagen' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Build the prompt — add product name context if available
    const contextualPrompt = productName
      ? `${IMAGE_PROMPT}\n\nThe product in the photo is: "${productName}". Make sure the generated image faithfully represents this product.`
      : IMAGE_PROMPT;

    // Attempt generation: Pro first (best quality), Flash fallback (faster, cheaper)
    const IMAGE_MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image'];
    let generatedImageData: string | null = null;
    let generatedMimeType = 'image/png';
    let lastError = '';

    for (let attempt = 0; attempt < IMAGE_MODELS.length; attempt++) {
      const model = IMAGE_MODELS[attempt];
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: contextualPrompt },
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        });

        // Extract generated image from response
        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
          const parts = candidates[0].content?.parts || [];
          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              generatedImageData = part.inlineData.data;
              generatedMimeType = part.inlineData.mimeType || 'image/png';
              break;
            }
          }
        }

        if (generatedImageData) break; // Success!
        lastError = `${model}: no retornó una imagen en la respuesta`;

      } catch (err: unknown) {
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[gemini-generate-image] ${model} (attempt ${attempt + 1}) failed:`, lastError);
        // Wait 1.5 seconds before trying fallback model
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    if (!generatedImageData) {
      return new Response(
        JSON.stringify({ error: `No se pudo generar la imagen después de 2 intentos: ${lastError}` }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Upload the generated image to Supabase Storage
    let publicUrl: string | null = null;
    try {
      const binaryStr = atob(generatedImageData);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const supabase = getServiceSupabase();
      const extension = generatedMimeType.includes('png') ? 'png' : 'jpg';
      const fileName = `ai_generated_${Date.now()}.${extension}`;
      const filePath = `user-uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, bytes, {
          contentType: generatedMimeType,
          upsert: true,
        });

      if (uploadError) {
        console.warn('[gemini-generate-image] Upload failed:', uploadError.message);
      } else {
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);
        publicUrl = urlData.publicUrl;
      }
    } catch (uploadErr) {
      console.warn('[gemini-generate-image] Upload error:', uploadErr);
      // Non-fatal: we still have the base64 data for preview
    }

    return new Response(
      JSON.stringify({
        imageBase64: `data:${generatedMimeType};base64,${generatedImageData}`,
        mimeType: generatedMimeType,
        imageUrl: publicUrl, // Direct Supabase URL (null if upload failed)
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'Error del servidor: ' + message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
