# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-25

### Added

- WHOOP membership through the official WHOOP Developer Platform API v2, with the user's own WHOOP app: OAuth 2.0 with the `offline` scope, an authorization code never sent twice, the access token renewed on its own and the rotating refresh token renewed one at a time and stored before use.
- One device per linked member: recovery and its zone, resting heart rate, HRV, blood oxygen, skin temperature, today's strain and calories, sleep performance, time asleep, sleep efficiency, breathing rate and the strain of the last workout.
- Scene triggers: recovery scored (filtered by zone), sleep or nap scored, workout scored (filtered by sport family), each fired once when WHOOP has scored it, never for old data at the first start or after a restart.
- Scene action "read the latest data", with 19 outputs (weight included) and a ready-made summary.
- Dashboard widgets: today with the recovery gauge and a sync button, last sleep, the last workouts with their strain, and the last seven days as a bar chart.
- Cloud transport: WHOOP read every 15 to 60 minutes on the integration's own timer, pause on 429 from the rate limit headers, back-off on errors, reconnection asked when WHOOP refuses the tokens, data kept in `/data`.
- Configuration actions: sync now, unlink the account (the access is revoked), and a diagnostic written to the Logs tab.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-whoop/releases/tag/v0.1.0
