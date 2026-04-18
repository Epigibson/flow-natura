/**
 * POST /api/enhance-product-image
 * Uses Gemini AI to analyze a product photo and find/suggest
 * a studio-quality image URL from Natura's CDN.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Falta GEMINI_API_KEY' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { imageBase64, mimeType = 'image/jpeg', productName, productCode } = body;

    if (!imageBase64 && !productName) {
      return new Response(JSON.stringify({ error: 'Se requiere imageBase64 o productName' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build parts for the AI request
    const parts: any[] = [];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: { data: cleanBase64, mimeType },
      });
    }

    const context = [
      productName ? `Nombre del producto: "${productName}"` : '',
      productCode ? `Código: ${productCode}` : '',
    ].filter(Boolean).join('. ');

    parts.push({
      text: `Eres un experto en productos de belleza de Natura y Avon.
${context ? `Contexto: ${context}` : ''}
${imageBase64 ? 'Te envío una foto del producto.' : ''}

Tu tarea:
1. Identifica el producto exacto (nombre completo, código si es posible).
2. Busca la URL de la imagen oficial de estudio de este producto en el CDN de Natura: https://gspstatic.natura.com/static/MX/producto/500x500/
   El formato típico es: https://gspstatic.natura.com/static/MX/producto/500x500/XXXXX.jpg donde XXXXX es el ID del producto.
3. Si no puedes encontrar la URL exacta, sugiere una búsqueda.

Responde EXCLUSIVAMENTE en JSON con esta estructura:
{
  "identified_name": "nombre completo del producto",
  "identified_code": "código si lo detectas",
  "suggested_image_url": "URL de la imagen de estudio o null",
  "confidence": "high" | "medium" | "low",
  "notes": "observaciones breves"
}
NO incluyas markdown, SOLO el JSON crudo.`
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.1 },
    });

    const responseText = (response.text || '').trim();

    // Parse JSON from response
    let jsonStr = responseText;
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let result;
    try {
      result = JSON.parse(jsonStr.trim());
    } catch {
      result = { identified_name: null, suggested_image_url: null, confidence: 'low', notes: responseText };
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error del servidor' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
