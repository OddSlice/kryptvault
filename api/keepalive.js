// Daily Vercel cron: ping the Supabase leaderboard so the free-tier
// project never pauses for inactivity. The apikey is the public anon
// key already shipped in index.html.
export default async function handler(req, res) {
  const r = await fetch(
    'https://gcsqmrdlmbpucatprbhx.supabase.co/rest/v1/scores?select=id&limit=1',
    { headers: { apikey: 'sb_publishable_NXbGLu9daR0M6y-dLThu9w_cdFizyEJ' } }
  );
  res.status(r.ok ? 200 : 502).json({ ok: r.ok, at: new Date().toISOString() });
}
