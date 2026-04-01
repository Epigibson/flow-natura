import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../../utils/crypto';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { userId, natura_email, natura_password } = await request.json();

    if (!userId || !natura_email || !natura_password) {
      return new Response(JSON.stringify({ success: false, error: 'Faltan credenciales o el ID del usuario.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Cifrar la contraseña
    const encryptedPassword = encrypt(natura_password);

    // 2. Instanciar Supabase Admin Server-side (Bypasses RLS)
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Actualizar el perfil
    const { error } = await supabaseAdmin
      .from('consultant_profiles')
      .update({
        natura_email,
        natura_password_encrypted: encryptedPassword,
        is_natura_connected: true
      })
      .eq('id', userId);

    if (error) {
      console.error('Error actualizando credenciales en Supabase:', error);
      return new Response(JSON.stringify({ success: false, error: 'No se pudo guardar la configuración en la base de datos.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error en /api/connect-natura:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
