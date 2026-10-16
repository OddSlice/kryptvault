// The game also runs on itch.io, which serves it from its own servers, so the
// browser checks with these routes first (an OPTIONS "preflight") before it
// lets the game call them. Any site may: the API uses no cookies or logins,
// so this exposes nothing that isn't already public.
export function allowCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
