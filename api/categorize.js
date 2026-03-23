import OpenAI from "openai";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { words } = req.body || {};

  if (!words || !Array.isArray(words) || words.length < 3) {
    return res.status(400).json({ error: "Provide at least 3 words." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured." });
  }

  const client = new OpenAI({ apiKey });

  try {
    const prompt = `
You are building a structured mind map.

Organize the following words into a 3-level hierarchy:

Level 1: Main categories (broad themes)
Level 2: Subcategories (more specific ideas)
Level 3: Individual words

Words:
${words.join(", ")}

Rules:
- 3–6 main categories
- Each category must have subcategories
- Each subcategory must contain related words
- Use clear semantic grouping (not random)
- Keep names short and meaningful
- Add emoji only at top-level categories
- Every word must appear exactly once

IMPORTANT: Return only valid JSON strictly matching the schema. Do NOT include any text outside the JSON.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      max_output_tokens: 1000, // prevents truncation
      text: {
        format: {
          type: "json_schema",
          name: "mindmap_tree",
          json_schema: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      emoji: { type: "string" },
                      children: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            name: { type: "string" },
                            children: {
                              type: "array",
                              items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                  name: { type: "string" }
                                },
                                required: ["name"]
                              }
                            }
                          },
                          required: ["name", "children"]
                        }
                      }
                    },
                    required: ["name", "emoji", "children"]
                  }
                }
              },
              required: ["title", "children"]
            }
          }
        }
      }
    });

    // Safely access parsed output
    const data = response.output?.[0]?.content?.[0]?.parsed;

    if (!data) {
      console.error("No valid parsed JSON returned:", response);
      return res
          .status(500)
          .json({ error: "Failed to parse mind map from OpenAI response." });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("OpenAI request error:", err);
    return res.status(500).json({ error: err.message });
  }
}
