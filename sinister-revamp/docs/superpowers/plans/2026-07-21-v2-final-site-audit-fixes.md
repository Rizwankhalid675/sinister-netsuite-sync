# V2 Final Site Audit Fixes

**Goal:** Resolve the reproducible storefront defects found by the 102-view desktop/mobile audit without changing the approved V2 design or third-party business behavior.

## Task 1: Lock the regressions down

- Add `tests/v2-final-site-audit.test.js`.
- Assert that catalog and editorial grid tracks can shrink (`minmax(0,1fr)`).
- Assert that the Klaviyo promotion form and injected form are contained on narrow screens and that top-level field rows stack.
- Assert that Shopper Approved mobile geometry is width-contained.
- Assert that the PDP FAQ jump uses the live product URL plus `#faq`, never a base-relative bare fragment.
- Run the new test and confirm it fails before production changes.

## Task 2: Apply minimal shared fixes

- In `css/sd2-global.css`, constrain `.sd2-v2-pgrid-wrap` and editorial `.sd2-wrap` grid tracks.
- Add mobile-only Klaviyo containment/stacking rules scoped to `promotion-form`.
- Keep Shopper Approved inside the constrained editorial track; add explicit mobile width/box-sizing rules only where the vendor stylesheet still wins.
- In `templates/prod-product_display.mvt`, make FAQ navigation product-aware.

## Task 3: Verify locally and deploy

- Run the new regression test, then the full Node regression suite.
- Inspect the MMT diff/status and push only files modified by this task.
- Verify the live preview at desktop and mobile widths for category, Military Discount, Customer Reviews, and PDP FAQ behavior.
- Re-run the full priority-route audit and record any remaining code defect separately from external configuration failures.

## External configuration findings

- Sponsor CAPTCHA renders an empty `MW_Miscellaneous_Options:recaptcha_site_key`; a valid Google site key is required in Miva configuration.
- Extend shipping protection requests a vendor endpoint that returns 404 for the configured store ID. This requires correction in the Extend/Miva module settings, not a CSS/template suppression.

