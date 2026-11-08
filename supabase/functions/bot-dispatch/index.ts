import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

function blockedHost(host: string) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (h.includes(':') || h.startsWith('[')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function webhookOk(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
    return !blockedHost(u.hostname);
  } catch {
    return false;
  }
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const botId = String(body?.bot_id || '');
  const messageId = body?.message_id;
  if (!botId || messageId == null) return json({ error: 'Bad request' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: msg } = await admin.from('messages').select('id, channel_id, user_id, username, text, created_at, deleted_at').eq('id', messageId).maybeSingle();
  if (!msg || msg.deleted_at || !msg.channel_id || Date.now() - Date.parse(msg.created_at) > 120000) return json({ ok: true, skipped: true });

  const { data: channel } = await admin.from('channels').select('id, name, server_id').eq('id', msg.channel_id).maybeSingle();
  if (!channel) return json({ ok: true });
  const { data: bot } = await admin.from('bots').select('id, name, avatar_url, bot_user_id, prefix, handle').eq('id', botId).maybeSingle();
  const { data: cred } = await admin.from('bot_credentials').select('webhook_url, webhook_secret').eq('bot_id', botId).maybeSingle();
  if (!bot?.bot_user_id || !cred?.webhook_url || !cred.webhook_secret || !webhookOk(cred.webhook_url)) return json({ ok: true });
  const { data: install } = await admin.from('bot_server_installs').select('id').eq('bot_id', botId).eq('server_id', channel.server_id).maybeSingle();
  if (!install) return json({ ok: true });

  const prefix = bot.prefix || '!';
  const text = String(msg.text || '');
  const isCommand = text.startsWith(prefix);
  const event = {
    type: isCommand ? 'command' : 'mention',
    id: msg.id,
    content: text,
    command: isCommand ? text.slice(prefix.length).trim().split(/\s+/)[0] || '' : null,
    args: isCommand ? text.slice(prefix.length).trim().split(/\s+/).slice(1) : [],
    channel: { id: channel.id, name: channel.name },
    server_id: channel.server_id,
    author: { id: msg.user_id, username: msg.username },
    created_at: msg.created_at,
  };
  const payload = JSON.stringify(event);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmac(cred.webhook_secret, `${ts}.${payload}`);

  let reply = '';
  try {
    const res = await fetch(cred.webhook_url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': '360-Bot-Dispatch/1', 'X-360-Timestamp': ts, 'X-360-Signature': `sha256=${sig}` },
      body: payload,
    });
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      const data = await res.json();
      reply = String(data?.content ?? '').trim().slice(0, 2000);
    }
  } catch {
    return json({ ok: true, delivered: false });
  }
  if (!reply) return json({ ok: true, delivered: true });

  const since = new Date(Date.now() - 10000).toISOString();
  const { count } = await admin.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', bot.bot_user_id).gte('created_at', since);
  if ((count ?? 0) >= 10) return json({ ok: true, limited: true });

  await admin.from('messages').insert({
    user_id: bot.bot_user_id, username: bot.name, avatar_url: bot.avatar_url, tag: 'BOT', role: 'bot', text: reply, channel_id: channel.id,
  });
  return json({ ok: true, delivered: true, replied: true });
});
