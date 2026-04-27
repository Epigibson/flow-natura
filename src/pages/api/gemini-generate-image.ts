/**
 * POST /api/gemini-generate-image
 * Receives a base64-encoded photo of a product and generates a clean,
 * professional product image using Gemini's image generation capabilities.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;

const IMAGE_PROMPT = `Observa esta foto de un producto cosmético. Genera una imagen profesional y limpia del MISMO producto exacto:

- Muestra SOLO el producto, sin manos, sin fondo, sin objetos adicionales
- Fondo blanco puro y limpio
- Iluminación profesional de estudio fotográfico
- El producto debe verse exactamente como el de la foto original (misma marca, misma forma, mismos colores, mismo empaque)
- Ángulo frontal ligeramente inclinado para mostrar dimensión
- Alta calidad, estilo catálogo de e-commerce
- NO cambies el diseño del empaque, solo limpia la presentación`;

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY no configurada' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { imageBase64, mimeType = 'image/jpeg' } = body;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'No se proporcionó imagen' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          role: 'user',
          parts: [
            { text: IMAGE_PROMPT },
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
    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No se generó imagen' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parts = candidates[0].content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return new Response(
          JSON.stringify({
            imageBase64: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`,
            mimeType: part.inlineData.mimeType || 'image/png',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Gemini no retornó una imagen en la respuesta' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'Error del servidor: ' + message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
