import type { APIRoute } from 'astro';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../../utils/crypto';

export const prerender = false;

const scriptPath = path.resolve('scripts/scrape-nivel-auto.mjs');

export const POST: APIRoute = async ({ request }) => {
  try {
    const { userId } = await request.json();
    if (!userId) {
       return new Response(JSON.stringify({ success: false, error: 'User ID missing.' }), { status: 400 });
    }

    // 1. Fetch credentials from DB using admin client to bypass RLS
    const supabaseAdmin = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY
    );

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
    
    // Archivo temporal para los datos extraídos
    const tempFile = path.join(process.cwd(), `.tmp_growth_${userId}.json`);

    return new Promise((resolve) => {
      console.log(`📡 Solicitud de sincronización de ${profile.natura_email}...`);
      
      const childEnv = {
          ...process.env,
          NATURA_USER: profile.natura_email,
          NATURA_PASS: plainPassword,
          OUT_FILE: tempFile
      };

      const command = `node ${scriptPath}`;

      exec(command, { env: childEnv }, async (err, stdout, stderr) => {
        if (err) {
          console.error(`❌ Error scraper: ${err.message}`);
          console.error(stderr);
          resolve(new Response(JSON.stringify({ 
              success: false, 
              error: `Fallo al ejecutar bot: ${err.message}. STDERR: ${stderr}` 
          }), { status: 500 }));
          return;
        }

        console.log(`✅ Scraper success:\n${stdout}`);

        try {
          if (fs.existsSync(tempFile)) {
             const resultData = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
             // 3. Update DB with new growth data
             await supabaseAdmin.from('consultant_profiles').update({
                 latest_growth_data: resultData,
                 growth_sync_date: new Date().toISOString()
             }).eq('id', userId);

             fs.unlinkSync(tempFile); // clean up
          } else {
             resolve(new Response(JSON.stringify({ success: false, error: 'Scraper didn\'t output data.' }), { status: 500 }));
             return;
          }
          
          resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
        } catch(fileErr) {
          console.error('Error parsing/saving sync data:', fileErr);
          resolve(new Response(JSON.stringify({ success: false, error: 'Error procesando datos extraídos.' }), { status: 500 }));
        }
      });
    });
  } catch(e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
};
