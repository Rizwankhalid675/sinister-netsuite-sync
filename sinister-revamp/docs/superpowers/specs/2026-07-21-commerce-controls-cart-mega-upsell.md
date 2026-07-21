# Commerce Controls, Cart, Mega Menu, and Upsell Repair

## Objective

Polish the active V2 commerce surfaces without changing the approved design language or replacing native Miva commerce behavior.

## Scope

- Normalize visible text fields, selects, radio/checkbox controls, focus outlines, and primary/secondary buttons inside PDP, basket, checkout, wish-list, and account surfaces.
- Keep native inputs accessible and preserve Miva names, actions, and server-side validation.
- Repair full-cart quantity decrement/increment using the existing `QTYG` basket-group form.
- Add quantity controls to the mini-cart by carrying each live basket group's update form into the drawer and refreshing the drawer after a successful update.
- Constrain desktop mega-menu geometry to the active header shell, remove conflicting overflow behavior, and preserve the current editorial columns.
- Rebalance the checkout special-offer (`OUS1`) page so product name, savings, price, and both order actions remain visible at desktop and mobile sizes.

## Behavior Contract

1. Quantity minus never produces a value below the input minimum.
2. Quantity plus/minus submits the closest native Miva quantity form once and refreshes totals from the server.
3. Mini-cart controls expose accessible labels and use the same basket group ID as the live basket response.
4. Controls have a minimum 44px interaction target and a visible keyboard focus state.
5. Mega menus remain inside the viewport and header width at supported desktop breakpoints.
6. Checkout and special-offer actions retain native Miva action values; no checkout or order submission is automated during QA.

## Verification

- Static regression contracts for markup, CSS, and JavaScript behavior.
- Existing V2 test suite.
- Authenticated Chrome QA at desktop and mobile widths for PDP, mega menu, mini-cart, full cart, special offer, shipping, and payment pages.
- MMT status and explicit push limited to repaired files.

