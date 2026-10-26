# FEVLOR — complete storefront + Google Apps Script backend

A responsive, dependency-free storefront for GitHub Pages, with a live Google Sheets catalog, persistent variant-aware cart, two-step manual-UPI checkout, server-side pricing, a private order ledger, and FormSubmit notifications.

**Delivered source code, not a hosted or activated shop.** You must deploy Apps Script, activate FormSubmit, populate the product sheet and complete the launch checklist. No actual Google Sheets data was accessed or changed during this build. No payment or live email was sent during testing.

## Start here

1. Read **Deployment**, below.
2. Keep checkout closed until you have tested the supplied QR in real UPI apps. A local OpenCV decoder could not decode the supplied image; this does **not** prove the QR is invalid. Its original file is preserved unchanged. Do not accept customer payments until the recipient and scan reliability are verified.
3. Follow the live acceptance checklist at the end.

## Project map

```text
index.html                       Accessible storefront shell; relative paths work on project Pages
styles.css                       Aubergine / Marigold / Ice Silver responsive design
js/config.js                     Edit public store settings here
js/core.js                       Catalog validation, cart math, filters and input validation
js/api.js                        Google Apps Script transport with timeout/error handling
js/app.js                        Homepage, shop, product, bag, checkout, success and information routes
assets/fevlor-logo.png            Original supplied logo — byte-for-byte unchanged
assets/upi-qr.jpeg               Original supplied QR — byte-for-byte unchanged
assets/editorial-interior.jpg    AI-generated interior inspiration, not a saleable product
apps-script/Code.gs              Live catalog, server-priced orders, ledger and FormSubmit
apps-script/appsscript.json      V8 runtime, India timezone, required scopes
.github/workflows/pages.yml      Test and deploy only the public site files
tests/*.test.mjs                  Dependency-free logic and backend simulation tests
tests/browser.mjs                Optional Playwright browser suite; test-only catalog fixtures
SECURITY.md                      Threat model, data access and operating limits
QA.md                            Tests performed and live checks still required
```

The design uses Georgia headings and the system Arial/Helvetica sans-serif stack: no third-party font request is needed. The brand colours are exactly `#301A2B`, `#E5A12B` and `#EEF0F2`.

## Deployment

### 1. Prepare your two private spreadsheets

The IDs are already configured in `apps-script/Code.gs`:

- **Products** spreadsheet: `1F9IW21ieO-NJFqayMA99j3Lrrny2o_-QWmJoHFCfzF4`, tab `Products`.
- **Orders** spreadsheet: `1jSwo07iIrvabFk7GXd3_AgtJKtA4nXMXMKDZlNQjXzo`, tab `Orders`.

Keep both spreadsheets restricted. Customers do not need spreadsheet access; the backend runs as the owner. Only give order-sheet access to staff who need customer information. Do not publish the Orders sheet or include customer exports in GitHub.

Using the Google account that owns or can edit **both** spreadsheets:

