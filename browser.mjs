/** Local-only browser fixtures. No test product or fake order endpoint is shipped to Pages. */
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const output = path.join(root, "test-results");
await fs.mkdir(output, { recursive: true });
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    let filename = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (filename === "/") filename = "/index.html";
    const file = path.resolve(root, "." + filename);
    if (!file.startsWith(root + path.sep)) throw Error();
    const body = await fs.readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "text/plain",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const fixture = [
  {
    id: "z-first",
    name: "Quiet Form",
    category: "Abstract",
    subcategory: "Organic",
    images: [
      "https://images.example.test/one.jpg",
      "https://images.example.test/two.jpg",
      "https://images.example.test/three.jpg",
    ],
    prices: { A5: 49900, A4: 69900, A3: 99900 },
  },
  {
    id: "a-second",
    name: "Still Afternoon",
    category: "Nature",
    subcategory: "Botanical",
    images: ["https://images.example.test/one.jpg"],
    prices: { A5: 29900, A4: 59900, A3: 79900 },
  },
  {
    id: "m-third",
    name: "A Softer Perspective",
    category: "Minimal",
    subcategory: "Line art",
    images: ["https://images.example.test/one.jpg"],
    prices: { A5: 39900, A4: 69900, A3: 89900 },
  },
];
const fixturePhoto = await fs.readFile(
  path.join(root, "assets/editorial-interior.jpg"),
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const errors = [];
const results = [];
async function setup(width) {
  const context = await browser.newContext({
    viewport: { width, height: 960 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  let mode = "complete",
    submissions = 0;
  await page.route("**/js/config.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `export const CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec',checkoutEnabled:true,contactEmail:'anikrathi.work@gmail.com',contactPhone:'',instagramUrl:'',pinterestUrl:'',turnstileSiteKey:'',returnsPolicy:'Fixture policy for automated tests only.',deliveryPolicy:'Fixture shipping information only.',businessAddress:''};`,
    }),
  );
  await page.route("https://images.example.test/**", (r) =>
    r.fulfill({ contentType: "image/jpeg", body: fixturePhoto }),
  );
  await page.route("https://script.google.com/**", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { ok: true, products: fixture } });
    submissions++;
    const body = JSON.parse(r.request().postData());
    if (mode === "network") return r.abort("failed");
    return r.fulfill({
      json: {
        ok: true,
        orderId: body.orderId,
        total: body.expectedTotal,
        saved: true,
        emailAccepted: mode === "complete",
        status: mode === "complete" ? "COMPLETE" : "EMAIL_PENDING",
      },
    });
  });
  return {
    context,
    page,
    setMode: (m) => (mode = m),
    get submissions() {
      return submissions;
    },
  };
}
async function shot(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(120);
  if (name.endsWith("-home")) {
    let html = await page.content();
    html = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/g, "")
      .replace(
        '<link rel="stylesheet" href="./styles.css">',
        "<style>" +
          (await fs.readFile(path.join(root, "styles.css"), "utf8")) +
          "</style>",
      )
      .replaceAll("./assets/", "file://" + root + "/assets/")
      .replace(
        /https:\/\/images\.example\.test\/[a-z]+\.jpg/g,
        "file://" + root + "/assets/editorial-interior.jpg",
      );
    await fs.writeFile(path.join(output, name + ".html"), html);
  }
  await page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(overflow, false, "No horizontal overflow on " + name);
  results.push(name);
}
try {
  for (const width of [1440, 390]) {
    const t = await setup(width),
      p = t.page,
      tag = width === 390 ? "mobile" : "desktop";
    await p.goto(base);
    await p.locator("#featured .product-card").first().waitFor();
    await shot(p, tag + "-home");
    if (width === 390) {
      await p.locator("#menu-toggle").click();
      assert.equal(
        await p.locator("#menu-toggle").getAttribute("aria-expanded"),
        "true",
      );
      await shot(p, "mobile-navigation");
      await p.locator('#navigation a[href="#/shop"]').click();
    } else await p.goto(base + "/#/shop");
    await p.locator("#shop-results .product-card").first().waitFor();
    assert.match(
      await p.locator(".product-card h3").first().textContent(),
      /Quiet Form/,
    );
    await p.locator("#sort").selectOption("low");
    assert.match(
      await p.locator(".product-card h3").first().textContent(),
      /Still Afternoon/,
    );
    await p.locator("#reset-filters").click();
    assert.match(
      await p.locator(".product-card h3").first().textContent(),
      /Quiet Form/,
    );
    await p.locator("#search").fill("nonexistent");
    await shot(p, tag + "-no-results");
    await p.locator("#reset-filters").click();
    await p.locator("#category").selectOption("Abstract");
    assert.equal(await p.locator(".product-card").count(), 1);
    await p.locator("#reset-filters").click();
    await shot(p, tag + "-shop");
    await p.goto(base + "/#/product/z-first");
    await p.locator("#detail-add").waitFor();
    assert.equal(await p.locator(".thumbnail").count(), 3);
    await p.locator('[data-image="1"]').click();
    assert.match(await p.locator("#gallery-image").getAttribute("src"), /two/);
    const dims = await p
      .locator(".gallery-main")
      .evaluate((el) => ({
        width: el.clientWidth,
        height: el.clientHeight,
        fit: getComputedStyle(el.querySelector("img")).objectFit,
      }));
    assert.ok(Math.abs(dims.width - dims.height) < 2);
    assert.equal(dims.fit, "contain");
    await p.locator('[name="size"][value="A4"]').check();
    assert.match(await p.locator("#detail-price").textContent(), /699/);
    await p.locator('[name="frame"][value="Brown Frame"]').check();
    await p.locator("#detail-add").click();
    await p.locator('[name="size"][value="A5"]').check();
    await p.locator("#detail-add").click();
    await shot(p, tag + "-product");
    await p.goto(base + "/#/cart");
    await p.locator(".cart-item").first().waitFor();
    assert.equal(await p.locator(".cart-item").count(), 2);
    await p.reload();
    await p.locator(".cart-item").first().waitFor();
    assert.equal(await p.locator(".cart-item").count(), 2);
    await p.locator('[data-cart-plus="0"]').click();
    await p.locator(".cart-item").first().waitFor();
    await shot(p, tag + "-cart");
    await p.locator('a[href="#/checkout"]').last().click();
    await p.locator("#details-form").waitFor();
    await shot(p, tag + "-checkout-details");
    for (const [id, value] of Object.entries({
      name: "Test Customer",
      phone: "9876543210",
      house: "7",
      street: "Main street",
      city: "Mumbai",
      pincode: "400001",
    }))
      await p.locator("#" + id).fill(value);
    await p.locator("#state").selectOption("Maharashtra");
    await p.locator("#details-form button[type=submit]").click();
    await p.locator("#payment-done").waitFor();
    assert.equal(
      await p.locator(".download").getAttribute("href"),
      "./assets/upi-qr.jpeg",
    );
    await shot(p, tag + "-payment");
    await p.locator(".delivery-review a").click();
    await p.locator("#details-form").waitFor();
    assert.equal(await p.locator("#name").inputValue(), "Test Customer");
    await p.locator("#details-form button[type=submit]").click();
    await p.locator("#payment-done").waitFor();
    await p.locator("#paid").check();
    await p.locator("#privacy-consent").check();
    t.setMode("pending");
    await p.locator("#payment-done").click();
    await p.locator("#retry-order").waitFor();
    await shot(p, tag + "-partial-failure");
    assert.equal(await p.locator("#cart-count").textContent(), "3");
    const pendingId = await p.evaluate(
      () => JSON.parse(localStorage.getItem("fevlor.pending.v1")).orderId,
    );
    await p.reload();
    await p.locator("#retry-order").waitFor();
    assert.equal(
      await p.evaluate(
        () => JSON.parse(localStorage.getItem("fevlor.pending.v1")).orderId,
      ),
      pendingId,
    );
    t.setMode("complete");
    await p.locator("#retry-order").click();
    await p.locator(".success").waitFor();
    await shot(p, tag + "-success");
    assert.equal(await p.locator("#cart-count").textContent(), "0");
    assert.equal(
      await p.evaluate(() => localStorage.getItem("fevlor.pending.v1")),
      null,
    );
    for (const route of [
      "categories",
      "about",
      "contact",
      "privacy",
      "delivery",
    ]) {
      await p.goto(base + "/#/" + route);
      await p.locator("#main h1").waitFor();
      if (route === "categories")
        await p.locator(".category-card").first().waitFor();
      await shot(p, tag + "-" + route);
    }
    await p.goto(base + "/#/cart");
    await p.locator(".empty").waitFor();
    await shot(p, tag + "-empty-cart");
    await p.goto(base + "/#/missing");
    await p.locator(".empty").waitFor();
    await shot(p, tag + "-404");
    await t.context.close();
  }
  // A real unconfigured build must fail gracefully, not use fixtures or fake products.
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  await p.locator("#featured .notice").waitFor();
  assert.equal(await p.locator(".product-card").count(), 0);
  await shot(p, "unconfigured-home");
  await p.goto(base + "/#/shop");
  await p.locator("#shop-body .notice").waitFor();
  await shot(p, "unconfigured-shop");
  await p.close();
  // Unknown network outcome preserves bag and the immutable id across retries.
  const n = await setup(390);
  await n.page.goto(base + "/#/shop");
  await n.page.locator("[data-add]").first().click();
  await n.page.goto(base + "/#/checkout");
  await n.page.locator("#details-form").waitFor();
  for (const [id, value] of Object.entries({
    name: "Test Customer",
    phone: "9876543210",
    house: "7",
    street: "Main street",
    city: "Mumbai",
    pincode: "400001",
  }))
    await n.page.locator("#" + id).fill(value);
  await n.page.locator("#state").selectOption("Maharashtra");
  await n.page.locator("#details-form button[type=submit]").click();
  await n.page.locator("#paid").check();
  await n.page.locator("#privacy-consent").check();
  n.setMode("network");
  await n.page.locator("#payment-done").click();
  await n.page.locator("#retry-order").waitFor();
  await shot(n.page, "mobile-network-failure");
  assert.equal(await n.page.locator("#cart-count").textContent(), "1");
  const id = await n.page.evaluate(
    () => JSON.parse(localStorage.getItem("fevlor.pending.v1")).orderId,
  );
  n.setMode("complete");
  await n.page.locator("#retry-order").click();
  await n.page.locator(".success").waitFor();
  assert.match(await n.page.locator(".success").textContent(), new RegExp(id));
  await n.context.close();
  assert.deepEqual(errors, [], "No browser runtime errors");
  await fs.writeFile(
    path.join(output, "browser-report.json"),
    JSON.stringify({ passed: true, captures: results, errors }, null, 2),
  );
  console.log(
    `Browser QA passed: ${results.length} route/state captures, desktop + mobile, no overflow/runtime errors.`,
  );
} finally {
  await browser.close();
  server.close();
}
