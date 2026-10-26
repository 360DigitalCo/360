import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function hashIp(ip: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('360-signup:' + ip));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const { email, password, captchaToken, data = {}, emailRedirectTo } = body || {};
  if (!email || !password) return json({ error: 'Email and password are required.' }, 400);

  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const ipHash = await hashIp(ip);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: problem, error: chkErr } = await admin.rpc('check_signup', {
    p_ip_hash: ipHash,
    p_username: String(data.username || ''),
    p_first: String(data.first_name || ''),
    p_last: String(data.last_name || ''),
    p_birthdate: String(data.birthdate || ''),
  });
  if (chkErr) return json({ error: 'Could not verify signup. Try again.' }, 500);
  if (problem) return json({ error: problem }, 400);

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: out, error } = await anon.auth.signUp({
    email, password,
    options: { data, captchaToken, emailRedirectTo },
  });
  if (error) return json({ error: error.message }, error.status && error.status < 500 ? error.status : 400);

  await admin.rpc('record_signup', { p_ip_hash: ipHash });
  return json({ user: out.user, session: out.session });
});
