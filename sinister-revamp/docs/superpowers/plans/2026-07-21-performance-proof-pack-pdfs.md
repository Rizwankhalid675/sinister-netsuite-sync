# Performance Proof Pack PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the V2 preview, compare it honestly with the supplied legacy baseline, and generate two branded PDFs suitable for Brian.

**Architecture:** Store raw measurement evidence under a dedicated report artifact directory, generate self-contained branded HTML from structured data, and print that HTML to PDF with headless Chromium. Generate the handbook PDF from the canonical Markdown through a purpose-built renderer that preserves headings, tables, callouts, code, and diagrams.

**Tech Stack:** Playwright/Chromium, Lighthouse-compatible performance measurement, Node.js, HTML/CSS, Markdown source, PDF inspection tools.

## Global Constraints

- Never expose the Miva preview branch credential, browser cookies, API keys, or customer data.
- Never claim a metric improvement without measured evidence.
- Clearly distinguish legacy supplied evidence, V2 direct measurement, and production-only SEMrush outcomes.
- Keep output self-contained and visually usable without remote assets.

---

### Task 1: Capture V2 performance evidence

**Files:**
- Create: `reports/performance-proof-pack/v2-performance-results.json`
- Create: `reports/performance-proof-pack/v2-homepage.png`

- [ ] Verify the V2 preview identity in a browser session.
- [ ] Attempt the actual GTmetrix cookie-enabled workflow using the authorized account/session.
- [ ] Run three V2 Lighthouse-compatible measurements and retain raw results.
- [ ] Compute median metrics and document test environment and limitations.

### Task 2: Build the Performance Proof Pack

**Files:**
- Create: `reports/performance-proof-pack/performance-proof-pack.html`
- Create: `reports/Sinister-Diesel-V2-Performance-Proof-Pack.pdf`
- Create: `scripts/build-performance-proof-pack.js`

- [ ] Encode the supplied legacy GTmetrix and SEMrush values as attributed baseline data.
- [ ] Build comparison verdicts only from defensible metrics.
- [ ] Generate branded HTML and PDF.
- [ ] Validate page count, text extraction, secrets, and clipping indicators.

### Task 3: Build the Handbook PDF

**Files:**
- Create: `reports/Sinister-Diesel-V2-Website-Handbook.pdf`
- Create: `scripts/build-handbook-pdf.js`

- [ ] Render the canonical handbook Markdown with branded print styling.
- [ ] Convert Mermaid blocks into readable static diagram treatments.
- [ ] Generate the PDF and verify section coverage, page count, and secret safety.

### Task 4: Final verification

**Files:**
- Test: `tests/v2-report-artifacts.test.js`

- [ ] Add an artifact contract for both PDFs and their evidence/source files.
- [ ] Run the full storefront regression suite.
- [ ] Inspect both PDFs visually at representative pages.
- [ ] Commit only report sources, scripts, tests, and final PDFs.
