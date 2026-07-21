# Sinister Diesel V2 Website Handbook Design

## Purpose

Create the definitive company and website handbook for the Sinister Diesel V2 storefront. The document must explain what the website is, how it supports the business, how its major systems work, what changed from the legacy experience, which problems were solved, why the project required sustained iteration, the current release position, and what remains before and after publication.

The handbook is written for four audiences without requiring separate documents: company leadership, ecommerce operators, developers or agencies, and future employees responsible for the storefront.

## Deliverable

The canonical source will be `docs/SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md`. It will be self-contained, versioned with the website source, easy to update, and readable in GitHub, Codex, VS Code, Obsidian, or any standard Markdown renderer.

The handbook will use Markdown-native visual structure so it remains portable:

- a concise title and document-control block;
- an executive status scorecard;
- clearly labeled status callouts;
- compact comparison and ownership tables;
- Mermaid diagrams for architecture and customer journeys;
- a chronological milestone timeline;
- an issue, cause, resolution, and business-impact matrix;
- launch and maintenance checklists;
- restrained icons or status markers only where they improve scanning.

The presentation will reflect the V2 brand through navy/blue terminology and hierarchy, but it will not depend on custom CSS, remote images, or proprietary fonts to remain readable.

## Information Architecture

1. Document control and executive summary
2. Company, customer, and brand context
3. Website mission and measurable business value
4. Legacy storefront problems and rebuild objectives
5. V2 experience overview and differentiators
6. Technical architecture and system boundaries
7. Storefront page and template inventory
8. Design system and interaction principles
9. Customer journeys and commerce workflows
10. Garage, fitment, catalog, search, PDP, cart, checkout, and account behavior
11. Help Center, forms API, Monday.com, email, reCAPTCHA, Extend, analytics, and other integrations
12. SEO, structured data, accessibility, security, responsive design, and performance
13. Major problems encountered and their resolutions
14. Why the project took longer than a conventional redesign
15. Quality assurance, tests, audits, and deployment evidence
16. Current release position and objective readiness assessment
17. Remaining blockers, external dependencies, and optional enhancements
18. Publication, rollback, and post-release verification runbook
19. Routine maintenance and ownership guidance
20. Recommended 30-, 60-, and 90-day roadmap
21. File map, commands, terminology, and appendices

## Accuracy Rules

- Separate verified facts, informed assessments, and recommendations.
- Do not claim production publication while `Revamp_v2` remains a preview branch.
- Do not describe source-level tests as proof of every live browser or third-party behavior.
- Record the clean MMT state separately from the currently unconsolidated Git working tree.
- Identify Extend configuration, configurable-product base prices, final transaction validation, production form routing, cross-browser testing, and Core Web Vitals as remaining work with the correct owner.
- Treat older V2-versus-Legacy milestone statements as historical and explicitly supersede outdated readiness claims.
- Avoid exposing API keys, passwords, tokens, cookies, private Monday addresses, customer records, or other secrets.

## Visual and Editorial Style

- Lead sections with outcomes and business meaning before implementation details.
- Use short paragraphs, meaningful headings, and tables only when they make comparison or ownership clearer.
- Keep diagrams small enough to understand without zooming.
- Use consistent status terms: Complete, Ready for validation, External dependency, Post-launch, and Historical.
- Use plain language for leadership sections and exact file, template, endpoint, and command names in technical appendices.
- Avoid marketing exaggeration. Describe the premium identity and improvements with evidence.

## Evidence Sources

The handbook will reconcile information from:

- current MMT release status;
- Git history and working-tree state;
- V2 specifications and implementation plans;
- the 12 storefront regression tests;
- authenticated desktop and mobile audits;
- current templates, partials, CSS, JavaScript, and API integration references;
- documented live issues and their verified resolutions;
- existing V2-versus-Legacy reports, clearly marking stale statements.

## Review and Verification

- Scan for contradictions, stale milestone language, unsupported completion claims, secrets, placeholders, and duplicate sections.
- Verify every local file link and command against the workspace.
- Re-run MMT status and the complete regression suite before recording final release evidence.
- Ensure every remaining item has an owner, priority, release impact, and next action.
- Confirm the handbook is readable as raw Markdown and rendered Markdown.

## Success Criteria

The completed handbook allows a leader to understand the project and present state in under ten minutes, while also allowing a developer or agency to operate, publish, verify, troubleshoot, and maintain the storefront without reconstructing the project history from chat messages or source files.
