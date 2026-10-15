// Global leaderboard.
//   GET  /api/scores  -> top 80 normal-mode runs (the game keeps each player's best)
//   POST /api/scores  -> submit a run; the scores_validate trigger checks it
import { query } from './_db.js';

const COLUMNS = ['name', 'wave', 'kills', 'level', 'cls', 'mode', 'disc', 'player_id', 'ver', 'upgrades'];

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const rows = await query(
        "select name, disc, wave, kills, cls from public.scores where mode = 'normal' " +
        'order by wave desc, kills desc limit 80'
      );
      return res.status(200).json(rows);
    } catch (e) {
      console.error('scores.js', e.message);
      return res.status(502).json({ error: 'unavailable' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const params = COLUMNS.map(function (k) {
      const v = body[k];
      if (v === undefined || v === null) return null;
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
    try {
      // a run dropped by the rate limit inserts nothing but still counts as ok
      await query(
        'insert into public.scores (name, wave, kills, level, cls, mode, disc, player_id, ver, upgrades) ' +
        "values ($1, $2::int, $3::int, $4::int, $5, coalesce($6, 'normal'), $7, $8::uuid, $9, $10::jsonb)",
        params
      );
      return res.status(201).end();
    } catch (e) {
      console.error('scores.js', e.message);
      return res.status(400).json({ error: 'rejected' });
    }
  }

  res.status(405).json({ error: 'method not allowed' });
}
