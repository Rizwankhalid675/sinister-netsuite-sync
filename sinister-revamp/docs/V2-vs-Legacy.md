# Sinister Diesel — V2 Revamp vs. Legacy Website

A brief, plain-language explanation of how the new (V2) site is built, how it
differs from the current (legacy) site, and why V2 is the better foundation.

> **Status note:** V2 is a governed, milestone-based rebuild. As of this
> writing the V2 templates are **built and staged but not yet activated** — all
> legacy templates remain live and untouched. See `V2_CONSTITUTION.md` for the
> activation rules and `V2_REVAMP_REPORT.md` for detailed progress.

---

## 1. The short version

The legacy site was built page-by-page: each template carried its own
copy-pasted markup and its own inline styling, and some values (phone number,
"latest blog" cards, etc.) were hardcoded into the markup. That works, but it
makes the site inconsistent, hard to change, and easy to break.

V2 rebuilds the same store on a **single shared design system** with **reusable
components** and **real store data** instead of duplicated code and baked-in
values. Same store, cleaner engine.

---

## 2. How the V2 site works

- **One design system.** Every V2 component pulls its spacing, color,
  typography, and motion from shared tokens in `css/sd2-global.css`. Nothing
  defines its own styling inline. Change a token once → it updates everywhere.
- **Reusable components.** Buttons, badges, price blocks, stock indicators,
  product cards, cart drawer, mega menu, footer, etc. are standalone partials
  (e.g. `sd2-v2-price-block.mvt`, `sd2-v2-buy-button.mvt`,
  `sd2-v2-product-card.mvt`). Pages assemble these blocks instead of
  re-declaring markup.
- **Real data, not placeholders.** The footer phone number now reads from the
  store-config token (matching the header), and the "Latest From The Blog"
  cards pull real blog post data with a graceful fallback — instead of
  hardcoded/dummy values baked in at build time.
- **Verified links.** Every nav / footer / help-center link target was checked
  against real template files and real Miva tokens — no guessed or broken URLs.
- **A premium interaction layer.** V2 adds a motion / 3D interaction system for
  a more modern feel (see report §9), which the legacy site does not have.

---

## 3. Legacy vs. V2 at a glance

| Area | Legacy site | V2 revamp |
|---|---|---|
| Styling | Per-template inline / duplicated CSS | One shared token system (`css/sd2-global.css`) |
| Components | Copy-pasted markup per page | Reusable canonical partials |
| Data | Some hardcoded values (phone, blog cards) | Sourced from real store/blog tokens with fallback |
| Consistency | Drifts page to page | Consistent by construction |
| Maintainability | Change many files to update one thing | Change one token/partial, updates everywhere |
| Link integrity | Mixed / unaudited | Audited against real templates & tokens |
| Third-party risk | SearchSpring still wired into every page `<head>` | Confirmed inert, de-risking its cancellation |
| Motion / feel | Static | Added 3D / premium interaction layer |

---

## 4. Why V2 is better than legacy

1. **Consistent** — shared tokens mean the whole site looks and behaves the same
   way, instead of small differences creeping in per page.
2. **Easier to maintain** — one change to a token or partial propagates
   everywhere, instead of hunting through many duplicated templates.
3. **More trustworthy content** — real store/blog data replaces hardcoded and
   dummy values, so the site stays accurate without manual edits.
4. **Fewer hidden risks** — links verified, and the cancelled SearchSpring
   dependency confirmed inert before removal.
5. **More modern experience** — the added motion/interaction layer gives a more
   premium feel than the static legacy pages.

---

## 5. What's still outstanding (honest status)

V2 is a real improvement in **foundation**, but it is not finished:

- V2 templates are **not activated** yet — work stays in preview/staging pending
  milestone sign-off (Milestones M3–M9: Homepage, Category/Listing, Search, PDP,
  Cart/Checkout, Dashboard, Final Polish — not yet started).
- Blog footer card **images** are still placeholder graphics (a content/photo
  gap, not a code bug).
- The PDP test template (`prod-product_display-v2-test.mvt`) has real Miva
  wiring only for name/price/image/description/add-to-cart; breadcrumbs, extra
  media, video, spec fields, reviews, related products, and bundles are still
  placeholders.
- No human browser/visual QA has been done yet — fixes are template/code-level
  verified only. Manual review of the staging URL is required before sign-off.

---

*Sources: `V2_REVAMP_REPORT.md` (§2, §4–§9), `DOCUMENTATION.md`. This document
summarizes those; the source files are authoritative.*
