# PDP Jump Navigation Placement

## Objective

Move the existing product dossier navigation to its intended position between the product purchase area and the Product Overview section.

## Scope

- Keep the product hero, fitment panel, gallery, purchase console, and all downstream sections unchanged.
- Move the existing `.sd2-v2-product-tabs` navigation before `#description`.
- Preserve the current navigation links, active-section tracking, sticky behavior, typography, dimensions, colors, and responsive presentation.
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
- Verify desktop and mobile product pages without horizontal overflow or console errors.
