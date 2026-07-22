# Performance Proof Pack and Handbook PDF Design

## Objective

Create two visually polished, shareable PDFs for Brian:

1. A Performance Proof Pack comparing the supplied legacy GTmetrix and SEMrush baseline with directly measured `Revamp_v2` evidence.
2. A formatted PDF edition of the canonical Sinister Diesel V2 Website, Commerce, and Operations Handbook.

## Evidence rules

- Label legacy values as supplied July 21, 2026 baseline evidence.
- Run the V2 preview under authenticated/preview conditions without publishing its branch credential.
- Prefer an actual GTmetrix report. If account/API access prevents it, record the blocker and use repeated Lighthouse measurements under documented comparable settings rather than fabricating a GTmetrix result.
- Use three performance runs and report the median for locally measured V2 values.
- Separate measured performance results, source-verified SEO readiness, and production-only outcomes.
- Do not claim improved rankings, traffic, conversions, authority, or Core Web Vitals before production measurement exists.

## Performance Proof Pack structure

- Executive cover and decision statement
- Evidence and methodology
- Legacy GTmetrix baseline
- V2 measured results
- Side-by-side metric deltas and verdicts
- SEMrush legacy baseline and V2 SEO readiness comparison
- What V2 demonstrably improves
- Remaining performance opportunities and release caveats
- Technical appendix and source references

## Visual system

- Sinister Diesel navy, cobalt, white, cool gray, and restrained gold
- Oswald-style condensed display typography with clear sans-serif body copy
- Large metric cards, compact comparison tables, horizontal delta bars, status pills, and page-numbered footers
- No remote assets or fragile dependencies in the final PDFs
- Letter-sized pages with print-safe margins and intentional page breaks

## Handbook PDF structure

- Preserve the canonical handbook content and hierarchy
- Render Mermaid diagrams as polished vector-like diagram blocks
- Apply the same branded cover, callouts, tables, checklists, section dividers, and running footer
- Include a document-control page and clickable table of contents where supported

## Acceptance criteria

- Both PDFs open successfully and have nonzero page counts.
- Text is selectable and not clipped.
- No secrets, preview cookies, or private branch credentials appear.
- Performance conclusions are supported by displayed evidence.
- The handbook PDF contains every canonical H2 section.
- Automated generation is repeatable from repository source.
