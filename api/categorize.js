export default async function handler(req, res) {
  // ── CORS headers (in case you ever call this from a different domain) ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { words } = req.body || {};

  if (!words || !Array.isArray(words) || words.length < 3) {
    return res.status(400).json({ error: 'Provide at least 3 words.' });
  }

  // ── API key lives only here, read from Vercel environment variable ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content:
`You are a semantic clustering engine for a mind-map tool.
Group the following words/phrases into 3–7 meaningful thematic categories.

Words: ${words.join(', ')}

Return ONLY a valid JSON array — zero markdown, zero explanation, no code fences.
Format exactly:
[{"category":"Short Name","emoji":"🔥","words":["word1","word2"]}]

Rules:
• Every input word must appear in exactly one category (use original casing).
• Keep category names short (1–3 words, title case).
• Choose a highly relevant emoji per category.
• Try to balance group sizes.`
        }]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errBody?.error?.message || `Anthropic error ${response.status}`
      });
    }

    const data  = await response.json();
    const text  = (data.content || []).map(b => b.text || '').join('');
    const match = text.match(/\[[\s\S]*\]/);

    if (!match) {
      return res.status(500).json({ error: 'Model returned no valid JSON. Raw: ' + text.slice(0, 200) });
    }

    return res.status(200).json({ categories: JSON.parse(match[0]) });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
