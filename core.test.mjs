import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZES,
  STATES,
  addItem,
  cartKey,
  filterProducts,
  normalizeProducts,
  subtotal,
  reconcile,
  validateCustomer,
  readCart,
  esc,
  safeUrl,
} from "../js/core.js";
const p = (id, price, category = "Abstract") => ({
  id,
  name: "Artwork " + id,
  category,
  subcategory: "Organic",
  images: ["https://example.com/" + id + ".jpg"],
  prices: { A5: price, A4: price + 10000, A3: price + 20000 },
});
const products = [p("z", 39900), p("a", 19900), p("m", 29900, "Nature")];
const customer = {
  name: "Test Customer",
  phone: "9876543210",
  email: "",
  house: "7",
  street: "Test Street",
  landmark: "",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400001",
};
test("all 28 states and 8 UTs, three dimensioned sizes", () => {
  assert.equal(STATES.length, 36);
  assert.equal(new Set(STATES).size, 36);
  assert.equal(SIZES.A3, "30 × 42 cm");
});
test("catalog preserves spreadsheet row order and omits invalid entries", () => {
  assert.deepEqual(
    normalizeProducts([
      products[0],
      {},
      products[1],
      { ...products[2], prices: { A5: -1 } },
      products[0],
    ]).map((p) => p.id),
    ["z", "a"],
  );
});
test("sort only on explicit request; resetting restores source order", () => {
  assert.deepEqual(
    filterProducts(products).map((p) => p.id),
    ["z", "a", "m"],
  );
  assert.deepEqual(
    filterProducts(products, { sort: "low" }).map((p) => p.id),
    ["a", "m", "z"],
  );
  assert.deepEqual(
    filterProducts(products, { sort: "high" }).map((p) => p.id),
    ["z", "m", "a"],
  );
  assert.deepEqual(
    filterProducts(products).map((p) => p.id),
    ["z", "a", "m"],
  );
});
test("search and category/subcategory compose", () => {
  assert.equal(
    filterProducts(products, {
      category: "Abstract",
      query: "artwork a",
      subcategory: "Organic",
    }).length,
    1,
  );
});
test("different sizes and frame colours never merge", () => {
  let c = addItem([], products[0], "A5", "Black Frame", 2);
  c = addItem(c, products[0], "A4", "Black Frame");
  c = addItem(c, products[0], "A5", "Brown Frame");
  c = addItem(c, products[0], "A5", "Black Frame");
  assert.equal(c.length, 3);
  assert.equal(c[0].quantity, 3);
  assert.equal(new Set(c.map(cartKey)).size, 3);
  assert.equal(subtotal(c), 39900 * 4 + 49900);
});
test("quantities are bounded and prices refresh without losing variants", () => {
  assert.throws(() => addItem([], products[0], "A5", "Black Frame", 0));
  const c = addItem([], products[0], "A3", "Brown Frame");
  assert.equal(reconcile(c, [p("z", 49900)])[0].unitPrice, 69900);
  assert.equal(reconcile(c, [])[0].unavailable, true);
});
test("customer validation handles PIN, mobile, state and optional email", () => {
  assert.equal(validateCustomer(customer), "");
  assert.notEqual(validateCustomer({ ...customer, pincode: "000000" }), "");
  assert.notEqual(validateCustomer({ ...customer, phone: "1234567890" }), "");
  assert.notEqual(validateCustomer({ ...customer, state: "Unknown" }), "");
  assert.notEqual(validateCustomer({ ...customer, email: "bad" }), "");
});
test("untrusted storage, URLs and HTML are safe", () => {
  assert.deepEqual(readCart({ getItem: () => "{" }), []);
  assert.deepEqual(readCart({ getItem: () => '[null,{"quantity":-2}]' }), []);
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://a:b@example.com/a"), "");
  assert.equal(
    esc('<img onerror="alert(1)">'),
    "&lt;img onerror=&quot;alert(1)&quot;&gt;",
  );
});
