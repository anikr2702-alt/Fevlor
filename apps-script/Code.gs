/** FEVLOR backend — V8 Google Apps Script Web App. See README before deployment.
 * Public endpoint: catalog + new order/retry only. No public order-list API.
 * Prices in API payloads are integer paise; sheet amounts are rupees.
 */
const PRODUCT_SHEET_ID = "1F9IW21ieO-NJFqayMA99j3Lrrny2o_-QWmJoHFCfzF4";
const ORDER_SHEET_ID = "1jSwo07iIrvabFk7GXd3_AgtJKtA4nXMXMKDZlNQjXzo";
const PRODUCT_HEADERS = [
  "product id",
  "product name",
  "category",
  "sub category",
  "photo url1",
  "photo url2",
  "photo url3",
  "a3 price",
  "a4 price",
  "a5 price",
];
const ORDER_HEADERS = [
  "order id",
  "order date",
  "customer name",
  "phone number",
  "email",
  "house/flat",
  "street/locality",
  "landmark",
  "city",
  "state",
  "pincode",
  "product id",
  "product name",
  "size",
  "frame colour",
  "quantity",
  "unit price",
  "item total",
  "subtotal",
  "shipping",
  "final amount",
];
const REQUEST_HEADERS = [
  "order id",
  "fingerprint",
  "created at",
  "phase",
  "email status",
  "snapshot json",
  "utr",
  "last error",
  "updated at",
];
const VALID_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];
const SIZE_KEYS = ["A5", "A4", "A3"];
const FRAME_NAMES = ["Black Frame", "Brown Frame"];
const FORM_SUBMIT_URL = "https://formsubmit.co/ajax/anikrathi.work@gmail.com";
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
function doGet(e) {
  try {
    if (!e || e.parameter.action !== "products")
      return json_({ ok: false, message: "Unknown endpoint." });
    const result = catalog_();
    return json_({
      ok: true,
      products: result.products,
      updatedAt: new Date().toISOString(),
    });
  } catch (_) {
    return json_({
      ok: false,
      message:
        "The product collection is temporarily unavailable. Please try again later.",
    });
  }
}
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 120000)
      throw new Error("Invalid request body.");
    let raw;
    try {
      raw = JSON.parse(e.postData.contents);
    } catch (_) {
      throw new Error("Invalid request data.");
    }
    if (raw.action !== "order") throw new Error("Unknown action.");
    // Lock covers the entire state transition including the remote email request.
    lock = LockService.getScriptLock();
    if (!lock.tryLock(2000))
      return json_({
        ok: false,
        message:
          "The order system is busy. Check again using the same order reference.",
      });
    const answer = processOrder_(raw);
    return json_(answer);
  } catch (error) {
    // Only validation errors explicitly marked before any write can release the client retry key.
    return json_({
      ok: false,
      notSaved: error.notSaved === true,
      message:
        error.publicMessage ||
        "We could not confirm your request. Please check again with the same order reference. Do not pay twice.",
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
function assertHeaders_(sheet, expected) {
  if (!sheet || sheet.getLastRow() < 1)
    throw new Error("Missing sheet or headers. Run setupStore first.");
  const actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  if (actual.some((v, i) => v !== expected[i]))
    throw new Error("Unexpected headers in " + sheet.getName());
}
function sheet_(id, name, headers) {
  const s = SpreadsheetApp.openById(id).getSheetByName(name);
  assertHeaders_(s, headers);
  return s;
}
function price_(v) {
  if (
    typeof v !== "number" &&
    !(typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v.trim()))
  )
    return null;
  const n = Number(v),
    p = Math.round(n * 100);
  return Number.isFinite(n) &&
    Number.isSafeInteger(p) &&
    p > 0 &&
    p <= 100000000 &&
    Math.abs(n * 100 - p) < 0.00001
    ? p
    : null;
}
function https_(v) {
  return (
    /^https:\/\/[^\s<>"']+$/i.test(String(v || "")) &&
    !/^https:\/\/[^/]*@/.test(String(v))
  );
}
function catalog_() {
  const sheet = sheet_(PRODUCT_SHEET_ID, "Products", PRODUCT_HEADERS);
  if (sheet.getLastRow() < 2) return { products: [], skipped: 0 };
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10),
    values = range.getValues(),
    display = range.getDisplayValues();
  const products = [],
    seen = Object.create(null),
    duplicateIds = Object.create(null),
    skipped = [];
  display.forEach((row) => {
    const id = String(row[0]).trim();
    if (id) {
      if (seen[id]) duplicateIds[id] = true;
      seen[id] = true;
    }
  });
  values.forEach((row, i) => {
    if (row.every((v) => v === "" || v === null)) return;
    const id = String(display[i][0]).trim(),
      name = String(display[i][1]).trim(),
      category = String(display[i][2]).trim(),
      subcategory = String(display[i][3]).trim();
    const images = [4, 5, 6]
      .map((n) => String(row[n] || "").trim())
      .filter(https_);
    const prices = {
      A3: price_(row[7]),
      A4: price_(row[8]),
      A5: price_(row[9]),
    };
    if (
      !id ||
      id.length > 100 ||
      duplicateIds[id] ||
      !name ||
      name.length > 180 ||
      !category ||
      category.length > 100 ||
      subcategory.length > 100 ||
      !images.length ||
      SIZE_KEYS.some((s) => prices[s] === null)
    ) {
      skipped.push(i + 2);
      return;
    }
    products.push({ id, name, category, subcategory, images, prices });
  });
  // Row numbers only, no customer information; visible to script administrators.
  if (skipped.length)
    console.warn("Skipped invalid product rows: " + skipped.join(", "));
  return { products, skipped: skipped.length };
}
function reject_(message) {
  const e = new Error(message);
  e.publicMessage = message;
  e.notSaved = true;
  throw e;
}
function text_(v, max, required) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v)
  )
    reject_("Please review your customer information.");
  const s = v.trim();
  if (required && !s) reject_("Please complete all required customer fields.");
  return s;
}
function canonical_(raw) {
  if (
    !/^FV-[A-F0-9]{8}-[A-F0-9]{4}-4[A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}$/.test(
      raw.orderId || "",
    )
  )
    reject_("Invalid order reference.");
  const source = raw.customer || {},
    c = {};
  [
    ["name", 100, true],
    ["phone", 10, true],
    ["email", 150, false],
    ["house", 200, true],
    ["street", 200, true],
    ["landmark", 200, false],
    ["city", 100, true],
    ["state", 100, true],
    ["pincode", 6, true],
  ].forEach((a) => (c[a[0]] = text_(source[a[0]] || "", a[1], a[2])));
  if (!/^[6-9]\d{9}$/.test(c.phone))
    reject_("Please enter a valid Indian mobile number.");
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
    reject_("Please enter a valid email address.");
  if (!/^[1-9]\d{5}$/.test(c.pincode) || VALID_STATES.indexOf(c.state) === -1)
    reject_("Please review your PIN code and state.");
  if (
    !Array.isArray(raw.items) ||
    raw.items.length < 1 ||
    raw.items.length > 50
  )
    reject_("Your order must contain between 1 and 50 selections.");
  const keys = Object.create(null);
  const items = raw.items.map((i) => {
    if (
      !i ||
      typeof i.productId !== "string" ||
      i.productId.length > 100 ||
      !i.productId.trim() ||
      SIZE_KEYS.indexOf(i.size) === -1 ||
      FRAME_NAMES.indexOf(i.frame) === -1 ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > 99 ||
      !Number.isSafeInteger(i.unitPrice) ||
      i.unitPrice < 1
    )
      reject_("Please review the items in your bag.");
    const key = JSON.stringify([i.productId, i.size, i.frame]);
    if (keys[key])
      reject_("Duplicate item selections. Please rebuild your bag.");
    keys[key] = true;
    return {
      productId: i.productId,
      size: i.size,
      frame: i.frame,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    };
  });
  if (
    !Number.isSafeInteger(raw.expectedTotal) ||
    raw.expectedTotal < 1 ||
    raw.expectedTotal > 10000000000
  )
    reject_("Invalid order total.");
  if (raw.paymentDeclared !== true || raw.consent !== true)
    reject_("Please confirm your payment declaration and data consent.");
  const utr = text_(raw.utr || "", 80, false);
  if (utr && !/^[A-Za-z0-9 /_-]+$/.test(utr))
    reject_("Please check your UPI reference.");
  return {
    orderId: raw.orderId,
    customer: c,
    items,
    expectedTotal: raw.expectedTotal,
    utr,
    paymentDeclared: true,
    consent: true,
  };
}
function hash_(data) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(data),
    Utilities.Charset.UTF_8,
  )
    .map((b) => ("0" + ((b + 256) % 256).toString(16)).slice(-2))
    .join("");
}
function getRequest_(sheet, id) {
  if (sheet.getLastRow() < 2) return null;
  const match = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(id)
    .matchEntireCell(true)
    .useRegularExpression(false)
    .findNext();
  if (!match) return null;
  const row = match.getRow(),
    v = sheet.getRange(row, 1, 1, REQUEST_HEADERS.length).getValues()[0];
  return {
    row,
    id: String(v[0]),
    fingerprint: String(v[1]),
    created: String(v[2]),
    phase: String(v[3]),
    email: String(v[4]),
    snapshot: JSON.parse(v[5]),
    utr: String(v[6]),
    error: String(v[7]),
  };
}
function cell_(v) {
  return typeof v === "string" && /^[=+@\-\t\r]/.test(v) ? "'" + v : v;
}
function setRequest_(sheet, r) {
  sheet
    .getRange(r.row, 1, 1, REQUEST_HEADERS.length)
    .setValues([
      [
        r.id,
        r.fingerprint,
        r.created,
        r.phase,
        r.email,
        JSON.stringify(r.snapshot),
        r.utr,
        r.error || "",
        new Date().toISOString(),
      ].map(cell_),
    ]);
  SpreadsheetApp.flush();
}
function verifyCaptcha_(token) {
  const props = PropertiesService.getScriptProperties(),
    secret = props.getProperty("TURNSTILE_SECRET");
  if (!secret) return;
  if (typeof token !== "string" || !token || token.length > 2048)
    reject_("Please complete the security verification.");
  try {
    const resp = UrlFetchApp.fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "post",
        payload: { secret, response: token },
        muteHttpExceptions: true,
      },
    );
    const d = JSON.parse(resp.getContentText()),
      host = props.getProperty("ALLOWED_HOSTNAME");
    if (
      d.success !== true ||
      d.action !== "order" ||
      !host ||
      d.hostname !== host
    )
      reject_("Security verification failed. Please refresh it and try again.");
  } catch (e) {
    if (e.notSaved) throw e;
    reject_(
      "Security verification is temporarily unavailable. Please try again.",
    );
  }
}
function throttle_(phone) {
  const cache = CacheService.getScriptCache(),
    key = "orders:" + hash_({ phone }),
    n = Number(cache.get(key) || 0);
  if (n >= 5)
    reject_(
      "Too many new requests. Please contact Fevlor before trying again.",
    );
  cache.put(key, String(n + 1), 3600);
}
function verifyOrWriteOrderRows_(orders, r) {
  const snap = r.snapshot;
  // A single setValues writes all line items. Recover safely if a previous response was lost.
  let matches = [];
  if (orders.getLastRow() > 1)
    matches = orders
      .getRange(2, 1, orders.getLastRow() - 1, 1)
      .createTextFinder(r.id)
      .matchEntireCell(true)
      .useRegularExpression(false)
      .findAll();
  if (matches.length) {
    if (matches.length !== snap.items.length)
      throw Error("Order rows need administrator review.");
    // Never silently accept modified/malformed rows; compare every persisted line and total.
    const stored = matches.map(
      (m) => orders.getRange(m.getRow(), 1, 1, 21).getValues()[0],
    );
    const expected = orderRows_(snap, r.created);
    if (
      !stored.every((row, i) =>
        row.every(
          (v, j) =>
            String(v) ===
            String(expected[i][j]).replace(/^'(?=[=+@\-\t\r])/, ""),
        ),
      )
    )
      throw Error(
        "Existing order differs from saved request. Administrator review needed.",
      );
  } else {
    const rows = orderRows_(snap, r.created);
    orders
      .getRange(orders.getLastRow() + 1, 1, rows.length, 21)
      .setValues(rows);
    SpreadsheetApp.flush();
  }
  r.phase = "SAVED";
}
function orderRows_(snap, created) {
  const c = snap.customer;
  return snap.items.map((i) =>
    [
      snap.orderId,
      created,
      c.name,
      c.phone,
      c.email,
      c.house,
      c.street,
      c.landmark,
      c.city,
      c.state,
      c.pincode,
      i.productId,
      i.name,
      i.size,
      i.frame,
      i.quantity,
      i.unitPrice / 100,
      (i.unitPrice * i.quantity) / 100,
      snap.total / 100,
      0,
      snap.total / 100,
    ].map(cell_),
  );
}
function processOrder_(raw) {
  // Canonical validation precedes any write; retries use exactly the original customer/cart payload.
  const canon = canonical_(raw),
    fingerprint = hash_(canon);
  const ledger = sheet_(ORDER_SHEET_ID, "_Requests", REQUEST_HEADERS),
    orders = sheet_(ORDER_SHEET_ID, "Orders", ORDER_HEADERS);
  let r = getRequest_(ledger, canon.orderId);
  if (r) {
    if (r.fingerprint !== fingerprint) {
      const e = Error("Reference conflict.");
      e.publicMessage =
        "This order reference belongs to different details. Contact Fevlor; do not submit another payment.";
      throw e;
    }
  } else {
    if (
      PropertiesService.getScriptProperties().getProperty("ACCEPT_ORDERS") !==
      "true"
    )
      reject_(
        "Checkout is temporarily closed. Please contact Fevlor; do not make another payment.",
      );
    verifyCaptcha_(raw.captchaToken);
    throttle_(canon.customer.phone);
    const live = catalog_().products;
    const items = canon.items.map((i) => {
      const p = live.find((p) => p.id === i.productId);
      if (!p)
        reject_(
          "An artwork is no longer available. Your order was not saved. Contact Fevlor if you have already paid.",
        );
      if (p.prices[i.size] !== i.unitPrice)
        reject_(
          "A price has changed. Your order was not saved. Review your bag; if you already paid, contact Fevlor.",
        );
      return {
        productId: p.id,
        name: p.name,
        size: i.size,
        frame: i.frame,
        quantity: i.quantity,
        unitPrice: p.prices[i.size],
      };
    });
    const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    if (total !== canon.expectedTotal)
      reject_(
        "The amount has changed. Review your bag before retrying. Contact Fevlor if you have already paid.",
      );
    const snapshot = {
      orderId: canon.orderId,
      customer: canon.customer,
      items,
      total,
      shipping: 0,
      utr: canon.utr,
      paymentStatus: "CUSTOMER_DECLARED_PENDING_MANUAL_VERIFICATION",
      consent: true,
    };
    r = {
      row: ledger.getLastRow() + 1,
      id: canon.orderId,
      fingerprint,
      created: new Date().toISOString(),
      phase: "PREPARED",
      email: "NOT_ATTEMPTED",
      snapshot,
      utr: canon.utr,
      error: "",
    };
    // Write intent before writing order rows. On any ambiguous failure, preserve the reference.
    setRequest_(ledger, r);
  }
  if (r.phase !== "SAVED" && r.phase !== "COMPLETE") {
    verifyOrWriteOrderRows_(orders, r);
    setRequest_(ledger, r);
  }
  // An interrupted send is uncertain. Never blindly resend: FormSubmit has no idempotency guarantee.
  if (r.email === "SENDING") {
    r.email = "UNCERTAIN";
    r.error =
      "A prior send ended without a confirmed outcome. Review FormSubmit/mailbox before resending.";
    setRequest_(ledger, r);
  }
  if (r.email === "NOT_ATTEMPTED") sendEmail_(ledger, r);
  if (r.email === "ACCEPTED" && r.phase !== "COMPLETE") {
    r.phase = "COMPLETE";
    setRequest_(ledger, r);
  }
  return {
    ok: true,
    orderId: r.id,
    status: r.phase === "COMPLETE" ? "COMPLETE" : "EMAIL_PENDING",
    saved: r.phase === "SAVED" || r.phase === "COMPLETE",
    emailAccepted: r.email === "ACCEPTED",
    total: r.snapshot.total,
  };
}
function emailPayload_(r) {
  const s = r.snapshot,
    c = s.customer;
  return {
    _subject: "FEVLOR | Order request " + r.id,
    _template: "table",
    "Order ID": r.id,
    "Order date and time (UTC)": r.created,
    "Order date and time (India)": Utilities.formatDate(
      new Date(r.created),
      "Asia/Kolkata",
      "yyyy-MM-dd HH:mm:ss z",
    ),
    "Customer name": c.name,
    "Phone number": c.phone,
    "Email address": c.email || "Not provided",
    "Delivery address": [
      c.house,
      c.street,
      c.landmark,
      c.city,
      c.state,
      c.pincode,
    ]
      .filter(Boolean)
      .join(", "),
    Items: s.items
      .map(
        (i, n) =>
          n +
          1 +
          ". " +
          i.name +
          " | ID: " +
          i.productId +
          " | " +
          i.size +
          " | " +
          i.frame +
          " | Qty: " +
          i.quantity +
          " | Unit INR " +
          (i.unitPrice / 100).toFixed(2) +
          " | Item total INR " +
          ((i.unitPrice * i.quantity) / 100).toFixed(2),
      )
      .join("\n"),
    "Subtotal (INR)": (s.total / 100).toFixed(2),
    "Shipping (INR)": "0.00 (FREE)",
    "Final amount (INR)": (s.total / 100).toFixed(2),
    "UPI transaction reference": s.utr || "Not provided",
    "Payment status":
      "Customer declares payment completed. NOT verified; manual verification required.",
    Invoice: "To be sent separately after processing.",
  };
}
function sendEmail_(ledger, r) {
  r.email = "SENDING";
  r.error = "";
  setRequest_(ledger, r);
  try {
    // Server-side AJAX endpoint: customer remains on Fevlor, no FormSubmit redirect.
    const response = UrlFetchApp.fetch(FORM_SUBMIT_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(emailPayload_(r)),
      muteHttpExceptions: true,
      followRedirects: true,
    });
    let body;
    try {
      body = JSON.parse(response.getContentText());
    } catch (_) {
      body = {};
    }
    if (
      response.getResponseCode() >= 200 &&
      response.getResponseCode() < 300 &&
      (body.success === true || body.success === "true") &&
      !/activat/i.test(String(body.message || ""))
    )
      r.email = "ACCEPTED";
    else {
      r.email = "UNCERTAIN";
      r.error =
        "FormSubmit response did not confirm acceptance (HTTP " +
        response.getResponseCode() +
        "). Review mailbox/activation before any resend.";
    }
  } catch (_) {
    r.email = "UNCERTAIN";
    r.error =
      "FormSubmit connection failed; acceptance is unknown. Administrator review required.";
  }
  // If this write fails, the durable SENDING marker prevents an automatic duplicate send.
  setRequest_(ledger, r);
}
/** Run once as the spreadsheet owner. Never overwrites existing product/order data. */
function setupStore() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    [
      [PRODUCT_SHEET_ID, "Products", PRODUCT_HEADERS],
      [ORDER_SHEET_ID, "Orders", ORDER_HEADERS],
      [ORDER_SHEET_ID, "_Requests", REQUEST_HEADERS],
    ].forEach((spec) => {
      const book = SpreadsheetApp.openById(spec[0]);
      let sheet = book.getSheetByName(spec[1]);
      if (!sheet) sheet = book.insertSheet(spec[1]);
      if (sheet.getLastRow() === 0)
        sheet.getRange(1, 1, 1, spec[2].length).setValues([spec[2]]);
      else assertHeaders_(sheet, spec[2]);
      sheet.setFrozenRows(1);
      sheet
        .getRange(1, 1, 1, spec[2].length)
        .setFontWeight("bold")
        .setBackground("#301A2B")
        .setFontColor("#ffffff");
      if (spec[1] === "Products") {
        sheet.getRange("A:A").setNumberFormat("@");
        sheet.getRange("H:J").setNumberFormat("₹#,##0.00");
      }
      if (spec[1] === "Orders") {
        ["A:A", "B:B", "D:E", "K:L"].forEach((a) =>
          sheet.getRange(a).setNumberFormat("@"),
        );
        sheet.getRange("Q:U").setNumberFormat("₹#,##0.00");
      }
      if (spec[1] === "_Requests") sheet.getRange("A:I").setNumberFormat("@");
    });
    // Intentionally does NOT open checkout or change ACCEPT_ORDERS.
    console.log(
      "Headers ready. Add products, activate FormSubmit, deploy and test before ACCEPT_ORDERS=true.",
    );
  } finally {
    lock.releaseLock();
  }
}
/** OWNER ONLY: run in the editor after checking the mailbox/FormSubmit outcome.
 * Set REVIEW_ORDER_ID and REVIEW_ACTION in Script Properties first.
 * Actions: mark-accepted (only if actual acceptance/delivery is evidenced), resend (after review).
 * Neither action verifies payment; mark-accepted never generates an invoice.
 * These editor functions are not routed from doGet/doPost.
 */
