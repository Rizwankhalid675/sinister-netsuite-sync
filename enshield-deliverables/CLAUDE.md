# CLAUDE.md — Enshield Deliverables

Context for Claude when a session opens in this folder.

> Note: the previous file here was a stray identical copy of the *sinister-revamp* (Miva/Sinister Diesel) CLAUDE.md — unrelated to Enshield. It was replaced with this Enshield-specific context.

## What this folder is
Central home for the **Enshield** project — a Shopify **shipping-protection** app. This folder holds decks, briefs, audit reports, mockups, build scripts, and the app codebases. It was consolidated from files previously scattered across `Work/`.

## The work
Active effort is a **revamp** of Enshield's surfaces:
- **Merchant dashboard** — standalone app talking to Shopify (`mock_dashboard.png`).
- **Gadget-embedded admin + marketing homepage** (`mock_gadget.png`, `mock_homepage.png`).

Blueprint decks = target architecture. Mockups = intended UI. Audit report = current state.

## Layout
- **Decks:** `Enshield-System-Blueprint.{pptx,html,pdf,md}`, `-v2.pptx`, `-v3.pptx`, `-for-Mike.md`, `Enshield-Exec-Brief.pptx`
- **Briefs/reports:** `access-request-brief.*`, `enshield-audit-report.*`, `enshield-exec-summary.md`, `enshield-mockup.html`
- **Mockups:** `mock_dashboard.*`, `mock_gadget.*`, `mock_homepage.*` (html + png)
- **Build scripts:** `build_deck.py`, `build_exec.py`, `build_brief_pdf.py`
- **Code:**
  - `enshield-app-gadget/` — Gadget + Shopify backend, package `enshield-shipping-protection` (`api/`, `accessControl/`, `extensions/`, `settings.gadget.ts`, `shopify.app.toml`).
  - `enshield-app/` — Vite frontend build (`src/`, `public/`, `vite.config.js`).
  - `enshield-old-dashboard/` — old dashboard (Gadget + Shopify), revamp reference.

## Environment
- Platform: **win32**, Windows 11. Shell: **PowerShell** primary; Bash tool also available for POSIX.
- This tree is under **OneDrive** → expect transient "busy"/"permission denied" locks while it syncs. If `mv` fails on a folder, use `robocopy <src> <dst> /MOVE /E /R:2 /W:2` (exit code 1 = success, files copied).
- Open editors (VS Code) also lock folders — check before moving code dirs.

## Conventions / gotchas
- `enshield-app-gadget/` was **renamed** from `enshield-app` during consolidation to avoid colliding with the Vite frontend build — keep them distinct.
- Regenerate artifacts from the `build_*.py` scripts rather than hand-editing PPTX/PDF.
- To rebuild decks: `python build_deck.py` (needs `python-pptx`). Close PowerPoint first — open .pptx files lock and can corrupt on overwrite.
- **NOT here (intentionally):** DigitalOcean infra files (`.do_token`, `do_token.txt`, `clone_create.json`, `clone_ip.txt`, `clone_userdata.yaml`) stayed in `../sinister-revamp/` — they're hosting credentials, not Enshield deliverables. Don't assume they're missing.

## For gadget code work
`enshield-app-gadget/` and `enshield-old-dashboard/` are Gadget apps — connect/sync via `ggt` if editing live; otherwise treat as source reference. Confirm target environment before any push.

## See also
`README.md` in this folder — human-facing / Obsidian version of the same map.
