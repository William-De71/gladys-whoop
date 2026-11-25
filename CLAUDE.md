# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for WHOOP: a Node.js service (Node
22+, ESM, no build step) that runs in its own sandboxed Docker container and
talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the **official WHOOP Developer Platform
API v2** (https://developer.whoop.com) with the **user's own WHOOP app**
(created on https://developer-dashboard.whoop.com), every 15 to 60 minutes on
its own timer, and keeps the last records in `/data`. Transport: cloud only.
Never tested with a real WHOOP account: every answer shape comes from the API
reference (read on 2026-11-25).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(): OAuth2
                        (authorize URL, callback, code exchange once), the
                        token renewal (one at a time, stored before use), the
                        reading round and its errors, timer, widgets, actions
src/whoop-api.js        API client: authorization URL, token exchange and
                        refresh (credentials in the form body), Bearer
                        requests, one at a time, error kinds, X-RateLimit-*
src/whoop.js            the answers read into records (score only when
                        SCORED, local dates from timezone_offset, zones,
                        sport families)
src/store.js            /data/whoop.json: member, last records, `seen`, `baseline`
src/events.js           trigger transitions, payloads, scene action outputs
src/device.js           one device per member, its features and states
src/widgets.js          today, sleep, workouts and week widgets
src/config.js           configuration and internal keys (tokens, OAuth state,
                        fingerprints of the codes already exchanged)
src/time.js             local days in the TZ of Gladys, jitter
src/i18n.js             runtime texts, zones, sport names, en/fr/de/es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/helpers/           made-up answers shaped like the API reference, a fake WHOOP
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **The refresh token rotates.** Each refresh answers a new pair and kills
  the old refresh token; of two concurrent refreshes WHOOP refuses the second.
  `freshToken()` runs one renewal at a time (`refreshing`), and `renew()`
  stores the new pair (`saveAuth`) before anything uses it. Never refresh
  outside `freshToken()`, never read the tokens back from the configuration
  while a renewal runs (`loadConfig`), and keep the tests of
  `test/app.test.js` that count the refreshes.
- **Never send an authorization code twice.** The callback checks the state,
  stores the fingerprint of the code and clears the state BEFORE calling the
  token endpoint; a concurrent callback waits for the first one; a known
  fingerprint never reaches WHOOP.
- **The OAuth `state` is exactly eight characters** ("The state parameter must
  be eight characters long"): `newState()`.
- **Tokens**: the access token lasts about an hour and is renewed two minutes
  before its end, or after a 401 (once). A refused refresh (`grant`) or a 401
  after renewal is final: `token_lost` is stored, the status asks to connect
  again, nothing is requested until then. No refresh token at the connection
  (`offline` refused) refuses the connection. Tokens and OAuth state live in
  internal config keys (`INTERNAL_KEYS`), never in `/data`, never in the
  logs. The basic profile is read for the user id and the first name only:
  never keep the e-mail address nor the last name.
- **External ids are forever**, and so is every key users store: the device
  (`member:<WHOOP user id>`, never a name), the feature keys of `FEATURES` in
  `src/device.js` and their `category` / `type` / `unit` / `min` / `max`, the
  keys of `config_schema`, `actions`, the widgets and their settings, the
  scene triggers (fields, options, variables) and the scene action (fields,
  outputs). `test/structure.test.js` compares them to a baseline: never update
  the baseline to make a test pass without a documented migration.
- **Category / type pairs** come from the SDK constants: percentages
  `level-sensor/decimal` %, counts without a Gladys unit (bpm, kcal)
  `counter-sensor/integer` without unit, HRV `duration/decimal` ms, skin
  temperature `temperature-sensor/decimal` °C, strain and breathing rate
  `level-sensor/decimal` without unit, time asleep `duration/decimal` hours,
  the zone `text/text`. No weight feature (no mass unit).
- **Only scored values.** `score` is read only when `score_state` is SCORED;
  a feature keeps its last value until the next score.
- **Be gentle with WHOOP.** One reading = four requests (the profile once,
  the body measurement twice a day), never a request per widget, per scene
  action or per tick. At least 15 minutes after a 429 (or X-RateLimit-Reset
  when longer), back-off on other errors. Webhooks are not used (they need a
  public HTTPS URL and a signature header Gladys Plus does not relay): do not
  add them without a way to verify them.
- **Events once.** `seen` and `baseline` (in /data) per kind; the first
  successful reading of a kind is a baseline; records ended more than two
  days ago are only remembered; five workouts per reading at most; a
  PENDING_SCORE record is announced when it gets its score. A scene action or
  a widget never fires an event. Every event carries exactly the variables of
  its trigger in the manifest (`test/events.test.js`).
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. German says "du", Spanish "usted".
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB; at most 20 scene action outputs. No `countries`, no permission, no
  webhook. Transport: `["cloud"]`. `gladys_version` `>=5.3.0`. The WHOOP logo
  names the service only; keep the "not affiliated" notices.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (a fake `fetch` at most).

## Pitfalls

- OAuth lives under `https://api.prod.whoop.com/oauth/oauth2/…`, the data
  under `https://api.prod.whoop.com/developer/v2/…`.
- The docs send `client_id` and `client_secret` in the token request body
  (no Basic header); PKCE is not documented.
- `limit` is at most 25 per page; lists are `{ records, next_token }`,
  newest first. Recovery has no id of its own: its sleep (UUID) is its key.
- Cycle ids are int64, sleep and workout ids UUIDs. `sport_id` is legacy:
  read `sport_name` (the reference sample even contradicts its own table).
- SpO2 and skin temperature exist from WHOOP 4.0 on: they may be absent.
- The Sandbox tier of an app accepts 10 members; more needs a request on the
  dashboard.
- `node --test` also runs `test/helpers/`: nothing starts on import.
