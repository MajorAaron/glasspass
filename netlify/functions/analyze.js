// /api/analyze — Glasspass AI sommelier
// Calls Gemini with the user's beer preferences; returns flavor profile + recs.

const GEMINI_MODEL = 'gemini-2.0-flash';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const beersLoved = (payload.beers_loved || '').toString().trim().slice(0, 500);
  const region = (payload.region || '').toString().trim().slice(0, 100);
  if (!beersLoved) return { statusCode: 400, headers, body: JSON.stringify({ error: 'beers_loved is required' }) };

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not configured' }) };

  const prompt = `You are the Glasspass Sommelier — a knowledgeable, warm, slightly playful craft-beer expert.

A drinker has named beers they've loved. Build their flavor profile and recommend:
1. Three specific beers (real or representative styles) they should try next.
2. Three real breweries to visit ${region ? `near or in ${region}` : 'in a craft-beer-rich US region'}.

Beers they've loved:
${beersLoved}

${region ? `Their location/region: ${region}` : ''}

Respond with VALID JSON ONLY, no markdown, no commentary:
{
  "flavor_profile": ["3 to 5 short tags like 'hoppy', 'citrus-forward', 'malty', 'barrel-aged', 'funky'"],
  "beer_recommendations": [
    {"name": "Beer name", "style": "Style (e.g. West Coast IPA)", "reason": "One short sentence on why they'll love it, ≤25 words."}
  ],
  "brewery_recommendations": [
    {"name": "Brewery name", "location": "City, State", "reason": "One short sentence on why they should visit, ≤25 words."}
  ]
}

Use REAL, well-known craft breweries (Russian River, Tree House, Bell's, Allagash, Hill Farmstead, Sierra Nevada, Burial, Wicked Weed, Highland, Trillium, Other Half, Equilibrium, Cellarmaker, etc.). Tailor to the region if given. Use real beer names when you can; otherwise use plausible-sounding ones with accurate styles. Keep it specific, never generic.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini API error', detail: errBody.slice(0, 300) }) };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    // Log to Turso (best-effort, swallow failures)
    if (process.env.TURSO_DB_URL && process.env.TURSO_DB_TOKEN) {
      try {
        await fetch(`${process.env.TURSO_DB_URL.replace('libsql://', 'https://')}/v2/pipeline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TURSO_DB_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                type: 'execute',
                stmt: {
                  sql: "INSERT INTO glasspass_tastings (beers_loved, region, flavor_profile, recommendations_json) VALUES (?, ?, ?, ?)",
                  args: [
                    { type: 'text', value: beersLoved },
                    { type: 'text', value: region },
                    { type: 'text', value: JSON.stringify(parsed.flavor_profile || []) },
                    { type: 'text', value: JSON.stringify(parsed) }
                  ]
                }
              },
              { type: 'close' }
            ]
          })
        });
      } catch (_) { /* ignore */ }
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unexpected error', detail: String(err).slice(0, 200) }) };
  }
};
