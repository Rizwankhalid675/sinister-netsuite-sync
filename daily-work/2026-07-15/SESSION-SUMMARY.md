# 2026-07-15 — Session summary

Focus: **NetSuite / TikTok customer sync — FNU LNU name fix**

Commits landed this day (4):
- `49e52cb` docs: design Miva-native form workflow
- `718f6a4` Fix FNU LNU placeholder names in NetSuite customer sync
- `b3b2a37` Add customer-name backfill script + fix FNU LNU in tiktok sync copy
- `4a74e99` Fix FNU LNU: never clobber hand-fixed names; derive readable name on create

What happened: killed the "FNU LNU" placeholder-name bug across the NetSuite and
TikTok customer syncs, added a backfill script for existing bad records, and made
create-logic derive a readable name while never overwriting hand-fixed names.
Scope: ~13 files, ~+684 lines.

Real history: `cd website-revamp/sinister-revamp && git log --oneline --stat -- .`

---
- Related: [[Website Revamp]] · [[Integrations]] · [[Daily Work]]
