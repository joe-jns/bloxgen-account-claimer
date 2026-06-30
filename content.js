// Bloxgen Account Claimer - content script (bloxgen.net/dashboard/generator)
// Injects a "Claim" button on each account. One confirm click changes the Roblox
// password (random or a fixed password you configure), copies "user:newpass" to the
// clipboard, shows the new password inline, and logs it in the popup so it can't be lost.
//
// Classes/attributes are namespaced "bac-" so this can coexist with the Voice Checker
// extension on the same page.

(() => {
  "use strict";

  const HISTORY_URL =
    "https://api.bloxgen.net/api/accounts/history?page=1&limit=100";

  // --- State ----------------------------------------------------------------
  let accMap = {};           // username(lower) -> { cookie, password }
  let lastFetch = 0;
  let nativeBtnClass = "";
  let settings = { mode: "random", fixedPw: "" };
  let claimedSet = new Set(); // usernames(lower) already claimed
  let claimedPw = {};         // username(lower) -> new password

  chrome.storage.sync.get({ mode: "random", fixedPw: "" }, (v) => { settings = v; });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    if (ch.mode) settings.mode = ch.mode.newValue;
    if (ch.fixedPw) settings.fixedPw = ch.fixedPw.newValue;
  });

  // --- Bloxgen accounts -----------------------------------------------------
  async function refreshHistory() {
    const r = await fetch(HISTORY_URL, { credentials: "include", cache: "no-store" });
    const j = await r.json();
    const map = {};
    const list = (j && j.data && j.data.history) || [];
    for (const a of list) {
      if (a && a.username && a.cookie) {
        map[a.username.toLowerCase()] = { cookie: a.cookie, password: a.password || "" };
      }
    }
    accMap = map;
    lastFetch = Date.now();
  }

  async function getAccount(uname) {
    if (!(uname in accMap) || Date.now() - lastFetch > 15000) await refreshHistory();
    return accMap[uname];
  }

  // --- New password ---------------------------------------------------------
  function genPassword() {
    const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnopqrstuvwxyz",
          D = "23456789", S = "!@#$%*?";
    const all = U + L + D + S;
    const pick = (s) => s[Math.floor(Math.random() * s.length)];
    const p = [pick(U), pick(L), pick(D), pick(S)];
    for (let i = 0; i < 10; i++) p.push(pick(all));
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p.join("");
  }

  function newPasswordFor() {
    if (settings.mode === "fixed") {
      return (settings.fixedPw && settings.fixedPw.length >= 8) ? settings.fixedPw : null;
    }
    return genPassword();
  }

  // --- Status display -------------------------------------------------------
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  const BTN = {
    idle:    { bg: "#dc2626", label: "Claim" },      // red, like native buttons (exact color captured below)
    confirm: { bg: "#d97706", label: "Confirm?" },   // amber so it's clearly different from the red idle
    pending: { bg: "#6b7280", label: "Claiming..." },
    done:    { bg: "#059669", label: "Claimed" },
    dead:    { bg: "#ea580c", label: "Dead" },
    error:   { bg: "#6b7280", label: "Error" }
  };

  // Card: show the new password on its own line below the action bar, in OUR element
  // (the native Password field has a Bloxgen click handler that copies the OLD password).
  function showCardResult(wrap, pw) {
    const bar = wrap.parentElement;
    if (!bar || !bar.parentElement) return;
    const u = wrap.dataset.bacUser;
    let out = bar.parentElement.querySelector('.bac-card-out[data-bac-user="' + cssEsc(u) + '"]');
    if (!out) {
      out = document.createElement("div");
      out.className = "bac-card-out";
      out.dataset.bacUser = u;
      const stop = (e) => e.stopPropagation();
      out.addEventListener("click", stop);
      out.addEventListener("mousedown", stop);
      out.addEventListener("pointerdown", stop);
      bar.insertAdjacentElement("afterend", out);
    }
    out.innerHTML = "";
    const lbl = document.createElement("span");
    lbl.className = "bac-card-lbl";
    lbl.textContent = "New password: ";
    const val = document.createElement("span");
    val.className = "bac-card-val";
    val.textContent = pw;
    out.appendChild(lbl);
    out.appendChild(val);
    out.title = "New password (copied to clipboard)";
  }

  function removeCardResult(wrap) {
    document.querySelectorAll('.bac-card-out[data-bac-user="' + cssEsc(wrap.dataset.bacUser) + '"]')
      .forEach((el) => el.remove());
  }

  function setStatus(uname, state, result, title) {
    document.querySelectorAll('.bac-claim[data-bac-user="' + cssEsc(uname) + '"]').forEach((wrap) => {
      const btn = wrap.querySelector(".bac-claim-btn");
      const out = wrap.querySelector(".bac-claim-out");
      const b = BTN[state] || BTN.idle;
      btn.style.backgroundColor = b.bg;
      btn.textContent = b.label;
      btn.title = title || b.label;
      wrap.dataset.bacState = state;
      const compact = wrap.classList.contains("bac-compact");
      if (compact) {
        // History rows: new password shown BELOW the button, inside the wrap.
        if (out) {
          if (state === "done" && result) {
            out.textContent = result;
            out.style.display = "";
            out.title = "New password (copied)";
          } else {
            out.textContent = "";
            out.style.display = "none";
          }
        }
      } else {
        // Card: dedicated line below the action bar.
        if (out) out.style.display = "none";
        if (state === "done" && result) showCardResult(wrap, result);
        else removeCardResult(wrap);
      }
    });
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch (_) {}
  }

  function saveClaimed(username, userId, password) {
    chrome.storage.local.get({ claimed: [] }, (d) => {
      const list = (d.claimed || []).filter(
        (x) => x.username.toLowerCase() !== username.toLowerCase()
      );
      list.unshift({ username, userId, password, at: Date.now() });
      chrome.storage.local.set({ claimed: list });
    });
  }

  // --- Claim action ---------------------------------------------------------
  async function doClaim(username) {
    const uname = String(username).toLowerCase();
    if (claimedSet.has(uname)) {
      setStatus(uname, "done", claimedPw[uname] || "", "Already claimed");
      return;
    }
    const newPw = newPasswordFor();
    if (!newPw) {
      setStatus(uname, "error", null, "Set a fixed password (>= 8 chars) in the popup");
      return;
    }
    setStatus(uname, "pending");
    let acc;
    try { acc = await getAccount(uname); }
    catch (e) { setStatus(uname, "error", null, "Bloxgen API unreachable"); return; }
    if (!acc || !acc.cookie) { setStatus(uname, "error", null, "Account not found"); return; }
    if (!acc.password) { setStatus(uname, "error", null, "Current password missing"); return; }

    chrome.runtime.sendMessage({
      type: "CLAIM", cookie: acc.cookie,
      currentPassword: acc.password, newPassword: newPw
    }, async (res) => {
      if (chrome.runtime.lastError || !res) {
        setStatus(uname, "error", null, (chrome.runtime.lastError || {}).message || "No response");
        return;
      }
      if (res.ok && res.alive === false) { setStatus(uname, "dead", null, "Cookie dead - regenerate"); return; }
      if (res.ok && res.status === 200) {
        claimedSet.add(uname);
        claimedPw[uname] = newPw;
        await copy(username + ":" + newPw);
        saveClaimed(username, res.userId, newPw);
        setStatus(uname, "done", newPw, "New password (copied to clipboard)");
        return;
      }
      setStatus(uname, "error", null, res.error || "Failed");
    });
  }

  // --- Confirm-then-act button ----------------------------------------------
  function onClick(wrap, username) {
    const state = wrap.dataset.bacState;
    if (state === "confirm") {
      clearTimeout(wrap._t);
      doClaim(username);
    } else if (state === "done" || state === "pending") {
      // ignore re-clicks
    } else {
      setStatus(username.toLowerCase(), "confirm", null, "Click again to confirm password change");
      wrap._t = setTimeout(() => setStatus(username.toLowerCase(), "idle"), 3500);
    }
  }

  function makeClaimUI(username, compact) {
    const wrap = document.createElement("span");
    wrap.className = "bac-claim bac-el" + (compact ? " bac-compact" : "");
    wrap.dataset.bacUser = String(username).toLowerCase();
    wrap.dataset.bacState = "idle";

    // The Bloxgen Password cell copies the (old) password on click. Stop any click
    // inside our UI (button or the new-password text) from reaching that handler.
    const stop = (e) => e.stopPropagation();
    wrap.addEventListener("click", stop);
    wrap.addEventListener("mousedown", stop);
    wrap.addEventListener("pointerdown", stop);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = (compact ? "bac-fallback bac-compact-btn" : (nativeBtnClass || "bac-fallback")) + " bac-claim-btn";
    btn.style.backgroundColor = BTN.idle.bg;
    btn.style.color = "#ffffff";
    btn.style.borderColor = "transparent";
    btn.textContent = BTN.idle.label;
    btn.title = "Claim " + username + " (change its Roblox password)";
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      onClick(wrap, username);
    });

    const out = document.createElement("span");
    out.className = "bac-claim-out";
    out.style.display = "none";

    wrap.appendChild(btn);
    wrap.appendChild(out);
    return wrap;
  }

  function captureNativeClass() {
    if (nativeBtnClass) return;
    const ref = [...document.querySelectorAll("button")].find((b) => {
      const t = b.textContent.trim();
      return t === "Auto Cookie" || t === "Auto Login" || t === "Login";
    });
    if (ref) {
      nativeBtnClass = ref.className;
      try {
        const bg = getComputedStyle(ref).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") BTN.idle.bg = bg;
      } catch (_) {}
    }
  }

  // Show an already-claimed account directly as "Claimed" (non-actionable)
  function markIfClaimed(username) {
    const uname = String(username).toLowerCase();
    if (claimedSet.has(uname)) setStatus(uname, "done", claimedPw[uname] || "", "Already claimed");
  }

  // Re-sync every injected button with the current claimed list (e.g. after a claim,
  // or after the list is cleared from the popup)
  function refreshClaimedStates() {
    document.querySelectorAll(".bac-claim").forEach((wrap) => {
      const uname = wrap.dataset.bacUser;
      if (claimedSet.has(uname)) {
        if (wrap.dataset.bacState !== "done") setStatus(uname, "done", claimedPw[uname] || "", "Already claimed");
      } else if (wrap.dataset.bacState === "done") {
        setStatus(uname, "idle");
      }
    });
  }

  // --- Injection ------------------------------------------------------------
  function onGeneratorPage() {
    return /^\/dashboard\/generator/.test(location.pathname);
  }

  // The "Generation History" table specifically — NOT some other table on the page
  // (e.g. the pricing/plans comparison). Identified by its Username + Generated At headers.
  function findHistoryTable() {
    const tables = document.querySelectorAll("table");
    for (const t of tables) {
      const heads = [...t.querySelectorAll("th")].map((th) => th.textContent.trim().toLowerCase());
      if (heads.includes("username") && heads.includes("generated at")) return t;
    }
    return null;
  }

  function injectAll() {
    if (!onGeneratorPage()) return; // SPA: don't inject after navigating away
    captureNativeClass();

    const table = findHistoryTable();
    if (table) {
      table.querySelectorAll("tbody tr").forEach((row) => {
        if (!row.cells || row.cells.length < 3) return;
        const username = (row.cells[1].textContent || "").trim();
        if (!username) return;
        // Inject into the Password column (its logical home, and keeps the last
        // cell uncluttered). Compact so the row doesn't get long.
        const cell = row.cells[2];
        if (!cell.querySelector(".bac-el")) {
          cell.appendChild(makeClaimUI(username, true));
          markIfClaimed(username);
        }
      });
    }

    const copyBtn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Copy Cookie"
    );
    if (copyBtn) {
      let node = copyBtn, h3 = null, d = 0;
      while (node && d < 8) {
        h3 = node.querySelector ? node.querySelector("h3") : null;
        if (h3) break;
        node = node.parentElement; d++;
      }
      const username = h3 ? h3.textContent.trim() : null;
      const bar = copyBtn.parentElement;
      if (username && bar) {
        // Drop any stale "new password" line left from a previously shown account
        document.querySelectorAll(".bac-card-out").forEach((el) => {
          if (el.dataset.bacUser !== username.toLowerCase()) el.remove();
        });
        if (!bar.querySelector(".bac-el")) {
          bar.appendChild(makeClaimUI(username, false));
          markIfClaimed(username);
        }
      }
    }
  }

  let pending = null;
  function scheduleInject() {
    if (pending) return;
    pending = setTimeout(() => { pending = null; injectAll(); }, 300);
  }
  new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });

  // --- Bulk export ----------------------------------------------------------
  async function collectAllAccounts() {
    const accts = [];
    let page = 1;
    while (page <= 500) {
      const r = await fetch(
        "https://api.bloxgen.net/api/accounts/history?page=" + page + "&limit=100",
        { credentials: "include", cache: "no-store" }
      );
      const j = await r.json();
      const hist = (j && j.data && j.data.history) || [];
      for (const a of hist) {
        if (a.username && a.cookie && a.password) accts.push(a);
      }
      const pg = j && j.data && j.data.pagination;
      if (!pg || !pg.hasNextPage) break;
      page++;
    }
    return accts;
  }

  function downloadTxt(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Fast: user:pass:cookie
  async function exportAllAccounts() {
    const accts = await collectAllAccounts();
    const lines = accts.map((a) => a.username + ":" + a.password + ":" + a.cookie);
    downloadTxt("bloxgen-accounts.txt", lines.join("\n"));
    return { count: lines.length };
  }

  // Progress toast (for the slow age-group export)
  function showProgress(text) {
    let el = document.getElementById("bac-progress");
    if (!el) {
      el = document.createElement("div");
      el.id = "bac-progress";
      el.className = "bac-progress";
      document.body.appendChild(el);
    }
    el.textContent = text;
  }
  function hideProgress() {
    const el = document.getElementById("bac-progress");
    if (el) el.remove();
  }
  function sendBg(message) {
    return new Promise((resolve) =>
      chrome.runtime.sendMessage(message, (res) => resolve(chrome.runtime.lastError ? null : res))
    );
  }

  // Slow: user:pass:cookie:ageGroup (one Roblox call per account, serialized in the background)
  async function exportWithAgeGroup() {
    const accts = await collectAllAccounts();
    if (!accts.length) return { count: 0 };
    const lines = [];
    try {
      for (let i = 0; i < accts.length; i++) {
        const a = accts[i];
        showProgress("Fetching age groups… " + (i + 1) + "/" + accts.length);
        let age = "?";
        const res = await sendBg({ type: "GET_AGE_GROUP", cookie: a.cookie });
        if (res && res.ok) age = res.alive ? (res.ageGroup || "unknown") : "dead";
        lines.push(a.username + ":" + a.password + ":" + a.cookie + ":" + age);
      }
    } finally {
      hideProgress();
    }
    downloadTxt("bloxgen-accounts-age.txt", lines.join("\n"));
    return { count: lines.length };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "EXPORT_ALL") {
      exportAllAccounts().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
      return true; // async
    }
    if (msg && msg.type === "EXPORT_AGE") {
      exportWithAgeGroup().then(sendResponse).catch((e) => { hideProgress(); sendResponse({ error: String(e) }); });
      return true; // async
    }
  });

  // Load the claimed list first, then inject and sync states
  chrome.storage.local.get({ claimed: [] }, (d) => {
    const list = d.claimed || [];
    claimedSet = new Set(list.map((x) => x.username.toLowerCase()));
    claimedPw = {};
    list.forEach((x) => { claimedPw[x.username.toLowerCase()] = x.password; });
    injectAll();
    refreshClaimedStates();
  });

  // Keep buttons in sync if the claimed list changes (claim done, or cleared in popup)
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local" || !ch.claimed) return;
    const list = ch.claimed.newValue || [];
    claimedSet = new Set(list.map((x) => x.username.toLowerCase()));
    claimedPw = {};
    list.forEach((x) => { claimedPw[x.username.toLowerCase()] = x.password; });
    refreshClaimedStates();
  });
})();
