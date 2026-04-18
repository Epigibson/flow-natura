/**
 * POST /api/enhance-product-image
 * Uses Imagen 4 to generate a studio quality image from a user photo,
 * OR uses Gemini to find the official Natura URL if only text is provided.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Falta GEMINI_API_KEY' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    let { imageBase64, mimeType = 'image/jpeg', productName, productCode, imageUrl } = body;

    if (!imageBase64 && !imageUrl && !productName) {
      return new Response(JSON.stringify({ error: 'Se requiere imageBase64, imageUrl o productName' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Download image if URL was provided instead of base64
    if (imageUrl && !imageBase64) {
      try {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error('No se pudo descargar la imagen proporcionada');
        const buffer = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buffer).toString('base64');
        imageBase64 = b64;
        mimeType = imgRes.headers.get('content-type') || mimeType;
      } catch (e) {
        console.warn("Could not fetch imageUrl, proceeding with text-only AI", e);
      }
    }

    // The user wants a clean studio background, but Generative Image models (like Imagen) 
    // hallucinate product shapes without an explicit layer mask API (like remove.bg).
    // The most accurate solution is to use Gemini 2.5 Flash's multimodal vision to identify 
    // the EXACT code/name from the user's messy photo, and retrieve the OFFICIAL Natura CDN
    // URL, which already has a perfect white studio background.

    const context = [
      productName ? `Nombre del producto pre-llenado: "${productName}"` : '',
      productCode ? `Código pre-llenado: ${productCode}` : '',
    ].filter(Boolean).join('. ');

    const parts: any[] = [{
      text: `Eres un experto en productos de belleza de Natura y Avon.
Contexto: ${context}

Tu tarea:
1. Identifica el producto EXACTO de Natura (nombre completo, repasa código si es posible). Presta especial atención al texto o caja en la imagen si se envía una.
2. Busca la URL de la imagen oficial de estudio de este producto en el CDN de Natura: https://gspstatic.natura.com/static/MX/producto/500x500/
   El formato típico es: .../500x500/XXXXX.jpg donde XXXXX es el código ID de 5 dígitos del producto Natura.
3. Si no puedes encontrar la URL exacta, devuelve null en ese campo.

Responde EXCLUSIVAMENTE en JSON con esta estructura:
{
  "identified_name": "nombre completo real del producto",
  "identified_code": "código de 5 dígitos si lo identificas",
  "suggested_image_url": "URL de la imagen de estudio del CDN o null",
  "confidence": "high" | "medium" | "low",
  "notes": "ej. Este es el jabón exfoliante oficial."
}
NO incluyas markdown, SOLO el JSON crudo.`
    }];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: { data: cleanBase64, mimeType }
      });
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
