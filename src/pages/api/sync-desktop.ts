import type { APIRoute } from 'astro';
import { getServiceSupabase } from '../../lib/supabase-server';

export const prerender = false;

const DESKTOP_SYNC_KEY = import.meta.env.DESKTOP_SYNC_KEY || 'fn-desktop-sync-2026';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { desktop_key, natura_email, growth_data } = await request.json();

    // 1. Verify API key
    if (!desktop_key || desktop_key !== DESKTOP_SYNC_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!natura_email) {
      return new Response(JSON.stringify({ success: false, error: 'Email requerido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Connect to Supabase with admin client
    const supabaseAdmin = getServiceSupabase();

    // 3. Find consultant by their Natura email
    const { data: profile, error: findError } = await supabaseAdmin
      .from('consultant_profiles')
      .select('id, natura_email')
      .eq('natura_email', natura_email)
      .single();

    if (findError || !profile) {
      console.error('❌ Consultora no encontrada:', natura_email);
      return new Response(JSON.stringify({
        success: false,
        error: `No se encontró una cuenta vinculada con ${natura_email}. Asegúrate de conectar tu cuenta de Natura en la app web primero.`,
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Update growth data
    const { error: updateError } = await supabaseAdmin
      .from('consultant_profiles')
      .update({
        latest_growth_data: growth_data,
        growth_sync_date: new Date().toISOString(),
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('❌ Error actualizando datos:', updateError);
      return new Response(JSON.stringify({ success: false, error: 'Error al guardar datos.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('Error en sync-desktop:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
