// Crash reports from the game: POST /api/errors with a small JSON body (see
// reportError in index.html). Anonymous, size-capped, and limited to 30 a
// minute and 20,000 stored, so neither a flood nor a bug that fires on every
// device can fill the database. Read them in the Neon SQL editor:
//   select created_at, ver, kind, msg, state, ua from public.error_reports order by id desc limit 50;
import { query } from './_db.js';
import { allowCors } from './_cors.js';

const cut = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);

export default async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  const msg = b && typeof b === 'object' ? cut(b.msg, 300) : null;
  if (!msg) return res.status(400).json({ error: 'bad report' });
  let state = null;
  if (b.state && typeof b.state === 'object') {
    const s = JSON.stringify(b.state);
    if (s.length <= 500) state = s;
  }
  try {
    await query(
      'insert into public.error_reports (ver, kind, msg, stack, state, ua, screen, session) ' +
      'select $1, $2, $3, $4, $5::jsonb, $6, $7, $8 ' +
      "where (select count(*) from public.error_reports where created_at > now() - interval '1 minute') < 30 " +
      'and (select count(*) from public.error_reports) < 20000',
      [cut(b.v, 16), cut(b.kind, 16), msg, cut(b.stack, 2000), state, cut(b.ua, 300), cut(b.scr, 32), cut(b.sid, 16)]
    );
  } catch (e) {
    console.error('errors.js', e.message);
  }
  res.status(204).end();
}
