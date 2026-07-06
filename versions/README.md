# Version archive

One zip per shipped version, named `kryptvault-<version>.zip`. Each zip contains
that version's `index.html` (the whole game — it's a single self-contained file).
Kept in git for backup, excluded from Vercel deploys via `../.vercelignore`.

Purpose: fast rollback if a release breaks. Git tags (`git tag`) mark the same
points in history; these zips are the grab-and-go copies.

## Roll back production to a known-good version

```sh
# from the repo root
unzip -o versions/kryptvault-v0.2c.zip -d .   # overwrites index.html with that build
/opt/homebrew/bin/vercel deploy --prod --yes  # redeploy
```

Then also restore the source of truth so future edits start from the right base:

```sh
cp index.html ~/claudecode/kryptvault.html
```

(Or roll back through git instead: `git checkout <tag> -- index.html`.)

## When shipping a new version

After bumping `GAME_VERSION` and copying `kryptvault.html` → `index.html`, archive it:

```sh
zip -j versions/kryptvault-v<NEW>.zip index.html
git tag v<NEW>
```

## Archived so far

| Version | Notes |
|---------|-------|
| v0.1  | early public build |
| v0.1a | menu polish, mode-select cards |
| v0.2c | boss/biome overhaul, class weapons, audio + settings, mobile name entry |
| v0.2d | mobile login keyboard (name + login both raise the soft keyboard) |

Note: v0.2, v0.2a, v0.2b were never committed as separate points — they were all
folded into the v0.2c commit, so the archive jumps v0.1a → v0.2c.
