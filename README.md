# KRYPTVAULT

8-bit roguelite survival game. Single self-contained `index.html` — open it in a browser or deploy as a static site.

Leaderboard, accounts and progress sync run through the Vercel functions in `api/`, backed by a Neon Postgres database (`DATABASE_URL`, set by the Vercel Neon integration). The schema lives in `db/schema.sql`.
