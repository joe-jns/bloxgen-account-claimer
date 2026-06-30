// Bloxgen Account Claimer - service worker
// Changes a Roblox account's password (= takes ownership) using its .ROBLOSECURITY
// cookie + current password. Serialized because the cookie store is global to the
// profile.
//
// Flow (validated by recon, no captcha for fresh alt accounts):
//   set cookie
//   POST /v2/user/passwords/change (no token)  -> 403 + x-csrf-token header
//   POST /v2/user/passwords/change (with token + {currentPassword,newPassword}) -> 200
//   clear cookie

const ROBLOX_URL = "https://www.roblox.com/";
const COOKIE_NAME = ".ROBLOSECURITY";
const CHANGE_URL = "https://auth.roblox.com/v2/user/passwords/change";
const AGE_GROUP_URL = "https://apis.roblox.com/user-settings-api/v1/account-insights/age-group";

// Map Roblox age-group translation keys to a short label.
//   Label.AgeGroupOver21 -> 21+   Label.AgeGroup18To20 -> 18-20   Label.AgeGroupUnder13 -> <13
function ageGroupLabel(key) {
  if (!key) return null;
  const m = String(key).replace("Label.AgeGroup", "");
  if (m.startsWith("Over")) return m.slice(4) + "+";
  if (m.startsWith("Under")) return "<" + m.slice(5);
  const r = m.match(/^(\d+)To(\d+)$/);
  if (r) return r[1] + "-" + r[2];
  return m;
}

// --- Queue: one claim at a time ---------------------------------------------
let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

async function setCookie(value) {
  await chrome.cookies.set({
    url: ROBLOX_URL,
    name: COOKIE_NAME,
    value: value,
    domain: ".roblox.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "no_restriction",
    expirationDate: Math.floor(Date.now() / 1000) + 3600
  });
}

async function clearCookie() {
  try { await chrome.cookies.remove({ url: ROBLOX_URL, name: COOKIE_NAME }); } catch (_) {}
}

async function claim(cookie, currentPassword, newPassword) {
  await setCookie(cookie);
  try {
    // Cookie alive? (also gives userId / name)
    const meRes = await fetch("https://users.roblox.com/v1/users/authenticated", {
      credentials: "include", cache: "no-store"
    });
    if (meRes.status === 401 || meRes.status === 403) return { ok: true, alive: false };
    if (!meRes.ok) return { ok: false, error: "auth HTTP " + meRes.status };
    const me = await meRes.json();

    // Grab the age range NOW, while the cookie is still valid — the password change
    // below signs the session out, so this is our only chance to read it.
    let ageGroup = null;
    try {
      const aRes = await fetch(AGE_GROUP_URL, { credentials: "include", cache: "no-store" });
      if (aRes.ok) { const a = await aRes.json(); ageGroup = ageGroupLabel(a.ageGroupTranslationKey); }
    } catch (_) {}

    const body = JSON.stringify({ currentPassword, newPassword });

    // 1) Prime the CSRF token (no token -> 403 with x-csrf-token header; nothing changes)
    const probe = await fetch(CHANGE_URL, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" }, body
    });
    const csrf = probe.headers.get("x-csrf-token");
    if (!csrf) return { ok: false, error: "no CSRF token (HTTP " + probe.status + ")", userId: me.id, name: me.name };

    // 2) Real password change
    const res = await fetch(CHANGE_URL, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrf }, body
    });

    const challengeType = res.headers.get("rblx-challenge-type");
    const text = await res.text();

    if (res.status === 200) {
      return { ok: true, alive: true, status: 200, ageGroup: ageGroup, userId: me.id, name: me.name };
    }
    if (challengeType) {
      return { ok: false, status: res.status, error: "Roblox challenge required (" + challengeType + ")", userId: me.id, name: me.name };
    }
    // 400 = validation error (weak password, contains username, etc.)
    let msg = "HTTP " + res.status;
    try {
      const j = JSON.parse(text);
      if (j && j.errors && j.errors[0] && j.errors[0].message) msg = j.errors[0].message;
    } catch (_) {}
    return { ok: false, status: res.status, error: msg, userId: me.id, name: me.name };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    await clearCookie();
  }
}

// Read-only: fetch the Roblox age range for one account's cookie (no password change).
async function fetchAgeGroup(cookie) {
  await setCookie(cookie);
  try {
    let res;
    for (let t = 0; t <= 4; t++) {
      res = await fetch(AGE_GROUP_URL, { credentials: "include", cache: "no-store" });
      if (res.status !== 429) break;
      const ra = parseFloat(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, (ra > 0 ? ra * 1000 : 1500 * (t + 1)) + Math.random() * 400));
    }
    if (res.status === 401 || res.status === 403) return { ok: true, alive: false };
    if (!res.ok) return { ok: false, error: "HTTP " + res.status };
    const j = await res.json();
    return { ok: true, alive: true, ageGroup: ageGroupLabel(j.ageGroupTranslationKey) };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    await clearCookie();
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "CLAIM" &&
      typeof msg.cookie === "string" &&
      typeof msg.currentPassword === "string" &&
      typeof msg.newPassword === "string") {
    enqueue(() => claim(msg.cookie, msg.currentPassword, msg.newPassword)).then(sendResponse);
    return true; // async response
  }
  if (msg && msg.type === "GET_AGE_GROUP" && typeof msg.cookie === "string") {
    enqueue(() => fetchAgeGroup(msg.cookie)).then(sendResponse);
    return true; // async response
  }
});
