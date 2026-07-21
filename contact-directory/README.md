# Counterpart Directory

A single-file contact/reference app (`index.html`) for tracking counterparts
and a library of government officials. No build step — it's plain HTML/CSS/JS,
plus one small server-side Worker for the AI features.

Storage and the AI features (name-card scan, "check for updates") originally
relied on APIs that only exist inside Claude's Artifact preview. This version
replaces those with things you host yourself:

- **Data storage** → a private GitHub Gist, read/written directly from the
  browser via the GitHub REST API.
- **Name-card scan** → runs entirely in the browser via
  [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR, WebAssembly,
  loaded from a public CDN on first use). No server, no API key, no per-scan
  cost — trade-off is it can only read text, not reason about card layout, so
  field assignment (name vs. title vs. org) is a set of heuristics rather than
  true understanding. A "Show scanned text" toggle always reveals the raw OCR
  output so anything mis-assigned can be copied out by hand.
- **"Check for updates"** (optional) → `site-worker.js`, a Cloudflare Worker
  that serves the static site *and* holds your Anthropic API key server-side
  to proxy `api.anthropic.com`. The browser never sees the key. (This is the
  only remaining feature that costs anything or needs an API key — name-card
  scanning does not use it.)

## 1. Host the site — Cloudflare Workers (with static assets)

GitHub Pages doesn't work here without a paid GitHub plan (Pages on a
private repo requires GitHub Pro/Team/Enterprise). This project instead
deploys as a Cloudflare **Worker with static assets** — Cloudflare's current
model, which is what you get by default when you connect a repo under
"Workers & Pages" → Create → **Workers** (not the separate "Pages" tab,
which is the older classic product and uses a different mechanism —
Pages Functions — that this repo doesn't use). It's free regardless of repo
visibility:

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Workers** → **Connect to Git** (or **Import a repository**).
2. Authorize the Cloudflare GitHub App and pick this repo.
3. Cloudflare reads `wrangler.jsonc` at the repo root, which points
   `main` at `contact-directory/site-worker.js` and serves the
   `contact-directory/` folder as static assets.
4. **Save and Deploy.** You get a free `https://<project>.<you>.workers.dev`
   URL, HTTPS included, and it auto-redeploys on every push to `main`.

If Cloudflare ever opens an automated PR titled "Add Cloudflare Workers
configuration" (from `cloudflare-workers-and-pages[bot]`) proposing its own
`wrangler.jsonc`, you can close it without merging — `wrangler.jsonc`
already exists in this repo with the `main`/`assets.binding` fields the
default bot config doesn't include.

## 2. Turn on GitHub-backed storage

1. Open the app and click **⚙ Storage & AI settings** in the sidebar.
2. Create a GitHub personal access token scoped to Gists only:
   - Fine-grained token (recommended): https://github.com/settings/personal-access-tokens/new
     → under "Permissions", grant **Gists: Read and write**. No repository
     access is needed.
   - Or a classic token with just the **gist** scope:
     https://github.com/settings/tokens/new
3. Paste the token into the **GitHub personal access token** field. Leave
   **Gist ID** blank the first time — the app creates a new private gist for
   you and remembers its ID in this browser's `localStorage`.
4. Click **Save & connect**. Your directory data is now stored in a private
   Gist under your GitHub account (visible at gist.github.com if you're
   signed in), and every add/edit/delete pushes an update to it.

**Using it on a second device (e.g. your phone):** open Settings there too,
enter the same (or a second) token, and this time paste the **Gist ID** from
the first device (visible in the URL of the gist, e.g.
`gist.github.com/you/<this-part>`) instead of leaving it blank. Settings are
per-browser (kept in `localStorage`), so this step has to be repeated on
every device — only the *data* syncs automatically via the Gist.

**Security note:** the token lives only in `localStorage` in your browser —
it is never written into this repo or any file. Anyone with physical/session
access to that browser profile could read it back out via devtools, and
anyone who obtains the token could read/write your directory Gist (that's
all a Gist-scoped token can touch). Don't paste it into a shared or public
computer's browser.

## 3. (Optional) Turn on AI features

The **📷 Scan a name card** button needs nothing further — it runs OCR
locally in the browser via Tesseract.js and works as soon as the site is
deployed, with no API key and no per-scan cost. The only remaining button
that needs a server-side proxy is **⟲ Check for updates**, because it calls
the Anthropic API (web search + reasoning) with a real API key — something
that can't safely live in client-side JS. Since `site-worker.js` serves both
the site and the API from the same Worker, the app already calls
`/v1/messages` on its own domain by default — once this is set up there's
nothing to configure in Settings, on any device, including your phone.

1. Get an API key from **console.anthropic.com → API Keys → Create Key**.
   Unlike the free hosting/storage/scanning above, Anthropic API usage is
   pay-as-you-go (a few cents per check), not a subscription.
2. This project reads the key through Cloudflare **Secrets Store** (an
   account-level secret manager), wired up via `secrets_store_secrets` in
   `wrangler.jsonc` at the repo root — not a plain per-Worker secret. In the
   Cloudflare dashboard, go to **Secrets Store** (a top-level item in the
   account sidebar, separate from this Worker project) and create/update a
   secret named `ANTHROPIC_API_KEY` with your key as the value. If you ever
   need to point at a different store, update the `store_id` in
   `wrangler.jsonc` to match.
3. Trigger a new deployment if it doesn't happen automatically (push any
   change, or retry the latest deployment from the **Deployments** tab) so
   the running Worker picks up the secret.

If you skip this step, everything else (contacts, groups, the officials
library, GitHub sync, and name-card scanning) still works — only the
**⟲ Check for updates** button shows an error explaining the proxy isn't set
up yet.

### Alternative: hosting the static site elsewhere

If you'd rather host the static site somewhere other than this Worker (e.g.
Netlify, Vercel, GitHub Pages on a public repo), `worker.js` +
`wrangler.toml` in this folder deploy a *separate*, standalone Cloudflare
Worker that only handles the AI proxy — same idea as `site-worker.js`, minus
the static-asset serving:

```bash
npm install -g wrangler        # if you don't have it
wrangler login
wrangler secret put ANTHROPIC_API_KEY   # paste your key from console.anthropic.com
wrangler deploy                # run from inside contact-directory/
```

This publishes a URL like `https://contact-directory-ai-proxy.<you>.workers.dev`.
Paste that into **AI proxy URL** in the app's Settings modal and save — this
overrides the same-origin default with that URL instead.

Once you know the exact origin your app is hosted at, tighten
`ALLOWED_ORIGIN` in `worker.js` from `'*'` to that origin and redeploy, so
only your app can call the proxy.

Any other serverless platform (Vercel/Netlify functions, a small Express
app, etc.) works too — it just needs to expose `POST /v1/messages`, attach
`x-api-key` and `anthropic-version` headers, forward the request body
unmodified to `https://api.anthropic.com/v1/messages`, and return the
response with permissive CORS headers.
