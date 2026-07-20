# V2 Editorial Pages Design

## Goal

Bring the remaining legacy content pages into the Sinister Diesel V2 visual system while preserving their live Miva data, legal copy, integrations, links, and forms.

## Scope

The batch covers Sale Restrictions, Policies/Terms & Conditions, Dealer Application, Military Discount, Rewards, Blog, Customer Reviews, Race Parts Notice, Site Map, Sinister Notice, and Sponsor Application.

## Architecture

The implementation will extend the shared V2 stylesheet with an editorial-page component family rather than adding page-local style blocks. Each Miva page template will opt into a clearly named variant: prose, directory, embed, media guide, reviews, blog, or application. Dynamic Miva items and ReadyTheme content sections remain the source of truth.

The existing global header, truck selector, global footer, typography, colors, and shared V2 page hero remain intact. Legacy right-hand About navigation is removed from the affected templates because it duplicates footer navigation and creates narrow, unbalanced content columns.

## Shared Layout

- Use one stable page wrapper below the floating global header, with sufficient top clearance at desktop and mobile breakpoints.
- Keep the navy V2 hero and breadcrumb treatment, with a consistent readable height and heading scale.
- Use a centered editorial content rail with deliberate maximum widths: narrower for prose, wider for directories, embeds, reviews, and blog results.
- Preserve semantic headings, lists, links, focus states, and responsive behavior.
- Prevent third-party content and legacy generated markup from overflowing the viewport.

## Page Variants

### Prose and policy pages

Sale Restrictions, Policies/Terms & Conditions, Race Parts Notice, and Sinister Notice use a readable single-column surface. Legal and notice copy is not rewritten. Lists and navigation sets receive stronger hierarchy, spacing, and link states.

### Directory page

Site Map uses the full editorial width. Its generated columns and groups are normalized into a responsive directory grid with legible typography. The footer CTA must never overlap the final directory content.

### Embedded forms

Dealer Application retains its PDF instructions, download link, and Monday form. The instructions become a compact numbered workflow and the embed receives a wide responsive frame with a practical minimum height. Military Discount keeps the Klaviyo form and script, centered in a purpose-built surface without styling inside the third-party form.

### Media guide

Rewards retains its existing videos, images, coupon instructions, and copy. Media is constrained to the content rail, keeps its intrinsic aspect ratio, and no longer creates an oversized narrow page.

### Dynamic content

Blog and Customer Reviews retain their Miva/Scots Blogger and Shopper Approved output. Shared selectors normalize content width, cards/list rows, sidebar behavior, pagination, images, and typography without fabricating data.

### Sponsor Application

The existing custom sponsor page remains structurally intact because it already follows the V2 campaign system. Only shared header clearance, responsive overflow, and consistency defects are addressed.

## Responsive Behavior

Desktop content uses the available V2 container width. Tablet layouts collapse multi-column structures before text becomes cramped. Mobile layouts use single-column flow, smaller hero headings, edge-safe padding, full-width controls, and horizontally safe media/embeds.

## Verification

Static assertions will verify that affected templates use the correct page variants, no affected page retains the legacy About sidebar, and required Miva items/integrations remain present. Rendered previews will be checked at desktop and mobile sizes using Playwright Chromium because no Browser plugin is available. Final screenshots will be inspected directly for header clearance, content hierarchy, overflow, footer separation, and responsive collapse.
