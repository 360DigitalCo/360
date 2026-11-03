(function () {
  var PREFIX = 'enc1:';
  var keyPromise = null;
  var keyFor = null;

  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function getKey(sb, userId) {
    if (keyPromise && keyFor === userId) return keyPromise;
    keyFor = userId;
    keyPromise = sb.rpc('get_chat_key').then(function (res) {
      if (res.error || !res.data) throw new Error('chat key unavailable');
      return crypto.subtle.importKey('raw', b64ToBytes(res.data), 'AES-GCM', false, ['encrypt', 'decrypt']);
    });
    keyPromise.catch(function () { keyPromise = null; });
    return keyPromise;
  }

  async function encText(sb, userId, text) {
    var key = await getKey(sb, userId);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text)));
    var out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0); out.set(ct, iv.length);
    return PREFIX + bytesToB64(out);
  }

  async function decText(sb, userId, value) {
    if (typeof value !== 'string' || value.indexOf(PREFIX) !== 0) return value;
    var key = await getKey(sb, userId);
    var raw = b64ToBytes(value.slice(PREFIX.length));
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    return new TextDecoder().decode(pt);
  }

  window.ChatCrypto = {
    isEncrypted: function (v) { return typeof v === 'string' && v.indexOf(PREFIX) === 0; },

    sealTitle: function (sb, uid, title) { return encText(sb, uid, title).catch(function () { return null; }); },
    openTitle: function (sb, uid, title) { return decText(sb, uid, title).catch(function () { return 'Encrypted chat'; }); },

    sealMessages: function (sb, uid, messages) {
      return encText(sb, uid, JSON.stringify(messages)).catch(function () { return null; });
    },
    openMessages: async function (sb, uid, stored) {
      if (Array.isArray(stored)) return stored;
      if (typeof stored !== 'string') return [];
      try { return JSON.parse(await decText(sb, uid, stored)); } catch (e) { return []; }
    }
  };
})();
