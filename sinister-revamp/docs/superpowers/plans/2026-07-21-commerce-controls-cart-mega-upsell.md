# Commerce Controls, Cart, Mega Menu, and Upsell Implementation Plan

1. Add failing regression contracts covering quantity submission, mini-cart quantity markup, scoped control styling, mega-menu containment, and OUS1 responsive geometry.
2. Repair the shared quantity controller to submit native Miva forms safely and only once.
3. Enhance the live mini-cart renderer with basket-group quantity controls and server refresh behavior.
4. Add final, narrowly scoped CSS for commerce fields, buttons, radios, focus states, mega-menu containment, cart controls, and OUS1 layout.
5. Run the focused regression test, then the complete local V2 test suite.
6. Push only the affected Miva-managed files and verify authenticated live desktop/mobile behavior without placing an order.

