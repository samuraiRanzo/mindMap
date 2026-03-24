import OpenAI from "openai";

// Initialize once, at module level
const openai = new OpenAI({
  baseURL: process.env.AI_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
    'X-OpenRouter-Title': process.env.OPENROUTER_SITE_NAME || 'MindCloud Local',
  },
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { words } = req.body || {};
  if (!words || !Array.isArray(words) || words.length < 3) {
    return res.status(400).json({ error: "Provide at least 3 words." });
  }

  // ✅ Validate OpenRouter key (not OpenAI)
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured." });
  }

  const prompt = `
You are building a structured mind map.

Organize the following words into a 3-level hierarchy:
Level 1: Main categories (broad themes)
Level 2: Subcategories (more specific ideas)  
Level 3: Individual words

Words: ${words.join(", ")}

Rules:
- 3–6 main categories with emoji icons
- Each category must have subcategories
- Each subcategory must contain related words
- Use clear semantic grouping (not random)
- Keep names short and meaningful
- Every input word must appear exactly once in leaf nodes
- Return ONLY valid JSON matching the schema below

Schema:
{
  "title": "string",
  "children": [
    {
      "name": "string",
      "emoji": "string",
      "children": [
        {
          "name": "string",
          "children": [{ "name": "string" }]
        }
      ]
    }
  ]
}

IMPORTANT: Output raw JSON only. No markdown, no explanations.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.AI_MODEL || 'qwen/qwen3.5-flash',
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mind_map',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              children: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    emoji: { type: 'string' },
                    children: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          children: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: { name: { type: 'string' } },
                              required: ['name'],
                              additionalProperties: false
                            }
                          }
                        },
                        required: ['name', 'children'],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ['name', 'children'],
                  additionalProperties: false
                }
              }
            },
            required: ['title', 'children'],
            additionalProperties: false
          }
        }
      },
      temperature: 0.1,
      max_tokens: 4096,
    });

    // ✅ Correct response parsing for OpenAI SDK + OpenRouter
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    let data;
    try {
      // Content may be string (needs parse) or already parsed object
      data = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseErr) {
      console.error("JSON parse failed. Raw content:", content);
      return res.status(500).json({ 
        error: "Failed to parse AI response as JSON",
        debug: content?.slice(0, 200) // safe preview
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("OpenRouter request error:", {
      message: err.message,
      status: err.status,
      type: err.type,
      // Safely log response if available
      response: err.response?.data || err.response?.statusText
    });
    
    // User-friendly error
    const userError = err.status === 401 
      ? "Invalid API key" 
      : err.status === 429 
        ? "Rate limit exceeded" 
        : err.message || "AI request failed";
        
    return res.status(err.status || 500).json({ error: userError });
  }
}
