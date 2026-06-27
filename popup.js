// Popup: password mode + fixed password + claimed-accounts log

const fixedPw = document.getElementById("fixedPw");
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
    const u = document.createElement("span");
    u.className = "u";
    u.textContent = a.username;
    const p = document.createElement("span");
    p.className = "p";
    p.textContent = a.password;
    row.appendChild(u);
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
