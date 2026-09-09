/**
 * 360 OAuth 2.0 Authorization Server
 * "Sign in with 360"
 *
 * Endpoints
 *   GET  /oauth/authorize          — redirect user to consent screen
 *   POST /oauth/token              — exchange code → access + refresh token
 *   POST /oauth/token/refresh      — rotate refresh token
 *   POST /oauth/token/revoke       — revoke any token
 *   GET  /oauth/userinfo           — OpenID Connect userinfo (Bearer)
 *   GET  /oauth/keys               — JWKS public key set (future JWT)
 *   POST /oauth/clients            — register a new OAuth application (authed)
 *   GET  /oauth/clients/:clientId  — get client metadata (authed, own clients)
 *
 * PKCE (RFC 7636) is required for public clients.
 * Confidential clients must send client_secret.
 *
 * Supported scopes:
 *   profile   — id, username, display_name, avatar_url, created_at
 *   email     — email, email_verified
 *   openid    — sub (same as profile.id)
 *   premium   — membership_tier, premium_until
 *   dev       — dev_suite flag (gated; client must be approved)
 *
 * Env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS for token ops
 *   OAUTH_BASE_URL              — https://360-search.com (no trailing slash)
 *   TOKEN_SECRET                — 64+ char random string for HMAC signing
 */

import crypto  from 'crypto';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BASE        = process.env.OAUTH_BASE_URL || 'https://360-search.com';
const TOKEN_TTL   = 3600;          // access token: 1 hour
const REFRESH_TTL = 60 * 60 * 24 * 90; // refresh token: 90 days

const VALID_SCOPES = new Set(['profile','email','openid','premium','dev']);

/* ── Helpers ─────────────────────────────────────────────────── */

function randomToken(bytes = 40) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(val) {
  return crypto.createHash('sha256').update(val).digest('base64url');
}

function hmac(val) {
  return crypto
    .createHmac('sha256', process.env.TOKEN_SECRET)
    .update(val)
    .digest('base64url');
}

function tokenPair(clientId, userId, scope) {
  const raw     = randomToken(40);
  const rawRef  = randomToken(50);
  const expiresAt  = new Date(Date.now() + TOKEN_TTL   * 1000).toISOString();
  const refExpiresAt = new Date(Date.now() + REFRESH_TTL * 1000).toISOString();
  return {
    access: {
      raw,
      hash:      sha256(raw),
      expiresAt,
    },
    refresh: {
      raw:       rawRef,
      hash:      sha256(rawRef),
      expiresAt: refExpiresAt,
    },
  };
}

function validateScopes(requested, allowed) {
  const req = requested.split(' ').filter(Boolean);
  const ok  = req.filter(s => VALID_SCOPES.has(s) && allowed.includes(s));
  return ok.join(' ') || 'profile';
}

function oauthError(res, code, description, status = 400) {
  return res.status(status).json({ error: code, error_description: description });
}

async function verifyBearer(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const raw  = auth.slice(7);
  const hash = sha256(raw);
  const { data } = await sb
    .from('oauth_access_tokens')
    .select('*')
    .eq('token_hash', hash)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data || null;
}

async function getClient(clientId) {
  const { data } = await sb
    .from('oauth_clients')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .single();
  return data;
}

async function auditLog(event, { clientId, userId, ip, userAgent, meta } = {}) {
  await sb.from('oauth_audit_log').insert({
    event,
    client_id:  clientId  || null,
    user_id:    userId    || null,
    ip:         ip        || null,
    user_agent: userAgent || null,
    meta:       meta      || null,
  });
}

