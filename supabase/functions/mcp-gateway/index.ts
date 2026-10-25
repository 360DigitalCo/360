const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PROTOCOL = "2025-06-18";
const TIMEOUT = 15000;
const MAX_ROUNDS = 4;
const MAX_OUT = 6000;

type Server = { id: string; name?: string; url: string; token?: string; headers?: Record<string, string>; allowWrites?: boolean };

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function privateHost(h: string): boolean {
  const host = h.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(":")) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host === "::";
  return false;
}

async function assertPublic(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:") throw new Error("Only https URLs are allowed");
  if (u.username || u.password) throw new Error("Credentials in URLs are not allowed");
  if (privateHost(u.hostname)) throw new Error("That address is not allowed");
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && !u.hostname.includes(":")) {
    for (const type of ["A", "AAAA"] as const) {
      try {
        const recs = await Deno.resolveDns(u.hostname, type);
        if (recs.some((r) => privateHost(String(r)))) throw new Error("That address is not allowed");
      } catch (e) {
        if (e instanceof Error && e.message === "That address is not allowed") throw e;
      }
    }
  }
  return u;
}

async function guarded(url: string, init: RequestInit = {}, ms = TIMEOUT): Promise<Response> {
  await assertPublic(url);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: "manual" });
  } finally { clearTimeout(t); }
}

function authHeaders(s: Server): Record<string, string> {
  const h: Record<string, string> = { ...(s.headers || {}) };
  if (s.token) h["Authorization"] = /^bearer /i.test(s.token) ? s.token : `Bearer ${s.token}`;
  return h;
}

async function readRpc(res: Response, id: number): Promise<any> {
  const type = res.headers.get("content-type") || "";
  const text = await res.text();
  if (type.includes("text/event-stream")) {
    let found: any = null;
    for (const block of text.split(/\n\n+/)) {
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (msg && msg.id === id) found = msg;
      } catch { /* ignore */ }
    }
    if (!found) throw new Error("No response from the MCP server");
    return found;
  }
  try { return JSON.parse(text); } catch { throw new Error("Unreadable response from the MCP server"); }
}

class McpClient {
  session: string | null = null;
  seq = 1;
  constructor(public s: Server) {}

  async post(body: unknown, expectId?: number): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      ...authHeaders(this.s),
    };
    if (this.session) headers["Mcp-Session-Id"] = this.session;
    const res = await guarded(this.s.url, { method: "POST", headers, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) {
      const err: any = new Error(res.status === 401 ? "Authorization required" : "Access denied");
      err.status = res.status;
      err.www = res.headers.get("www-authenticate") || "";
      throw err;
    }
    if (res.status >= 300 && res.status < 400) throw new Error("The MCP server redirected the request");
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.session = sid;
    if (expectId === undefined) { await res.text().catch(() => ""); return null; }
    if (!res.ok) throw new Error(`MCP server returned ${res.status}`);
    const msg = await readRpc(res, expectId);
    if (msg.error) throw new Error(msg.error.message || "MCP error");
    return msg.result;
  }

  async init(): Promise<any> {
    const id = this.seq++;
    const result = await this.post({
      jsonrpc: "2.0", id, method: "initialize",
      params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "360 AI", version: "1.0.0" } },
    }, id);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
    return result;
  }

  async call(method: string, params: unknown = {}): Promise<any> {
    const id = this.seq++;
    return this.post({ jsonrpc: "2.0", id, method, params }, id);
  }

  async tools(): Promise<any[]> {
    const out: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const r = await this.call("tools/list", cursor ? { cursor } : {});
      out.push(...(r.tools || []));
      cursor = r.nextCursor;
      if (!cursor) break;
    }
    return out;
  }
}

function isReadOnly(t: any): boolean {
  const a = t.annotations || {};
  if (a.destructiveHint === true) return false;
  if (a.readOnlyHint === true) return true;
  if (a.readOnlyHint === false) return false;
  return /^(get|list|search|read|fetch|find|query|describe|view|show|lookup|resolve|check|count|browse|retrieve)/i.test(t.name || "");
}

