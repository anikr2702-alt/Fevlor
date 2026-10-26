import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
const source = fs.readFileSync(
  new URL("../apps-script/Code.gs", import.meta.url),
  "utf8",
);
const clean = (v) =>
  typeof v === "string" ? v.replace(/^'(?=[=+@\-\t\r])/, "") : v;
function backend({
  email = "success",
  products,
  failAfterOrders = false,
} = {}) {
  let emails = 0,
    fail = failAfterOrders;
  class Sheet {
    constructor(name, data) {
      this.name = name;
      this.data = data;
    }
    getName() {
      return this.name;
    }
    getLastRow() {
      return this.data.length;
    }
    getRange(row, col, height = 1, width = 1) {
      const sheet = this;
      return {
        getRow: () => row,
        getValues: () =>
          Array.from({ length: height }, (_, i) =>
            Array.from(
              { length: width },
              (_, j) => sheet.data[row - 1 + i]?.[col - 1 + j] ?? "",
            ),
          ),
        getDisplayValues() {
          return this.getValues().map((r) => r.map(String));
        },
        setValues(values) {
          values.forEach((r, i) => {
            sheet.data[row - 1 + i] ??= [];
            r.forEach(
              (v, j) => (sheet.data[row - 1 + i][col - 1 + j] = clean(v)),
            );
          });
          if (sheet.name === "Orders" && row > 1 && fail) {
            fail = false;
            throw Error("Simulated lost acknowledgement after Orders write");
          }
          return this;
        },
        createTextFinder(needle) {
          return {
            matchEntireCell() {
              return this;
            },
            useRegularExpression() {
              return this;
            },
            findAll() {
              const found = [];
              for (let i = 0; i < height; i++)
                if (String(sheet.data[row - 1 + i]?.[col - 1] ?? "") === needle)
                  found.push({ getRow: () => row + i });
              return found;
            },
            findNext() {
              return this.findAll()[0] || null;
            },
          };
        },
      };
    }
  }
  const PH = [
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
  const OH = [
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
  const RH = [
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
  const sheets = {
    Products: new Sheet("Products", [
      PH,
      ...(products || [
        [
          "z",
          "First artwork",
          "Abstract",
          "Ink",
          "https://example.com/a.jpg",
          "",
          "",
          599,
          499,
          399,
        ],
        ["", "", "", "", "", "", "", "", "", ""],
        [
          "a",
          "Second artwork",
          "Nature",
          "",
          "https://example.com/b.jpg",
          "",
          "",
          499,
          399,
          299,
        ],
      ]),
    ]),
    Orders: new Sheet("Orders", [OH]),
    _Requests: new Sheet("_Requests", [RH]),
  };
  const props = new Map([["ACCEPT_ORDERS", "true"]]),
    cache = new Map();
  let locked = false;
  const ctx = {
    console: { log() {}, warn() {} },
    SpreadsheetApp: {
      openById(id) {
        assert.ok(
          id === "1F9IW21ieO-NJFqayMA99j3Lrrny2o_-QWmJoHFCfzF4" ||
            id === "1jSwo07iIrvabFk7GXd3_AgtJKtA4nXMXMKDZlNQjXzo",
        );
        return { getSheetByName: (n) => sheets[n] };
      },
      flush() {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) || null,
        deleteProperty: (k) => props.delete(k),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k),
        put: (k, v) => cache.set(k, v),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          locked = true;
          return true;
        },
        waitLock() {
          locked = true;
        },
        hasLock: () => locked,
        releaseLock() {
          locked = false;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({
        setMimeType() {
          return JSON.parse(text);
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_, text) =>
        Array.from(crypto.createHash("sha256").update(text).digest()),
      formatDate: (date) => date.toISOString(),
    },
    UrlFetchApp: {
      fetch(url, options) {
        assert.ok(url.startsWith("https://formsubmit.co/ajax/"));
        emails++;
        assert.equal(options.contentType, "application/json");
        const payload = JSON.parse(options.payload);
        assert.match(payload["Payment status"], /NOT verified/);
        if (email === "throw") throw Error("Network");
        return {
          getResponseCode: () => (email === "success" ? 200 : 500),
          getContentText: () =>
            JSON.stringify({ success: email === "success" }),
        };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {
    ctx,
    sheets,
    props,
    get emails() {
      return emails;
    },
    post: (body) =>
      ctx.doPost({ postData: { contents: JSON.stringify(body) } }),
    catalog: () => ctx.doGet({ parameter: { action: "products" } }),
  };
}
const order = () => ({
  action: "order",
  orderId: "FV-12345678-1234-4123-8123-123456789012",
  customer: {
    name: "Test Customer",
    phone: "9876543210",
    email: "",
    house: "7",
    street: "Main street",
    landmark: "",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
  },
  items: [
    {
      productId: "z",
      size: "A5",
      frame: "Black Frame",
      quantity: 2,
      unitPrice: 39900,
    },
  ],
  expectedTotal: 79800,
  utr: "123456789012",
  paymentDeclared: true,
  consent: true,
});
test("live catalog uses exact row order, skips blank and invalid rows", () => {
  const b = backend();
  assert.deepEqual(
    Array.from(b.catalog().products, (p) => p.id),
    ["z", "a"],
  );
});
test("missing prices and duplicate IDs are never sold", () => {
  const b = backend({
    products: [
      ["x", "One", "Cat", "", "https://example.com/1", "", "", 50, 40, 30],
      ["x", "Two", "Cat", "", "https://example.com/2", "", "", 50, 40, 30],
      ["v", "Invalid", "Cat", "", "https://example.com/3", "", "", 50, 40, 0],
    ],
  });
  assert.equal(b.catalog().products.length, 0);
});
test("saves one row per item, UTR separately, FormSubmit accepted before COMPLETE", () => {
  const b = backend();
  const o = order();
  o.items.push({
    productId: "z",
    size: "A4",
    frame: "Brown Frame",
    quantity: 1,
    unitPrice: 49900,
  });
  o.expectedTotal += 49900;
  const r = b.post(o);
  assert.equal(r.status, "COMPLETE");
  assert.equal(r.saved, true);
  assert.equal(b.emails, 1);
  assert.equal(b.sheets.Orders.data.length, 3);
  assert.equal(b.sheets.Orders.data[1].length, 21);
  assert.equal(b.sheets.Orders.data[1][20], 1297);
  assert.equal(b.sheets._Requests.data[1][6], o.utr);
});
test("retries are idempotent even after catalog changes", () => {
  const b = backend();
  const o = order();
  b.post(o);
  b.sheets.Products.data[1][9] = 999;
  assert.equal(b.post(o).status, "COMPLETE");
  assert.equal(b.emails, 1);
  assert.equal(b.sheets.Orders.data.length, 2);
});
test("same ID with different details is rejected without overwriting", () => {
  const b = backend();
  const o = order();
  b.post(o);
  o.customer.house = "Changed";
  const r = b.post(o);
  assert.equal(r.ok, false);
  assert.notEqual(r.notSaved, true);
  assert.equal(b.sheets.Orders.data.length, 2);
});
test("server rejects tampered prices before writing", () => {
  const b = backend();
  const o = order();
  o.items[0].unitPrice = 1;
  o.expectedTotal = 2;
  const r = b.post(o);
  assert.equal(r.ok, false);
  assert.equal(r.notSaved, true);
  assert.equal(b.sheets.Orders.data.length, 1);
  assert.equal(b.emails, 0);
});
test("email failure never shows full success; no blind retries", () => {
  for (const email of ["throw", "failure"]) {
    const b = backend({ email });
    const o = order();
    const r = b.post(o);
    assert.equal(r.status, "EMAIL_PENDING");
    assert.equal(r.saved, true);
    assert.equal(r.emailAccepted, false);
    b.post(o);
    assert.equal(b.emails, 1);
    assert.equal(b.sheets.Orders.data.length, 2);
  }
});
test("lost acknowledgement after sheet write recovers without duplicate rows", () => {
  const b = backend({ failAfterOrders: true });
  const o = order();
  assert.equal(b.post(o).ok, false);
  assert.equal(b.sheets.Orders.data.length, 2);
  assert.equal(b.post(o).status, "COMPLETE");
  assert.equal(b.sheets.Orders.data.length, 2);
  assert.equal(b.emails, 1);
});
test("sheet formula input is written as literal text and recovery handles escaping", () => {
  const b = backend({ failAfterOrders: true });
  const o = order();
  o.customer.name = '=IMPORTXML("example","x")';
  assert.equal(b.post(o).ok, false);
  assert.equal(b.sheets.Orders.data[1][2], o.customer.name);
  assert.equal(b.post(o).status, "COMPLETE");
});
test("a SENDING marker from an interrupted email is uncertain, never auto resent", () => {
  const b = backend({ email: "failure" });
  const o = order();
  b.post(o);
  b.sheets._Requests.data[1][4] = "SENDING";
  assert.equal(b.post(o).status, "EMAIL_PENDING");
  assert.equal(b.emails, 1);
  assert.equal(b.sheets._Requests.data[1][4], "UNCERTAIN");
});
test("server checkout switch refuses new orders", () => {
  const b = backend();
  b.props.set("ACCEPT_ORDERS", "false");
  assert.equal(b.post(order()).notSaved, true);
  assert.equal(b.sheets.Orders.data.length, 1);
});
test("invalid input, bounds, UPI declaration and consent are rejected", () => {
  for (const mutate of [
    (o) => (o.customer.phone = "1234567890"),
    (o) => (o.customer.pincode = "000001"),
    (o) => (o.items[0].quantity = 100),
    (o) => (o.consent = false),
    (o) => (o.paymentDeclared = false),
  ]) {
    const b = backend();
    const o = order();
    mutate(o);
    assert.equal(b.post(o).notSaved, true);
    assert.equal(b.sheets.Orders.data.length, 1);
  }
});
