const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EXA_KEY = Deno.env.get('EXA_KEY');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type Post = { url: string; platform: string; text: string; author?: string; image?: string; date?: string };

async function get(url: string, ms = 7000, headers: Record<string, string> = {}) {
  return await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers } });
}
const clean = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim();
const https = (u?: string) => (u && /^https:\/\//.test(u) ? u : '');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function xTimeline(handle: string, dbg: any): Promise<Post[]> {
  const h = handle.replace(/^@/, '');
  try {
    const r = await get(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(h)}?showReplies=false&lang=en`);
    dbg.x_syn = r.status;
    if (r.ok) {
      const html = await r.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (m) {
        const entries = JSON.parse(m[1])?.props?.pageProps?.timeline?.entries || [];
        const out: Post[] = [];
        for (const e of entries) {
          const t = e?.content?.tweet;
          if (!t || t.in_reply_to_status_id_str) continue;
          const media = t.extended_entities?.media?.[0] || t.entities?.media?.[0];
          out.push({
            url: `https://x.com/${t.user?.screen_name || h}/status/${t.id_str}`,
            platform: 'X',
            text: clean(unesc(String(t.full_text || t.text || '').replace(/https:\/\/t\.co\/\w+/g, ''))),
            author: t.user?.screen_name ? '@' + t.user.screen_name : '@' + h,
            image: https(media?.media_url_https),
            date: t.created_at ? new Date(t.created_at).toISOString() : '',
          });
          if (out.length >= 4) break;
        }
        dbg.x_n = out.length;
        if (out.length) return out;
      }
    }
  } catch (e) { dbg.x_err = String(e).slice(0, 80); }
  try {
    const r = await get(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(h)}/statuses`);
    dbg.x_fx = r.status;
    if (r.ok) {
      const j = await r.json();
      return (j.results || []).slice(0, 4).map((t: any) => ({
        url: t.url, platform: 'X', text: clean(t.text), author: '@' + h,
        image: https(t.media?.photos?.[0]?.url || t.media?.all?.[0]?.thumbnail_url), date: t.created_at,
      }));
    }
  } catch (e) { dbg.x_fx_err = String(e).slice(0, 80); }
  return [];
}

async function ytFeed(channel: string, dbg: any): Promise<Post[]> {
  try {
    const r = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel)}`);
    dbg.yt = r.status;
    if (!r.ok) return [];
    const xml = await r.text();
    const author = (xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || '';
    return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 3).map((m) => {
      const e = m[1];
      const id = (e.match(/<yt:videoId>([^<]+)</) || [])[1];
      return {
        url: `https://www.youtube.com/watch?v=${id}`, platform: 'YouTube',
        text: clean(unesc((e.match(/<title>([^<]*)</) || [])[1] || '')),
        author: unesc(author), image: https((e.match(/<media:thumbnail url="([^"]+)"/) || [])[1]),
        date: (e.match(/<published>([^<]+)</) || [])[1] || '',
      };
    }).filter((p) => p.url.includes('v=') && p.text);
  } catch (e) { dbg.yt_err = String(e).slice(0, 80); return []; }
}

async function bskyFeed(handle: string, dbg: any): Promise<Post[]> {
  try {
    const r = await get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=8&filter=posts_no_replies`);
    dbg.bsky = r.status;
    if (!r.ok) return [];
    const j = await r.json();
    return (j.feed || []).filter((f: any) => !f.reason).slice(0, 3).map((f: any) => {
      const p = f.post;
      const rkey = String(p.uri).split('/').pop();
      return {
        url: `https://bsky.app/profile/${p.author?.handle}/post/${rkey}`, platform: 'Bluesky', text: clean(p.record?.text),
        author: '@' + p.author?.handle, image: https(p.embed?.images?.[0]?.thumb || p.embed?.external?.thumb), date: p.record?.createdAt,
      };
    }).filter((p: Post) => p.text);
  } catch (e) { dbg.bsky_err = String(e).slice(0, 80); return []; }
}

