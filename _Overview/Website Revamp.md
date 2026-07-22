# Website Revamp

← back to [[🏠 Work Home]]

The **Sinister Diesel V2** frontend redesign — a from-scratch Miva Merchant theme built
alongside the untouched live ("Legacy") theme.

Folder: `website-revamp/sinister-revamp/` — full technical doc in that folder's
`DOCUMENTATION.md`.

> **History note:** commits here are **task-based, not daily** — work is committed when a
> chunk is finished, not on a fixed calendar day. The `daily-work/*` day folders are
> pointers here, not copies. To see what actually changed and when:
>
>     cd website-revamp/sinister-revamp
>     git log --oneline --stat -- .
>
> Commit dates show when each finished piece of work landed.

---

## The one-paragraph version

Miva Merchant stays the commerce engine (products, cart, checkout, accounts, orders,
search all keep working). Only the **visible frontend** is redesigned. V2 files are built
**inactive** — creating one never puts it live; a human assigns it to a copied test page
in Miva Admin to preview. Creative direction: premium performance garage / motorsport
engineering — deliberately *not* a generic catalog theme.

---

## Governing spec (read before changing anything)
- `V2_CONSTITUTION.md` — mission, non-negotiable rules, **milestone roadmap M0–M9**
- `V2_STRUCTURE.md` — full file inventory, canonical components, integration points
- `DOCUMENTATION.md` — the onboarding/summary doc (new)

## Design system
- **One** global system: `css/sd2-global.css`, tokens prefixed `--sd2-*`. No duplicated
  CSS anywhere else.
- Shared JS: `js/sd2-v2-components.js` (no external deps), hooks are `data-v2-*`,
  localStorage wrapped in try/catch.
- Fixed localStorage keys: `sd2v2_garage`, `sd2v2_recent_searches`, `sd2_v2_recent_searches`.

## Milestones
`M0` creative exploration → `M1` Foundation **(done)** → `M2` Global Components →
`M3` Homepage → `M4` Category/Listing → `M5` Search → `M6` PDP → `M7` Cart/Checkout →
`M8` Customer Dashboard → `M9` Final Polish. **One milestone at a time.**

## Hard rules
- Never overwrite/activate `sfnt.mvt`, `srch.mvt`, `prod-product_display.mvt`, live
  header/footer, checkout, basket, or account templates with V2 files.
- Legacy templates are never deleted.
- Component partials contain no inline scripts/styles.

---

## Related
- [[Integrations]] — monday.com help embeds + `spons.mvt` token
- `docs/Website-Audit-and-Improvement-Plan.md` (see [[Docs & Assets]]) — the audit that
  motivated the revamp
- [[Daily Work]] — mockups & prime-day pages that fed early exploration
- [[🏠 Work Home]]
