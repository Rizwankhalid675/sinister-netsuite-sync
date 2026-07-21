# Technical Blue Interaction Layer

## Objective

Make small browser and control interactions feel native to Sinister Diesel V2 without changing page layouts, component geometry, typography, content, or commerce behavior. The treatment must remain clear on white, navy, and cobalt surfaces and must preserve accessible keyboard navigation and reduced-motion preferences.

## Visual Direction

Use a restrained Technical Blue system rather than decorative novelty. Selected text uses a light electric-blue background with deep navy text so it remains readable over both light and dark sections. Focus, hover, active, autofill, and scrollbar treatments reuse the existing V2 navy and blue palette.

The interaction layer must not add a custom cursor, sounds, particles, glows, layout shifts, or new visible copy.

## Interaction Treatments

### Text selection

- Apply one global `::selection` treatment so homepage, editorial, category, product, account, cart, and checkout pages behave consistently.
- Use a light electric-blue selection background and deep navy foreground.
- Add the equivalent `::-moz-selection` rule for Firefox.
- Override the existing page-scoped selection rules through one final canonical layer.

### Keyboard focus

- Preserve a highly visible blue focus ring for links, buttons, form controls, and disclosure controls.
- Use `:focus-visible`, not `:focus`, so pointer users do not receive unnecessary rings.
- Do not suppress native focus unless the replacement ring is present.

### Links

- Add a restrained underline reveal only to ordinary inline content links.
- Exclude buttons, navigation controls, product-card media links, image links, and components that already provide a complete hover state.
- Do not cause text reflow or change link destinations.

### Buttons

- Add a one-pixel visual press response to enabled buttons and button-styled links.
- Preserve existing colors, typography, dimensions, and hover states.
- Disabled and loading controls must not move.

### Form autofill

- Replace browser-yellow autofill with a pale blue surface and deep navy text where browser support permits.
- Preserve readable caret and placeholder behavior.
- Do not interfere with password managers or form values.

### Scrollbars

- Use a slim neutral track and V2 blue thumb for page and intentionally scrollable component rails.
- Maintain sufficient thumb contrast and a larger hover target where supported.
- Avoid hiding functional scrollbars globally.

### Motion preferences

- Disable underline animation and button press transforms under `prefers-reduced-motion: reduce`.
- State changes remain visible without animation.

## Implementation Boundaries

- Implement as a final, clearly labeled canonical section in `css/sd2-global.css` so older scoped rules cannot override it accidentally.
- Add regression assertions to the existing V2 presentation test suite.
- JavaScript and Miva templates should not change unless live verification proves CSS alone cannot provide the approved behavior.
- Do not change the V2 layout, display typography, product imagery, button geometry, or page-specific design.

## Verification

- Prove the new tests fail before implementation and pass afterward.
- Run the complete storefront regression suite.
- Inspect text selection on a cobalt CTA, a navy hero, and light body copy.
- Verify keyboard focus, inline-link hover, button press, autofill styling where testable, and scrollbars at desktop and mobile widths.
- Check Chrome through the authenticated preview session; source-level Firefox selection support is required, while full Firefox visual testing is a documented residual risk if unavailable.
- Confirm MMT reports a clean release state after deployment.

## Success Criteria

The storefront has one coherent branded selection treatment and refined micro-interactions that feel intentional but do not distract from shopping. Text remains readable, controls do not shift layout, keyboard focus is never lost, reduced-motion users receive stable states, and no commerce behavior changes.
