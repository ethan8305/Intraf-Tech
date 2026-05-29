const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '256kb' }));

// Browsers will only let intraftech.xyz (and the www variant) call /chat.
// Requests with no Origin header (curl, Railway health checks) still pass —
// CORS only protects against browser-driven abuse from other sites.
const ALLOWED_ORIGINS = new Set([
  'https://intraftech.xyz',
  'https://www.intraftech.xyz'
]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed`));
  }
}));

// ──────────────────────────────────────────────────────────────
// System prompt lives here on the server — never shipped to the
// browser. The client only sends `messages`.
// ──────────────────────────────────────────────────────────────
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

app.get('/', (_req, res) => res.json({ status: 'ok' }));

app.post('/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Only accept `messages` from the client. Everything else is decided here.
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Validate shape and trim history.
  const cleaned = messages
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_HISTORY);

  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'no valid messages' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: cleaned
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
