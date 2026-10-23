import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const CATEGORIES = ["Utility", "Moderation", "Fun", "Music", "Productivity", "General"];

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeToken(botId: string) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const body = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `360b_${botId.replace(/-/g, "")}_${body}`;
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Sign in required" }, 401);
  const user = userData.user;

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(payload.action ?? "");

  const { data: profile } = await admin
    .from("profiles")
    .select("banned, age_verified, account_deleted")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.banned || profile?.account_deleted) return json({ error: "Account is suspended" }, 403);

  if (action === "create") {
    const name = String(payload.name ?? "").trim();
    const handle = String(payload.handle ?? "").trim().toLowerCase();
    const description = String(payload.description ?? "").trim().slice(0, 200);
    const category = CATEGORIES.includes(String(payload.category)) ? String(payload.category) : "General";
    const prefix = String(payload.prefix ?? "!").trim().slice(0, 3) || "!";
    const isPublic = payload.is_public !== false;

    if (name.length < 2 || name.length > 32) return json({ error: "Name must be 2 to 32 characters" }, 400);
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
      return json({ error: "Handle must be 3 to 24 characters: letters, numbers, underscore" }, 400);
    }

    const { count } = await admin.from("bots").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    if ((count ?? 0) >= 5) return json({ error: "You can create up to 5 bots" }, 400);

    const { data: taken } = await admin.from("bots").select("id").eq("handle", handle).maybeSingle();
    if (taken) return json({ error: "That handle is already taken" }, 409);

    const botId = crypto.randomUUID();
    const avatar = cleanUrl(payload.avatar_url);
    const website = cleanUrl(payload.website_url);

    const { data: botUser, error: botUserErr } = await admin.auth.admin.createUser({
      email: `bot-${botId}@bots.360-search.com`,
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { username: `${handle}_bot`, avatar_url: avatar, is_bot: true },
    });
    if (botUserErr || !botUser?.user) return json({ error: "Could not create the bot account" }, 500);

    await admin
      .from("profiles")
      .update({ is_bot: true, tag: "BOT", username: `${handle}_bot`, avatar_url: avatar, age_verified: true })
      .eq("id", botUser.user.id);

    const { data: bot, error: botErr } = await admin
      .from("bots")
      .insert({
        id: botId,
        owner_id: user.id,
        bot_user_id: botUser.user.id,
        name,
        handle,
        description: description || null,
        avatar_url: avatar,
        website_url: website,
        category,
        prefix,
        is_public: isPublic,
      })
      .select("id, name, handle, description, avatar_url, website_url, category, prefix, is_public, install_count, created_at")
      .single();
    if (botErr || !bot) {
      await admin.from("profiles").update({ account_deleted: true, banned: true }).eq("id", botUser.user.id);
      return json({ error: "Could not save the bot" }, 500);
    }

    const token = makeToken(botId);
    await admin.from("bot_credentials").insert({ bot_id: botId, token_hash: await sha256Hex(token) });
    return json({ bot, token });
  }

  const botId = String(payload.bot_id ?? "");
  const { data: bot } = await admin
    .from("bots")
    .select("id, owner_id, bot_user_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.owner_id !== user.id) return json({ error: "Bot not found" }, 404);

  if (action === "rotate") {
    const token = makeToken(bot.id);
    const { error } = await admin
      .from("bot_credentials")
      .upsert({ bot_id: bot.id, token_hash: await sha256Hex(token), rotated_at: new Date().toISOString() });
    if (error) return json({ error: "Could not rotate the token" }, 500);
    return json({ token });
  }

  if (action === "delete") {
    if (bot.bot_user_id) {
      await admin.from("server_members").delete().eq("user_id", bot.bot_user_id);
      await admin.from("profiles").update({ account_deleted: true, banned: true }).eq("id", bot.bot_user_id);
    }
    const { error } = await admin.from("bots").delete().eq("id", bot.id);
    if (error) return json({ error: "Could not delete the bot" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
