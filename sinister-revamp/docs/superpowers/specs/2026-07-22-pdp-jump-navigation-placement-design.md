# PDP Navigation Placement and Legacy Overview Modernization

## Objective

Move the existing product dossier navigation to its intended position between the product purchase area and the Product Overview section. Preserve the merchant-authored Product Overview content while modernizing its presentation to match V2.

## Scope

- Keep the product hero, fitment panel, gallery, purchase console, and all downstream sections unchanged.
- Move the existing `.sd2-v2-product-tabs` navigation before `#description`.
- Preserve the current navigation links, active-section tracking, sticky behavior, typography, dimensions, colors, and responsive presentation.
- Keep `&mvt:product:descrip;` as the Product Overview source without rewriting product records.
- Apply the modernization only inside `#description .sd2-v2-pdp-copy`.
- Normalize legacy headings, paragraphs, lists, links, images, tables, videos, embeds, and inline formatting into the established V2 typography and media system.
- Preserve meaningful product content and intentional branded media while overriding accidental legacy font sizes, colors, widths, and spacing.
- Constrain prose to a readable measure while allowing intentional media, tables, and feature layouts to use the available section width.
- Do not alter pricing, product attributes, quantity controls, wishlist behavior, or add-to-cart behavior.

## Resulting Order

1. Product hero
2. Fitment confirmation
3. Gallery and purchase console
4. Product dossier navigation
5. Product Overview
6. Specifications, installation, reviews, FAQ, and related products

## Verification

- Confirm the navigation precedes `#description` in both V2 product-display templates.
- Confirm every jump link still targets the current product URL and the correct section fragment.
- Confirm active-section tracking still works.
- Confirm legacy description text and media remain present after modernization.
- Verify long-form descriptions, images, tables, lists, links, videos, and embeds at desktop and mobile widths.
- Verify product pages without horizontal overflow, broken media, or console errors.
