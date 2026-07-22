# V2 Premium Presentation Audit Implementation Plan

**Goal:** Restore a consistent premium visual finish across the existing V2 storefront without changing its information architecture, visual identity, or page designs.

**Architecture:** Keep the existing templates and V2 components intact. Add a final, narrowly scoped CSS consistency layer for typography, control sizing, editorial media, and third-party/MMX content, backed by static regression tests and browser renders at desktop and mobile widths.

**Tech Stack:** Miva templates, CSS custom properties, Node.js assertion tests, Playwright browser auditing.

---

### Task 1: Lock the premium presentation contract

**Files:**
- Create: `tests/v2-premium-presentation.test.js`
- Read: `css/sd2-global.css`
- Read: `css/google-fonts.json`

1. Add assertions for the three V2 font families and their intended roles.
2. Add assertions for minimum button/control heights, editorial/MMX heading typography, readable utility text, review controls, and constrained portrait media.
3. Run the new test and confirm it fails for the missing consistency rules.

### Task 2: Normalize V2 sizing without redesigning pages

**Files:**
- Modify: `css/sd2-global.css`

1. Add a final V2-only premium scale layer using the existing design tokens.
2. Normalize headings, body copy, utility labels, buttons, and form controls.
3. Constrain oversized portrait media while preserving its aspect ratio.
4. Normalize MMX editorial headings and spacing.
5. Repair review pagination/filter sizing and blog form controls.
6. Preserve product image `object-fit: contain` behavior and existing layout structure.

### Task 3: Verify representative and full-site behavior

**Files:**
- Test: `tests/v2-premium-presentation.test.js`
- Test: `tests/v2-commerce-controls.test.js`
- Test: `tests/v2-editorial-pages.test.js`
- Test: `css/sd2-global.css`

1. Run all relevant Node regression tests.
2. Validate CSS brace balance and scan for prohibited pill button overrides.
3. Inject the local stylesheet into representative live routes and capture settled desktop/mobile screenshots.
4. Re-run the route audit for overflow, typography, image sizing, controls, and console errors.
5. Report local completion separately from Miva deployment status.
