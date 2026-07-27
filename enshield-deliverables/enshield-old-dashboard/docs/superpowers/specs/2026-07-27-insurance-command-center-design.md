# Enshield Insurance Command Center Design

## Objective

Transform the internal Gadget dashboard into a modern, minimal insurance CRM/ERP command center while preserving the current Shopify data APIs, Miva connection honesty, authentication, tenancy, and role permissions. The result must serve both daily operators and leadership review without changing production.

## Chosen Direction

The approved direction is the balanced command center. It combines executive clarity with operational density: a calm navigation shell, a prominent protection summary, compact supporting KPIs, useful charts, actionable status panels, and a responsive recent-orders workspace.

## Visual System

- Deep navy navigation and hero surfaces communicate trust and operational seriousness.
- Warm white cards sit on a soft slate workspace; teal is the primary Enshield accent.
- Green, amber, and red are reserved for semantic status and never act as the only status cue.
- Typography uses the existing application font stack with stronger size, weight, and spacing hierarchy.
- Corners, borders, and shadows remain restrained; this is an insurance operations product rather than a marketing site.
- All text and controls meet WCAG AA contrast and focus requirements.

## Application Shell

The existing routes and permission gates remain unchanged. The desktop rail gains recognizable icons, labels on expansion, tooltips when collapsed, and a clearer active state. The header contains the page title, client context, environment indicator, notifications, and account controls. Mobile uses a compact header and an accessible slide-out navigation drawer.

## Dashboard Composition

1. An operational header identifies the selected client, active date range, insurance status, source health, and refresh action.
2. A primary protection summary combines protected value, protected order count, and open claims into one high-priority surface.
3. Supporting KPI cards show attach rate, in-transit orders, refunds, and fulfillment with correct units and short contextual labels.
4. The activity module shows monthly protected value and order volume with accessible labels, hover/focus details, and empty states.
5. Claims and fulfillment modules summarize operational health without implying unavailable Miva data is zero.
6. The latest-orders workspace provides search, compact status badges, export, and responsive mobile disclosure cards.

## Responsive Behavior

Desktop uses a two-column analytical layout with a compact table. Tablet collapses secondary panels while preserving side-by-side KPIs. Mobile uses a horizontally scrollable KPI strip, condensed activity visualization, and expandable order summaries so the page does not become an excessively long stack of labels.

## Motion

Framer Motion is used for functional feedback: 150–350 ms page and panel transitions, restrained initial stagger, number changes, chart reveals, navigation drawers, filter changes, and status feedback. Motion never blocks interaction. `prefers-reduced-motion` produces immediate states without intermediate opacity that could reduce contrast.

## Data Contract

The API remains the source of truth. Percentage fields use one explicit convention: the backend's current 0–100 percentage values are displayed directly, while deltas remain ratios where already documented. All KPI values in a selected range come from the same range aggregate. Shopify is labeled live when available. Miva remains unavailable until an authenticated read integration exists.

## Error and Empty States

- Authentication failures return to internal login.
- Forbidden states retain the existing permission-specific message.
- API failures preserve the last stable layout and provide a retry action.
- Empty ranges explain that no records fall in the selected period and offer All time.
- Partial aggregation and disconnected sources use compact status notices rather than dominant warning banners.

## Component Boundaries

The dashboard route is divided into focused presentation units: operational header, KPI summary, activity visualization, health panels, and recent orders. Formatting helpers remain pure and independently testable. Existing `useRole`, navigation, API endpoints, and permission gates remain intact.

## Verification

- Unit tests cover percentage formatting and the range-consistent KPI contract.
- React tests cover data, error, forbidden, empty, and reduced-motion states.
- Playwright verifies authenticated desktop and mobile layouts, primary range interaction, responsive navigation, viewport containment, console health, and accessibility.
- A live development smoke test verifies real Shopify metrics after Gadget sync.
- Production-mode Vite build must succeed before handoff.

## Explicit Non-Goals

- No production deployment or production configuration mutation.
- No fabricated Miva totals or direct production database access.
- No redesign of finance or claim workflows beyond shared shell consistency in this iteration.
- No replacement of Gadget, Shopify, Laravel, or existing authorization boundaries.
