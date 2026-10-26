# Verification report

## Automated checks performed

- **20/20 dependency-free tests passed** (`npm test`): 8 frontend/core tests and 12 backend simulation tests.
- **36 browser route/state captures passed** in local Chromium, at 1440 px desktop and 390 px mobile widths. Browser assertions found no horizontal overflow or uncaught JavaScript runtime errors.
- Each primary route and its desktop/mobile layout was visually reviewed. Final refinements addressed proportional QR sizing, the prominent payable amount, initial form validation styling, footer-logo contrast, route scroll reset, navigation icons and off-screen status UI.
- The bundled HTML capture helper additionally rendered the desktop homepage snapshot: no failed resources, console errors, clipped overflow or overlay intersections reported.
- Supplied logo and QR asset bytes match the original uploaded files. They were not regenerated, recoloured, cropped or replaced.

## What the tests cover

### Frontend/core

- Original spreadsheet order; blank/invalid entries excluded.
- Search/category/subcategory composition and explicit ascending/descending starting-price sorting.
- Reset returns to source order.
- Variant-aware cart keys, quantities, rupee display and integer-paise arithmetic.
- Price/availability reconciliation and safe handling of malformed cart storage.
- All 28 states and 8 union territories.
- Customer/mobile/PIN/email validation and safe HTML/URL rendering.

### Backend simulation

- Exact product row order and invalid/duplicate-ID rejection.
- One order line per variant, exact 21-column schema, totals in rupees and UTR in private metadata.
- Server re-pricing rejects tampered prices before writing.
- Same-reference retry reuses saved historical values even if current product prices changed.
- Same reference with changed customer/items is rejected.
- Email error/timeout produces partial status, never full success, and does not blindly resend.
- Interrupted order-write acknowledgement recovers without appending duplicate rows.
- Spreadsheet-formula escaping and recovery comparisons.
- Interrupted email `SENDING` marker becomes uncertain rather than triggering automatic resend.
- Server checkout kill switch and validation/quantity/declaration/consent guards.

### Browser interactions

- Desktop navigation and expanded mobile menu.
- Shop sorting/reset, category filtering and no-result state.
- Three photograph gallery slots, thumbnail selection, square containers and `object-fit: contain`.
- Size changes price; frame selection and same-product/different-size additions.
- Cart quantity changes and persistence after refresh.
- Two-step checkout and preserved customer details on back navigation.
- QR original-file download link.
- Partial-email outcome: saved order, preserved bag and same-reference recovery after refresh.
- Full confirmation: specified success copy and cart clearance only after both acknowledgements.
- Simulated network failure: no false success; bag/key retained; safe retry.
- About, categories, contact, privacy, delivery, empty bag and not-found routes.
- Unconfigured production build shows an honest catalog error and never falls back to hardcoded products.

## Important limitations — not tested live

No access to the user's real Google spreadsheets was used, no Apps Script deployment was published, no FormSubmit notification was sent, and no UPI payment was made. Catalog and order services in browser tests were intercepted with **local-only fixtures**, which are not deployed with the public storefront. Backend tests execute `Code.gs` in a simulated Apps Script environment, not Google's runtime.

A local OpenCV decoder could not decode the supplied QR image. This is not proof of invalidity. The owner must verify scanning, recipient identity and payment behaviour in actual UPI apps before opening checkout. The original image remains unchanged.

The following need live acceptance testing by the owner:

- Google authorization, anonymous `/exec` access and actual redirect/CORS behaviour from the deployed Pages origin.
- Actual Sheets read/write behaviour, account permissions and service quotas.
- FormSubmit activation, successful server-to-server notification acceptance and actual inbox arrival.
- Optional live Cloudflare Turnstile verification and hostname configuration.
- Actual bank/UPI settlement, owner payment review and separate invoice processing.
- Approved merchant disclosures, delivery/refund/returns policy and privacy compliance.
- Live Safari/iOS, Android browsers and assistive-technology review as applicable. Local Chromium checks do not certify all browsers or full WCAG conformance.

See README's launch acceptance checklist. Checkout is deliberately disabled in the delivered public configuration.
