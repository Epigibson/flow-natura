/**
 * POST /api/upload-product-image
 * Receives a base64-encoded image and uploads it to Supabase Storage
 * bucket "product-images". Returns the public URL.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAuth } from '../../lib/api-auth';
import { getServiceSupabase } from '../../lib/supabase-server';



export const POST: APIRoute = async ({ request }) => {
  try {
    // Auth guard
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { imageBase64, fileName, mimeType = 'image/jpeg' } = body;

    if (!imageBase64 || !fileName) {
      return new Response(
        JSON.stringify({ error: 'Faltan imageBase64 o fileName' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // Convert base64 to Uint8Array
    const binaryStr = atob(cleanBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Use service role client (bypasses RLS and storage policies)
    const supabase = getServiceSupabase();

    const filePath = `user-uploads/${fileName}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Error subiendo imagen: ' + error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({
        url: urlData.publicUrl,
        path: data.path,
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
