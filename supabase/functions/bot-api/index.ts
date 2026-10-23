import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bot\s+/i, "").trim();
  const match = token.match(/^360b_([0-9a-f]{32})_[A-Za-z0-9_-]{20,}$/);
  if (!match) return json({ error: "Missing or malformed bot token" }, 401);

  const id = match[1];
  const botId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;

  const { data: cred } = await admin.from("bot_credentials").select("token_hash").eq("bot_id", botId).maybeSingle();
  if (!cred || cred.token_hash !== (await sha256Hex(token))) return json({ error: "Invalid bot token" }, 401);

  const { data: bot } = await admin
    .from("bots")
    .select("id, name, handle, avatar_url, bot_user_id, prefix")
    .eq("id", botId)
    .maybeSingle();
  if (!bot?.bot_user_id) return json({ error: "Bot is not available" }, 403);

  const path = new URL(req.url).pathname.replace(/\/+$/, "");

  if (req.method === "GET" && path.endsWith("/me")) {
    const { data: installs } = await admin.from("bot_server_installs").select("server_id").eq("bot_id", bot.id);
    return json({ id: bot.id, name: bot.name, handle: bot.handle, servers: (installs ?? []).map((i) => i.server_id) });
  }

  if (req.method === "GET" && path.endsWith("/channels")) {
    const { data: installs } = await admin.from("bot_server_installs").select("server_id").eq("bot_id", bot.id);
    const ids = (installs ?? []).map((i) => i.server_id);
    if (!ids.length) return json({ channels: [] });
    const { data: channels } = await admin
      .from("channels")
      .select("id, name, server_id")
      .in("server_id", ids)
      .order("position");
    return json({ channels: channels ?? [] });
  }

  if (req.method === "GET" && path.endsWith("/events")) {
    const { data: installs } = await admin.from("bot_server_installs").select("server_id").eq("bot_id", bot.id);
    const serverIds = (installs ?? []).map((i) => i.server_id);
    if (!serverIds.length) return json({ events: [] });
    const { data: chans } = await admin.from("channels").select("id, server_id").in("server_id", serverIds);
    const serverOf = new Map((chans ?? []).map((c) => [c.id, c.server_id]));
    if (!serverOf.size) return json({ events: [] });

    const q = new URL(req.url).searchParams;
    const afterRaw = q.get("after");
    const afterMs = afterRaw ? Date.parse(afterRaw) : Date.now() - 60_000;
    const after = new Date(Number.isFinite(afterMs) ? afterMs : Date.now() - 60_000).toISOString();

    const { data: rows } = await admin
      .from("messages")
      .select("id, channel_id, user_id, username, text, created_at")
      .in("channel_id", [...serverOf.keys()])
      .gt("created_at", after)
      .neq("user_id", bot.bot_user_id)
      .order("created_at", { ascending: true })
      .limit(200);

    const prefix = bot.prefix || "!";
    const mention = new RegExp(`(^|\\s)@${bot.handle.replace(/[^a-z0-9_]/gi, "")}\\b`, "i");
    const events = (rows ?? [])
      .filter((m) => m.text && (m.text.startsWith(prefix) || mention.test(m.text)))
      .slice(0, 50)
      .map((m) => ({
        id: m.id,
        channel_id: m.channel_id,
        server_id: serverOf.get(m.channel_id),
        author: { id: m.user_id, username: m.username },
        content: m.text,
        created_at: m.created_at,
        type: m.text.startsWith(prefix) ? "command" : "mention",
      }));
    return json({ events, next_after: events.length ? events[events.length - 1].created_at : after });
  }

  if (req.method === "POST" && path.endsWith("/messages")) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const channelId = String(body.channel_id ?? "");
    const content = String(body.content ?? "").trim();
    if (!channelId || !content) return json({ error: "channel_id and content are required" }, 400);
    if (content.length > 2000) return json({ error: "content is limited to 2000 characters" }, 400);

    const { data: channel } = await admin.from("channels").select("id, server_id").eq("id", channelId).maybeSingle();
    if (!channel) return json({ error: "Channel not found" }, 404);

    const { data: install } = await admin
      .from("bot_server_installs")
      .select("id")
      .eq("bot_id", bot.id)
      .eq("server_id", channel.server_id)
      .maybeSingle();
    if (!install) return json({ error: "Bot is not installed in this server" }, 403);

    const since = new Date(Date.now() - 10_000).toISOString();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", bot.bot_user_id)
      .gte("created_at", since);
    if ((count ?? 0) >= 10) return json({ error: "Rate limited" }, 429);

    const { data: message, error } = await admin
      .from("messages")
      .insert({
        user_id: bot.bot_user_id,
        username: bot.name,
        avatar_url: bot.avatar_url,
        tag: "BOT",
        role: "bot",
        text: content,
        channel_id: channel.id,
      })
      .select("id, created_at")
      .single();
    if (error) return json({ error: "Could not send the message" }, 500);
    return json({ id: message.id, created_at: message.created_at }, 201);
  }

  return json({ error: "Not found" }, 404);
});
