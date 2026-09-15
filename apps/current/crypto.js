/**
 * Current E2EE Engine
 * 
 * Architecture:
 * - Each user generates an X25519 (ECDH P-256) identity key pair on registration
 * - Private key stored in IndexedDB (never leaves device)
 * - Public key uploaded to current_profiles.identity_key
 * 
 * Per-conversation session:
 * - Sender generates a random AES-256-GCM session key
 * - Session key is ECDH-wrapped for each recipient using their public identity key
 * - Wrapped keys stored in current_messages.recipient_keys (JSON map)
 * - Message encrypted with AES-GCM session key
 * 
 * On receive:
 * - Fetch your wrapped key from recipient_keys[myUserId]
 * - Unwrap using local private key → AES session key
 * - Decrypt ciphertext
 */

const DB_NAME = "current_e2ee";
const DB_VERSION = 1;
const KEY_STORE = "keys";

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(KEY_STORE);
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const req = tx.objectStore(KEY_STORE).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e.target.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    const req = tx.objectStore(KEY_STORE).put(value, key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    const req = tx.objectStore(KEY_STORE).delete(key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

// ── Base64 helpers ─────────────────────────────────────────────────────────────

export function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ── Identity key management ───────────────────────────────────────────────────

export async function generateIdentityKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  // Export public key as raw bytes → base64 for Supabase
  const pubRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const pubB64 = bufToB64(pubRaw);

  // Export private key as JWK → store in IDB
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

  await idbSet("identity_private_jwk", JSON.stringify(privJwk));
  await idbSet("identity_public_b64", pubB64);

  return pubB64;
}

export async function getPublicKeyB64() {
  return idbGet("identity_public_b64");
}

export async function hasIdentityKey() {
  const k = await idbGet("identity_private_jwk");
  return !!k;
}

async function getPrivateKey() {
  const jwkStr = await idbGet("identity_private_jwk");
  if (!jwkStr) throw new Error("No identity key found. Did you register?");
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"]
  );
}

async function importPublicKey(b64) {
  const raw = b64ToBuf(b64);
  return crypto.subtle.importKey(
    "raw", raw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
}

// ── ECDH key wrapping ──────────────────────────────────────────────────────────

// Derive a wrapping key from ECDH shared secret between our private key and their public key
async function deriveWrappingKey(myPrivKey, theirPubKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPubKey },
    myPrivKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// Wrap an AES session key for a recipient (given their public key b64)
async function wrapSessionKeyFor(sessionKey, recipientPubB64) {
  const myPriv = await getPrivateKey();
  const theirPub = await importPublicKey(recipientPubB64);
  const wrappingKey = await deriveWrappingKey(myPriv, theirPub);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey(
    "raw", sessionKey, wrappingKey,
    { name: "AES-GCM", iv }
  );

  return bufToB64(iv) + ":" + bufToB64(wrapped);
}

// Unwrap our wrapped AES session key (given sender's public key b64)
async function unwrapSessionKey(wrappedB64, senderPubB64) {
  const myPriv = await getPrivateKey();
  const theirPub = await importPublicKey(senderPubB64);
  const wrappingKey = await deriveWrappingKey(myPriv, theirPub);

  const [ivB64, dataB64] = wrappedB64.split(":");
  const iv = b64ToBuf(ivB64);
  const wrapped = b64ToBuf(dataB64);

  return crypto.subtle.unwrapKey(
    "raw", wrapped, wrappingKey,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── Message encryption ─────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext message for multiple recipients.
 * @param {string} plaintext
 * @param {Array<{userId: string, publicKeyB64: string}>} recipients
 * @returns {{ ciphertext, iv, recipient_keys }}
 */
export async function encryptMessage(plaintext, recipients) {
  // Generate ephemeral AES-256-GCM session key
  const sessionKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // Encrypt the message
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    enc.encode(plaintext)
  );

  // Wrap session key for each recipient
  const recipientKeys = {};
  for (const r of recipients) {
    try {
      recipientKeys[r.userId] = await wrapSessionKeyFor(sessionKey, r.publicKeyB64);
    } catch (e) {
      console.warn(`Could not wrap key for ${r.userId}:`, e);
    }
  }

  return {
    ciphertext: bufToB64(cipherBuf),
    iv: bufToB64(iv.buffer),
    recipient_keys: recipientKeys,
  };
}

/**
 * Decrypt a message.
 * @param {{ ciphertext, iv, recipient_keys }} msg
 * @param {string} myUserId
 * @param {string} senderPublicKeyB64
 */
export async function decryptMessage(msg, myUserId, senderPublicKeyB64) {
  const wrappedKey = msg.recipient_keys?.[myUserId];
  if (!wrappedKey) throw new Error("No key for you in this message");

  const sessionKey = await unwrapSessionKey(wrappedKey, senderPublicKeyB64);

  const iv = b64ToBuf(msg.iv);
  const cipher = b64ToBuf(msg.ciphertext);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    cipher
  );

  return new TextDecoder().decode(plainBuf);
}

// ── Local key export/import (backup) ──────────────────────────────────────────

export async function exportKeyBackup(password) {
  const privJwk = await idbGet("identity_private_jwk");
  if (!privJwk) throw new Error("No key to export");

  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const wrapKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrapKey,
    enc.encode(privJwk)
  );

  return JSON.stringify({
    salt: bufToB64(salt.buffer),
    iv: bufToB64(iv.buffer),
    data: bufToB64(encrypted),
    version: 1,
  });
}

export async function importKeyBackup(backupJson, password) {
  const { salt, iv, data } = JSON.parse(backupJson);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const wrapKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBuf(salt), iterations: 310000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(iv) },
    wrapKey,
    b64ToBuf(data)
  );
  const privJwk = new TextDecoder().decode(decrypted);
  await idbSet("identity_private_jwk", privJwk);

  // Re-derive public key
  const jwk = JSON.parse(privJwk);
  const privKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  // We need to store the public key b64 — derive from JWK
  const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const pubKey = await crypto.subtle.importKey(
    "jwk", pubJwk, { name: "ECDH", namedCurve: "P-256" }, true, []
  );
  const raw = await crypto.subtle.exportKey("raw", pubKey);
  await idbSet("identity_public_b64", bufToB64(raw));
}

export async function clearLocalKeys() {
  await idbDelete("identity_private_jwk");
  await idbDelete("identity_public_b64");
}
