// /api/subscribe — Glasspass email capture via Turso HTTP API

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

  const email = (payload.email || '').toString().trim().toLowerCase();
  const source = (payload.source || 'glasspass').toString().slice(0, 64);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const DB_URL = process.env.TURSO_DB_URL;
  const DB_TOKEN = process.env.TURSO_DB_TOKEN;
  if (!DB_URL || !DB_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const httpsUrl = DB_URL.replace('libsql://', 'https://');
  const ideaSlug = process.env.IDEA_SLUG || 'glasspass';

  try {
    const res = await fetch(`${httpsUrl}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: "INSERT INTO subscribers (email, source, idea_slug) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET source = excluded.source, idea_slug = excluded.idea_slug",
              args: [
                { type: 'text', value: email },
                { type: 'text', value: source },
                { type: 'text', value: ideaSlug }
              ]
            }
          },
          { type: 'close' }
        ]
      })
    });
    if (!res.ok) {
      const body = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Subscription failed', detail: body.slice(0, 300) }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: String(err).slice(0, 200) }) };
  }
};
