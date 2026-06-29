# Bloxgen Account Claimer

A Chrome extension (Manifest V3) that lets you **claim** a Bloxgen-generated Roblox
account in one click — it changes the account's password to one **only you** know, so
the account is no longer controlled by Bloxgen's stored credentials.

It uses the account's cookie and current password (both provided by Bloxgen) plus
Roblox's password-change API. **No auto-login, no captcha.**

> **Companion tools** (same Bloxgen page, coexist side by side):
> [Bloxgen Voice Checker](https://github.com/joe-jns/bloxgen-voice-checker) — check if voice chat is enabled (+ age group) ·
> [Bloxgen Discord bot](https://github.com/joe-jns/bloxgen-discord-bot) — generate & manage accounts from Discord.

---

## Table of contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [⚠️ Read this first](#️-read-this-first)
- [Requirements](#requirements)
- [Installation (step by step)](#installation-step-by-step)
- [Usage](#usage)
- [Use a dedicated Chrome profile](#use-a-dedicated-chrome-profile)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Disclaimer](#disclaimer)

---

## What it does

- Injects a **`Claim`** button on the latest-generated account card and a compact one in the
  **Password column** of every history row.
- Click it once → it turns red **`Confirm?`**; click again to actually change the password.
- On success the button turns green **`Claimed`** and the new password is **copied to your
  clipboard** as `username:newpassword` and **logged in the popup**. In history rows the new
  password is also shown **below the button**; the card stays button-only.
- **Already-claimed accounts show `Claimed` and can't be claimed again** — the state persists
  across reloads (cleared only if you clear the list in the popup).
- Popup → **Export all accounts (.txt)** downloads every account across all pages as
  `username:password:cookie`, for bulk password-changing with a Node script (see the
  companion `bloxgen-bulk-claimer` tool).
- Popup settings:
  - **Random (strong)** — generates a unique strong password per account (default).
  - **Fixed** — every claimed account gets the same password you type.
- Popup keeps a **Claimed accounts** list with **Copy all (user:pass)** and **Clear**.

---

## How it works

```
content.js  →  GET api.bloxgen.net/api/accounts/history     (cookie + current password)
background  →  set .ROBLOSECURITY on .roblox.com
            →  POST auth.roblox.com/v2/user/passwords/change (no token)  → 403 + x-csrf-token
            →  POST auth.roblox.com/v2/user/passwords/change (token + {currentPassword, newPassword}) → 200
            →  remove the cookie
```

---

## ⚠️ Read this first

- **Changing a password is irreversible.** If you lose the new password, you lose the account.
  The extension copies it to your clipboard, shows it inline, and logs it in the popup — but
  **export it somewhere safe** (popup → *Copy all*).
- Claiming an account usually **invalidates Bloxgen's stored cookie** and logs out other
  sessions. That's the point (you take ownership), but the account will no longer work through
  Bloxgen's buttons afterward.
- **Fixed password mode**: pick a strong one (min 8 chars) and don't include the username, or
  Roblox will reject it.

---

## Requirements

- **Google Chrome** (or any Chromium browser).
- A **Bloxgen account**, logged in, with generated accounts.

---

## Installation (step by step)

1. **Download the code** (git clone or *Download ZIP* → unzip).
2. Open `chrome://extensions`.
3. Toggle **Developer mode** ON (top-right).
4. Click **Load unpacked**.
5. Select the **`bloxgen-account-claimer`** folder (the one with `manifest.json`).
6. Done — no build step.

> Update later: pull/download new code, then click the **↻ reload** icon on the extension card.

---

## Usage

1. Open the popup (toolbar icon) and choose **Random** or **Fixed** (and set the fixed
   password if applicable).
2. Go to **https://bloxgen.net/dashboard/generator** (logged in).
3. On any account you like, click **`Claim`** → **`Confirm?`** → click again.
4. The new password appears inline and is copied as `username:newpassword`.
5. Back up your claims any time: popup → **Copy all (user:pass)**.

---

## Use a dedicated Chrome profile

The Roblox cookie (`.ROBLOSECURITY`) is **global to the Chrome profile**. The extension sets
it during a claim, then removes it. If you're signed in to **your own** Roblox account in the
same profile, this would disturb your session.

➡️ Use a **separate Chrome profile** (no personal Roblox session) for this extension.

---

## Troubleshooting

| Problem | Meaning / fix |
|---------|---------------|
| Button shows `Dead` | The account's cookie is expired/invalid — regenerate it on Bloxgen. |
| `Error` with a Roblox message | Roblox rejected the new password (too weak, contains username…). Change your fixed password. |
| `Roblox challenge required` | Roblox asked for a captcha on this account (rare). Skip it. |
| Buttons don't appear | Be on `bloxgen.net/dashboard/generator`, logged in; reload the page. |

---

## Project structure

```
bloxgen-account-claimer/
├── manifest.json        # MV3 manifest
├── background.js        # set cookie → CSRF → change password → clear cookie
├── content.js           # injects Claim buttons, generates passwords, logs claims
├── content.css          # button + result styles
├── popup.html / popup.js# mode (random/fixed) + claimed-accounts log
└── README.md
```

---

## Disclaimer

Only use this on accounts you own via your own Bloxgen account. It changes passwords on
accounts you control; it does not break into anything. Use it in accordance with Bloxgen's
and Roblox's terms of service. Provided as-is, for educational and personal use.
