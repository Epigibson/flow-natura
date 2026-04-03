import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    if (!body || !body.file) {
      return new Response(JSON.stringify({ error: 'Falta el archivo PDF en la petición' }), { status: 400 });
    }

    const base64Pdf = body.file;

    const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: 'Falta la API Key de Gemini. Por favor añade GEMINI_API_KEY=tu_clave al archivo .env' 
      }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Ya tenemos base64Pdf desde el cliente
    
    // Call Gemini directly
    const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: base64Pdf,
                            mimeType: 'application/pdf',
                        }
                    },
                    {
                        text: `Escanéa esta página de un catálogo de Natura y extrae todos los productos que encuentres. Un producto válido debe tener al menos un código y un precio.
Devuelve el resultado EXCLUSIVAMENTE como un JSON Array estricto.
Cada objeto del arreglo debe tener exactamente la siguiente estructura (si no hay puntos o categoría, déjalos nulos o asume lo mejor):
{
  "codigo": "string",
  "nombre": "string",
  "precio": 125.50,
  "puntos": 10,
  "categoria": "string"
}
Si el precio en el PDF dice "R$ 125,50" o "$125.50", conviértelo a número flotante 125.50.
En nombre trata de poner la descripción y el tono si es maquillaje.
Si la página no tiene productos legibles con código y precio, devuelve [].
IMPORTANTE: NO incluyas markdown, NO pongas \`\`\`json, SOLO devuelve el arreglo [] crudo.`
                    }
                ]
            }
        ],
        config: {
            temperature: 0.1,
        }
    });

    const responseText = response.text || '';
    
    // Simple extraction if markdown wraps the response
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    
    let products = [];
    try {
        products = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Error parsing Gemini JSON", responseText);
        // We'll return the raw text to help debugging
        return new Response(JSON.stringify({ error: "No se pudo parsear el resultado", rawText: responseText }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in process-catalog-page:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    });
  }
}
