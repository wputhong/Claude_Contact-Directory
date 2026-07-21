// Cloudflare Worker entry point for this project's actual deploy model:
// "Workers with static assets" (see wrangler.jsonc at the repo root), not
// classic Cloudflare Pages — Pages Functions (functions/*.js) don't run
// under this model, which is why this file exists instead.
//
// Handles POST /v1/messages by proxying to the real Anthropic API using
// ANTHROPIC_API_KEY, bound via Cloudflare Secrets Store (see
// secrets_store_secrets in wrangler.jsonc at the repo root). Secrets Store
// bindings aren't plain strings — the value must be read with an async
// `.get()` call. Everything else falls through to the static site served
// from the `assets` binding, i.e. the contact-directory/ folder — so the
// app and its API live on the exact same origin, which is also why
// index.html can call a plain relative `/v1/messages` with nothing to
// configure.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/v1/messages') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return new Response('Missing ANTHROPIC_API_KEY secret on this Worker', { status: 500 });
      }

      const apiKey = await env.ANTHROPIC_API_KEY.get();
      if (!apiKey) {
        return new Response('ANTHROPIC_API_KEY secret is bound but has no value set', { status: 500 });
      }

      const body = await request.text();
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      });

      const responseBody = await upstream.text();
      return new Response(responseBody, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
