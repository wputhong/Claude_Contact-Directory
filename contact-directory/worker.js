// Cloudflare Worker: proxies POST /v1/messages to the real Anthropic API.
//
// NOTE: if the app is hosted on Cloudflare Pages (the default setup), you
// don't need this file — functions/v1/messages.js does the same job
// automatically on the same domain, configured entirely through the
// Cloudflare dashboard (Pages project -> Bindings -> Add binding -> Secret),
// no CLI required. Use this standalone Worker instead only if the static
// site is hosted somewhere other than Cloudflare Pages (GitHub Pages,
// Netlify, Vercel, etc.) and still needs an AI proxy — in that case, deploy
// this and paste the resulting URL into the app's "AI proxy URL" setting.
//
// Why this exists: the app (index.html) runs entirely in the browser and has
// nowhere safe to keep an Anthropic API key — anything embedded in client-side
// JS is visible to anyone who views source. This worker holds the key as a
// server-side secret and forwards requests on the browser's behalf, adding
// the auth header itself.
//
// Deploy:
//   1. npm install -g wrangler   (if you don't already have it)
//   2. wrangler login
//   3. wrangler secret put ANTHROPIC_API_KEY      # paste your key when prompted
//   4. wrangler deploy
//   5. Copy the resulting *.workers.dev URL into the app's Settings modal
//      as the "AI proxy URL".
//
// Once you know the exact origin the app is hosted at (e.g. your GitHub
// Pages URL), tighten ALLOWED_ORIGIN below instead of leaving it as '*'.

const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/v1/messages') {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response('Worker is missing the ANTHROPIC_API_KEY secret', {
        status: 500,
        headers: corsHeaders(),
      });
    }

    const body = await request.text();
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
