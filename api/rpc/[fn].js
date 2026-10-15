// Account RPCs: POST /api/rpc/<fn> with the same JSON body the game used to
// send to Supabase. Each call maps onto the Postgres function of that name.
import { query } from '../_db.js';

const FUNCTIONS = {
  register_player: 'select public.register_player($1) as r',
  login_player: 'select public.login_player($1, $2, $3) as r',
  save_progress: 'select public.save_progress($1::uuid, $2, $3::jsonb) as r'
};

const ARGS = {
  register_player: ['p_name'],
  login_player: ['p_name', 'p_disc', 'p_secret'],
  save_progress: ['p_id', 'p_secret', 'p_progress']
};

export default async function handler(req, res) {
  const fn = req.query.fn;
  if (!FUNCTIONS[fn]) return res.status(404).json({ error: 'unknown function' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const body = req.body || {};
  const params = ARGS[fn].map(function (k) {
    const v = body[k];
    if (v === undefined || v === null) return null;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });

  try {
    const rows = await query(FUNCTIONS[fn], params);
    // login_player returns json null for a wrong tag/key; the game tells
    // that apart from a network failure, so the null goes back as-is
    res.status(200).json(rows[0].r);
  } catch (e) {
    res.status(400).json({ error: 'rejected' });
  }
}
