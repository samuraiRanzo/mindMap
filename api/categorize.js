// api/categorize.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { words } = req.body || {};
  if (!words || !Array.isArray(words) || words.length < 3) {
    return res.status(400).json({ error: "Provide at least 3 words." });
  }

  // Validate env vars
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').trim();
  
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured." });
  }

  // Build the prompt
  const prompt = `
You are a mind-mapping assistant. Organize these words into a 3-level hierarchy.

Words: ${words.join(", ")}

Requirements:
- Return ONLY valid JSON (no markdown, no explanations)
- Schema: { title: string, children: [{ name: string, emoji: string, children: [{ name: string, children: [{ name: string }] }] }] }
- 3-6 top-level categories with emojis
- Every input word appears exactly once in leaf nodes
- Use semantic grouping, not random

Output:`;

  // Retry helper for rate limits
  async function fetchWithRetry(url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.status === 429 && attempt < retries) {
          const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          console.log(`⏳ Rate limited, retrying in ${delay/1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return response;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  try {
    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-OpenRouter-Title": process.env.OPENROUTER_SITE_NAME || "MindCloud",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "qwen/qwen3.5-9b", // Avoid :free for reliability
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
        // ✅ Structured JSON output
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "mind_map",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      emoji: { type: "string" },
                      children: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            children: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: { name: { type: "string" } },
                                required: ["name"],
                                additionalProperties: false
                              }
                            }
                          },
                          required: ["name", "children"],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ["name", "children"],
                    additionalProperties: false
                  }
                }
              },
              required: ["title", "children"],
              additionalProperties: false
            }
          }
        }
      })
    });

    // Handle HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenRouter error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorData
      });
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Rate limit exceeded. Please wait 30 seconds and try again." 
        });
      }
      if (response.status === 401) {
        return res.status(401).json({ error: "Invalid OpenRouter API key." });
      }
      return res.status(response.status).json({ 
        error: errorData.error?.message || "OpenRouter request failed" 
      });
    }

    const data = await response.json();
    
    // Parse the AI response
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    let parsed;
    try {
      // Handle both string and pre-parsed content
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (parseErr) {
      console.error("JSON parse error. Raw content:", content?.slice(0, 300));
      // Fallback: strip markdown code blocks if present
      const clean = content.replace(/```(?:json)?\n?|\n?```/g, "").trim();
      parsed = JSON.parse(clean);
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error("Request failed:", {
      message: err.message,
      name: err.name,
      stack: err.stack
    });
    return res.status(500).json({ 
      error: err.message || "Failed to generate mind map" 
    });
  }
}
