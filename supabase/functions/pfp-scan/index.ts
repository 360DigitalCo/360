import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_BYTES = 3 * 1024 * 1024;

const PROMPT = `You are a strict image moderator for a community that includes teenagers. The image will be used as a profile picture.
Mark it unsafe if it contains any of: nudity or sexual content, suggestive poses, gore or graphic injury, graphic violence, weapons aimed at people, drugs or drug use, self-harm, hate symbols, extremist imagery, harassment text or slurs, a screenshot of private information, or anything else inappropriate for a profile picture.
Reply with JSON only: {"safe": true|false, "reason": "short phrase"}`;

function privateHost(h: string) {
  return /^(localhost|.*\.local|.*\.internal)$/i.test(h) ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|fc|fd|fe80)/i.test(h);
}

async function resolvesPublic(host: string) {
  if (privateHost(host)) return false;
  for (const t of ['A', 'AAAA'] as const) {
    try {
      const ips = await Deno.resolveDns(host, t);
      if (ips.some((ip) => privateHost(String(ip)))) return false;
    } catch { /* no record of this type */ }
  }
  return true;
}

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}

function b64(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string } | { error: string }> {
  let u: URL;
  try { u = new URL(url); } catch { return { error: 'That is not a valid link.' }; }
  if (u.protocol !== 'https:') return { error: 'Use an https link.' };
  if (u.username || u.password) return { error: 'That link is not allowed.' };
  if (!(await resolvesPublic(u.hostname))) return { error: 'That link is not allowed.' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(u, { signal: ctl.signal, redirect: 'error', headers: { 'User-Agent': '360-pfp-scan' } });
    if (!r.ok) return { error: 'Could not load that image.' };
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return { error: 'Image is too large (3 MB max).' };
    const reader = r.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { ctl.abort(); return { error: 'Image is too large (3 MB max).' }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    const type = sniff(bytes);
    if (!type) return { error: 'Use a PNG, JPG, GIF or WebP image.' };
    return { bytes, type };
  } catch {
    return { error: 'Could not load that image.' };
  } finally {
    clearTimeout(timer);
  }
}

type Verdict = { safe: boolean; reason: string };
const dbg: string[] = [];

function parseVerdict(txt: string): Verdict | null {
  const mm = txt.match(/\{[\s\S]*\}/);
  if (!mm) return null;
  try {
    const v = JSON.parse(mm[0]);
    if (typeof v.safe === 'boolean') return { safe: v.safe, reason: String(v.reason || '') };
  } catch { /* not json */ }
  return null;
}

async function chatVision(base: string, key: string, model: string, dataUrl: string, extra: Record<string, string> = {}): Promise<Verdict | null> {
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extra },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 150,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
    }),
  });
  if (!r.ok) { dbg.push(`${model} ${r.status} ${(await r.text()).slice(0, 100)}`); return null; }
  const j = await r.json();
  const v = parseVerdict(j.choices?.[0]?.message?.content || '');
  if (!v) dbg.push(`${model} unparsable`);
  return v;
}

async function visionModels(base: string, key: string, free: boolean): Promise<string[]> {
  try {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) { dbg.push(`models ${base} ${r.status}`); return []; }
    const j = await r.json();
    const list: any[] = j.data || [];
    if (free) {
      return list
        .filter((m) => (m.architecture?.input_modalities || []).includes('image') && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
        .map((m) => m.id).slice(0, 4);
    }
    return list.map((m) => m.id).filter((id: string) => /llama-4|scout|maverick|vision/i.test(id) && !/guard|whisper/i.test(id)).slice(0, 3);
  } catch (e) { dbg.push(`models ${base} ${String(e)}`); return []; }
}

async function geminiVerdict(dataUrl: string): Promise<Verdict | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!key || !m) return null;
  for (const model of ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json' },
        }),
      });
      if (!r.ok) { dbg.push(`${model} ${r.status}`); if (r.status === 403) return null; continue; }
      const j = await r.json();
      const v = parseVerdict(j.candidates?.[0]?.content?.parts?.[0]?.text || '');
      if (v) return v;
    } catch (e) { dbg.push(`${model} ${String(e)}`); }
  }
  return null;
}

async function moderate(dataUrl: string): Promise<Verdict | null> {
  const viaGemini = await geminiVerdict(dataUrl);
  if (viaGemini) return viaGemini;
  const groq = Deno.env.get('GROQ_API_KEY');
  const or = Deno.env.get('OPENROUTER_API_KEY');
  if (groq) {
    for (const m of await visionModels('https://api.groq.com/openai/v1', groq, false)) {
      const v = await chatVision('https://api.groq.com/openai/v1', groq, m, dataUrl);
      if (v) return v;
    }
  }
  if (or) {
    const extra = { 'HTTP-Referer': 'https://360-search.com', 'X-Title': '360 pfp scan' };
    for (const m of await visionModels('https://openrouter.ai/api/v1', or, true)) {
      const v = await chatVision('https://openrouter.ai/api/v1', or, m, dataUrl, extra);
      if (v) return v;
    }
  }
  return null;
}

async function scan(url: string) {
  const img = await fetchImage(url);
  if ('error' in img) return { ok: false, error: img.error };
  const v = await moderate(`data:${img.type};base64,${b64(img.bytes)}`);
  if (!v) return { ok: false, error: 'Could not check that image right now. Try again in a minute.', unavailable: true };
  if (!v.safe) return { ok: false, error: 'That image is not allowed as a profile picture.', rejected: true, reason: v.reason };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  const user = u?.user;
  if (!user) return json({ error: 'Sign in first.' }, 401);

  const link = String(body?.url || '').trim();
  if (!link) return json({ error: 'Paste an image link.' }, 400);

  const { data: prof } = await admin.from('profiles').select('banned').eq('id', user.id).maybeSingle();
  if (prof?.banned) return json({ error: 'Not allowed.' }, 403);

  const res = await scan(link);
  if (!res.ok) return json({ error: res.error }, res.unavailable ? 503 : 400);

  const { error } = await admin.from('profiles').update({
    avatar_url: link, avatar_style: 'url', avatar_seed: null, updated_at: new Date().toISOString(),
  }).eq('id', user.id);
  if (error) return json({ error: 'Could not save your picture.' }, 500);
  return json({ ok: true, avatar_url: link });
});
