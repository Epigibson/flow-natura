import type { APIRoute } from 'astro';
import { getServiceSupabase } from '../../lib/supabase-server';
import { requireAuth } from '../../lib/api-auth';
import { decrypt } from '../../utils/crypto';

export const prerender = false;

const SCRAPER_URL = import.meta.env.SCRAPER_SERVICE_URL || 'http://localhost:3001';
const SCRAPER_SECRET = import.meta.env.SCRAPER_API_SECRET || 'dev-secret-key';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Auth guard — only the authenticated user can trigger their own sync
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.error;

    const userId = authResult.user.id;

    // 1. Fetch credentials from DB using admin client to bypass RLS
    const supabaseAdmin = getServiceSupabase();

    const { data: profile, error } = await supabaseAdmin
      .from('consultant_profiles')
      .select('natura_email, natura_password_encrypted, is_natura_connected')
      .eq('id', userId)
      .single();

    if (error || !profile?.is_natura_connected || !profile.natura_email || !profile.natura_password_encrypted) {
       return new Response(JSON.stringify({ success: false, error: 'Credenciales de Natura no configuradas.' }), { status: 401 });
    }

    // 2. Decrypt password
    const plainPassword = decrypt(profile.natura_password_encrypted);

    // 3. Call the external Render scraper service
    const scraperResponse = await fetch(`${SCRAPER_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SCRAPER_SECRET
      },
      body: JSON.stringify({
        natura_email: profile.natura_email,
        natura_password: plainPassword
      })
    });

    const scraperResult = await scraperResponse.json();

    if (!scraperResponse.ok || !scraperResult.success) {
      console.error('❌ Error del Scraper Service:', scraperResult.error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Error de sincronización: ${scraperResult.error}` 
      }), { status: 500 });
    }

    // 4. Save growth data to DB
    await supabaseAdmin.from('consultant_profiles').update({
      latest_growth_data: scraperResult.data,
      growth_sync_date: new Date().toISOString()
    }).eq('id', userId);

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch(e: any) {
    console.error('Error en sync-natura:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
};
