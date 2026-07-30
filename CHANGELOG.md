# Changelog

All notable changes to **Bloxgen Account Claimer** are documented here.
Versioning follows [Semantic Versioning](https://semver.org/) and matches the
`version` field in `manifest.json`.

## [1.5.0] - 2026-07-30

### Fixed
- **Removed the incorrect `US ✕` label.** Claiming does **not** depend on the account's
  country. A live cookie from any region (UK, US, DZ…) returns `403 + x-csrf-token` on the
  password-change endpoint and the claim goes through. The old code misread a
  `401 without CSRF token` as a permanent "US / bound-auth-token" block — that response
  actually means the session is **invalid/expired or rate-limited**.

### Changed
- A `401`/`429` without a CSRF token is now treated as a **retryable** state: the button
  shows **`Retry`** (amber) instead of `US ✕`, and the background retries the CSRF prime
  once (1.2 s pause) before giving up.
- README: replaced the "Does not work on US accounts" section with "Region doesn't matter".

## [1.4.0] - 2026-07-13

### Fixed
- Re-anchored account-card injection after a Bloxgen dashboard redesign (the `Copy Cookie`
  button became icon-only); the card `Claim` button now anchors on a native text button.
- History `Claim` button now clones the native Bloxgen button style so it no longer looks
  bolted-on.

## [1.3.1] - 2026-07-08

### Fixed
- Enforce Roblox's 8-character minimum password: the random generator pads short results and
  the popup warns when prefix + length would be under 8.

## [1.3.0] - 2026-07-05

### Added
- Configurable random passwords: optional prefix, character set (letters / numbers /
  letters+numbers), and length for the random part.

## [1.2.0] - 2026-06-30

### Added
- Capture the account's Roblox age range (`<13`, `13-15`, `16-17`, `18-20`, `21+`) at claim
  time, while the cookie is still valid, and store/show it.
- Age range and account age (days old) included in exports
  (`username:password:ageGroup:accountAge`).

## [1.1.0] - 2026-06-28

### Added
- Bulk export of all accounts (all history pages) to a `.txt` file.
- New password shown inline after a claim (card + history row) and logged in the popup.

### Changed
- Popup restyled to match the Bloxgen site (light theme, red accent).
- Injection restricted to the generator route and the Generation History table only.

## [1.0.0] - 2026-06-27

### Added
- Initial release: one-click `Claim` button that changes a Bloxgen-generated Roblox
  account's password (random or fixed), copies `username:newpassword`, and logs claims in
  the popup.
