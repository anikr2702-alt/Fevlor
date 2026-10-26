export const SIZES = { A5: "15 × 21 cm", A4: "21 × 30 cm", A3: "30 × 42 cm" };
export const FRAMES = ["Black Frame", "Brown Frame"];
export const STATES = [
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
export const money = (p) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: p % 100 ? 2 : 0,
  }).format(p / 100);
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
};
export const cartKey = (i) => JSON.stringify([i.productId, i.size, i.frame]);
export function normalizeProducts(rows) {
  const ids = new Set();
  return (Array.isArray(rows) ? rows : [])
    .filter((p) => {
      if (
        !p ||
        typeof p.id !== "string" ||
        !p.id.trim() ||
        ids.has(p.id) ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        !p.category ||
        !safeUrl(p.images?.[0]) ||
        !Object.keys(SIZES).every(
          (s) =>
            Number.isSafeInteger(p.prices?.[s]) &&
            p.prices[s] > 0 &&
            p.prices[s] <= 100000000,
        )
      )
        return false;
      ids.add(p.id);
      return true;
    })
    .map((p) => ({
      ...p,
      images: p.images.map(safeUrl).filter(Boolean).slice(0, 3),
    }));
}
export function filterProducts(
  products,
  { query = "", category = "", subcategory = "", sort = "sheet" } = {},
) {
  const q = query.trim().toLowerCase();
  const result = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!subcategory || p.subcategory === subcategory) &&
      (!q ||
        `${p.name} ${p.category} ${p.subcategory}`.toLowerCase().includes(q)),
  );
  if (sort === "low")
    result.sort(
      (a, b) =>
        Math.min(...Object.values(a.prices)) -
        Math.min(...Object.values(b.prices)),
    );
  if (sort === "high")
    result.sort(
      (a, b) =>
        Math.min(...Object.values(b.prices)) -
        Math.min(...Object.values(a.prices)),
    );
  return result;
}
export function addItem(cart, product, size, frame, quantity = 1) {
  if (
    !SIZES[size] ||
    !FRAMES.includes(frame) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 99
  )
    throw Error("Choose a valid size, frame and quantity.");
  const next = cart.map((i) => ({ ...i }));
  const item = {
    productId: product.id,
    name: product.name,
    image: product.images[0],
    size,
    frame,
    quantity,
    unitPrice: product.prices[size],
  };
  const existing = next.find((i) => cartKey(i) === cartKey(item));
  if (existing) {
    if (existing.quantity + quantity > 99)
      throw Error("Maximum quantity is 99 per selection.");
    existing.quantity += quantity;
    existing.unitPrice = item.unitPrice;
  } else next.push(item);
  return next;
}
export const subtotal = (cart) =>
  cart.reduce((n, i) => n + i.unitPrice * i.quantity, 0);
export function reconcile(cart, products) {
  return cart.map((i) => {
    const p = products.find((p) => p.id === i.productId);
    return p &&
      SIZES[i.size] &&
      FRAMES.includes(i.frame) &&
      Number.isInteger(i.quantity) &&
      i.quantity >= 1 &&
      i.quantity <= 99
      ? {
          ...i,
          name: p.name,
          image: p.images[0],
          unitPrice: p.prices[i.size],
          unavailable: false,
        }
      : { ...i, unavailable: true };
  });
}
export function validateCustomer(c) {
  if (!c || !c.name?.trim() || c.name.trim().length > 100)
    return "Enter your full name (up to 100 characters).";
  if (!/^[6-9]\d{9}$/.test(c.phone || ""))
    return "Enter a valid 10-digit Indian mobile number.";
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
    return "Enter a valid email address.";
  for (const f of ["house", "street", "city"])
    if (!c[f]?.trim() || c[f].length > 200)
      return "Complete your house/flat, street/locality and city.";
  if (!STATES.includes(c.state)) return "Select your state or union territory.";
  if (!/^[1-9]\d{5}$/.test(c.pincode || ""))
    return "Enter a valid six-digit Indian PIN code.";
  return "";
}
export function readCart(storage) {
  try {
    const c = JSON.parse(storage.getItem("fevlor.cart.v1") || "[]");
    return Array.isArray(c)
      ? c
          .filter(
            (i) =>
              i &&
              typeof i.productId === "string" &&
              SIZES[i.size] &&
              FRAMES.includes(i.frame) &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0 &&
              i.quantity <= 99 &&
              Number.isSafeInteger(i.unitPrice) &&
              i.unitPrice > 0,
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
