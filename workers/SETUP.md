# Free Storage Setup — Backblaze B2 + Cloudflare Workers

## What this replaces
- `music` bucket (Supabase) → B2 `music/` prefix — removes 50MB cap, unlimited size
- `videos` bucket (Supabase) → B2 `videos/` prefix — was failing on every upload over 50MB
- `thumbnails` bucket (Supabase) → B2 `thumbnails/` prefix
- `msg-media` / `msg-files` (Supabase) → B2 `current/` prefix

## Cost: $0, no card required

| Service | Free tier |
|---|---|
| Backblaze B2 | 10 GB storage, 1 GB/day download, free forever |
| Cloudflare Workers | 100,000 requests/day free forever |

---

## Step 1 — Create Backblaze B2 account
1. Go to https://www.backblaze.com/b2/sign-up.html — no card required
2. Create a bucket named `360-media` — set to **Public**
3. Go to **App Keys** → **Add a New Application Key**
   - Name: `360-worker`
   - Bucket: `360-media`
   - Permissions: Read and Write
   - Save the `keyID` and `applicationKey` — you won't see the key again

## Step 2 — Deploy the Cloudflare Worker
1. Go to https://dash.cloudflare.com — free account, no card
2. Go to **Workers & Pages** → **Create** → **Create Worker**
3. Paste the contents of `b2-proxy.js` into the editor
4. Click **Deploy**
5. Go to **Settings** → **Variables** → **Add secret** for each:
   - `B2_KEY_ID` — your keyID from step 1
   - `B2_APP_KEY` — your applicationKey from step 1
   - `B2_BUCKET_ID` — your bucket ID (visible in B2 dashboard under the bucket)
   - `B2_BUCKET_NAME` — `360-media`
   - `ALLOWED_ORIGIN` — your site URL e.g. `https://360-search.com`
6. Note your worker URL: `https://360-b2-proxy.YOUR_SUBDOMAIN.workers.dev`

## Step 3 — Update the app files
In these four files, replace `YOUR_SUBDOMAIN` with your actual Cloudflare subdomain:
- `apps/360Music.html`
- `apps/360vids.html`
- `apps/360Studio.html`
- `apps/Current.html`

Search for: `https://360-b2-proxy.YOUR_SUBDOMAIN.workers.dev`
Replace with: your actual worker URL

## Step 4 — Enable CORS on your B2 bucket
In the B2 dashboard, go to your bucket → **CORS Rules** → paste:
```json
[{
  "corsRuleName": "allow-360",
  "allowedOrigins": ["https://360-search.com"],
  "allowedHeaders": ["*"],
  "allowedOperations": ["b2_upload_file"],
  "maxAgeSeconds": 3600
}]
```

Done. Uploads now go directly from the browser → B2 via the worker-signed URL.
Supabase is now only used for auth, database, and realtime — well within its free limits.
