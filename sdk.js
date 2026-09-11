/**
 * sign-in-with-360  — client SDK
 *
 * Handles the full PKCE OAuth 2.0 flow for browser-based apps.
 * No dependencies, ~3 kB minified.
 *
 * Usage:
 *   import { Auth360 } from './sdk.js';
 *
 *   const auth = new Auth360({
 *     clientId:    '360_abc123',
 *     redirectUri: 'https://yourapp.com/auth/callback',
 *     scope:       'profile email',
 *   });
 *
 *   // On login button click:
 *   await auth.signIn();
 *
 *   // On /auth/callback page load:
 *   const tokens = await auth.handleCallback();
 *
 *   // Get the current user:
 *   const user = await auth.getUser();
 *
 *   // Sign out:
 *   auth.signOut();
 */

const BASE_URL   = 'https://360-search.com';
const STORE_KEY  = '360_oauth_';

export class Auth360 {
  constructor({ clientId, redirectUri, scope = 'profile email' }) {
    if (!clientId || !redirectUri) throw new Error('clientId and redirectUri are required.');
    this.clientId    = clientId;
    this.redirectUri = redirectUri;
    this.scope       = scope;
  }

  /* ── PKCE helpers ─────────────────────────────────────────── */

  async #generateVerifier() {
    const arr = new Uint8Array(40);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async #challengeFor(verifier) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  #randomState() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ── Storage ──────────────────────────────────────────────── */

  #store(key, val) { sessionStorage.setItem(STORE_KEY + key, val); }
  #load(key)       { return sessionStorage.getItem(STORE_KEY + key); }
  #clear(key)      { sessionStorage.removeItem(STORE_KEY + key); }

  /* ── signIn() ─────────────────────────────────────────────── */

  async signIn() {
    const verifier   = await this.#generateVerifier();
    const challenge  = await this.#challengeFor(verifier);
    const state      = this.#randomState();

    this.#store('verifier', verifier);
    this.#store('state',    state);

    const url = new URL(`${BASE_URL}/oauth/authorize`);
    url.searchParams.set('response_type',          'code');
    url.searchParams.set('client_id',              this.clientId);
    url.searchParams.set('redirect_uri',           this.redirectUri);
    url.searchParams.set('scope',                  this.scope);
    url.searchParams.set('state',                  state);
    url.searchParams.set('code_challenge',         challenge);
    url.searchParams.set('code_challenge_method',  'S256');

    window.location.href = url.toString();
  }

  /* ── handleCallback() ─────────────────────────────────────── */

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');
    const error  = params.get('error');

    if (error) throw new Error(params.get('error_description') || error);
    if (!code || !state) throw new Error('Missing code or state in callback.');

    const savedState = this.#load('state');
    if (state !== savedState) throw new Error('State mismatch — possible CSRF.');

    const verifier = this.#load('verifier');
    this.#clear('state');
    this.#clear('verifier');

    const res  = await fetch(`${BASE_URL}/oauth/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  this.redirectUri,
        client_id:     this.clientId,
        code_verifier: verifier,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed.');

    this.#store('access_token',  data.access_token);
    this.#store('refresh_token', data.refresh_token);
    this.#store('expires_at',    String(Date.now() + data.expires_in * 1000));
    this.#store('scope',         data.scope);

    // Remove code/state from URL without a page reload
    const clean = window.location.pathname;
    window.history.replaceState({}, document.title, clean);

    return data;
  }

  /* ── getAccessToken() — returns a valid token, refreshing if needed ── */

  async getAccessToken() {
    const token     = this.#load('access_token');
    const expiresAt = parseInt(this.#load('expires_at') || '0', 10);

    if (token && Date.now() < expiresAt - 60_000) return token;

    const refreshToken = this.#load('refresh_token');
    if (!refreshToken) return null;

    const res  = await fetch(`${BASE_URL}/oauth/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     this.clientId,
      }),
    });

    if (!res.ok) { this.signOut(); return null; }

    const data = await res.json();
    this.#store('access_token',  data.access_token);
    this.#store('refresh_token', data.refresh_token);
    this.#store('expires_at',    String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  }

  /* ── getUser() ────────────────────────────────────────────── */

  async getUser() {
    const token = await this.getAccessToken();
    if (!token) return null;

    const res = await fetch(`${BASE_URL}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  }

  /* ── signOut() ────────────────────────────────────────────── */

  signOut() {
    const token = this.#load('access_token');
    if (token) {
      // Fire-and-forget revocation
      fetch(`${BASE_URL}/oauth/token/revoke`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    ['access_token','refresh_token','expires_at','scope','verifier','state']
      .forEach(k => this.#clear(k));
  }

  /* ── isSignedIn() ─────────────────────────────────────────── */

  isSignedIn() {
    return !!this.#load('access_token') &&
           Date.now() < parseInt(this.#load('expires_at') || '0', 10);
  }
}
