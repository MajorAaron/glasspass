// /api/history — last N anonymized Glasspass recommendations

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'GET only' }) };

  const DB_URL = process.env.TURSO_DB_URL;
  const DB_TOKEN = process.env.TURSO_DB_TOKEN;
  if (!DB_URL || !DB_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };

  const httpsUrl = DB_URL.replace('libsql://', 'https://');

  try {
    const res = await fetch(`${httpsUrl}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: "SELECT region, flavor_profile, created_at FROM glasspass_tastings ORDER BY created_at DESC LIMIT 10" } },
          { type: 'close' }
        ]
      })
    });
    if (!res.ok) {
      const body = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'DB error', detail: body.slice(0, 200) }) };
    }
    const data = await res.json();
    const rows = data?.results?.[0]?.response?.result?.rows || [];
    const items = rows.map(r => ({
      region: r[0]?.value || '',
      flavor_profile: JSON.parse(r[1]?.value || '[]'),
      created_at: r[2]?.value || ''
    }));
    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: String(err).slice(0, 200) }) };
  }
};
