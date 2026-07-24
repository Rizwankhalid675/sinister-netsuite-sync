# Enshield — Deliverables Vault

> Central home for everything related to **Enshield** (shipping-protection app + dashboard revamp) — decks, briefs, mockups, audit reports, and the app codebases.

This folder was consolidated from files that were previously scattered across `Work/`. Everything Enshield now lives here.

---

## 📁 What's in here

### 🗂️ Decks & Blueprints
| File | What it is |
|------|-----------|
| `Enshield-System-Blueprint.pptx` | Main system blueprint deck |
| `Enshield-System-Blueprint-v2.pptx` / `-v3.pptx` | Later revisions of the blueprint deck |
| `Enshield-System-Blueprint.html` / `.pdf` / `.md` | Same blueprint in web / print / markdown form |
| `Enshield-System-Blueprint-for-Mike.md` | Blueprint written for **Mike** (audience-specific) |
| `Enshield-Exec-Brief.pptx` | Executive summary deck |

### 📄 Briefs & Reports
| File | What it is |
|------|-----------|
| `access-request-brief.md` / `.pdf` | Access-request brief |
| `enshield-audit-report.md` / `.html` / `.pdf` | Full audit report of the existing system |
| `enshield-exec-summary.md` | Short exec summary |
| `enshield-mockup.html` | Standalone mockup page |

### 🎨 Mockups (revamp visuals)
| File | What it is |
|------|-----------|
| `mock_dashboard.html` / `.png` | Revamped **dashboard** mockup |
| `mock_gadget.html` / `.png` | **Gadget** admin/embedded mockup |
| `mock_homepage.html` / `.png` | Marketing **homepage** mockup |

### 🛠️ Build Scripts (regenerate the artifacts)
| Script | Generates |
|--------|-----------|
| `build_deck.py` | The blueprint PPTX deck(s) |
| `build_exec.py` | The exec-brief PPTX |
| `build_brief_pdf.py` | The access-request brief PDF |

### 💻 Code folders
| Folder | What it is |
|--------|-----------|
| `enshield-app-gadget/` | **Gadget + Shopify** backend app (`enshield-shipping-protection`). Contains `api/`, `accessControl/`, `extensions/`, `settings.gadget.ts`, `shopify.app.toml`. |
| `enshield-app/` | **Vite frontend** build (`index.html`, `src/`, `public/`, `vite.config.js`). The marketing/mockup front end. |
| `enshield-old-dashboard/` | The **old dashboard** codebase (Gadget + Shopify) — reference for the revamp. |

> ⚠️ `enshield-app-gadget/` was renamed from `enshield-app/` during consolidation to avoid a name collision with the Vite frontend build.

---

## 🎯 Project context

**Enshield** is a Shopify shipping-protection app. The active work is a **revamp** of:
1. The **merchant dashboard** (currently a standalone app talking to Shopify) — see `mock_dashboard.png`.
2. The **Gadget-embedded admin / homepage** — see `mock_gadget.png` and `mock_homepage.png`.

The blueprint decks describe the target architecture; the mockups show the intended UI; the audit report documents the current state.

---

## 🔗 Related (NOT moved here — kept in `sinister-revamp/`)
DigitalOcean hosting artifacts (`.do_token`, `do_token.txt`, `clone_create.json`, `clone_ip.txt`, `clone_userdata.yaml`) stayed with the dashboard-hosting work — they are infra credentials, not Enshield deliverables.

---

## 🕸️ Quick links
- [[Enshield-System-Blueprint-for-Mike]]
- [[enshield-audit-report]]
- [[enshield-exec-summary]]
- [[access-request-brief]]
