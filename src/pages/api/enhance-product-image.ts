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

    // SCENARIO 1: User provided a photo. Use Imagen 4 to turn it into a studio shot.
    if (imageBase64) {
      // 1. Clean base64 prefix
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      
      // 2. Call Imagen 4
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-fast-generate-001',
        prompt: `Professional cinematic studio photography of this exact cosmetic product, centered on a pristine white background. High quality studio lighting, hyper-realistic, keep the product's original text and packaging exactly as it is, just remove the background and make it look like an official catalog photo.`,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          sourceImage: {
            imageBytes: cleanBase64,
            mimeType: mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
          }
        }
      });

      if (!response.generatedImages || response.generatedImages.length === 0) {
        throw new Error("La IA no pudo generar una imagen editada.");
      }

      const generatedBase64 = response.generatedImages[0].image.imageBytes;
      
      // 3. Upload to Supabase explicitly since the client needs a URL
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        throw new Error('Configuración de Supabase incompleta para guardar la imagen.');
      }

      const binaryStr = atob(generatedBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const fileName = `generated_studio_${Date.now()}.jpg`;
      const filePath = `user-uploads/${fileName}`;

      const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: true });

      if (error) throw new Error('Error subiendo la imagen generada: ' + error.message);

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return new Response(JSON.stringify({
        identified_name: productName || "Producto Editado con IA",
        identified_code: productCode || null,
        suggested_image_url: urlData.publicUrl,
        confidence: "high",
        notes: "Imagen editada y mejorada a calidad de estudio usando Imagen 4."
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // SCENARIO 2: No photo provided, only text. 
    // Fallback to Gemini 2.5 Flash to search Natura's CDN for the official URL.
    const context = [
      productName ? `Nombre del producto: "${productName}"` : '',
      productCode ? `Código: ${productCode}` : '',
    ].filter(Boolean).join('. ');

    const parts = [{
      text: `Eres un experto en productos de belleza de Natura y Avon.
Contexto: ${context}

Tu tarea:
1. Identifica el producto exacto.
2. Busca la URL de la imagen oficial de estudio de este producto en el CDN de Natura: https://gspstatic.natura.com/static/MX/producto/500x500/
   El formato típico es: .../500x500/XXXXX.jpg donde XXXXX es el ID del producto Natura.
3. Si no puedes encontrar la URL exacta, sugiere una búsqueda o devuelve null.

Responde EXCLUSIVAMENTE en JSON con esta estructura:
{
  "identified_name": "nombre completo del producto",
  "identified_code": "código si lo detectas",
  "suggested_image_url": "URL de la imagen de estudio o null",
  "confidence": "high" | "medium" | "low",
  "notes": "observaciones breves"
}
NO incluyas markdown, SOLO el JSON crudo.`
    }];

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
