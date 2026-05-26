const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());

// Allow requests from your live site only
const allowedOrigins = [
  'https://intraftech.xyz',
  'https://www.intraftech.xyz',
  'http://localhost'  // for local testing
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl) or matching origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Health check — Railway uses this to confirm the service is up
app.get('/', (req, res) => res.json({ status: 'ok' }));

// Proxy endpoint — your frontend POSTs here instead of directly to Anthropic
app.post('/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
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