function oauthMeta(www: string): string | null {
  const m = www.match(/resource_metadata="([^"]+)"/i);
  return m ? m[1] : null;
}

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await guarded(url, { headers: { Accept: "application/json" } }, 8000);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function discover(url: string, redirectUri: string, name: string) {
  const origin = new URL(url).origin;
  let metaUrl: string | null = null;
  try {
    const c = new McpClient({ id: "x", url });
    await c.init();
    return { open: true };
  } catch (e: any) {
    if (e.status === 401 || e.status === 403) metaUrl = oauthMeta(e.www || "");
    else if (!/Authorization|required/i.test(String(e.message))) throw e;
  }
  const prm = (metaUrl && await getJson(metaUrl)) || await getJson(`${origin}/.well-known/oauth-protected-resource`);
  const issuer: string = (prm && prm.authorization_servers && prm.authorization_servers[0]) || origin;
  const base = new URL(issuer);
  const wk = base.pathname && base.pathname !== "/" ? `${base.origin}/.well-known/oauth-authorization-server${base.pathname}` : `${base.origin}/.well-known/oauth-authorization-server`;
  const as = (await getJson(wk)) || (await getJson(`${base.origin}/.well-known/openid-configuration`)) || {
    authorization_endpoint: `${base.origin}/authorize`, token_endpoint: `${base.origin}/token`, registration_endpoint: `${base.origin}/register`,
  };
  if (!as.authorization_endpoint || !as.token_endpoint) throw new Error("This server does not support sign in. Use an access token instead.");
  let clientId = "";
  if (as.registration_endpoint) {
    const r = await guarded(as.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: name || "360 AI", redirect_uris: [redirectUri], grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"], token_endpoint_auth_method: "none", application_type: "web",
      }),
    });
    const reg = await r.json().catch(() => ({}));
    if (!r.ok || !reg.client_id) throw new Error(reg.error_description || "The server would not register 360 AI as a client. Use an access token instead.");
    clientId = reg.client_id;
  } else {
    throw new Error("This server needs a pre-registered app. Use an access token instead.");
  }
  const scopes = Array.isArray(as.scopes_supported) ? as.scopes_supported.join(" ") : "";
  return {
    open: false, authorization_endpoint: as.authorization_endpoint, token_endpoint: as.token_endpoint,
    client_id: clientId, resource: prm?.resource || url, scope: prm?.scopes_supported?.join(" ") || scopes,
  };
}

