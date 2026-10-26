import { CONFIG } from "./config.js";
import {
  SIZES,
  FRAMES,
  STATES,
  money,
  esc,
  safeUrl,
  cartKey,
  normalizeProducts,
  filterProducts,
  addItem,
  subtotal,
  reconcile,
  validateCustomer,
  readCart,
} from "./core.js";
import { request } from "./api.js";
const main = document.querySelector("#main");
const memoryStorage = new Map();
const storage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memoryStorage.get(k) || null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      memoryStorage.set(k, v);
      return false;
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
    memoryStorage.delete(k);
  },
};
const parse = (store, key, fallback) => {
  try {
    return JSON.parse(store.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};
let cart = readCart(storage),
  products = [],
  catalogLoaded = false,
  catalogPromise = null,
  catalogFetchedAt = 0,
  submitting = false,
  renderVersion = 0;
let pending = parse(storage, "fevlor.pending.v1", null);
let customer;
try {
  customer = parse(sessionStorage, "fevlor.customer.v1", {});
} catch {
  customer = {};
}
let receipt;
try {
  receipt = parse(sessionStorage, "fevlor.receipt.v1", null);
} catch {
  receipt = null;
}
let selectedSize = "A5",
  selectedFrame = FRAMES[0],
  selectedQuantity = 1,
  toastTimer;
const icon = (name) => {
  const paths = {
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    frame:
      '<rect x="3" y="3" width="18" height="18"/><rect x="6" y="6" width="12" height="12"/>',
    truck:
      '<path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10M8 4l9 5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${paths[name] || paths.frame}</svg>`;
};
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function updateBadge() {
  const n = cart.reduce((n, i) => n + i.quantity, 0);
  document.querySelector("#cart-count").textContent = n;
  document
    .querySelector(".bag")
    .setAttribute("aria-label", `Shopping bag, ${n} items`);
}
function saveCart() {
  if (!storage.setItem("fevlor.cart.v1", JSON.stringify(cart)))
    toast(
      "Browser storage is unavailable. Keep this tab open to retain your bag.",
    );
  updateBadge();
}
function persistCustomer() {
  try {
    sessionStorage.setItem("fevlor.customer.v1", JSON.stringify(customer));
  } catch {}
}
function readPending() {
  pending = parse(storage, "fevlor.pending.v1", null);
  return pending;
}
function canChangeCart() {
  if (submitting || readPending()) {
    toast(
      "An order request is in progress. Open checkout to check its status first.",
    );
    return false;
  }
  return true;
}
function priceTotals(items = cart) {
  const total = subtotal(items);
  return `<div class="totals"><div class="row"><span>Subtotal</span><span>${money(total)}</span></div><div class="row"><span>Shipping</span><span class="shipping">FREE</span></div><div class="row grand"><span>Total</span><span>${money(total)}</span></div></div>`;
}
function card(p) {
  return `<article class="product-card"><a href="#/product/${encodeURIComponent(p.id)}" aria-label="View ${esc(p.name)}"><div class="square"><img src="${esc(p.images[0])}" alt="${esc(p.name)} framed artwork" loading="lazy" width="600" height="600"></div><div class="product-meta"><div><p class="product-category">${esc(p.category)}</p><h3>${esc(p.name)}</h3></div><div class="product-price"><small>From</small>${money(Math.min(...Object.values(p.prices)))}</div></div></a><div class="card-actions"><a class="text-link" href="#/product/${encodeURIComponent(p.id)}">View Product <span aria-hidden="true">↗</span></a><button class="quick-add" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)}, A5, Black Frame to bag">Add A5 · Black <span aria-hidden="true">+</span></button></div></article>`;
}
function categoryCards() {
  return [...new Set(products.map((p) => p.category))]
    .map((c) => {
      const p = products.find((p) => p.category === c);
      return `<a class="category-card" href="#/shop?category=${encodeURIComponent(c)}"><div class="square"><img src="${esc(p.images[0])}" alt="${esc(c)} artwork" loading="lazy" width="600" height="600"></div><div class="category-title"><h3>${esc(c)}</h3><span aria-hidden="true">↗</span></div></a>`;
    })
    .join("");
}
function benefits() {
  return `<div class="wrap"><div class="benefits">${[
    [
      "frame",
      "Premium Acrylic Frames",
      "A timeless finish for the stories you love.",
    ],
    ["truck", "Free Shipping", "Delivered across India, at no extra cost."],
    [
      "box",
      "Carefully Packed Artwork",
      "Thoughtfully protected for its journey.",
    ],
    [
      "sun",
      "Elegant Wall Decor",
      "A considered finishing touch to your space.",
    ],
  ]
    .map(
      ([i, t, d]) =>
        `<div class="benefit">${icon(i)}<h3>${t}</h3><p>${d}</p></div>`,
    )
    .join("")}</div></div>`;
}
function footer() {
  const socials = [
    ["Instagram", CONFIG.instagramUrl],
    ["Pinterest", CONFIG.pinterestUrl],
  ].filter(([, u]) => safeUrl(u));
  document.querySelector("#footer").innerHTML =
    `<div class="footer"><div class="wrap"><div class="footer-grid"><div><a class="footer-brand" href="#/" aria-label="Fevlor home"><img src="./assets/fevlor-logo.png" alt="FEVLOR" width="1983" height="793"></a><p>For the walls you live with.<br>For the moments that make them yours.</p></div><div><h3>Explore</h3><ul><li><a href="#/shop">Discover the Collection</a></li><li><a href="#/categories">The collections</a></li><li><a href="#/about">About Fevlor</a></li><li><a href="#/cart">Your bag</a></li></ul></div><div><h3>Good to know</h3><ul><li><a href="#/delivery">Shipping & returns</a></li><li><a href="#/privacy">Privacy</a></li><li><a href="#/contact">Contact us</a></li></ul></div><div><h3>Stay in touch</h3><ul><li><a href="mailto:${esc(CONFIG.contactEmail)}">${esc(CONFIG.contactEmail)}</a></li>${CONFIG.contactPhone ? `<li>${esc(CONFIG.contactPhone)}</li>` : ""}${socials.map(([n, u]) => `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${n} ↗</a></li>`).join("")}${!socials.length ? "<li>Social links coming soon</li>" : ""}</ul></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} FEVLOR. All rights reserved.</span><span>Considered art. Delivered across India.</span></div></div></div>`;
}
async function loadCatalog(force = false) {
  if (catalogPromise) return catalogPromise;
  if (catalogLoaded && !force && Date.now() - catalogFetchedAt < 60000)
    return products;
  catalogPromise = (async () => {
    const data = await request();
    products = normalizeProducts(data.products);
    catalogLoaded = true;
    catalogFetchedAt = Date.now();
    const updated = reconcile(cart, products);
    const changed = updated.some(
      (i, n) =>
        i.unitPrice !== cart[n].unitPrice ||
        Boolean(i.unavailable) !== Boolean(cart[n].unavailable),
    );
    cart = updated;
    saveCart();
    if (changed && cart.length)
      toast(
        "Your bag has been updated with the latest prices and availability.",
      );
    return products;
  })();
  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}
function catalogError(error) {
  return `<div class="notice error" role="alert"><strong>The collection is taking a moment.</strong><p>${esc(error.message)}</p><button class="button secondary" data-reload>Try again</button></div>`;
}
function collectionEmpty() {
  return '<div class="empty"><h2>A collection in the making.</h2><p>Our artwork will appear here as soon as the collection is ready. Please check back soon.</p></div>';
}
async function home(version) {
  main.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">FEVLOR / The art of feeling at home</span><h1>A little cinema.<br>A whole new<br><em>feeling.</em></h1><p>Framed movie and series artwork that brings your favourite stories, characters and moments into your space.</p><a class="button" href="#/shop">Frame Your Favourites <span aria-hidden="true">↗</span></a><p class="micro">Premium frames. Personal spaces.</p></div><div class="hero-image"><img src="./assets/editorial-interior.jpg" alt="Interior inspiration: an aubergine and ochre artwork in a sunlit, neutral living room" width="1264" height="848" fetchpriority="high"><span class="image-caption">Interior inspiration · artwork shown for styling</span></div></section><div class="intro-strip">Thoughtfully chosen <span>—</span> Beautifully framed <span>—</span> Made for your space</div><section class="section"><div class="wrap"><div class="section-heading"><div><span class="eyebrow">The considered collection</span><h2>Find a piece of you.</h2></div><a class="text-link" href="#/shop">Shop all art <span aria-hidden="true">↗</span></a></div><div id="featured"><div class="loading"><span class="spinner"></span>Opening the collection…</div></div></div></section><section class="section category-section"><div class="wrap"><div class="section-heading"><div><span class="eyebrow">A mood for every wall</span><h2>Explore the collections.</h2></div></div><div id="home-categories"></div></div></section><section class="editorial"><div class="editorial-picture"><img src="./assets/editorial-interior.jpg" alt="Warm, art-led interior styling inspiration" loading="lazy" width="1264" height="848"></div><div class="editorial-copy"><span class="eyebrow">Beyond a blank wall</span><h2>Your space.<br>Your point of view.</h2><p>The quiet corner. The busy workspace. The room you return to. For the stories that stay long after the screen fades to black.</p><a class="text-link" href="#/about">The Fevlor approach <span aria-hidden="true">↗</span></a></div></section>${benefits()}`;
  try {
    await loadCatalog();
    if (version !== renderVersion) return;
    document.querySelector("#featured").innerHTML = products.length
      ? `<div class="product-grid">${products.slice(0, 6).map(card).join("")}</div>`
      : collectionEmpty();
    document.querySelector("#home-categories").innerHTML = products.length
      ? `<div class="category-grid">${categoryCards()}</div>`
      : '<p class="muted">Collections will appear with our artwork.</p>';
  } catch (e) {
    if (version !== renderVersion) return;
    document.querySelector("#featured").innerHTML = catalogError(e);
    document.querySelector("#home-categories").innerHTML =
      '<p class="muted">The live collections are currently unavailable.</p>';
  }
}
async function shop(params, version) {
  main.innerHTML = `<div class="wrap"><header class="page-head"><span class="eyebrow">More than just wall decor</span><h1>The collection.</h1><p>Curated posters, elegant frames and thoughtful details. Everything your walls need to make an impression.</p></header><div id="shop-body" class="loading"><span class="spinner"></span>Loading artwork…</div></div>`;
  try {
    await loadCatalog();
    if (version !== renderVersion) return;
    const category = params.get("category") || "";
    document.querySelector("#shop-body").className = "shop-layout";
    document.querySelector("#shop-body").innerHTML =
      `<aside class="filters" aria-label="Filter artwork"><div class="field"><label for="search">Find your artwork</label><input id="search" type="search" placeholder="Search the collection" maxlength="100"></div><div class="field"><label for="category">Category</label><select id="category"><option value="">All categories</option>${[...new Set(products.map((p) => p.category))].map((c) => `<option value="${esc(c)}" ${c === category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div><div class="field"><label for="subcategory">Subcategory</label><select id="subcategory"></select></div><button class="text-link" id="reset-filters">Reset filters & sort ↗</button></aside><div><div class="toolbar"><p id="result-count" class="muted" aria-live="polite"></p><div><label for="sort">Sort by </label><select id="sort"><option value="sheet">Featured / sheet order</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div></div><div id="shop-results"></div></div>`;
    const updateSubs = () => {
      const selected = document.querySelector("#category").value;
      const subs = [
        ...new Set(
          products
            .filter((p) => !selected || p.category === selected)
            .map((p) => p.subcategory)
            .filter(Boolean),
        ),
      ];
      document.querySelector("#subcategory").innerHTML =
        '<option value="">All subcategories</option>' +
        subs
          .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
          .join("");
    };
    const update = () => {
      const list = filterProducts(products, {
        query: document.querySelector("#search").value,
        category: document.querySelector("#category").value,
        subcategory: document.querySelector("#subcategory").value,
        sort: document.querySelector("#sort").value,
      });
      document.querySelector("#result-count").textContent =
        `${list.length} ${list.length === 1 ? "artwork" : "artworks"}`;
      document.querySelector("#shop-results").innerHTML = list.length
        ? `<div class="product-grid">${list.map(card).join("")}</div>`
        : products.length
          ? '<div class="empty"><h2>No pieces found.</h2><p>Try another search or reset your filters.</p></div>'
          : collectionEmpty();
    };
    updateSubs();
    update();
    document.querySelector("#search").addEventListener("input", update);
    document.querySelector("#category").addEventListener("change", () => {
      updateSubs();
      update();
    });
    document.querySelector("#subcategory").addEventListener("change", update);
    document.querySelector("#sort").addEventListener("change", update);
    document.querySelector("#reset-filters").onclick = () => {
      document.querySelector("#search").value = "";
      document.querySelector("#category").value = "";
      document.querySelector("#sort").value = "sheet";
      updateSubs();
      update();
    };
  } catch (e) {
    if (version === renderVersion)
      document.querySelector("#shop-body").innerHTML = catalogError(e);
  }
}
async function categories(version) {
  main.innerHTML =
    '<div class="wrap"><header class="page-head"><span class="eyebrow">A mood for every wall</span><h1>The collections.</h1><p>Different perspectives. One beautifully personal space.</p></header><div class="section" id="categories-body"><div class="loading">Loading collections…</div></div></div>';
  try {
    await loadCatalog();
    if (version === renderVersion)
      document.querySelector("#categories-body").innerHTML = products.length
        ? `<div class="category-grid">${categoryCards()}</div>`
        : collectionEmpty();
  } catch (e) {
    if (version === renderVersion)
      document.querySelector("#categories-body").innerHTML = catalogError(e);
  }
}
async function productPage(id, version) {
  main.innerHTML =
    '<div class="wrap section"><div class="loading"><span class="spinner"></span>Loading your artwork…</div></div>';
  try {
    await loadCatalog();
    if (version !== renderVersion) return;
    const p = products.find((p) => p.id === id);
    if (!p) {
      notFound();
      return;
    }
    selectedSize = "A5";
    selectedFrame = FRAMES[0];
    selectedQuantity = 1;
    document.title = `${p.name} — FEVLOR`;
    main.innerHTML = `<div class="wrap"><div class="breadcrumbs"><a href="#/">Home</a><span>/</span><a href="#/shop">Shop</a><span>/</span><span>${esc(p.name)}</span></div><section class="product-detail"><div><div class="square gallery-main"><img id="gallery-image" src="${esc(p.images[0])}" alt="${esc(p.name)}, photograph 1" width="900" height="900"></div><div class="gallery-thumbs" role="group" aria-label="Product photographs">${p.images.map((url, i) => `<button class="thumbnail" data-image="${i}" aria-label="Show photograph ${i + 1}" aria-pressed="${i === 0}"><img src="${esc(url)}" alt="" width="80" height="80"></button>`).join("")}</div></div><div class="product-info"><span class="eyebrow">${esc(p.category)}${p.subcategory ? " / " + esc(p.subcategory) : ""}</span><h1>${esc(p.name)}</h1><p class="detail-price" id="detail-price" aria-live="polite">${money(p.prices.A5)}</p><p class="small muted">Free shipping across India</p><p class="product-description">Bring a considered finishing touch to your space with ${esc(p.name)}. A high-quality acrylic frame and an elegant, durable finish give this ${esc(p.category.toLowerCase())} artwork a premium presence in your home, bedroom, office or workspace. Carefully packed before dispatch.</p><fieldset class="options"><legend>Choose your size</legend><div class="size-options">${Object.entries(
      SIZES,
    )
      .map(
        ([s, d]) =>
          `<label class="choice"><input type="radio" name="size" value="${s}" ${s === "A5" ? "checked" : ""}><span>${s}<small>${d}</small></span></label>`,
      )
      .join(
        "",
      )}</div></fieldset><fieldset class="options"><legend>Choose your frame</legend><div class="frame-options">${FRAMES.map((f, i) => `<label class="choice"><input type="radio" name="frame" value="${esc(f)}" ${i === 0 ? "checked" : ""}><span><i class="swatch ${i === 1 ? "brown" : ""}" aria-hidden="true"></i>${f}</span></label>`).join("")}</div></fieldset><div class="add-row"><div class="quantity" aria-label="Quantity"><button id="detail-minus" aria-label="Decrease quantity">−</button><output id="detail-quantity" aria-live="polite">1</output><button id="detail-plus" aria-label="Increase quantity">+</button></div><button class="button" id="detail-add">Add to Cart <span aria-hidden="true">↗</span></button></div><div class="detail-facts"><span>Premium acrylic frame</span><span>Carefully packed artwork</span><span>Free shipping, anywhere in India</span></div></div></section></div>`;
    main.querySelectorAll("[data-image]").forEach(
      (b) =>
        (b.onclick = () => {
          const i = Number(b.dataset.image);
          const img = document.querySelector("#gallery-image");
          img.src = p.images[i];
          img.alt = `${p.name}, photograph ${i + 1}`;
          img.parentElement.querySelector(".image-fallback")?.remove();
          main
            .querySelectorAll("[data-image]")
            .forEach((el) => el.setAttribute("aria-pressed", el === b));
        }),
    );
    main.querySelectorAll("[name=size]").forEach(
      (r) =>
        (r.onchange = () => {
          selectedSize = r.value;
          document.querySelector("#detail-price").textContent = money(
            p.prices[selectedSize],
          );
        }),
    );
    main.querySelectorAll("[name=frame]").forEach(
      (r) =>
        (r.onchange = () => {
          selectedFrame = r.value;
        }),
    );
    document.querySelector("#detail-minus").onclick = () => {
      selectedQuantity = Math.max(1, selectedQuantity - 1);
      document.querySelector("#detail-quantity").textContent = selectedQuantity;
    };
    document.querySelector("#detail-plus").onclick = () => {
      selectedQuantity = Math.min(99, selectedQuantity + 1);
      document.querySelector("#detail-quantity").textContent = selectedQuantity;
    };
    document.querySelector("#detail-add").onclick = () =>
      addToCart(p, selectedSize, selectedFrame, selectedQuantity);
  } catch (e) {
    if (version === renderVersion)
      main.innerHTML = `<div class="wrap section">${catalogError(e)}</div>`;
  }
}
function addToCart(p, size = "A5", frame = FRAMES[0], quantity = 1) {
  if (!canChangeCart()) return;
  try {
    if (
      cart.length >= 50 &&
      !cart.some(
        (i) => cartKey(i) === cartKey({ productId: p.id, size, frame }),
      )
    )
      throw Error("Your bag can contain up to 50 different selections.");
    cart = addItem(cart, p, size, frame, quantity);
    saveCart();
    toast(`${p.name} · ${size} · ${frame} added to your bag.`);
  } catch (e) {
    toast(e.message);
  }
}
function emptyCart() {
  return `<div class="wrap section"><div class="empty">${icon("bag")}<span class="eyebrow">Room for something beautiful</span><h2>Your bag is a blank canvas.</h2><p>Find an artwork you love and make a little space for it here.</p><a class="button" href="#/shop">Explore the collection ↗</a>${readPending() ? '<p><a class="text-link" href="#/checkout">Check your pending order</a></p>' : ""}</div></div>`;
}
async function cartPage(version) {
  if (!cart.length) {
    main.innerHTML = emptyCart();
    return;
  }
  main.innerHTML =
    '<div class="wrap section"><div class="loading">Checking the latest prices…</div></div>';
  let error;
  try {
    await loadCatalog(true);
  } catch (e) {
    error = e;
  }
  if (version !== renderVersion) return;
  const available = !error && !cart.some((i) => i.unavailable);
  main.innerHTML = `<div class="wrap"><header class="page-head"><span class="eyebrow">Your considered collection</span><h1>The shopping bag.</h1></header>${error ? catalogError(error) : ""}${readPending() ? '<div class="notice legal-message">An order request is pending. Your bag is preserved. <a class="text-link" href="#/checkout">Check the order status ↗</a></div>' : ""}<div class="cart-layout"><div>${cart.map((i, index) => `<article class="cart-item"><a href="#/product/${encodeURIComponent(i.productId)}" class="square"><img src="${esc(safeUrl(i.image))}" alt="${esc(i.name)}" width="112" height="112"></a><div><h3><a href="#/product/${encodeURIComponent(i.productId)}">${esc(i.name)}</a></h3><p class="item-options">${i.size} · ${SIZES[i.size]}<br>${esc(i.frame)}</p>${i.unavailable ? '<p class="small">This artwork is unavailable. Please remove it.</p>' : ""}<div class="quantity"><button data-cart-minus="${index}" aria-label="Decrease quantity for ${esc(i.name)}">−</button><output>${i.quantity}</output><button data-cart-plus="${index}" aria-label="Increase quantity for ${esc(i.name)}">+</button></div></div><div class="item-end"><div><strong>${money(i.unitPrice * i.quantity)}</strong><p class="small muted">${money(i.unitPrice)} each</p></div><button class="remove" data-cart-remove="${index}" aria-label="Remove ${esc(i.name)}, ${i.size}, ${esc(i.frame)}">Remove</button></div></article>`).join("")}</div><aside class="summary-card"><h2>A little closer to home.</h2>${priceTotals()}${available ? '<a class="button full" href="#/checkout">Proceed to Checkout ↗</a>' : '<p class="small">Please resolve unavailable products or refresh the collection before checking out.</p>'}<p class="small muted">Manual UPI payment. Payment is reviewed separately by Fevlor.</p><a class="text-link" href="#/shop">Continue exploring ↗</a></aside></div></div>`;
  for (const type of ["minus", "plus", "remove"])
    main.querySelectorAll(`[data-cart-${type}]`).forEach(
      (b) =>
        (b.onclick = () => {
          if (!canChangeCart()) return;
          const n = Number(b.getAttribute(`data-cart-${type}`));
          if (type === "remove") cart.splice(n, 1);
          else
            cart[n].quantity = Math.max(
              1,
              Math.min(99, cart[n].quantity + (type === "plus" ? 1 : -1)),
            );
          saveCart();
          cartPage(renderVersion);
        }),
    );
}
const input = (key, label, attrs = "", required = true) =>
  `<div class="field"><label for="${key}">${label}${required ? " *" : " (optional)"}</label><input id="${key}" name="${key}" value="${esc(customer[key] || "")}" ${required ? "required" : ""} ${attrs}></div>`;
function orderItems(items) {
  return `<div class="checkout-items">${items.map((i) => `<div class="checkout-item"><div class="square"><img src="${esc(safeUrl(i.image))}" alt="${esc(i.name)}" width="64" height="64"></div><div><strong>${esc(i.name)}</strong><small>${esc(i.size)} · ${esc(i.frame)} · Qty ${i.quantity}</small><small>${money(i.unitPrice)} each</small></div><strong>${money(i.unitPrice * i.quantity)}</strong></div>`).join("")}</div>`;
}
function checkoutHead(step) {
  return `<header class="page-head"><span class="eyebrow">A home for your art</span><h1>Checkout.</h1><div class="steps" aria-label="Checkout progress"><span class="${step === 1 ? "current" : ""}"><b>1</b>Customer details</span><span class="${step === 2 ? "current" : ""}"><b>2</b>Summary & payment</span></div></header>`;
}
async function checkout(version, step = 1) {
  readPending();
  if (pending) {
    pendingPage();
    return;
  }
  if (!cart.length) {
    main.innerHTML = emptyCart();
    return;
  }
  if (!CONFIG.checkoutEnabled) {
    main.innerHTML =
      '<div class="wrap section"><div class="empty"><h2>Checkout is not open just yet.</h2><p>We are putting the final touches on the store. Your bag is saved. Please contact Fevlor before making a payment.</p><a href="#/contact" class="button">Contact Fevlor ↗</a></div></div>';
    return;
  }
  if (step === 1) {
    main.innerHTML =
      '<div class="wrap section"><div class="loading">Confirming your collection…</div></div>';
    try {
      await loadCatalog(true);
    } catch (e) {
      if (version === renderVersion)
        main.innerHTML = `<div class="wrap section">${catalogError(e)}</div>`;
      return;
    }
  }
  if (version !== renderVersion) return;
  if (cart.some((i) => i.unavailable)) {
    main.innerHTML =
      '<div class="wrap section"><div class="notice">An artwork in your bag is no longer available. Please update your bag before paying.<p><a class="button" href="#/cart">Review bag ↗</a></p></div></div>';
    return;
  }
  if (step === 2) {
    paymentPage();
    return;
  }
  main.innerHTML = `<div class="wrap">${checkoutHead(1)}<div class="checkout-layout"><form id="details-form"><fieldset class="form-section"><legend>Personal information</legend><div class="form-grid">${input("name", "Full name", 'autocomplete="name" maxlength="100"')}${input("phone", "Mobile number", 'type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[6-9][0-9]{9}" minlength="10" maxlength="10" title="10-digit Indian mobile number, starting with 6, 7, 8 or 9"')}${input("email", "Email address", 'type="email" autocomplete="email" maxlength="150"', false)}</div></fieldset><fieldset class="form-section"><legend>Delivery address</legend><div class="form-grid">${input("house", "House / flat number", 'autocomplete="address-line1" maxlength="200"')}${input("street", "Street / locality", 'autocomplete="address-line2" maxlength="200"')}${input("landmark", "Landmark", 'maxlength="200"', false)}${input("city", "City", 'autocomplete="address-level2" maxlength="100"')}<div class="field"><label for="state">State / union territory *</label><select id="state" name="state" autocomplete="address-level1" required><option value="">Select state or union territory</option>${STATES.map((s) => `<option ${customer.state === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>${input("pincode", "PIN code", 'inputmode="numeric" autocomplete="postal-code" pattern="[1-9][0-9]{5}" minlength="6" maxlength="6" title="Six-digit Indian PIN code, not starting with zero"')}</div></fieldset><p class="form-note">* Required. We use these details to process and deliver your order. <a class="text-link" href="#/privacy">Privacy information</a></p><div id="form-error" role="alert"></div><div class="form-actions"><a class="text-link" href="#/cart">← Back to bag</a><button class="button" type="submit">Next: summary & payment ↗</button></div></form><aside class="summary-card"><h2>Your collection</h2>${orderItems(cart)}<div class="legal-message">${priceTotals()}</div><p class="small muted">Review your details before paying in the next step.</p></aside></div></div>`;
  const form = document.querySelector("#details-form");
  const store = () => {
    customer = Object.fromEntries(new FormData(form).entries());
    persistCustomer();
  };
  form.addEventListener("input", store);
  form.addEventListener("change", store);
  form.onsubmit = (e) => {
    e.preventDefault();
    store();
    const error = validateCustomer(customer);
    if (error) {
      document.querySelector("#form-error").innerHTML =
        `<div class="notice error">${esc(error)}</div>`;
      return;
    }
    location.hash = "/checkout/payment";
  };
}
let turnstileId = null,
  turnstileToken = "";
async function mountTurnstile() {
  if (!CONFIG.turnstileSiteKey) return;
  try {
    if (!window.turnstile)
      await new Promise((resolve, reject) => {
        let s = document.querySelector("#turnstile-script");
        if (s) {
          s.addEventListener("load", resolve, { once: true });
          s.addEventListener("error", reject, { once: true });
          return;
        }
        s = document.createElement("script");
        s.id = "turnstile-script";
        s.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    if (!document.querySelector("#captcha")) return;
    turnstileId = window.turnstile.render("#captcha", {
      sitekey: CONFIG.turnstileSiteKey,
      action: "order",
      callback: (t) => {
        turnstileToken = t;
      },
      "expired-callback": () => {
        turnstileToken = "";
      },
      "error-callback": () => {
        turnstileToken = "";
      },
    });
  } catch {
    const el = document.querySelector("#captcha");
    if (el)
      el.textContent =
        "Verification could not load. Please reload before submitting.";
  }
}
function paymentPage() {
  if (validateCustomer(customer)) {
    location.hash = "/checkout";
    return;
  }
  turnstileToken = "";
  main.innerHTML = `<div class="wrap">${checkoutHead(2)}<div class="checkout-layout"><section><h2>Your order summary</h2>${orderItems(cart)}<div class="legal-message">${priceTotals()}</div><div class="delivery-review"><strong>Deliver to ${esc(customer.name)}</strong><p>${esc(customer.house)}, ${esc(customer.street)}${customer.landmark ? ", " + esc(customer.landmark) : ""}<br>${esc(customer.city)}, ${esc(customer.state)} – ${esc(customer.pincode)}<br>${esc(customer.phone)}${customer.email ? "<br>" + esc(customer.email) : ""}</p><a class="text-link" href="#/checkout">Edit customer details ↗</a></div><p class="small muted">Please check the amount and delivery details before you pay. This is a manual UPI payment; Fevlor will verify it separately.</p><a class="text-link" href="#/cart">← Back to bag</a></section><section><div class="qr-card"><div class="qr-head"><h3>Pay with UPI</h3><a class="download" href="./assets/upi-qr.jpeg" download="FEVLOR-UPI-QR.jpeg">Download QR Code ↓</a></div><img class="qr-image" src="./assets/upi-qr.jpeg" alt="Fevlor UPI payment QR code. Confirm the recipient in your UPI app before paying." width="622" height="622"><p class="small muted">Final payable amount</p><p class="pay-amount">${money(subtotal(cart))}</p><p>Scan the QR code using any UPI application to complete your payment.</p></div><p class="payment-notice">After completing your payment, click the Payment Done button below.</p><form id="payment-form"><div class="field"><label for="utr">UPI transaction reference / UTR (optional)</label><input id="utr" name="utr" maxlength="80" pattern="[A-Za-z0-9 /_-]{1,80}" autocomplete="off" aria-describedby="utr-help"><small class="muted" id="utr-help">A reference helps with manual review. Entering it does not verify payment.</small></div><div class="check-line"><input type="checkbox" id="paid" required><label for="paid">I confirm I have made the payment. I understand Fevlor will verify it manually, and that my invoice will be sent separately.</label></div><div class="check-line"><input type="checkbox" id="privacy-consent" required><label for="privacy-consent">I agree to share my order and delivery details with Fevlor, Google Sheets and FormSubmit for order processing. <a href="#/privacy" class="text-link">Privacy</a></label></div><div id="captcha" class="legal-message"></div><button class="button gold full" id="payment-done" type="submit">Payment Done ↗</button><div class="submission-status" id="submission-status" role="status" aria-live="polite"></div></form></section></div></div>`;
  document.querySelector("#payment-form").onsubmit = (e) => {
    e.preventDefault();
    if (CONFIG.turnstileSiteKey && !turnstileToken) {
      toast("Please complete the security verification.");
      return;
    }
    submitOrder();
  };
  mountTurnstile();
}
function setSubmitting(value) {
  submitting = value;
  document.querySelectorAll("#payment-done,#retry-order").forEach((b) => {
    b.disabled = value;
    b.innerHTML = value
      ? '<span class="spinner"></span> Saving your request…'
      : b.id === "retry-order"
        ? "Check request status ↗"
        : "Payment Done ↗";
  });
}
async function submitOrder() {
  if (submitting) return;
  const work = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      readPending();
      if (!pending) {
        const error = validateCustomer(customer);
        if (error) throw Error(error);
        if (!cart.length) throw Error("Your bag is empty.");
        const id = "FV-" + crypto.randomUUID().toUpperCase();
        pending = {
          action: "order",
          orderId: id,
          customer: { ...customer },
          items: cart.map((i) => ({
            productId: i.productId,
            name: i.name,
            image: i.image,
            size: i.size,
            frame: i.frame,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          expectedTotal: subtotal(cart),
          utr: (document.querySelector("#utr")?.value || "").trim(),
          paymentDeclared: true,
          consent: true,
        };
        if (!storage.setItem("fevlor.pending.v1", JSON.stringify(pending))) {
          storage.removeItem("fevlor.pending.v1");
          pending = null;
          throw Error(
            "Persistent browser storage is required for safe order retries. Enable storage, then try again.",
          );
        }
      }
      const data = await request({ ...pending, captchaToken: turnstileToken });
      if (data.status === "COMPLETE" && data.saved && data.emailAccepted) {
        receipt = { orderId: data.orderId, total: data.total };
        try {
          sessionStorage.setItem("fevlor.receipt.v1", JSON.stringify(receipt));
          sessionStorage.removeItem("fevlor.customer.v1");
        } catch {}
        storage.removeItem("fevlor.pending.v1");
        pending = null;
        customer = {};
        cart = [];
        saveCart();
        location.hash = "/success";
      } else if (data.saved) {
        pendingPage(data);
      } else
        throw Error(
          "The order has not been confirmed. Keep this order reference and check again. Do not pay twice.",
        );
    } catch (e) {
      if (e.notSaved) {
        storage.removeItem("fevlor.pending.v1");
        pending = null;
      }
      const target = document.querySelector("#submission-status");
      if (target)
        target.innerHTML = `<div class="notice error"><strong>Your request is not fully confirmed.</strong><p>${esc(e.message)}</p>${pending ? `<p>Order reference: ${esc(pending.orderId)}. Keep your bag and use “Check request status” to safely retry. Do not pay twice.</p><button class="button secondary" id="retry-order" type="button">Check request status ↗</button>` : "<p>No order was saved. Go back to your bag to refresh prices and review your selection. If you have already paid, contact Fevlor; do not pay again.</p>"}</div>`;
      const retry = document.querySelector("#retry-order");
      if (retry) retry.onclick = submitOrder;
    } finally {
      setSubmitting(false);
      if (window.turnstile && turnstileId !== null) {
        try {
          window.turnstile.reset(turnstileId);
        } catch {}
        turnstileToken = "";
      }
    }
  };
  if (navigator.locks)
    await navigator.locks.request("fevlor-order-submit", work);
  else await work();
}
function pendingPage(data) {
  if (!pending) {
    location.hash = "/cart";
    return;
  }
  main.innerHTML = `<div class="wrap"><header class="page-head"><span class="eyebrow">Your order reference is safe</span><h1>Let’s check your request.</h1></header><div class="checkout-layout"><section><div class="notice ${data?.saved ? "" : "error"}"><strong>${data?.saved ? "Your order is saved. The email notification is not confirmed." : "An order request needs confirmation."}</strong><p>${data?.saved ? "Fevlor has your order details in its order system. We cannot yet confirm the FormSubmit notification. This is not a payment verification. Please contact Fevlor using your order reference." : "A previous submission may have reached Fevlor. Check its status using the same reference below. This does not create another order."}</p><p>Do not pay again. Your bag is preserved until both required operations are confirmed.</p></div><div class="success-details"><span class="eyebrow">Order reference</span><b>${esc(pending.orderId)}</b><p class="price">${money(pending.expectedTotal)}</p></div><p class="small muted">If an email outcome is uncertain, Fevlor must review it before resending. Checking again here does not resend an uncertain notification.</p><p class="legal-message"><a class="text-link" href="mailto:${esc(CONFIG.contactEmail)}?subject=${encodeURIComponent("Order support: " + pending.orderId)}">Contact Fevlor ↗</a></p><button class="button" id="retry-order">Check request status ↗</button><div id="submission-status" class="submission-status" role="status" aria-live="polite"></div></section><aside class="summary-card"><h2>Your request</h2>${orderItems(pending.items)}<div class="legal-message">${priceTotals(pending.items)}</div><p class="small muted">Manual UPI payment · awaiting separate verification.</p></aside></div></div>`;
  document.querySelector("#retry-order").onclick = submitOrder;
}
function successPage() {
  if (!receipt) {
    notFound();
    return;
  }
  main.innerHTML = `<div class="wrap"><section class="success"><div class="success-icon">${icon("check")}</div><span class="eyebrow">A little closer to your walls</span><h1>Your request has been initiated!</h1><p>Thank you for choosing Fevlor. We've received your order details and will get in touch with you shortly.</p><div class="success-details"><span class="eyebrow">Order ID</span><b>${esc(receipt.orderId)}</b><p class="price">${money(receipt.total)}</p></div><p>Your invoice will be sent to you soon.</p><p class="small muted">Your payment confirmation has been submitted for manual review. This screen does not verify a UPI payment.</p><a class="button" href="#/shop">Continue Shopping ↗</a></section></div>`;
}
function aboutPage() {
  main.innerHTML = `<div class="wrap"><article class="prose"><span class="eyebrow">The Fevlor approach</span><h1>Made to live with.<br>Not just look at.</h1><p>A home is more than the things inside it. It's a feeling, a reflection of everything you love. Fevlor brings a curated collection of framed movie and series posters to the spaces that make life yours.</p><h2>A finishing touch, with feeling.</h2><p>A quiet statement in the bedroom. Fresh perspective in the workspace. A conversation in the living room. Choose the artwork that speaks to you.</p><h2>Considered from frame to doorstep.</h2><p>Our high-quality acrylic frames offer an elegant, durable finish. Every piece is carefully packed before dispatch, with free shipping across India.</p><p class="legal-message"><a class="button" href="#/shop">Explore the collection ↗</a></p></article></div>${benefits()}`;
}
function contactPage() {
  main.innerHTML = `<div class="wrap"><header class="page-head"><span class="eyebrow">A little help goes a long way</span><h1>We're all ears.</h1><p>Whether it's about a poster, your space or an order, we're just a message away.</p></header><div class="contact-grid"><section class="contact-block"><h2>A note to Fevlor.</h2><span class="eyebrow">Email</span><a class="text-link" href="mailto:${esc(CONFIG.contactEmail)}">${esc(CONFIG.contactEmail)} ↗</a>${CONFIG.contactPhone ? `<span class="eyebrow">Phone</span><p>${esc(CONFIG.contactPhone)}</p>` : ""}${CONFIG.businessAddress ? `<span class="eyebrow">Business address</span><p>${esc(CONFIG.businessAddress)}</p>` : ""}</section><section class="contact-block"><h2>About your order.</h2><p class="muted">Please include your order ID when you write to us. For a payment query, keep your UPI transaction reference handy.</p><p class="muted">Payments are checked manually. Your invoice will be sent separately after order processing.</p><p class="legal-message"><a class="text-link" href="#/delivery">Shipping & returns ↗</a></p></section></div></div>`;
}
function legalPage(type) {
  const delivery = `<span class="eyebrow">The details that matter</span><h1>Shipping & returns.</h1><h2>Shipping</h2><p>Shipping is free across India. Your artwork is carefully packed before dispatch.</p><p>${esc(CONFIG.deliveryPolicy || "Dispatch and delivery timelines are being finalised. Please contact Fevlor for current information before placing an order.")}</p><h2>Returns & cancellations</h2><p>${esc(CONFIG.returnsPolicy || "Our returns and cancellation policy is being finalised. Please contact Fevlor before ordering. Checkout should remain closed until the approved policy is published.")}</p><h2>Payment & invoices</h2><p>UPI payments are reviewed manually. Clicking Payment Done declares that you have made a payment; it does not verify payment. Your invoice will be sent separately after order processing.</p>`;
  const privacy = `<span class="eyebrow">Your information</span><h1>Privacy, clearly.</h1><p>We collect the name, phone number, optional email address, delivery address, order details and optional UPI reference that you provide, to process your order, contact you and arrange delivery.</p><h2>Where your information goes</h2><p>Order details are saved in Fevlor’s private Google Sheets order system through Google Apps Script and sent to Fevlor via FormSubmit email notification. These services process the information under their own terms. We do not collect your UPI PIN, bank password or card details.</p><h2>Saved on your device</h2><p>Your bag is stored in this browser’s local storage. Your address draft is held in session storage for this tab. If you submit an order, a pending request, including your customer details, is saved in local storage to make retries safe; it is removed after full confirmation. Avoid shared devices, and contact Fevlor if you need help removing a pending request after it is resolved.</p><h2>Questions or deletion requests</h2><p>Contact ${esc(CONFIG.contactEmail)} to ask about your information or request correction or deletion, subject to applicable record-keeping obligations. No marketing cookies or analytics are included in this website. If enabled, Cloudflare Turnstile is used to protect the order form from abuse.</p>`;
  main.innerHTML = `<div class="wrap"><article class="prose">${type === "delivery" ? delivery : privacy}<p class="legal-message"><a class="text-link" href="#/contact">Contact Fevlor ↗</a></p></article></div>`;
}
function notFound() {
  main.innerHTML =
    '<div class="wrap section"><div class="empty"><span class="eyebrow">A little off the wall</span><h1>We couldn’t find that page.</h1><p>The artwork may have moved, or the link may be incomplete.</p><a class="button" href="#/shop">Back to the collection ↗</a></div></div>';
}
async function render() {
  const version = ++renderVersion;
  const raw = location.hash.slice(1) || "/";
  const [path, qs = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  let name = parts[0] || "home";
  const params = new URLSearchParams(qs);
  document.title = `${{ home: "Art that feels like you.", shop: "The collection", categories: "The collections", cart: "Your bag", checkout: "Checkout", about: "Our approach", contact: "Contact", privacy: "Privacy", delivery: "Shipping & returns", success: "Your order request" }[name] || "Artwork"} — FEVLOR`;
  document.querySelector("#navigation").classList.remove("open");
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
  document.querySelectorAll("#navigation a").forEach((a) => {
    const active =
      (a.hash === "#/" && name === "home") || a.hash === `#/${name}`;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (window.turnstile && turnstileId !== null) {
    try {
      window.turnstile.remove(turnstileId);
    } catch {}
    turnstileId = null;
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  switch (name) {
    case "home":
      await home(version);
      break;
    case "shop":
      await shop(params, version);
      break;
    case "categories":
      await categories(version);
      break;
    case "product":
      try {
        await productPage(decodeURIComponent(parts[1] || ""), version);
      } catch {
        notFound();
      }
      break;
    case "cart":
      await cartPage(version);
      break;
    case "checkout":
      await checkout(version, parts[1] === "payment" ? 2 : 1);
      break;
    case "success":
      successPage();
      break;
    case "about":
      aboutPage();
      break;
    case "contact":
      contactPage();
      break;
    case "privacy":
      legalPage("privacy");
      break;
    case "delivery":
      legalPage("delivery");
      break;
    default:
      notFound();
  }
  if (version === renderVersion) main.focus({ preventScroll: true });
}
document.querySelector("#menu-toggle").onclick = () => {
  const nav = document.querySelector("#navigation");
  const open = nav.classList.toggle("open");
  const b = document.querySelector("#menu-toggle");
  b.setAttribute("aria-expanded", String(open));
  b.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelector("#navigation").classList.remove("open");
    document
      .querySelector("#menu-toggle")
      .setAttribute("aria-expanded", "false");
  }
});
main.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const p = products.find((p) => p.id === add.dataset.add);
    if (p) addToCart(p);
  }
  if (e.target.closest("[data-reload]")) {
    catalogLoaded = false;
    render();
  }
});
main.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img.tagName !== "IMG") return;
    if (img.closest(".thumbnail")) {
      img.closest(".thumbnail").hidden = true;
      return;
    }
    if (
      img.parentElement.classList.contains("square") &&
      !img.parentElement.querySelector(".image-fallback")
    ) {
      const fallback = document.createElement("span");
      fallback.className = "image-fallback";
      fallback.textContent = "Photograph temporarily unavailable";
      img.parentElement.append(fallback);
    }
  },
  true,
);
window.addEventListener("hashchange", render);
window.addEventListener("storage", (e) => {
  if (e.key === "fevlor.cart.v1") {
    cart = readCart(storage);
    updateBadge();
    if (location.hash.startsWith("#/cart")) render();
  }
  if (e.key === "fevlor.pending.v1") readPending();
});
footer();
updateBadge();
render();
