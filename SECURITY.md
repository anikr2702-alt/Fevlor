# Security & operations

## Trust boundaries

- GitHub Pages and `js/config.js` are public. Never put credentials, secret keys, customer data or private spreadsheet exports in the repository. Only the web-app URL and a public CAPTCHA site key belong in frontend configuration.
- The Apps Script owner authorizes access to two private spreadsheets. The public API exposes only validated product data and accepts order requests. It cannot list orders, reveal addresses or invoke owner review functions.
- An order reference alone is not a public order lookup token. A retry must include the same customer/items payload whose SHA-256 fingerprint was stored. Returned status contains no address or phone. Use UUID references, not sequential IDs.
- Client prices/names are untrusted. The server looks up IDs, frame/size options, limits and current prices and calculates all totals. Stored historical snapshots survive product changes on retries.
- All user-controlled text is escaped before HTML insertion. HTTPS image/social URLs are filtered. Text that could become a spreadsheet formula is escaped on write. Do not weaken these checks to enable arbitrary HTML in product cells.
- The meta Content Security Policy restricts scripts, backend destinations and frames, with no inline/eval script allowance. GitHub Pages cannot set all custom HTTP security headers. Deploy behind a suitable host/proxy if response-header policies, `frame-ancestors` or stricter server controls are required.

## Abuse and limits

This public anonymous web app must accept customer traffic, so its URL is not an authentication secret. Origin checks are not an authentication mechanism. For public launch, enable Turnstile in both frontend and backend and test its hostname check. Do not expose the secret.

A per-phone cache limiter (five new attempts/hour), body/field/quantity/line limits and a global Script Lock reduce accidental and simple abuse. They do not provide IP-level throttling, DDoS protection or an atomic distributed rate limit. Attackers can vary phone numbers; Apps Script cache entries can evict. Captcha verification itself consumes service resources.

Apps Script, Google Sheets and FormSubmit have account-specific daily/runtime/concurrency/external-fetch/email restrictions. The script deliberately serializes order transitions, including notification sends, to avoid races. A slow external notification temporarily blocks another request, which receives a retryable busy response. Large sheets and high order volume need an indexed transactional backend and a durable mail queue instead. Monitor actual limits for your account; no numerical capacity guarantee is implied.

## Data handling

- Customer/order/UTR details exist in the private Orders spreadsheet and its `_Requests` ledger and are sent through FormSubmit to the configured merchant email. Do not post these records in GitHub issues or support screenshots.
- Browser local storage contains the cart and, only after submitting, a pending request including delivery details. Session storage contains the address draft and last receipt. This is disclosed in the privacy page. Avoid shared devices; locally stored information is accessible to scripts on the same origin, including other apps on that origin. A dedicated merchant custom domain improves isolation from other GitHub Pages repositories under the same username origin.
- Do not run third-party analytics or unreviewed scripts on checkout. HTTPS is required. HTTPS transport does not encrypt local storage from a device user.
- Set a business/legal retention policy covering both `Orders` and `_Requests`, inbox copies, backups and support records. Coordinate deletion/correction requests carefully. Removing an idempotency record while a customer still has an unresolved pending request can cause a duplicate on retry.
- Keep the deployment owner's Google account secure with MFA and recovery ownership. Only trusted staff should edit sheets/script. Use a production deployment version and review changes before deployment.
- Logs intentionally avoid customer payloads. Product validation logs report row numbers only. Do not add production `console.log` statements containing PII.

## Reliability is not payment verification

The QR is a static merchant-supplied image. The site does not read bank transactions, verify payment or validate whether a UTR actually belongs to the order. Verify recipient/settlement manually, resolve under/overpayments and refunds, and send the invoice separately. Frontend checkboxes are declarations, not proof.

An external AJAX `success` is notification acceptance, not guaranteed email delivery. An interrupted email send is uncertain and intentionally needs human reconciliation. The owner review action must never be used just to hide an error. Verify evidence first. See README for the runbook.

## Incident switch

Set `ACCEPT_ORDERS=false` in Script Properties to refuse new submissions while preserving status/recovery for already-saved references. Also set frontend `checkoutEnabled=false` and deploy promptly so customers do not scan/pay during closure. This does not cancel existing payments/orders. Contact affected customers and reconcile all pending references before deleting anything.

## Vulnerability reporting

Contact the configured Fevlor business email privately with a description and redacted evidence. Never include customer data, UPI PINs, account credentials or full delivery records in public reports.