async function redditRss(name: string, dbg: any): Promise<Post[]> {
  const urls = [
    `https://www.reddit.com/search.rss?q=${encodeURIComponent('"' + name + '"')}&sort=new&limit=8`,
    `https://www.reddit.com/r/${encodeURIComponent(name.replace(/[^A-Za-z0-9]/g, ''))}/new.rss?limit=6`,
  ];
  for (const u of urls) {
    try {
      const r = await get(u);
      dbg['reddit_' + urls.indexOf(u)] = r.status;
      if (!r.ok) continue;
      const xml = await r.text();
      if (!xml.includes('<entry>')) continue;
      const out = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 4).map((m) => {
        const e = m[1];
        const link = (e.match(/<link href="([^"]+)"/) || [])[1] || '';
        const sub = (e.match(/<category term="([^"]+)"/) || [])[1] || '';
        const content = unesc((e.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || '');
        const body = clean(unesc(content.replace(/<[^>]+>/g, ' ')).replace(/submitted by.*$/i, '').replace(/\[link\]|\[comments\]/g, ''));
        const title = clean(unesc((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''));
        return {
          url: unesc(link), platform: 'Reddit', text: clean(title + (body && body !== title ? ' - ' + body.slice(0, 200) : '')),
          author: sub ? 'r/' + sub : '', image: https(unesc((e.match(/<media:thumbnail url="([^"]+)"/) || [])[1] || '')),
          date: (e.match(/<updated>([^<]+)</) || [])[1] || '',
        };
      }).filter((p) => p.url.includes('/comments/') && p.text);
      if (out.length) return out;
    } catch (e) { dbg.reddit_err = String(e).slice(0, 80); }
  }
  return [];
}

async function mastodonTag(name: string, dbg: any): Promise<Post[]> {
  const tag = name.replace(/[^A-Za-z0-9]/g, '');
  if (!tag) return [];
  try {
    const r = await get(`https://mastodon.social/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=12`);
    dbg.masto = r.status;
    if (!r.ok) return [];
    const j = await r.json();
    return (j || []).filter((s: any) => !s.sensitive && !s.reblog && s.language !== null).map((s: any) => {
      const img = (s.media_attachments || []).find((m: any) => m.type === 'image');
      return {
        url: s.url, platform: 'Mastodon',
        text: clean(unesc(String(s.content || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, ''))).slice(0, 400),
        author: s.account?.display_name ? s.account.display_name : '@' + s.account?.acct,
        image: https(img?.preview_url), date: s.created_at,
      };
    }).filter((p: Post) => p.text.length > 20).slice(0, 3);
  } catch (e) { dbg.masto_err = String(e).slice(0, 80); return []; }
}

const SITES: { domain: string; platform: string; post: RegExp }[] = [
  { domain: 'instagram.com', platform: 'Instagram', post: /\/(p|reel|reels|tv)\// },
  { domain: 'tiktok.com', platform: 'TikTok', post: /\/(video|photo)\/\d+/ },
  { domain: 'facebook.com', platform: 'Facebook', post: /\/(posts|videos|reel|watch|photo|permalink)/ },
  { domain: 'threads.net', platform: 'Threads', post: /\/post\// },
];

async function exaFind(name: string, site: typeof SITES[number], dbg: any): Promise<Post[]> {
  if (!EXA_KEY) return [];
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST', headers: { 'x-api-key': EXA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${name} ${site.platform} post`, numResults: 8, type: 'auto', includeDomains: [site.domain], contents: { text: { maxCharacters: 400 } } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { dbg['exa_' + site.domain] = res.status; return []; }
    const data = await res.json();
    return (data.results || []).filter((r: any) => { try { return site.post.test(new URL(r.url).pathname); } catch { return false; } }).slice(0, 2)
      .map((r: any) => ({ url: r.url, platform: site.platform, text: clean(r.text || r.title).slice(0, 400), author: r.author || '', image: https(r.image), date: r.publishedDate || '' }))
      .filter((p: Post) => p.text && !/log in|sign up|create an account/i.test(p.text));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const name = clean(body?.name).slice(0, 80);
  if (!name) return json({ posts: [] });
  const h = body?.handles || {};
  const dbg: any = {};
  const jobs: Promise<Post[]>[] = [];
  if (typeof h.x === 'string' && /^[\w]{1,15}$/.test(h.x.replace(/^@/, ''))) jobs.push(xTimeline(h.x, dbg));
  if (typeof h.youtube === 'string' && /^UC[\w-]{20,26}$/.test(h.youtube)) jobs.push(ytFeed(h.youtube, dbg));
  if (typeof h.bluesky === 'string' && /^[\w.-]+$/.test(h.bluesky)) jobs.push(bskyFeed(h.bluesky, dbg));
  jobs.push(redditRss(name, dbg), mastodonTag(name, dbg));
  SITES.forEach((s) => jobs.push(exaFind(name, s, dbg)));
  const lists = await Promise.all(jobs.map((j) => j.catch(() => [] as Post[])));
  const seen = new Set<string>();
  const posts = lists.flat().filter((p) => p.url && !seen.has(p.url) && seen.add(p.url));
  return json({ posts, dbg: body?.debug ? dbg : undefined });
});