async function tokenRequest(endpoint: string, params: Record<string, string>) {
  const r = await guarded(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(data.error_description || data.error || "Token request failed");
  return {
    access_token: data.access_token, refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || 3600, token_type: data.token_type || "Bearer",
  };
}

function safeName(s: string): string { return s.replace(/[^a-zA-Z0-9_-]/g, "_"); }

async function chatWithTools(messages: any[], tools: any[]): Promise<any> {
  const groq = Deno.env.get("GROQ_API_KEY");
  const or = Deno.env.get("OPENROUTER_API_KEY");
  const attempts: Array<{ url: string; key: string; model: string; extra?: Record<string, string> }> = [];
  if (groq) attempts.push({ url: "https://api.groq.com/openai/v1/chat/completions", key: groq, model: "llama-3.3-70b-versatile" });
  if (or) {
    attempts.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: or, model: "openai/gpt-oss-120b:free", extra: { "HTTP-Referer": "https://360-search.com", "X-Title": "360 AI" } });
    attempts.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: or, model: "meta-llama/llama-3.3-70b-instruct:free", extra: { "HTTP-Referer": "https://360-search.com", "X-Title": "360 AI" } });
  }
  let last = "No model is configured for tools";
  for (const a of attempts) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(a.url, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.key}`, ...(a.extra || {}) },
        body: JSON.stringify({ model: a.model, messages, tools, tool_choice: "auto", temperature: 0.1, max_tokens: 1500 }),
      });
      clearTimeout(t);
      if (!r.ok) { last = `${a.model} ${r.status}`; continue; }
      const j = await r.json();
      const msg = j.choices?.[0]?.message;
      if (msg) return msg;
    } catch (e: any) { last = e?.message || String(e); }
  }
  throw new Error(last);
}

function sse(controller: ReadableStreamDefaultController, obj: unknown) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
}

async function runAgent(servers: Server[], message: string, memory: any[], controller: ReadableStreamDefaultController) {
  const clients = new Map<string, McpClient>();
  const catalog: Array<{ fn: string; server: Server; tool: any }> = [];
  for (const s of servers.slice(0, 8)) {
    try {
      const c = new McpClient(s);
      await c.init();
      const tools = await c.tools();
      clients.set(s.id, c);
      for (const t of tools) {
        if (!s.allowWrites && !isReadOnly(t)) continue;
        const fn = (safeName(s.id) + "__" + safeName(t.name)).slice(0, 64);
        catalog.push({ fn, server: s, tool: t });
      }
    } catch (e: any) {
      sse(controller, { type: "tool", name: s.name || s.id, status: "done", code: "connect", output: `[Could not connect: ${e?.message || e}]` });
    }
  }
  if (!catalog.length) return "";
  const tools = catalog.slice(0, 120).map((c) => ({
    type: "function",
    function: {
      name: c.fn,
      description: `[${c.server.name || c.server.id}] ${(c.tool.description || c.tool.title || c.tool.name).slice(0, 400)}`,
      parameters: c.tool.inputSchema && c.tool.inputSchema.type ? c.tool.inputSchema : { type: "object", properties: {} },
    },
  }));
  const messages: any[] = [
    { role: "system", content: "You decide whether tools are needed to answer the user. Call tools when the request involves the user's connected services or data. Prefer a small number of precise calls. If no tool helps, answer with the single word DONE." },
    ...memory.slice(-6).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1500) })),
    { role: "user", content: message.slice(0, 4000) },
  ];
  const gathered: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await chatWithTools(messages, tools).catch((e) => {
      sse(controller, { type: "tool", name: "agent", status: "done", code: "plan", output: `[Planning failed: ${e?.message || e}]` });
      return null;
    });
    if (!reply || !reply.tool_calls || !reply.tool_calls.length) break;
    messages.push({ role: "assistant", content: reply.content || "", tool_calls: reply.tool_calls });
    for (const call of reply.tool_calls.slice(0, 4)) {
      const entry = catalog.find((c) => c.fn === call.function?.name);
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
      const label = entry ? `${entry.server.name || entry.server.id}: ${entry.tool.name}` : String(call.function?.name);
      const code = JSON.stringify(args).slice(0, 600);
      sse(controller, { type: "tool", name: label, status: "running", code });
      let out: string;
      if (!entry) out = "[Unknown tool]";
      else {
        try {
          const res = await clients.get(entry.server.id)!.call("tools/call", { name: entry.tool.name, arguments: args });
          const parts = (res.content || []).map((p: any) => p.type === "text" ? p.text : p.type === "resource" ? (p.resource?.text || "") : `[${p.type}]`);
          out = (parts.join("\n") || JSON.stringify(res.structuredContent || res)).slice(0, MAX_OUT);
          if (res.isError) out = "[Tool error] " + out;
        } catch (e: any) { out = `[Tool error: ${e?.message || e}]`; }
      }
      sse(controller, { type: "tool", name: label, status: "done", code, output: out.slice(0, 2000) });
      gathered.push(`${label}\n${out}`);
      messages.push({ role: "tool", tool_call_id: call.id, content: out });
    }
  }
  return gathered.length ? gathered.join("\n\n---\n\n").slice(0, 24000) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const action = String(body.action || "");
  try {
    if (action === "probe") {
      const s: Server = { id: "probe", url: String(body.url || ""), token: body.token, headers: body.headers };
      const c = new McpClient(s);
      const info = await c.init();
      const tools = await c.tools();
      return json({
        ok: true, server: info?.serverInfo || null,
        tools: tools.map((t) => ({ name: t.name, description: (t.description || t.title || "").slice(0, 200), readOnly: isReadOnly(t) })),
      });
    }
    if (action === "discover") {
      return json(await discover(String(body.url || ""), String(body.redirect_uri || ""), String(body.client_name || "360 AI")));
    }
    if (action === "exchange") {
      return json(await tokenRequest(String(body.token_endpoint), {
        grant_type: "authorization_code", code: String(body.code), redirect_uri: String(body.redirect_uri),
        client_id: String(body.client_id), code_verifier: String(body.code_verifier), ...(body.resource ? { resource: String(body.resource) } : {}),
      }));
    }
    if (action === "refresh") {
      return json(await tokenRequest(String(body.token_endpoint), {
        grant_type: "refresh_token", refresh_token: String(body.refresh_token), client_id: String(body.client_id), ...(body.resource ? { resource: String(body.resource) } : {}),
      }));
    }
    if (action === "run") {
      const servers: Server[] = Array.isArray(body.servers) ? body.servers : [];
      const message = String(body.message || "");
      const memory = Array.isArray(body.memory) ? body.memory : [];
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const context = await runAgent(servers, message, memory, controller);
            sse(controller, { type: "context", text: context });
          } catch (e: any) {
            sse(controller, { type: "context", text: "", error: e?.message || String(e) });
          }
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e), status: e?.status || null, www: e?.www || null }, 200);
  }
});
