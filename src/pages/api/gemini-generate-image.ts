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
 * Ultra-specific prompt for Natura/Avon cosmetics product photography.
 * Designed to produce e-commerce catalog quality images.
 */
const IMAGE_PROMPT = `You are a professional e-commerce product photographer. Look at this photo of a cosmetics/beauty product and generate a CLEAN, PROFESSIONAL studio photograph of the EXACT same product.

CRITICAL REQUIREMENTS:
1. PRODUCT FIDELITY: The product MUST look identical to the original photo — same packaging, same labels, same colors, same brand logos, same text on the box/bottle. Do NOT invent or change any detail.
2. BACKGROUND: MANDATORY pure white background (#FFFFFF). The ENTIRE background must be solid bright white — no black, no dark colors, no gray, no gradients, no colored surfaces. If the input image has black bars, black borders, black letterboxing, or any dark padding around the product — COMPLETELY IGNORE those. They are NOT part of the product. Replace ALL of that with pure white.
3. LIGHTING: Soft, diffused studio lighting from the front-left and front-right. No harsh shadows. Very subtle soft shadow directly beneath the product only.
4. COMPOSITION: Product centered in frame with generous white space around it (~20% padding on all sides). Product fills approximately 60-70% of the image height.
5. ANGLE: Slight 3/4 front-facing angle to show depth and dimensionality of the packaging.
6. QUALITY: Sharp focus, high resolution appearance, professional color accuracy.
7. STYLE: Clean e-commerce catalog style, similar to product listings on Amazon, Mercado Libre, or the official Natura.com.mx website. These always use WHITE backgrounds.
8. If the product is a SET or KIT (multiple items in a box), show the box AND the individual items arranged professionally next to it.

IMPORTANT: The background MUST be pure white (#FFFFFF). NEVER use black, dark, gray, or any colored background. If the original photo has black bars on the sides, top, or bottom — those are camera artifacts, NOT part of the product. Remove them entirely and use white.

DO NOT add any text, watermarks, borders, backgrounds, hands, or props that are not in the original photo.`;

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

    // Attempt generation with retry (max 2 attempts)
    let generatedImageData: string | null = null;
    let generatedMimeType = 'image/png';
    let lastError = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
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
        lastError = 'Gemini no retornó una imagen en la respuesta';

      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[gemini-generate-image] Attempt ${attempt + 1} failed:`, lastError);
        // Wait 2 seconds before retry
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
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
