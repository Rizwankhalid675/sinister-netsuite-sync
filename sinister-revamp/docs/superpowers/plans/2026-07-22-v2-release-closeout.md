# V2 Release Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining code-owned V2 polish and produce current evidence for every launch dependency without publishing production or creating a real charge.

**Architecture:** Add one final authoritative interaction layer to the shared V2 stylesheet and protect it with a source-level regression contract. Use the authenticated Chrome preview and read-only HTTP/CDP diagnostics to verify storefront, reCAPTCHA, forms, catalog, accessibility, and responsive behavior. Record unresolved owner-controlled items in the handbook and a concise release manifest.

**Tech Stack:** Miva Merchant templates, CSS, Node.js test runner, Chrome DevTools Protocol, MMT CLI, Markdown.

## Global Constraints

- Preserve the approved V2 layout and visual language.
- Do not publish the production Miva branch.
- Do not submit a real payment or place an order.
- Do not hide or suppress third-party integration failures.
- Do not stage or commit unrelated files from the dirty parent worktree.
- Use test-first changes for production CSS.

---

### Task 1: Global Technical Blue Selection Treatment

**Files:**
- Modify: `tests/v2-premium-presentation.test.js`
- Modify: `css/sd2-global.css`

**Interfaces:**
- Consumes: shared V2 color tokens and global storefront CSS cascade.
- Produces: consistent `::selection` and `::-moz-selection` behavior on every storefront page.

- [ ] **Step 1: Write the failing regression contract**

Require the final stylesheet layer to define global blue selection with white text, no text shadow, and Firefox parity.

- [ ] **Step 2: Run the focused test and verify the new contract fails**

Run: `node --test tests/v2-premium-presentation.test.js`

Expected: failure because selection is currently limited to five page shells.

- [ ] **Step 3: Add the minimal authoritative global selection CSS**

Add a final `V41: Technical Blue Selection` layer using `::selection` and `::-moz-selection` without altering component layout.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/v2-premium-presentation.test.js`

Expected: pass.

### Task 2: Production Integration and Catalog Diagnostics

**Files:**
- Create: `%TEMP%/sd2-release-closeout-diagnostic.js`
- Modify: `docs/SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md`

**Interfaces:**
- Consumes: authenticated Chrome preview, live storefront DOM, form markup, reCAPTCHA scripts, catalog pages, and network responses.
- Produces: timestamped evidence for reCAPTCHA presence, forms endpoint configuration, zero-price mitigation, Extend status, and first-party runtime health.

- [ ] **Step 1: Inventory all seven help workflows and their submit configuration**

Inspect templates and rendered routes without submitting customer-visible requests.

- [ ] **Step 2: Verify reCAPTCHA configuration and runtime presence**

Confirm applicable forms load a site key/client script and expose the expected token field or execution hook.

- [ ] **Step 3: Verify catalog zero-price mitigation**

Inspect configurable product cards and PDP entry points for truthful `Choose Options` behavior rather than a purchasable `$0.00` action.

- [ ] **Step 4: Recheck external endpoint status**

Capture the Extend response status and classify it as fixed or owner-controlled.

### Task 3: Accessibility and Responsive Release Sweep

**Files:**
- Create: `%TEMP%/sd2-release-closeout-accessibility.js`
- Modify: `docs/SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md`

**Interfaces:**
- Consumes: representative homepage, category, PDP, cart, checkout entry, account, help, editorial, and form routes.
- Produces: desktop/mobile evidence for headings, labels, focusability, overflow, blank states, broken images, and first-party console errors.

- [ ] **Step 1: Run desktop and mobile rendered checks**

Use 1440×900 and 390×844 viewports against the preview branch.

- [ ] **Step 2: Exercise representative navigation and pagination interactions**

Verify visible controls update real UI state and retain keyboard focus styling.

- [ ] **Step 3: Classify browser coverage honestly**

Record Chrome/Chromium evidence and retain Safari/Firefox/physical-device checks as owner-operated follow-ups when those runtimes are unavailable.

### Task 4: Release Manifest and Final Verification

**Files:**
- Create: `docs/V2-RELEASE-CLOSEOUT-2026-07-22.md`
- Modify: `docs/SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md`

**Interfaces:**
- Consumes: test output, MMT status, diagnostics, and parent Git status.
- Produces: current launch-ready evidence plus an explicit list of actions requiring production authority.

- [ ] **Step 1: Run the complete regression suite**

Run: `node --test --test-reporter=spec tests/*.test.js`

Expected: zero failures.

- [ ] **Step 2: Push intended MMT changes and verify MMT is clean**

Run: `mmt push --notes "Complete V2 release closeout polish"` followed by `mmt status`.

Expected: intended CSS committed and `No files modified`.

- [ ] **Step 3: Document current repository state without broad staging**

Record the dirty-tree count and explain that a scoped commit/tag requires owner review because unrelated edits must not be captured automatically.

- [ ] **Step 4: Publish a precise remaining-authority list**

Keep production activation, real transaction completion, Extend ownership, and non-Chromium physical-device validation explicitly outside the completed-code claim.