function ip(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

/* ═══════════════════════════════════════════════════════════════
   GET /oauth/authorize
   Query params: client_id, redirect_uri, response_type, scope,
                 state, code_challenge, code_challenge_method
═══════════════════════════════════════════════════════════════ */
export async function authorize(req, res) {
  const {
    client_id, redirect_uri, response_type,
    scope = 'profile', state,
    code_challenge, code_challenge_method,
  } = req.query;

  if (response_type !== 'code')
    return oauthError(res, 'unsupported_response_type', 'Only code flow is supported.');

  if (!client_id || !redirect_uri)
    return oauthError(res, 'invalid_request', 'client_id and redirect_uri are required.');

  const client = await getClient(client_id);
  if (!client)
    return oauthError(res, 'invalid_client', 'Unknown client_id.', 401);

  if (!client.redirect_uris.includes(redirect_uri))
    return oauthError(res, 'invalid_request', 'redirect_uri not registered for this client.');

  if (client.is_public && !code_challenge)
    return oauthError(res, 'invalid_request', 'PKCE code_challenge required for public clients.');

  const resolvedScope = validateScopes(scope, client.allowed_scopes);

  // Store PKCE state server-side (10 min TTL) then redirect to consent UI
  const stateToken = state || randomToken(16);
  await sb.from('oauth_pkce_state').insert({
    state:                stateToken,
    client_id,
    redirect_uri,
    scope:                resolvedScope,
    code_challenge:       code_challenge       || null,
    code_challenge_method: code_challenge_method || null,
  });

  const consentUrl = new URL(`${BASE}/oauth/consent`);
  consentUrl.searchParams.set('state',     stateToken);
  consentUrl.searchParams.set('client_id', client_id);
  consentUrl.searchParams.set('scope',     resolvedScope);
  consentUrl.searchParams.set('app_name',  client.name);
  if (client.logo_url)     consentUrl.searchParams.set('logo',     client.logo_url);
  if (client.homepage_url) consentUrl.searchParams.set('homepage', client.homepage_url);

  return res.redirect(302, consentUrl.toString());
}

/* ═══════════════════════════════════════════════════════════════
   POST /oauth/consent/approve
   Called by the consent page after the user clicks "Approve".
   Body: { state, supabase_access_token }
   Returns: redirect to redirect_uri?code=...&state=...
═══════════════════════════════════════════════════════════════ */
export async function consentApprove(req, res) {
  const { state, supabase_access_token } = req.body;
  if (!state || !supabase_access_token)
    return oauthError(res, 'invalid_request', 'state and supabase_access_token are required.');

  // Verify the Supabase session token
  const { data: { user }, error: authErr } = await sb.auth.getUser(supabase_access_token);
  if (authErr || !user)
    return oauthError(res, 'access_denied', 'Invalid or expired session. Please sign in again.', 401);

  // Pull PKCE state
  const { data: pkce, error: pkceErr } = await sb
    .from('oauth_pkce_state')
    .select('*')
    .eq('state', state)
    .gt('expires_at', new Date().toISOString())
    .single();
  if (pkceErr || !pkce)
    return oauthError(res, 'invalid_request', 'State expired or invalid. Restart the flow.');

  // Delete used state
  await sb.from('oauth_pkce_state').delete().eq('state', state);

  // Upsert consent record
  await sb.from('oauth_consents').upsert(
    { user_id: user.id, client_id: pkce.client_id, scope: pkce.scope },
    { onConflict: 'user_id,client_id' }
  );

  // Issue authorization code (2 min TTL, single-use)
  const code = randomToken(32);
  await sb.from('oauth_authorization_codes').insert({
    code,
    client_id:             pkce.client_id,
    user_id:               user.id,
    redirect_uri:          pkce.redirect_uri,
    scope:                 pkce.scope,
    code_challenge:        pkce.code_challenge,
    code_challenge_method: pkce.code_challenge_method,
  });

  await auditLog('code_issued', {
    clientId: pkce.client_id, userId: user.id,
    ip: ip(req), userAgent: req.headers['user-agent'],
    meta: { scope: pkce.scope },
  });

  const redirect = new URL(pkce.redirect_uri);
  redirect.searchParams.set('code',  code);
  redirect.searchParams.set('state', state);
  return res.redirect(302, redirect.toString());
}

/* ═══════════════════════════════════════════════════════════════
   POST /oauth/token
   grant_type: authorization_code | refresh_token
═══════════════════════════════════════════════════════════════ */
export async function token(req, res) {
  const { grant_type } = req.body;
  if (grant_type === 'authorization_code') return tokenAuthCode(req, res);
  if (grant_type === 'refresh_token')      return tokenRefresh(req, res);
  return oauthError(res, 'unsupported_grant_type', 'Supported: authorization_code, refresh_token.');
}

async function tokenAuthCode(req, res) {
  const { code, redirect_uri, client_id, client_secret, code_verifier } = req.body;
  if (!code || !redirect_uri || !client_id)
    return oauthError(res, 'invalid_request', 'code, redirect_uri, client_id are required.');

  const client = await getClient(client_id);
  if (!client) return oauthError(res, 'invalid_client', 'Unknown client.', 401);

  // Confidential client — verify secret
  if (!client.is_public) {
    if (!client_secret) return oauthError(res, 'invalid_client', 'client_secret required.', 401);
    const secretHash = sha256(client_secret);
    if (!crypto.timingSafeEqual(Buffer.from(secretHash), Buffer.from(client.client_secret_hash)))
      return oauthError(res, 'invalid_client', 'Invalid client_secret.', 401);
  }

  // Pull and validate auth code
  const { data: authCode, error: codeErr } = await sb
    .from('oauth_authorization_codes')
    .select('*')
    .eq('code', code)
    .eq('client_id', client_id)
    .eq('redirect_uri', redirect_uri)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .single();
  if (codeErr || !authCode)
    return oauthError(res, 'invalid_grant', 'Authorization code invalid, expired, or already used.');

  // Mark code used immediately (replay protection)
  await sb.from('oauth_authorization_codes').update({ used: true }).eq('code', code);

  // PKCE verification for public clients
  if (client.is_public) {
    if (!code_verifier) return oauthError(res, 'invalid_request', 'code_verifier required.');
    const method = authCode.code_challenge_method || 'S256';
    const derived = method === 'S256'
      ? sha256(code_verifier)
      : code_verifier;
    if (!crypto.timingSafeEqual(
      Buffer.from(derived),
      Buffer.from(authCode.code_challenge)
    )) return oauthError(res, 'invalid_grant', 'PKCE verification failed.');
  }

  const tokens = tokenPair(client_id, authCode.user_id, authCode.scope);

  // Persist access token
  const { data: atRow } = await sb.from('oauth_access_tokens').insert({
    token_hash: tokens.access.hash,
    client_id,
    user_id:    authCode.user_id,
    scope:      authCode.scope,
    expires_at: tokens.access.expiresAt,
  }).select('id').single();

  // Persist refresh token
  await sb.from('oauth_refresh_tokens').insert({
    token_hash:      tokens.refresh.hash,
    client_id,
    user_id:         authCode.user_id,
    scope:           authCode.scope,
    access_token_id: atRow?.id || null,
    expires_at:      tokens.refresh.expiresAt,
  });

  await auditLog('token_issued', {
    clientId: client_id, userId: authCode.user_id,
    ip: ip(req), userAgent: req.headers['user-agent'],
    meta: { grant: 'authorization_code', scope: authCode.scope },
  });

  return res.json({
    access_token:  tokens.access.raw,
    token_type:    'Bearer',
    expires_in:    TOKEN_TTL,
    refresh_token: tokens.refresh.raw,
    scope:         authCode.scope,
  });
}

async function tokenRefresh(req, res) {
  const { refresh_token, client_id, client_secret } = req.body;
  if (!refresh_token || !client_id)
    return oauthError(res, 'invalid_request', 'refresh_token and client_id are required.');

  const client = await getClient(client_id);
  if (!client) return oauthError(res, 'invalid_client', 'Unknown client.', 401);

  if (!client.is_public) {
    if (!client_secret) return oauthError(res, 'invalid_client', 'client_secret required.', 401);
    const secretHash = sha256(client_secret);
    if (!crypto.timingSafeEqual(Buffer.from(secretHash), Buffer.from(client.client_secret_hash)))
      return oauthError(res, 'invalid_client', 'Invalid client_secret.', 401);
  }

  const { data: rt } = await sb
    .from('oauth_refresh_tokens')
    .select('*')
    .eq('token_hash', sha256(refresh_token))
    .eq('client_id', client_id)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .single();
  if (!rt) return oauthError(res, 'invalid_grant', 'Refresh token invalid or expired.');

  // Rotate: revoke old tokens, issue new pair
  await sb.from('oauth_refresh_tokens').update({ revoked: true }).eq('id', rt.id);
  if (rt.access_token_id)
    await sb.from('oauth_access_tokens').update({ revoked: true }).eq('id', rt.access_token_id);

  const tokens = tokenPair(client_id, rt.user_id, rt.scope);

  const { data: atRow } = await sb.from('oauth_access_tokens').insert({
    token_hash: tokens.access.hash,
    client_id,
    user_id:    rt.user_id,
    scope:      rt.scope,
    expires_at: tokens.access.expiresAt,
  }).select('id').single();

  await sb.from('oauth_refresh_tokens').insert({
    token_hash:      tokens.refresh.hash,
    client_id,
    user_id:         rt.user_id,
    scope:           rt.scope,
    access_token_id: atRow?.id || null,
    expires_at:      tokens.refresh.expiresAt,
  });

  await auditLog('token_refreshed', {
    clientId: client_id, userId: rt.user_id, ip: ip(req),
  });

  return res.json({
    access_token:  tokens.access.raw,
    token_type:    'Bearer',
    expires_in:    TOKEN_TTL,
    refresh_token: tokens.refresh.raw,
    scope:         rt.scope,
  });
}

/* ═══════════════════════════════════════════════════════════════
   POST /oauth/token/revoke
   Revokes an access or refresh token.
═══════════════════════════════════════════════════════════════ */
export async function revoke(req, res) {
  const { token: rawToken, token_type_hint } = req.body;
  if (!rawToken) return oauthError(res, 'invalid_request', 'token is required.');
  const hash = sha256(rawToken);

  if (token_type_hint !== 'refresh_token') {
    await sb.from('oauth_access_tokens').update({ revoked: true }).eq('token_hash', hash);
  }
  await sb.from('oauth_refresh_tokens').update({ revoked: true }).eq('token_hash', hash);

  return res.json({ revoked: true });
}

/* ═══════════════════════════════════════════════════════════════
   GET /oauth/userinfo
   Returns claims for the scopes granted on the access token.
═══════════════════════════════════════════════════════════════ */
export async function userinfo(req, res) {
  const tok = await verifyBearer(req);
  if (!tok) return oauthError(res, 'invalid_token', 'Missing or expired access token.', 401);

  const scopes = tok.scope.split(' ');

  const select = ['id','username','display_name','avatar_url','avatar_style','avatar_seed','created_at'];
  if (scopes.includes('email'))   select.push('email','email_verified');
  if (scopes.includes('premium')) select.push('membership_tier','premium_until');
  if (scopes.includes('dev'))     select.push('dev_suite');

  const { data: profile } = await sb
    .from('profiles')
    .select(select.join(','))
    .eq('id', tok.user_id)
    .eq('account_deleted', false)
    .single();

  if (!profile) return oauthError(res, 'invalid_token', 'User not found.', 401);

  const claims = {
    sub:          profile.id,
    username:     profile.username,
    display_name: profile.display_name || profile.username,
    avatar_url:   profile.avatar_url   || null,
    avatar_style: profile.avatar_style || null,
    avatar_seed:  profile.avatar_seed  || null,
    created_at:   profile.created_at,
  };

  if (scopes.includes('email')) {
    claims.email          = profile.email;
    claims.email_verified = profile.email_verified || false;
  }
  if (scopes.includes('premium')) {
    claims.membership_tier = profile.membership_tier || null;
    claims.premium_until   = profile.premium_until   || null;
  }
  if (scopes.includes('dev')) {
    claims.dev_suite = profile.dev_suite || false;
  }

  return res.json(claims);
}

/* ═══════════════════════════════════════════════════════════════
   POST /oauth/clients  — register a new OAuth application
   Requires a valid 360 user session (Bearer from Supabase Auth).
═══════════════════════════════════════════════════════════════ */
export async function registerClient(req, res) {
  const { data: { user } } = await sb.auth.getUser(
    (req.headers.authorization || '').replace('Bearer ', '')
  );
  if (!user) return oauthError(res, 'unauthorized', 'Sign in to register an application.', 401);

  const {
    name, description, homepage_url, logo_url,
    redirect_uris = [], allowed_scopes = ['profile','email'],
    is_public = false,
    client_secret,
  } = req.body;

  if (!name)              return oauthError(res, 'invalid_request', 'name is required.');
  if (!redirect_uris.length) return oauthError(res, 'invalid_request', 'At least one redirect_uri is required.');

  const validScopes = allowed_scopes.filter(s => VALID_SCOPES.has(s));

  const row = {
    name,
    description:    description    || null,
    homepage_url:   homepage_url   || null,
    logo_url:       logo_url       || null,
    redirect_uris,
    allowed_scopes: validScopes,
    owner_id:       user.id,
    is_public:      Boolean(is_public),
    client_secret_hash: null,
  };

  // Confidential clients hash the secret — it's never stored in plaintext
  const plainSecret = (!is_public && client_secret) ? client_secret : null;
  if (plainSecret) row.client_secret_hash = sha256(plainSecret);

  const { data: newClient, error } = await sb
    .from('oauth_clients')
    .insert(row)
    .select('client_id,name,redirect_uris,allowed_scopes,is_public,created_at')
    .single();

  if (error) return res.status(500).json({ error: 'server_error', error_description: error.message });

  await auditLog('client_registered', { clientId: newClient.client_id, userId: user.id, ip: ip(req) });

  return res.status(201).json(newClient);
}

/* ═══════════════════════════════════════════════════════════════
   GET /oauth/clients/:clientId  — fetch own client metadata
═══════════════════════════════════════════════════════════════ */
export async function getClientMetadata(req, res) {
  const { data: { user } } = await sb.auth.getUser(
    (req.headers.authorization || '').replace('Bearer ', '')
  );
  if (!user) return oauthError(res, 'unauthorized', 'Sign in required.', 401);

  const { data: client } = await sb
    .from('oauth_clients')
    .select('client_id,name,description,homepage_url,logo_url,redirect_uris,allowed_scopes,is_public,is_active,created_at,updated_at')
    .eq('client_id', req.params.clientId)
    .eq('owner_id', user.id)
    .single();

  if (!client) return oauthError(res, 'not_found', 'Client not found or not yours.', 404);
  return res.json(client);
}

/* ═══════════════════════════════════════════════════════════════
   GET /oauth/clients  — list all clients owned by the authed user
═══════════════════════════════════════════════════════════════ */
export async function listClients(req, res) {
  const { data: { user } } = await sb.auth.getUser(
    (req.headers.authorization || '').replace('Bearer ', '')
  );
  if (!user) return oauthError(res, 'unauthorized', 'Sign in required.', 401);

  const { data: clients } = await sb
    .from('oauth_clients')
    .select('client_id,name,description,homepage_url,logo_url,redirect_uris,allowed_scopes,is_public,is_active,created_at,updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return res.json(clients || []);
}

/* ═══════════════════════════════════════════════════════════════
   DELETE /oauth/clients/:clientId  — delete an app + revoke all its tokens
═══════════════════════════════════════════════════════════════ */
export async function deleteClient(req, res) {
  const { data: { user } } = await sb.auth.getUser(
    (req.headers.authorization || '').replace('Bearer ', '')
  );
  if (!user) return oauthError(res, 'unauthorized', 'Sign in required.', 401);

  const { clientId } = req.params;

  // Confirm ownership before deleting
  const { data: client } = await sb
    .from('oauth_clients')
    .select('id')
    .eq('client_id', clientId)
    .eq('owner_id', user.id)
    .single();
  if (!client) return oauthError(res, 'not_found', 'Client not found or not yours.', 404);

  // Revoke all live tokens for this client
  await sb.from('oauth_access_tokens').update({ revoked: true }).eq('client_id', clientId);
  await sb.from('oauth_refresh_tokens').update({ revoked: true }).eq('client_id', clientId);

  await sb.from('oauth_clients').delete().eq('client_id', clientId);

  await auditLog('client_deleted', { clientId, userId: user.id, ip: ip(req) });

  return res.status(204).end();
}

/* ═══════════════════════════════════════════════════════════════
   GET /oauth/keys  — JWKS endpoint (placeholder for JWT migration)
═══════════════════════════════════════════════════════════════ */
export async function jwks(req, res) {
  return res.json({ keys: [] });
}
