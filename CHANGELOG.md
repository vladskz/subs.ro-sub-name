# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Vercel serverless deployment support (`api/index.js` + `vercel.json` rewrites).
- Bilingual (RO/EN) free Vercel hosting instructions in the README.
- API key validation now returns a reason (`invalid_key`, `network_error`, `cloudflare_challenge`).

### Changed

- `server.js` now exports the Express app and only starts `app.listen()` when run directly.
- Subtitle proxy base URLs now use the incoming request host instead of the hardcoded BeamUp host.
- Upstream subs.ro API calls switched from `api.subs.ro` to `subs.ro/api/v1.0`.
- Subtitle `lang` now embeds the language name plus the format tag (e.g. `Romanian 🇷🇴 BluRay`) so Stremio shows the label while Nuvio can still normalize it to a valid language code.

### Fixed

- Fixed a double-slash URL bug (`/v1.0//quota` → `/v1.0/quota`).
- Rate limiter now self-schedules queue processing so it works on serverless platforms where intervals are frozen.
- Configure page now URL-encodes the API key and shows "Network error" separately from "Invalid key".

## [1.6.0]

- Initial subs.ro subtitles addon for Stremio.
