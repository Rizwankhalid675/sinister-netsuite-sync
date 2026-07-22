# Homepage Truck Lab Interaction Hardening Implementation Plan

> **For Codex:** Execute this plan continuously with the systematic-debugging, test-driven-development, frontend-testing-debugging, and verification-before-completion skills. Do not declare the site ready from static inspection alone.

**Goal:** Keep every Truck Lab platform selector and its visible “Enter” CTA clickable throughout scrolling, animated platform changes, keyboard use, and pointer dragging.

**Architecture:** Preserve the existing Miva template and V2 visual composition. Stabilize the active slide's browser hit-test geometry by excluding its 3D `transform` from the incoming transition while retaining the outgoing depth animation. Harden drag lifecycle cleanup with pointer capture so an outside-stage release cannot leave stale interaction state. Protect both fixes with source contracts and validate the deployed branch with real pointer hit tests at every transition frame.

**Tech Stack:** Miva Merchant templates (`.mvt`), CSS, browser JavaScript, Node `assert` tests, Playwright against the Miva branch preview, and MMT deployment.

**Global constraints:** Keep the V2 design unchanged; preserve unrelated working-tree changes; use root-safe links; retain keyboard and reduced-motion behavior; do not use transaction-producing checkout actions; do not claim completion without deployed desktop and mobile evidence.

---

## Task 1: Encode the reproduced failure as a regression contract

**Files:**
- Modify: `tests/v2-button-link-integrity.test.js`
- Test: `tests/v2-button-link-integrity.test.js`

- [x] Add an assertion that `.sd2-v5-truck.is-active` owns an explicit transition containing only opacity and filter, never transform. This guarantees the incoming visible CTA reaches stable hit-test geometry immediately.
- [x] Add assertions that Truck Lab drag setup uses `setPointerCapture`, records the active pointer ID, and clears/releases it from completion, cancellation, capture-loss, and uncaptured-leave paths.
- [x] Run `node tests/v2-button-link-integrity.test.js` and confirm it fails for the missing transition and pointer-capture contracts before production code changes.

## Task 2: Stabilize active-slide hit testing without redesigning the carousel

**Files:**
- Modify: `css/sd2-global.css:4745-4748`
- Test: `tests/v2-button-link-integrity.test.js`

- [x] Add `transition: opacity .45s ease, filter .6s ease;` to `.sd2-v5-truck.is-active`.
- [x] Keep the base slide transform transition so departing and background slides retain the V2 depth motion.
- [x] Do not change slide sizing, layout, imagery, typography, or control placement.
- [x] Run the regression contract and confirm the transition assertion passes.

## Task 3: Make pointer dragging self-cleaning

**Files:**
- Modify: `js/sd2-motion.js:610-672`
- Test: `tests/v2-button-link-integrity.test.js`

- [x] Add `dragPointerId` state next to `dragStart`.
- [x] On an eligible pointer down, store the pointer ID; capture only after movement proves a drag so normal image-link clicks still navigate.
- [x] Add one cleanup helper that clears `dragStart`, `dragPointerId`, and tilt state, and releases capture only when that pointer remains captured.
- [x] Use that helper from pointer up, pointer cancel, capture loss, and uncaptured pointer leave; retain the current 55px swipe threshold and platform selection direction.
- [x] Prevent native image dragging from cancelling the custom pointer gesture.
- [x] Run `node tests/v2-button-link-integrity.test.js` and confirm all new contracts pass.

## Task 4: Review the focused implementation before deployment

**Files:**
- Review: `css/sd2-global.css`
- Review: `js/sd2-motion.js`
- Review: `tests/v2-button-link-integrity.test.js`

- [x] Inspect the scoped diff for accidental visual or navigation changes.
- [x] Run `node --check js/sd2-motion.js`.
- [x] Run the complete repository test inventory under `tests/*.test.js`.
- [x] Have a read-only review agent check root-cause alignment, accessibility, pointer lifecycle, and regression quality; resolve any valid findings before deployment.

## Task 4A: Clear the two mobile overlay collisions found by the interaction audit

**Files:**
- Modify: `css/sd2-global.css:598-616`
- Modify: `css/sd2-global.css:4820-4831`
- Test: `tests/v2-button-link-integrity.test.js`

- [x] Raise the mobile drawer and its scrim above the V3 floating header so the visible close control receives pointer input.
- [x] At phone widths, keep the Truck Lab control rail left-aligned and clear of the fixed bottom-right reCAPTCHA badge without altering tablet or desktop composition.
- [x] Add CSS source contracts for both stacking and phone-width control placement.
- [x] Re-run the mobile drawer close and Truck Lab next-arrow tests with raw pointer clicks at 320×844, 361×844, 380×844, 381×844, and 390×844.

## Task 5: Deploy and exercise real interaction timing

**Files:**
- Deploy: `css/sd2-global.css`
- Deploy: `js/sd2-motion.js`

- [x] Run `mmt status` and verify only the intended Miva-managed files are pending.
- [x] Push the scoped CSS and JavaScript changes through MMT.
- [x] Open `https://sinisterdiesel.com/?BranchKey=b5afdddae9601468481279b3c52b007d` through Playwright and wait for the deployed asset versions.
- [x] At desktop widths 1904 and 1440, scroll the Truck Lab into view and switch Powerstroke → Duramax → Cummins → Powerstroke.
- [x] During each 850ms transition, sample the visible CTA center every 50ms with `document.elementFromPoint`; require the hit target to remain the active CTA.
- [x] Use raw `page.mouse.click` during the former 250–700ms failure window for all three CTAs and confirm each navigates to its intended root-relative catalog URL.
- [x] Verify numbered tabs, previous/next arrows, stage arrow keys, a completed drag, and a drag released outside the stage.
- [x] Repeat selector, keyboard, drawer-close, and tap checks across the phone breakpoint matrix; confirm no horizontal overflow or sticky-header/reCAPTCHA interception.
- [x] Save QA screenshots outside the repository under the system temporary directory.

## Task 6: Release verification and handoff

**Files:**
- Verify: all scoped files and the deployed branch

- [x] Re-run the complete test suite after deployment.
- [x] Re-run `mmt status` and confirm no intended file remains unpushed.
- [x] Check `git diff --check` and inspect `git status --short`, preserving pre-existing unrelated files.
- [ ] Commit only the plan, regression test, CSS, and JavaScript changes with a focused message.
- [ ] Report the root cause, exact fixes, tested viewports/interactions, commands, evidence location, and any remaining external risk.
