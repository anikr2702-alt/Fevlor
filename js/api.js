import { CONFIG } from "./config.js";
export async function request(payload) {
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(
      CONFIG.apiUrl,
    )
  )
    throw Error(
      "The live store is not connected yet. Please contact Fevlor or try again later.",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(
      payload ? CONFIG.apiUrl : `${CONFIG.apiUrl}?action=products`,
      {
        method: payload ? "POST" : "GET",
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        ...(payload
          ? {
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(payload),
            }
          : {}),
      },
    );
    if (!response.ok)
      throw Error("The store could not be reached. Please try again.");
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error(
        "The store returned an unreadable response. Please contact Fevlor.",
      );
    }
    if (!data.ok) {
      const error = Error(
        data.message || "The request could not be completed. Please retry.",
      );
      error.notSaved = data.notSaved === true;
      throw error;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError")
      throw Error(
        "The connection timed out. Your request may have reached us. Use the same order reference to check again; do not pay twice.",
      );
    if (e.name === "TypeError")
      throw Error(
        "We could not reach the order service. Check your connection and retry with the same order reference. Do not pay twice.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
