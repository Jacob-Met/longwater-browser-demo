# Scope addendum — 2026-10-08

The frozen CONTRACT.md (SHA-256 68019f69f33962f020c517dd9ada093ef2da7c5d90dcaa7ca56e8d5f3d9085f7) remains unchanged. Inspection of scripts/package.mjs found that every embedded stylesheet must have an explicit href in index.html, and new watch-trends.js is a nested dependency of journal.js rather than a direct game.js import.

Root approved exactly one additional index.html line, `<link rel="stylesheet" href="./watch-trends.css">`, adjacent to the existing journal stylesheet. Every other index byte remains unchanged. The packager will embed this stylesheet and rewrite only journal.js's new watch-trends.js import before embedding journal.js into the unchanged game.js import. No game.js edit is required.

Issue #10 and central comment 6058918547 record ownership; the root owns publication and the issue amendment. The frozen user/data behavior, existing callbacks, reset/replay provenance, and all other path exclusions are unchanged.
