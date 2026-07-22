# V2 Button / Radius / Typography Consistency Fixes

**Date:** 2026-07-22
**File in scope:** `css/sd2-global.css`
**Nature:** Cosmetic-token consistency. No layout/markup changes. No new components.

## Context
An uncommitted changeset reshaped buttons from pill (`999px`) to `6px` and set button
font-size to `15px`. This introduced off-scale literals and mismatches with existing
design tokens. Fix by aligning everything to tokens (or promoting the new values to tokens),
NOT by scattering more literals.

## Confirmed issues

| # | Issue | Evidence | Decision needed |
|---|-------|----------|-----------------|
| 1 | Buttons hardcode `6px`, but `--sd2-r-sm: 8px`. Buttons no longer match cards/fields using `var(--sd2-r-sm)`. | token block vs `.sd2-btn` rules | Standard = 8px token OR retune token to 6px |
| 2 | `999px` pills survive next to new 6px buttons (e.g. `.sd2-v2-product-card__action` vs `.sd2-v2-product-card .sd2-btn`). | grep `border-radius:999px` | Pill vs 6px per component |
| 3 | Sticky-buy has 3 radii: wrapper 10px, button 6px, inner differ. | sticky-buy hunk | One radius |
| 4 | Button `font-size: 15px` is off the type scale (12/14/16/20/25/31/39/49) — orphan, 4+ rules. | `.sd2-btn` rules | Use `--sd2-text-sm` (14px) OR add `--sd2-text-btn: 15px` |
| 5 | Duplicate `.sd2-btn { }` base blocks (~L169 and ~L5059); later overrides radius/letter-spacing, first is dead. | two base defs | Consolidate |
| 6 | Uncommitted diff = 2445 insertions across ~40 files — far larger than this tweak. | `git diff --stat` | Confirm intended before commit |

## Decisions (LOCKED)
- [x] **Radius standard:** `var(--sd2-r-sm)` (8px). Replace all raw `6px` in button rules with the token. Do NOT retune the token.
- [x] **Button font:** `var(--sd2-text-sm)` (14px). Remove all raw `15px` from button rules.
- [x] **Pill exceptions:** Badges/chips/tags keep `999px`. All `.sd2-btn` and card action buttons use `var(--sd2-r-sm)`.

## Fix steps (do NOT start until decisions are checked)
1. Resolve radius: set token value once; replace raw `6px` button literals with `var(--sd2-r-sm)`.
2. Replace `font-size: 15px` in button rules with the chosen token.
3. Consolidate the two `.sd2-btn` base blocks into one.
4. Reconcile surviving `999px` pills against the standard; keep only intentional pills.
5. Unify sticky-buy radii to the standard.

## Verification
- `grep -nE "border-radius:\s*6px" css/sd2-global.css` -> 0 in button rules
- `grep -nE "font-size:\s*15px" css/sd2-global.css` -> 0 in button rules
- Visual: fitment banner "Open Garage", product-card buttons, sticky-buy, footer CTA share one radius
- Run existing `tests/v2-button-link-integrity.test.js`

## Guardrails
- Touch ONLY `css/sd2-global.css`. Do not restage or commit the other ~40 changed files.
- No visual change beyond radius/font unification. No markup edits.
