# V2 Account Workspace Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every authenticated account route feel native to the approved premium V2 storefront without changing its information architecture or behavior.

**Architecture:** Add one late, narrowly scoped CSS layer under `.sd2-v2-account` so the existing Miva templates, links, forms, tables, and customer data remain unchanged. The layer reuses the established V2 navy, blue, white, display, body, and mono tokens and contains responsive adaptations for navigation and dense account data.

**Tech Stack:** Miva Merchant templates, CSS, Node assertion tests, authenticated Chrome CDP visual verification, MMT deployment.

## Global Constraints

- Preserve all current account routes, Miva items, forms, data, and visible copy.
- Do not change the approved V2 header, footer, or general storefront composition.
- Keep tables as tables on desktop and preserve usable horizontal access on narrow screens.
- Maintain 44px minimum interactive targets and 16px mobile form text.
- Verify desktop and 390px mobile layouts before completion.

---

### Task 1: Account visual contracts

**Files:**
- Modify: `tests/v2-release-candidate.test.js`

**Interfaces:**
- Consumes: `css/sd2-global.css`
- Produces: regression assertions for the account workspace selectors

- [ ] Add assertions for the branded hero, segmented navigation rail, full-width direct cards, table header, and mobile navigation.
- [ ] Run `node tests/v2-release-candidate.test.js` and confirm it fails because the account polish layer is absent.

### Task 2: Shared account workspace styling

**Files:**
- Modify: `css/sd2-global.css`

**Interfaces:**
- Consumes: existing `.sd2-v2-account*` markup and V2 design tokens
- Produces: consistent account presentation across dashboard, orders, addresses, payment, subscriptions, wish lists, returns, settings, password, and garage entry points

- [ ] Add the scoped CSS layer after the final interface polish block.
- [ ] Make the hero a navy technical field with the established grid and blue accent.
- [ ] Turn account navigation into a contained white rail with clear current, hover, and focus states.
- [ ] Remove the legacy 70% direct-card cap and strengthen card/table spacing and hierarchy.
- [ ] Add desktop order-history toolbar alignment and mobile overflow-safe navigation/table rules.
- [ ] Run `node tests/v2-release-candidate.test.js` and confirm it passes.

### Task 3: Live deployment and visual verification

**Files:**
- Modify: `css/sd2-global.css`

**Interfaces:**
- Consumes: authenticated Revamp_v2 preview session
- Produces: live desktop and mobile proof across representative account states

- [ ] Push with `mmt push --notes "Polish V2 account workspace hierarchy, navigation, cards, and responsive tables"`.
- [ ] Reload dashboard, order history, and wish lists with cache disabled.
- [ ] Verify desktop width, sticky-header clearance, navigation selected state, table containment, typography, and footer transition.
- [ ] Verify the same pages at 390px with no document overflow or clipped actions.
- [ ] Run every `tests/*.test.js` file and `mmt status`; require zero failures and `No files modified`.

