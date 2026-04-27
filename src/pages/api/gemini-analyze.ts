/**
 * POST /api/gemini-analyze
 * Receives a base64-encoded image and analyzes it with Gemini Vision
 * to extract product information (name, category, brand, description, price).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../../lib/api-auth';

const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `Eres un experto en productos de belleza y cosméticos, especialmente de marcas como Natura, Avon, Casa & Estilo, y otras marcas de venta directa en México y Latinoamérica.

Analiza la imagen del producto y extrae la siguiente información. Responde ÚNICAMENTE con un JSON válido, sin markdown ni texto adicional:

{
  "name": "Nombre completo del producto tal como aparece en el empaque",
  "brand": "Marca del producto (Natura, Avon, Casa & Estilo, u otra)",
  "category": "Una de estas categorías: Perfumería, Maquillaje, Cuerpo, Cabello, Rostro, Cuidado Personal, Accesorios",
  "description": "Descripción breve del producto basada en lo visible (tipo, uso, beneficios principales). Máximo 2 oraciones.",
  "code": null,
  "estimated_price": null,
  "estimated_cost": null,
  "confidence": "high | medium | low"
}

Reglas:
- Si puedes leer texto en el empaque, úsalo para el nombre exacto.
- Si ves un código de producto, número SKU, o código de barras visible, ponlo en "code".
- Los precios son en PESOS MEXICANOS (MXN).
- "estimated_price" es el precio de venta al público sugerido. Si ves un precio impreso, úsalo. Si no, estima basándote en tu conocimiento del producto.
- "estimated_cost" es el costo que paga una consultora (generalmente ~30% menos que el precio de venta para Natura, ~25% para Avon). Calcula: estimated_cost = estimated_price * 0.70 aproximadamente.
- Si NO puedes determinar algún campo con certeza, usa tu mejor estimación y pon "confidence" en "medium" o "low".
- Si la imagen no es un producto cosmético, responde con: {"error": "No se detectó un producto cosmético en la imagen"}
- SOLO responde con JSON, nada más.`;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Auth guard
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY no configurada en el servidor' }),
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

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
    });

    const text = response.text?.trim() || '';

    // Try to parse JSON from the response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({
          error: 'No se pudo parsear la respuesta de Gemini',
          raw: text,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'Error del servidor: ' + message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
