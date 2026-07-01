// Popup: bulk export + password mode + fixed password + claimed-accounts log

const exportClaimedBtn = document.getElementById("exportClaimed");
const exportAllLink = document.getElementById("exportAll");
const fixedPw = document.getElementById("fixedPw");

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

// Account age (how old the Roblox account is), in days, from the stored `created` date.
function accountAge(created) {
  if (!created) return "?";
  const t = Date.parse(created);
  if (Number.isNaN(t)) return "?";
  return Math.max(0, Math.floor((Date.now() - t) / 86400000)) + "d";
}

// Primary: export only the CLAIMED accounts -> username:password:ageGroup (from local log)
const CLAIMED_LABEL = "Export claimed accounts (.txt)";
exportClaimedBtn.addEventListener("click", () => {
  chrome.storage.local.get({ claimed: [] }, (d) => {
    const list = d.claimed || [];
    if (!list.length) {
      exportClaimedBtn.textContent = "No claimed accounts yet";
      setTimeout(() => (exportClaimedBtn.textContent = CLAIMED_LABEL), 1800);
      return;
    }
    const lines = list.map((a) => a.username + ":" + a.password + ":" + (a.ageGroup || "unknown") + ":" + accountAge(a.created));
    downloadTxt("bloxgen-claimed.txt", lines.join("\n"));
    exportClaimedBtn.textContent = "Exported " + lines.length + " claimed";
    setTimeout(() => (exportClaimedBtn.textContent = CLAIMED_LABEL), 2000);
  });
});

// Secondary: export ALL accounts as user:pass:age (needs the Bloxgen page; slow — one Roblox
// call per non-claimed account). Progress is shown on the page; it keeps going if the popup closes.
const ALL_LABEL = "or export all accounts (user:pass:age — slow)";
exportAllLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/bloxgen\.net\/dashboard\/generator/.test(tab.url || "")) {
    exportAllLink.textContent = "open the Generator page first";
    setTimeout(() => (exportAllLink.textContent = ALL_LABEL), 2000);
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "EXPORT_ALL" }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    exportAllLink.textContent = "exported " + res.count + " accounts";
    setTimeout(() => (exportAllLink.textContent = ALL_LABEL), 2500);
  });
  exportAllLink.textContent = "running on the page…";
});
const claimedEl = document.getElementById("claimed");
const countEl = document.getElementById("count");
const copyAllBtn = document.getElementById("copyAll");
const clearBtn = document.getElementById("clear");

// --- Settings ---------------------------------------------------------------
chrome.storage.sync.get({ mode: "random", fixedPw: "" }, (v) => {
  document.querySelector('input[name="mode"][value="' + v.mode + '"]').checked = true;
  fixedPw.value = v.fixedPw || "";
  fixedPw.disabled = v.mode !== "fixed";
});

document.querySelectorAll('input[name="mode"]').forEach((r) => {
  r.addEventListener("change", () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    fixedPw.disabled = mode !== "fixed";
    chrome.storage.sync.set({ mode });
  });
});

fixedPw.addEventListener("input", () => {
  chrome.storage.sync.set({ fixedPw: fixedPw.value });
});

// --- Claimed list -----------------------------------------------------------
function render(list) {
  claimedEl.innerHTML = "";
  countEl.textContent = list.length;
  for (const a of list) {
    const row = document.createElement("div");
    row.className = "item";
    const left = document.createElement("span");
    left.className = "left";
    const u = document.createElement("span");
    u.className = "u";
    u.textContent = a.username;
    left.appendChild(u);
    if (a.ageGroup) {
      const age = document.createElement("span");
      age.className = "age";
      age.textContent = a.ageGroup;
      left.appendChild(age);
    }
    const p = document.createElement("span");
    p.className = "p";
    p.textContent = a.password;
    row.appendChild(left);
    row.appendChild(p);
    claimedEl.appendChild(row);
  }
}

function load() {
  chrome.storage.local.get({ claimed: [] }, (d) => render(d.claimed || []));
}

copyAllBtn.addEventListener("click", () => {
  chrome.storage.local.get({ claimed: [] }, async (d) => {
    const text = (d.claimed || []).map((a) => a.username + ":" + a.password).join("\n");
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    copyAllBtn.textContent = "Copied!";
    setTimeout(() => (copyAllBtn.textContent = "Copy all (user:pass)"), 1500);
  });
});

clearBtn.addEventListener("click", () => {
  clearBtn.textContent = "Sure?";
  if (clearBtn.dataset.armed) {
    chrome.storage.local.set({ claimed: [] });
    delete clearBtn.dataset.armed;
    clearBtn.textContent = "Clear";
  } else {
    clearBtn.dataset.armed = "1";
    setTimeout(() => { delete clearBtn.dataset.armed; clearBtn.textContent = "Clear"; }, 3000);
  }
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.claimed) render(ch.claimed.newValue || []);
});

load();
