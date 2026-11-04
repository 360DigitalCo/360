const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const HOSTS: Record<string, string> = {
  'x.com': 'X', 'twitter.com': 'X', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'threads.net': 'Threads',
  'reddit.com': 'Reddit', 'bsky.app': 'Bluesky',
};

type Preview = { url: string; platform: string; author?: string; handle?: string; text?: string; image?: string; date?: string };

const UA_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_WEB = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url: string, ua = UA_WEB, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': ua, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
  } finally { clearTimeout(t); }
}

function decode(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
const strip = (h: string) => decode(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();

function meta(html: string, key: string) {
  const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + key + '["\'][^>]*content=["\']([^"\']*)["\']|<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + key + '["\']', 'i');
  const m = html.match(re);
  return m ? decode(m[1] || m[2] || '') : '';
}

function safeImg(u?: string) {
  if (!u) return undefined;
  try { const p = new URL(u); return p.protocol === 'https:' ? p.toString() : undefined; } catch { return undefined; }
}

async function viaOg(url: string, platform: string): Promise<Preview | null> {
  const r = await get(url, UA_BOT);
  if (!r.ok) return null;
  const html = (await r.text()).slice(0, 400000);
  const text = meta(html, 'og:description') || meta(html, 'description');
  const title = meta(html, 'og:title');
  const image = safeImg(meta(html, 'og:image'));
  if (!text && !image) return null;
  return { url, platform, author: title, text: text.slice(0, 400), image };
}

async function xPost(url: string, u: URL): Promise<Preview | null> {
  const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (m) {
    try {
      const r = await get(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`);
      if (r.ok) {
        const j = await r.json();
        const t = j.tweet;
        if (t) {
          const photo = t.media?.photos?.[0]?.url || t.media?.videos?.[0]?.thumbnail_url || t.media?.all?.[0]?.thumbnail_url;
          return { url, platform: 'X', author: t.author?.name, handle: t.author?.screen_name ? '@' + t.author.screen_name : undefined, text: String(t.text || '').slice(0, 400), image: safeImg(photo), date: t.created_at };
        }
      }
    } catch { /* fall through */ }
    try {
      const r = await get(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`);
      if (r.ok) {
        const j = await r.json();
        const p = String(j.html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (p) return { url, platform: 'X', author: j.author_name, text: strip(p[1]).slice(0, 400) };
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function oembed(url: string, platform: string, endpoint: string): Promise<Preview | null> {
  const r = await get(endpoint + encodeURIComponent(url));
  if (!r.ok) return null;
  const j = await r.json();
  return { url, platform, author: j.author_name, text: String(j.title || '').slice(0, 400), image: safeImg(j.thumbnail_url) };
}

async function bsky(url: string, u: URL): Promise<Preview | null> {
  const m = u.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
  if (!m) return null;
  const r = await get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=0&uri=${encodeURIComponent(`at://${m[1]}/app.bsky.feed.post/${m[2]}`)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const p = j.thread?.post;
  if (!p) return null;
  const img = p.embed?.images?.[0]?.thumb || p.embed?.external?.thumb;
  return { url, platform: 'Bluesky', author: p.author?.displayName, handle: p.author?.handle ? '@' + p.author.handle : undefined, text: String(p.record?.text || '').slice(0, 400), image: safeImg(img), date: p.record?.createdAt };
}

async function reddit(url: string, u: URL): Promise<Preview | null> {
  try {
    const r = await get(`https://www.reddit.com${u.pathname.replace(/\/$/, '')}.json?limit=1`);
    if (r.ok) {
      const j = await r.json();
      const d = j?.[0]?.data?.children?.[0]?.data;
      if (d) {
        const th = d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') || (/^https:/.test(d.thumbnail || '') ? d.thumbnail : '');
        return { url, platform: 'Reddit', author: 'r/' + d.subreddit, text: String(d.title + (d.selftext ? ' - ' + d.selftext : '')).slice(0, 400), image: safeImg(th), date: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined };
      }
    }
  } catch { /* fall through */ }
  return viaOg(url, 'Reddit');
}

async function preview(raw: string): Promise<Preview | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '').replace(/^(m|mobile|old)\./, '');
  const platform = HOSTS[host];
  if (!platform) return null;
  const url = u.toString();
  try {
    if (platform === 'X') return await xPost(url, u);
    if (platform === 'TikTok') return (await oembed(url, platform, 'https://www.tiktok.com/oembed?url=')) || (await viaOg(url, platform));
    if (platform === 'YouTube') return await oembed(url, platform, 'https://www.youtube.com/oembed?format=json&url=');
    if (platform === 'Bluesky') return await bsky(url, u);
    if (platform === 'Reddit') return await reddit(url, u);
    return await viaOg(url, platform);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const urls: string[] = Array.isArray(body?.urls) ? body.urls.slice(0, 12).map(String) : [];
  const out = await Promise.all(urls.map((x) => preview(x).catch(() => null)));
  return json({ previews: out.filter(Boolean) });
});
