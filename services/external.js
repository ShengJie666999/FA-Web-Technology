// Wrappers for the three external third-party Web APIs.
//   1. Frankfurter  - currency exchange rates   (no API key)
//   2. Nager.Date   - Malaysian public holidays (no API key)
//   3. Resend       - transactional email       (API key in .env)
// Each wrapper normalizes the upstream payload into a small, stable shape.

const TIMEOUT_MS = 5000;

async function getJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Upstream ${new URL(url).host} responded with ${res.status}`);
  return res.json();
}

// ---- API 1: Frankfurter (cached for 1 hour to limit upstream calls) ----
let fxCache = { at: 0, data: null };

async function getRates(base = "MYR", symbols = ["USD", "SGD", "EUR"]) {
  if (fxCache.data && Date.now() - fxCache.at < 60 * 60 * 1000) return fxCache.data;
  const raw = await getJson(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${symbols.join(",")}`);
  fxCache = { at: Date.now(), data: { base: raw.base, date: raw.date, rates: raw.rates } };
  return fxCache.data;
}

// ---- API 2: Nager.Date ----
const holidayCache = new Map();

async function getHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const raw = await getJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/MY`);
  const data = raw.map(h => ({ date: h.date, name: h.name }));
  holidayCache.set(year, data);
  return data;
}

// Adds N business days to today, skipping weekends and Malaysian public holidays.
async function estimateDelivery(businessDays = 3) {
  const d = new Date();
  const holidays = new Set();
  for (const y of [d.getFullYear(), d.getFullYear() + 1]) {
    (await getHolidays(y)).forEach(h => holidays.add(h.date));
  }
  let added = 0;
  while (added < businessDays) {
    d.setDate(d.getDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (![0, 6].includes(d.getDay()) && !holidays.has(iso)) added++;
  }
  return d.toISOString().slice(0, 10);
}

// ---- API 3: Resend ----
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

async function sendOrderEmail({ to, name, orderId, total }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  return getJson("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to: [to],
      subject: `ShopFlow order #${orderId} confirmed`,
      html: `<p>Hi ${esc(name)}, thank you for your order!</p>
             <p>Order <b>#${orderId}</b> total: <b>RM ${Number(total).toFixed(2)}</b></p>`
    })
  });
}

module.exports = { getRates, getHolidays, estimateDelivery, sendOrderEmail };
