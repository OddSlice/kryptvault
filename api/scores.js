// Global leaderboard.
//   GET  /api/scores  -> each player's best normal-mode run, top 80
//   POST /api/scores  -> submit a run; the scores_validate trigger checks it
import { query } from './_db.js';

const COLUMNS = ['name', 'wave', 'kills', 'level', 'cls', 'mode', 'disc', 'player_id', 'ver', 'upgrades'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // each player's best run only: 80 raw rows could be mostly one grinder,
      // which left the top 10 with only a handful of names. Ties go to
      // whoever got there first, so the order doesn't shuffle between loads.
      const rows = await query(
        'select name, disc, wave, kills, cls from (' +
        '  select distinct on (name, coalesce(disc, \'\')) name, disc, wave, kills, cls, created_at' +
        "  from public.scores where mode = 'normal'" +
        "  order by name, coalesce(disc, ''), wave desc, kills desc, created_at" +
        ') best order by wave desc, kills desc, created_at limit 80'
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
    // a real build summary is a few hundred characters; anything far bigger
    // is junk, so it's dropped rather than stored (the score itself still counts)
    // a tag is only trusted with the matching vault key. Without it the run
    // still counts, but untagged: anyone could post as MAR#1234 before, and a
    // forged post every 19s blocked that player's real runs (20s rate limit)
    const nameAt = COLUMNS.indexOf('name'), discAt = COLUMNS.indexOf('disc'), idAt = COLUMNS.indexOf('player_id');
    let owner = null;
    if (typeof body.player_id === 'string' && UUID.test(body.player_id) && typeof body.secret === 'string' && body.secret) {
      try {
        const rows = await query('select name, disc from public.players where id = $1::uuid and secret = upper($2)', [body.player_id, body.secret]);
        owner = rows[0] || null;
      } catch (e) {
        console.error('scores.js', e.message);
      }
    }
    if (owner) { params[nameAt] = owner.name; params[discAt] = owner.disc; }
    else { params[discAt] = null; params[idAt] = null; }
    const upg = COLUMNS.indexOf('upgrades'), ver = COLUMNS.indexOf('ver');
    if (params[upg] && params[upg].length > 4000) params[upg] = null;
    if (params[ver] && params[ver].length > 16) params[ver] = params[ver].slice(0, 16);
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
