# Frontend fidelity ledger

Reference: Enshield live-dashboard screenshots supplied in the project conversation on
2026-07-23. Browser plugin was not available, so verification used Playwright Chromium.
Rendered evidence is written outside the repository to
`%TEMP%\enshield-qa-screenshots\enshield-{dashboard,table}-{desktop,mobile}.png`.

| Comparison point | Live reference | Current render | Resolution / disposition |
| --- | --- | --- | --- |
| Information architecture | Dashboard, Clients, Claims, Errors, Reports, Settings, plus Users from the live account surface | Dashboard, Clients, Orders, Claims, Errors, Reports, Settings, Users | Core live sections are preserved. Orders is an intentional operational addition required by the revamp scope. |
| Sidebar | Dark slate vertical rail with teal active state and persistent labels/icons | Dark navy compact rail with teal active state and two-letter accessible shortcuts; mobile becomes a drawer | Structure, selection treatment, and responsive behavior match. Exact shield/icon artwork is not yet available in the repository, so shortcuts remain an intentional deviation. |
| Header | White top bar with page identity, notification control, and account menu | White top bar with page title, client selector, notification control, account name, and sign out; at 393 CSS px it becomes two rows | Functional hierarchy matches. The first implementation overflowed to 538 CSS px; it was repaired and every visible header control now has a bounding box inside the viewport. |
| Content surfaces | Pale blue-gray canvas, white panels/tables, navy text, teal accents | Same canvas/surface/navy/teal system | Palette is faithful. Teal and muted text were darkened slightly to satisfy WCAG AA contrast. |
| Tables | Wide searchable operational tables with subtle dividers and compact headers | Search/status controls, subtle table dividers, compact headers, responsive label/value rows | Desktop table density is close; mobile intentionally converts rows to labeled records rather than forcing horizontal scrolling. |
| Empty/error states | Centered empty-state messaging in bordered content areas | Centered empty states with a bold title plus a muted description line, and inline semantic error messaging with retry on recoverable errors | Meaning, hierarchy, and restraint match. Empty states now carry a title/description pair (`.esd-empty-title` / `.esd-empty-desc`); a `.esd-empty-icon` slot is reserved in CSS but remains unused pending the live icon asset. |
| Notifications | Right-side empty notification panel with close control | Anchored notification popover with close control, Escape/outside-click handling, and focus restoration | Interaction is more compact but retains the reference message and close path. |
| Typography | Clean sans-serif, subdued labels, stronger headings and values | Inter/system sans-serif, subdued labels, strong headings/metrics | Hierarchy is faithful; browser/system fallback may vary where Inter is unavailable. |
| Responsive behavior | No mobile reference was supplied | Pixel 5 verification: two-row header, drawer navigation, stacked filters, labeled table rows, keyboard/focus behavior | Mobile is an intentional extension. Automated checks prove `scrollWidth <= clientWidth` on every route and no header control crosses either viewport edge. |
| Motion | Reference screenshots are static | Small entrance/graph motion with `prefers-reduced-motion` support | Motion is restrained and disabled/reduced for the user preference. |

Above-the-fold copy check: no marketing copy, badges, or invented product claims were
added. Operational labels come from the supplied live IA or the approved revamp scope.

Remaining fidelity risks:

- The exact Enshield shield logo and live icon set are not present as reusable local assets.
- The live screenshots are conversation images rather than local files, so a pixel-diff or
  `view_image` call on the reference itself was not possible. The latest desktop and mobile
  Playwright captures were inspected directly.
- Gadget telemetry is intercepted with a successful test response. The QA server omits the
  Gadget editor harness, makes no broad console exclusions, and fails on every same-origin
  4xx/5xx resource response, console error, or uncaught page error.
