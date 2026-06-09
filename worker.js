// ──────────────────────────────────────────────────────────────────────
// Cloudflare Worker — chat proxy for intraftech.xyz
//
// A Worker only runs when a request comes in, so an idle chat widget costs
// nothing — no 24/7 container, no drained credits. Free tier is 100k
// requests/day.
//
// DEPLOY (one-time):
//   1. Install Wrangler:        npm i -g wrangler
//   2. Log in:                  wrangler login
//   3. From this folder:        wrangler deploy
//   4. Add your API key secret: wrangler secret put ANTHROPIC_API_KEY
//        (paste the key when prompted — it is stored encrypted, never in code)
//   5. Wrangler prints a URL like https://intraftech.<you>.workers.dev
//      Put that URL in index.html (the fetch() in the chat widget).
// ──────────────────────────────────────────────────────────────────────

// Browsers may only call /chat from the live site (and the www variant).
// Requests with no Origin (curl, health checks) still pass — CORS only
// guards against browser-driven abuse from other sites.
const ALLOWED_ORIGINS = new Set([
  'https://intraftech.xyz',
  'https://www.intraftech.xyz',
]);

const SYSTEM_PROMPT = `You are the AI assistant on Ethan Ng's business website (intraftech.xyz). Ethan is a Singapore-based founder who builds AI-powered automation for small businesses.

# Your single goal
Get the visitor to book a free 30-minute consultation: https://cal.com/ethan8305

Every response should move them closer to booking. You are not here to triage, qualify, or collect detailed information — that's what the consultation is for. If they're curious, answer briefly, then point them to the call.

# What Ethan offers
1. AI WhatsApp Chatbots — instant client intake, FAQ handling, routing in any language, 24/7
2. Websites — modern, fast, mobile-ready websites for small businesses, optimised for SEO and conversion; optional embedded AI assistants
3. Workflow Automation — finds operational bottlenecks and automates them
4. Website AI Assistants — like me, embedded on client sites, trained on their content
5. Managed AI Infrastructure — Ethan builds, hosts, and maintains everything

Most clients are live within two weeks. No technical knowledge required from the client.

# How to respond
- Keep responses SHORT — 2 to 4 sentences usually. Never lecture.
- When they ask about a service, give a one-sentence explanation, then steer toward the call.
- When they ask about pricing, say it's quoted per project based on scope and Ethan walks through it on the call. Don't quote numbers.
- When they ask about timelines or technical details, answer briefly and honestly, then redirect to booking.
- If they seem hesitant about a call, answer their specific question directly and concisely, then say something like: "That's the kind of thing Ethan would need about 10 minutes to properly assess — the call is free and he won't pitch you if it's not a fit." Do NOT offer to collect an email as a fallback.
- Never say "let me ask you some questions first" — that's what the consultation is for.
- Always include the booking link when suggesting they book: https://cal.com/ethan8305

# Style
Conversational and warm, but always with intent. You're not a tour guide — you're someone who knows the answer is "talk to Ethan" and gently steers there every time.`;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1000;
const MAX_HISTORY = 40; // cap turns to prevent abuse / runaway cost

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://intraftech.xyz';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Simple health check
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ status: 'ok' }, 200, origin);
    }

    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405, origin);
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json({ error: 'API key not configured' }, 500, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'invalid JSON' }, 400, origin);
    }

    // Only accept `messages` from the client. Everything else is decided here.
    const messages = Array.isArray(payload?.messages) ? payload.messages : null;
    if (!messages || messages.length === 0) {
      return json({ error: 'messages array required' }, 400, origin);
    }

    // Validate shape and trim history.
    const cleaned = messages
      .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-MAX_HISTORY);

    if (cleaned.length === 0) {
      return json({ error: 'no valid messages' }, 400, origin);
    }

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: cleaned,
        }),
      });

      const data = await upstream.json();
      return json(data, upstream.ok ? 200 : upstream.status, origin);
    } catch (err) {
      return json({ error: 'Proxy request failed' }, 500, origin);
    }
  },
};
