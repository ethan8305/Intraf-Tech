const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`>>> ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.post('/chat', async (req, res) => {
  console.log('--- /chat handler entered ---');
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('!!! No API key found in env');
    return res.status(500).json({ error: 'API key not configured' });
  }
  console.log('API key found, length:', apiKey.length);

  try {
    console.log('Calling Anthropic API...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    console.log('Anthropic response status:', response.status);
    const data = await response.json();
    console.log('Anthropic response received');

    if (!response.ok) {
      console.log('Anthropic error:', JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    res.json(data);
    console.log('Response sent to client');
  } catch (err) {
    console.error('!!! Proxy error:', err.message);
    console.error('!!! Stack:', err.stack);
    res.status(500).json({ error: 'Proxy request failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
