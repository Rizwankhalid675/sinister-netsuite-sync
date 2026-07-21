# PDP Dossier Navigation and Desktop Polish Design

## Objective

Make every product dossier control navigate to its section on the current product page without resolving through Miva's `/mm5/` base path, then strengthen the desktop presentation while preserving the mobile composition.

## Root Cause

`templates/prod-product_display.mvt` uses bare fragment links for Overview, Specifications, Installation, and Reviews. Miva's document base causes those links to resolve as `/mm5/#fragment`, which returns 403. FAQ already uses `&mvte:product:link;#faq` and demonstrates the correct server-rendered fallback.

## Approved Design

1. Render all five links as `&mvte:product:link;#section` so navigation remains valid without JavaScript.
2. Add a page-scoped progressive enhancement that intercepts same-page dossier links, scrolls to the section, updates the URL fragment with `history.pushState`, and manages the active tab state.
3. Keep the dossier navigation horizontally scrollable on mobile. At desktop widths, increase label scale, spacing, minimum height, and active-state clarity.
4. Strengthen desktop section and FAQ hierarchy through the existing V2 display/body type system. Do not alter product data, FAQ copy, or the mobile visual scale.

## Accessibility and Behavior

- Every link remains a real link with a valid fallback.
- The active link uses `aria-current="location"`.
- Keyboard activation follows native anchor behavior.
- Scrolling accounts for the sticky storefront header and dossier navigation.
- Motion respects `prefers-reduced-motion`.

## Verification

- Source regression test proves no bare dossier fragments remain.
- Interaction test contract verifies active-state and same-page scroll behavior is present.
- Existing full regression suite remains green.
- Rendered checks cover desktop and mobile PDP states when the preview is reachable.

