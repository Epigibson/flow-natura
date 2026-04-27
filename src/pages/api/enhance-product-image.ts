/**
 * POST /api/enhance-product-image
 * Uses Imagen 4 to generate a studio quality image from a user photo,
 * OR uses Gemini to find the official Natura URL if only text is provided.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../../lib/api-auth';
import { getServiceSupabase } from '../../lib/supabase-server';

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
        if (!imgRes.ok) throw new Error('No se pudo descargar la imagen proporcionada');
        const buffer = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buffer).toString('base64');
        imageBase64 = b64;
        mimeType = imgRes.headers.get('content-type') || mimeType;
      } catch (e) {
        console.warn("Could not fetch imageUrl, proceeding with text-only AI", e);
      }
    }

    // SCENARIO 1: User provided a photo. Use Imagen to strictly REMOVE the background
    // without altering the existing pixels of the product.
    if (imageBase64) {
      // Clean base64 prefix
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      try {
        const fullPromptDesc = [productName, productDesc].filter(Boolean).join(" ");
        // Explicit instruction to ONLY remove the background without redrawing/hallucinating the subject
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
          if (!generatedBase64) throw new Error("No image data returned from AI");
          
          const binaryStr = atob(generatedBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }

          const supabase = getServiceSupabase();
          const fileName = `generated_studio_${Date.now()}.png`;
          const filePath = `user-uploads/${fileName}`;

          const { error } = await supabase.storage
            .from('product-images')
            .upload(filePath, bytes, { contentType: 'image/png', upsert: true });

          if (error) throw new Error('Error subiendo la imagen generada: ' + error.message);

          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

          return new Response(JSON.stringify({
            identified_name: productName || "Producto Editado con IA",
            identified_code: productCode || null,
            suggested_image_url: urlData.publicUrl,
            confidence: "high",
            notes: "Fondo removido exitosamente sin alterar tu producto original."
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (err: any) {
        console.warn("Imagen background removal failed, falling back to Gemini text search", err);
      }
    }

    // SCENARIO 2: No photo provided, OR Imagen failed. Fallback to Gemini 2.5 Flash to search Natura's CDN.
    const context = [
      productName ? `Nombre del producto pre-llenado: "${productName}"` : '',
      productCode ? `Código pre-llenado: ${productCode}` : '',
      productDesc ? `Descripción / Categoría del producto: "${productDesc}"` : '',
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
