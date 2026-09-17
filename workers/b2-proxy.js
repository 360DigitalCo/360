/**
 * Cloudflare Worker — B2 upload proxy for 360
 *
 * Secrets to set in Cloudflare dashboard (Workers > Settings > Variables > Secrets):
 *   B2_KEY_ID     — your Backblaze B2 applicationKeyId
 *   B2_APP_KEY    — your Backblaze B2 applicationKey
 *   B2_BUCKET_ID  — your Backblaze B2 bucketId
 *   B2_BUCKET_NAME — your bucket name (e.g. "360-media")
 *   ALLOWED_ORIGIN — your site origin (e.g. "https://360-search.com")
 *
 * Endpoints:
 *   POST /sign-upload   { fileName, contentType } → { uploadUrl, authToken, fileUrl }
 *   GET  /              → health check
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';

    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    if (url.pathname === '/sign-upload' && request.method === 'POST') {
      try {
        const { fileName, contentType } = await request.json();
        if (!fileName || !contentType) {
          return new Response(JSON.stringify({ error: 'fileName and contentType required' }),
            { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        // Step 1: Authorize B2
        const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
          headers: {
            Authorization: 'Basic ' + btoa(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`),
          },
        });
        if (!authRes.ok) throw new Error('B2 auth failed: ' + authRes.status);
        const auth = await authRes.json();

        // Step 2: Get upload URL
        const upUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
          method: 'POST',
          headers: {
            Authorization: auth.authorizationToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bucketId: env.B2_BUCKET_ID }),
        });
        if (!upUrlRes.ok) throw new Error('B2 get_upload_url failed: ' + upUrlRes.status);
        const upData = await upUrlRes.json();

        // Step 3: Return signed upload details to client
        const fileUrl = `${auth.downloadUrl}/file/${env.B2_BUCKET_NAME}/${fileName}`;

        return new Response(JSON.stringify({
          uploadUrl: upData.uploadUrl,
          authToken: upData.authorizationToken,
          fileUrl,
        }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }),
          { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ ok: true, service: '360 B2 proxy' }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