1. Open [Google Apps Script](https://script.google.com/) and create a **standalone** project named `FEVLOR Store Backend`.
2. Replace its `Code.gs` with `apps-script/Code.gs` from this project.
3. In Project Settings enable **Show appsscript.json manifest file in editor**, then replace that file with `apps-script/appsscript.json`.
4. Save; select `setupStore` in the function dropdown; click **Run** and authorize spreadsheet and external-request access.
5. The function creates missing tabs/headers and formatting. Existing rows are preserved. If existing headers differ, it stops rather than overwriting your data. Correct the headers and rerun.

`setupStore` sets these exact product columns, in this order:

```text
product id | product name | category | sub category | photo url1 | photo url2 | photo url3 | a3 price | a4 price | a5 price
```

It sets these exact order columns, in this order:

```text
order id | order date | customer name | phone number | email | house/flat | street/locality | landmark | city | state | pincode | product id | product name | size | frame colour | quantity | unit price | item total | subtotal | shipping | final amount
```

An additional **private `_Requests` tab in the Orders spreadsheet** is required for reliability. It contains the immutable snapshot, optional UTR, idempotency fingerprint and email state. It does not add/change any of your 21 Orders columns and it does not mix orders with the product spreadsheet. Hiding a tab is not a security boundary; restrict the entire spreadsheet.

### 2. Add products

Add your real products below the header row. No test products or hardcoded inventory are included in the public site.

- Use a permanent, unique `product id`; set that column to plain text before entering IDs such as `001`.
- `product name` and `category` are required. `sub category` is optional.
- Add up to three direct HTTPS image URLs. At least one must be valid. Empty or invalid URL slots are omitted without inserting blank gallery tiles. Reachable URLs that return broken images display a graceful placeholder; broken thumbnail buttons hide.
- **Use your original square 1:1 product photographs.** Cards and the product gallery use square containers and `object-fit: contain`, never cropping or stretching your product photos. Images have no zoom, lightbox or fullscreen interaction.
- Prefer public, direct image hosting such as your own CDN or assets in the GitHub repository. A Google Drive preview/share-page URL is not a direct image URL. Test each URL in an incognito browser without a login. Keep supplied photos at practical web sizes (approximately 1200–1800 px square).
- Enter **positive numeric rupee values**, with at most two decimal places, in all three price columns. Do not type `₹` into the cell value; use sheet formatting. The backend reads numbers, not formatted currency text.
- Product names are limited to 180 characters; IDs/categories/subcategories to 100.
- Empty rows and invalid products are skipped. **All rows with duplicate IDs are skipped**, so the owner can fix the ambiguity rather than sell the wrong item. Skipped row numbers appear in the script execution logs.
- Sheet order is the default display order. Explicit customer sorting does not mutate it. Reset filters/sort restores the original order. Homepage featured products are the first six valid rows; categories follow first appearance in the sheet.
- Catalog data is fetched on a fresh page visit, and rechecked for prices/availability on bag and checkout entry. Changes appear on the next fetch; there is no background realtime socket. To see a sheet edit immediately, refresh the website. The backend validates prices again when receiving a new order.

### 3. Activate FormSubmit

Notifications use the AJAX variant of your supplied destination:

```text
https://formsubmit.co/ajax/anikrathi.work@gmail.com
```

The backend makes this request on behalf of the customer. This keeps the customer on FEVLOR and makes email tracking durable across browser refreshes. There is no payment gateway and no FormSubmit page redirect.

**FormSubmit requires recipient activation.** Before launch, initiate an activation/test using FormSubmit's service, open the email in `anikrathi.work@gmail.com` and follow its confirmation link. Check spam as well. An unactivated mailbox is not ready for live checkout.

A successful AJAX response means FormSubmit **accepted** the notification; it is not a guarantee of mailbox delivery, and it never verifies UPI payment. Check actual inbox arrival during live acceptance testing. The recipient is set in `FORM_SUBMIT_URL` in `Code.gs`; if you change it, reactivate the new recipient and update the public contact address separately.

### 4. Deploy the Apps Script web app

1. Click **Deploy → New deployment → Web app**.
2. Set **Execute as: Me** (the owner account).
3. Set **Who has access: Anyone**. This is the public storefront API, not the spreadsheets. Some managed Google Workspace accounts disallow anonymous web apps; use an account/configuration that supports it.
4. Deploy and copy the URL ending in **`/exec`**. Do not use `/dev`, the Apps Script editor URL or a spreadsheet URL.
5. Open `YOUR_EXEC_URL?action=products` in an incognito browser. Expect JSON containing `ok: true` and your valid products. It must not require a Google login.
6. In `js/config.js`, paste this `/exec` URL into `apiUrl`.

The browser uses a simple `text/plain` POST with a JSON body, follows Google redirects and reads the JSON result. It does not rely on `no-cors`, opaque responses, public spreadsheet CSVs or a JSONP callback. **Test both catalog GET and order POST from the actual GitHub Pages origin**. A login/HTML response, CORS restriction or account-level deployment restriction is a failed launch check. Do not bypass it by falsely reporting success.

For backend changes later: save the code, then **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Keep the existing deployment URL so the frontend configuration need not change.

### 5. Configure storefront information

Edit only the public fields in `js/config.js`:

| Setting | What to do |
|---|---|
| `apiUrl` | Your deployed Apps Script `/exec` URL |
| `checkoutEnabled` | Leave `false` until the live checklist passes; then set `true` |
| `contactEmail` | Already `anikrathi.work@gmail.com` |
| `contactPhone` | Optional genuine business contact number |
| `instagramUrl`, `pinterestUrl` | Real HTTPS profiles only; blank values show no fabricated link |
| `returnsPolicy` | Your approved returns, damage reporting and cancellation terms |
| `deliveryPolicy` | Your actual dispatch and delivery timelines |
| `businessAddress` | Your real business contact address |
| `turnstileSiteKey` | Optional public anti-abuse key, described below |

Legal/privacy text is transparent starter copy, **not a legal compliance certification**. Review it for your business and applicable Indian consumer, privacy and tax requirements. Add actual refund timelines, grievance contact information and any required business disclosures before accepting real orders. No invented social handle, phone number, address or delivery promise is published.

Backend checkout is separately controlled in **Apps Script → Project Settings → Script Properties**:

```text
ACCEPT_ORDERS = true
```

Until this is set to the exact string `true`, new orders are refused before saving. Existing order retries remain available even when new checkout is closed. This is a kill switch, not a secret. Frontend `checkoutEnabled` and backend `ACCEPT_ORDERS` must both be enabled for launch.

**Recommended before public promotion:** enable Cloudflare Turnstile (free anti-abuse verification).

1. Register your GitHub Pages domain/custom domain in Cloudflare Turnstile.
2. Put the public site key in `turnstileSiteKey`.
3. Put `TURNSTILE_SECRET` and `ALLOWED_HOSTNAME` in Apps Script **Script Properties**. The hostname is e.g. `yourname.github.io`, without protocol or repository path.
4. Keep the secret out of GitHub. The backend checks the hostname and action `order` before a new order can be written.

If no secret is configured, CAPTCHA is not enforced. The backend has a lightweight 5-new-requests-per-phone/per-hour cache limiter. This is not a substitute for bot protection; cache eviction and arbitrary phone numbers limit its effectiveness. See `SECURITY.md`.

### 6. Publish on GitHub Pages

1. Create a GitHub repository, for example `fevlor`.
2. Upload the **contents** of this project (not an extra parent folder), including `.github/workflows/pages.yml`. Do not upload customer data, secrets or private spreadsheet exports.
3. Use branch `main`. Open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Commit/push the configuration changes. The included workflow runs the 20 unit/backend tests, copies only `index.html`, `styles.css`, `assets/` and `js/`, and publishes them.
5. Find the live URL in the completed Actions deployment, typically `https://YOURNAME.github.io/fevlor/`.
6. Optionally configure a custom domain and HTTPS in GitHub Pages settings.

All internal links are hash routes (`#/shop`, `#/product/ID`, etc.), so product links and refreshing nested views work without a server rewrite or a custom 404 redirect. Relative assets support both project and root-domain hosting. Hash routing is reliable for Pages but has weaker product-level SEO than server-rendered storefronts. If strong product indexing becomes essential, consider a prerendered deployment later.

## Customer flow

- Homepage: editorial hero → first six sheet products → live category collection → brand story and benefits.
- Shop: original sheet order → compose search, category and subcategory → explicit starting-price sort → reset to sheet order.
- Card quick add is clearly **A5 / Black Frame**. Open a product to choose any size/frame, view all supplied photos and set quantity (1–99).
- Bag keys are `[productId, size, frame]`. Identical variants merge quantities; different variants remain separate. Up to 50 distinct selections. All money math uses integer paise.
- Checkout step 1: required name, Indian mobile, house/flat, street/locality, city, state/UT and six-digit PIN; optional email/landmark. All 28 states and 8 UTs are available. Drafts survive back navigation and refresh in the same tab.
- Step 2: immutable-at-submit item summary, original QR image download, prominent final amount, optional UTR and explicit manual-payment/data-consent declarations.
- Payment Done does **not** mean payment verified. The server re-reads current products and prices; an altered, unavailable or changed-price item is rejected before saving. If a customer already paid before a price-change rejection, the UI directs them to contact Fevlor and not pay again.
- A UUID order ID is created and persisted before the POST. Retry uses exactly the same payload/reference. Browser Web Locks coordinates simultaneous submissions in supporting browsers; server locks and the private ledger provide the authoritative idempotency guarantee for the same reference.
- On full confirmation: the specified success text, order ID, total, future invoice notice, manual-review disclaimer and Continue Shopping appear. Only then is the bag cleared.

## Reliability and failure handling

The system intentionally does **not** pretend that Sheets and FormSubmit form a distributed transaction.

| Scenario | Behaviour |
|---|---|
| Backend rejects details/prices before writing | Explicit `notSaved` response; bag retained; pending key released so corrected details can be submitted |
| Connection/response is lost | Outcome unknown; same reference and bag retained; Check request status safely retries |
| Ledger prepared, order write response lost | Retry finds the intent and compares existing rows; no duplicate order append |
| Order saved, email fails or times out | Partial-status screen; no full success; bag retained; notification state becomes uncertain |
| Email accepted, backend response lost | Retry returns the saved completion without re-appending rows or resending email |
| Email send interrupted mid-flight | Durable `SENDING` becomes `UNCERTAIN`; no automatic blind resend |
| Same reference reused with changed payload | Rejected as a conflict; original order is never overwritten |

FormSubmit does not provide an idempotency key. **Exactly-once email delivery across ambiguous network failures cannot honestly be guaranteed.** Uncertain notifications require owner review rather than silently sending a potential duplicate. Different newly generated references are distinct requests; do not erase a pending key and resubmit the same paid order as a new order.

### Resolve a partial email outcome

1. Open the private `_Requests` tab in the Orders spreadsheet and locate the order reference. Do not manually delete ledger/order rows to “retry”.
2. Check your actual mailbox, spam folder and FormSubmit activation/service state. Also confirm the order lines in `Orders`.
3. In Script Properties, set:

```text
REVIEW_ORDER_ID = FV-...full reference...
REVIEW_ACTION = mark-accepted
```

Use `mark-accepted` **only with evidence that the notification actually arrived/was accepted**. If you have checked and need another attempt, use `resend` instead. A deliberate resend may create a duplicate if the original actually arrived; review first.

4. Run `reviewEmailAfterManualCheck` directly from the Apps Script editor as the owner. This function is not exposed through the public API. It removes the review properties afterward.
5. Have the customer use **Check request status** again. A completed record will show the success screen without creating another order.

If phase is `PREPARED`, let the customer retry with their original reference/payload; it recovers the write. Conflicting/partial manually edited order rows stop recovery and need operator investigation. Do not manually mark them successful without reconciliation.

### Read Orders correctly

There is **one row per purchased variant**, not one row per order. `subtotal`, `shipping` and `final amount` repeat on each row for convenient order processing. **Do not sum repeated final amounts across line rows.** Group by order ID and take one final amount per order. Unit price and item total belong to each line. Numeric sheet amounts are rupees; API/ledger amounts are integer paise. `order date` is a UTC ISO timestamp; the email also includes India local time.

The UTR, payment declaration, email state and consent are kept in `_Requests` to preserve your exact 21-column Orders schema. No payment is marked verified automatically. Verify settlement in your bank/UPI records, then process the order and send the invoice separately through your own accounting process.

## Run and maintain locally

No frontend build or production npm dependencies are needed.

```bash
npm start
# Open http://localhost:8080 (do not double-click index.html: ES modules need HTTP).
npm test
```

Optional browser suite:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
# Or set CHROMIUM_PATH to your installed Chromium executable.
```

The browser suite runs its own local HTTP server and intercepts the test API. It never modifies real Sheets, sends real emails or simulates a production payment verification. `test-results/` is local-only and excluded from deployments. The homepage interior image is used as a **test-only** photo fixture; actual inventory always comes from the sheet.

Content updates: change product rows in Sheets; update public contact/policy settings in `js/config.js`; change presentation in `styles.css`. Changing product prices after a request has already been saved does not rewrite the saved historical order.

## Launch acceptance checklist — required

- [ ] Both spreadsheets remain private, distinct and accessible to the deployment owner.
- [ ] `setupStore` ran successfully; exact headers and private `_Requests` exist.
- [ ] Real, valid products are populated; row order, all three images and each size price are checked.
- [ ] Supplied QR scans in multiple real UPI apps; the recipient shown is your correct merchant account. Verify with an owner-controlled small payment only if you choose to do so. Never test with an unsuspecting customer.
- [ ] QR download returns the original JPEG, not a screenshot.
- [ ] FormSubmit recipient is activated and an actual test notification arrives in the inbox.
- [ ] Actual GitHub Pages origin can perform anonymous catalog GET and order POST, including redirects.
- [ ] Turnstile configured/tested, or residual spam/quota risk explicitly accepted by the owner.
- [ ] Actual delivery/returns policies, business contact disclosures and privacy text are approved.
- [ ] A controlled test order saves every line exactly once with correct size/frame/quantity and server-calculated amounts.
- [ ] Browser refresh/retry preserves reference and does not append duplicate rows or send a second accepted notification.
- [ ] Simulated email/network failures show partial/unknown status, preserve bag and do not show false success.
- [ ] Owner has practiced partial-email reconciliation and understands totals repeat per line.
- [ ] Desktop, mobile, keyboard navigation and form validation checked on the live deployment.
- [ ] Apps Script quotas/ownership and FormSubmit service limits are suitable for expected traffic; monitoring and a backup/export process are in place.
- [ ] `ACCEPT_ORDERS=true` and `checkoutEnabled=true` set only after the checks above. For staged live testing, enable only while the owner is testing, then close again until launch.

## Asset notes

The provided logo and QR are copied unchanged; CSS only scales them proportionally. The generated editorial interior photo is decorative styling inspiration and is labelled that way on the hero. It does not claim that its pictured artwork is available to buy. All saleable product photography comes from your sheet.

This implementation is designed for a small, owner-operated store within Apps Script/FormSubmit limits, not a high-volume transactional commerce platform. See `SECURITY.md` for operational constraints and remaining deployment responsibilities.