function reviewEmailAfterManualCheck() {
  const props = PropertiesService.getScriptProperties(),
    id = props.getProperty("REVIEW_ORDER_ID"),
    action = props.getProperty("REVIEW_ACTION");
  if (!id || ["mark-accepted", "resend"].indexOf(action) === -1)
    throw Error("Set REVIEW_ORDER_ID and REVIEW_ACTION.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ledger = sheet_(ORDER_SHEET_ID, "_Requests", REQUEST_HEADERS),
      r = getRequest_(ledger, id);
    if (!r || r.phase !== "SAVED")
      throw Error("Order must exist with phase SAVED.");
    if (action === "mark-accepted") {
      r.email = "ACCEPTED";
      r.phase = "COMPLETE";
      r.error = "Manually confirmed after mailbox/provider review.";
      setRequest_(ledger, r);
    } else {
      if (r.email === "ACCEPTED")
        throw Error("Already accepted; do not resend.");
      sendEmail_(ledger, r);
      if (r.email === "ACCEPTED") {
        r.phase = "COMPLETE";
        setRequest_(ledger, r);
      }
    }
  } finally {
    props.deleteProperty("REVIEW_ORDER_ID");
    props.deleteProperty("REVIEW_ACTION");
    lock.releaseLock();
  }
}
