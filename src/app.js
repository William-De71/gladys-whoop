// -----------------------------------------------------------------------------
// The WHOOP integration: every handler, registered on a Gladys client.
//
// Brings the data of a WHOOP membership (through the official WHOOP
// Developer Platform API v2) into Gladys:
//   - device (device.js): one per linked member: recovery and its zone,
//     resting heart rate, HRV, SpO2, skin temperature, today's strain and
//     calories, the last sleep (performance, time asleep, efficiency,
//     breathing rate), the strain of the last workout;
//   - scene triggers (events.js): recovery scored (the member woke up),
//     sleep scored, workout scored;
//   - scene action: the latest values, for a message or a condition;
//   - dashboard widgets (widgets.js): today, sleep, workouts, last seven days.
//
// Sign-in: OAuth 2.0 with the user's own WHOOP app (credentials in the form
// body, `offline` scope for a refresh token). The integration exchanges the
// code itself (onOAuthCallback): Gladys only relays the redirect. A code is
// sent to WHOOP at most once. The access token lives about an hour; the
// refresh token ROTATES: one refresh at a time, and the new pair is stored
// before it is used (a lost refresh token means connecting again).
//
// WHOOP is read on the integration's own timer (every 15 to 60 minutes, four
// requests a reading, the body measurement twice a day), never on a Gladys
// poll: WHOOP's webhooks need a public HTTPS URL and a signature header
// Gladys Plus does not relay. Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  ACCOUNT_FIELD,
  AUTO_LANGUAGE,
  DEFAULT_TEXT_LANGUAGE,
  INTERNAL_KEYS,
  MAX_USED_CODES,
  normalizeConfig,
  readLanguage,
} from './config.js';
import { buildAuthorizeUrl, createWhoopClient, WhoopApiError } from './whoop-api.js';
import {
  parseCycle,
  parseRecovery,
  parseSleep,
  parseWorkout,
  parseBody,
  parseProfile,
  readList,
} from './whoop.js';
import { createStore, DEFAULT_PATH, KEEP } from './store.js';
import { buildDevice, buildStates, idsOf, userIdOfDevice } from './device.js';
import { detectEvents, actionOutputs } from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  buildTodayWidget,
  buildSleepWidget,
  buildWorkoutsWidget,
  buildWeekWidget,
  readWeekSettings,
} from './widgets.js';
import { MINUTE_MS, HOUR_MS, safeTimeZone, localDate, jitterOf } from './time.js';
import { t, all, LANGUAGES, shortTime, formatNumber, zoneLabel } from './i18n.js';

const ACTIONS = { REFRESH: 'refresh', DIAGNOSTIC: 'diagnostic', DISCONNECT: 'disconnect' };
const SCENE_ACTIONS = { GET_SUMMARY: 'get_summary' };
// After a failed reading: new tries, then the usual pace.
const RETRY_DELAYS_MIN = [5, 10, 20, 40];
// WHOOP said "too many requests": never sooner than this.
const RATE_LIMIT_DELAY_MIN = 15;
// A manual sync never reads again within this delay.
const REFRESH_MIN_INTERVAL_MS = 2 * MINUTE_MS;
// The body measurement changes rarely.
const BODY_EVERY_MS = 12 * HOUR_MS;
// The access token is renewed when it ends within this delay.
const TOKEN_MARGIN_MS = 2 * MINUTE_MS;
// Records read per collection and per reading (a week and a bit).
const READ_LIMIT = { cycles: 8, recoveries: 8, sleeps: 10, workouts: 10 };
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description A short, non-reversible fingerprint of an authorization code.
 * @param {string} code - The code.
 * @returns {string} 32 hexadecimal characters.
 */
const fingerprint = (code) => createHash('sha256').update(String(code)).digest('hex').slice(0, 32);

/**
 * @description A random OAuth state of exactly eight characters (WHOOP: "The
 * state parameter must be eight characters long").
 * @returns {string} Eight base64url characters (48 random bits).
 */
const newState = () => randomBytes(6).toString('base64url');

/**
 * @description Merge fresh records over the kept ones (by id), newest first.
 * @param {object[]} kept - The kept records.
 * @param {object[]} fresh - The records just read.
 * @param {number} max - How many to keep.
 * @param {Function} sortKey - `(record) => number`.
 * @returns {object[]} The records.
 */
function mergeById(kept, fresh, max, sortKey) {
  const byId = new Map(kept.map((record) => [record.id, record]));
  for (const record of fresh) {
    byId.set(record.id, record);
  }
  return [...byId.values()].sort((a, b) => (sortKey(b) ?? 0) - (sortKey(a) ?? 0)).slice(0, max);
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport to WHOOP (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of "today" (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timer (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = safeTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let auth = { ...config.token };
  let pendingAuth = { state: '', redirectUri: '' };
  let usedCodes = [];
  const inflight = new Map();
  let refreshing = null;
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = null;
  let createdDevices = new Set();
  let lastStatus = null;
  let lastDiscovery = null;
  let lastError = null;
  let endpointErrors = {};
  let failures = 0;
  let retryAt = null;
  let timer = null;
  let running = null;
  let stopped = false;

  const client = createWhoopClient({ now, ...(fetchFn ? { fetch: fetchFn } : {}) });
  const store = createStore({ path: storePath, logger });

  const today = () => localDate(now(), timeZone);
  const intervalMs = () => config.interval * MINUTE_MS;
  const linked = () => Boolean(auth.refreshToken && auth.userId);
  const connected = () => linked() && !auth.lost;
  const memberName = (lang) => store.data.name ?? t('deviceNameDefault', lang);
  const deviceId = () => (store.data.userId ? idsOf(gladys, store.data.userId).device : null);

  /**
   * @description Remember the language of a widget request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () =>
    config.language === AUTO_LANGUAGE ? (language ?? DEFAULT_TEXT_LANGUAGE) : config.language;

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} isConnected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(isConnected, message) {
    const signature = JSON.stringify([isConnected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(isConnected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Store the tokens and what goes with them (internal config
   * keys). The memory is updated first: a failed write keeps the new pair in
   * use until the next restart.
   * @param {object} next - `{ accessToken, refreshToken, expiresAt, userId, clientId, lost }`.
   * @returns {Promise<void>}
   */
  async function saveAuth(next) {
    auth = { ...next };
    await gladys.setConfig({
      [INTERNAL_KEYS.accessToken]: next.accessToken,
      [INTERNAL_KEYS.refreshToken]: next.refreshToken,
      [INTERNAL_KEYS.expiresAt]: next.expiresAt ? String(next.expiresAt) : '',
      [INTERNAL_KEYS.userId]: next.userId,
      [INTERNAL_KEYS.tokenClientId]: next.clientId,
      [INTERNAL_KEYS.lost]: next.lost ? 'true' : '',
    });
  }

  const NO_AUTH = {
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    userId: '',
    clientId: '',
    lost: false,
  };

  // --- Tokens ------------------------------------------------------------------------

  /**
   * @description Trade the refresh token for a new pair, and store it at once.
   * @returns {Promise<string>} The new access token.
   */
  async function renew() {
    if (!auth.refreshToken) {
      throw new WhoopApiError('grant', 'No refresh token: connect again');
    }
    const next = await client.refresh({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: auth.refreshToken,
    });
    // The old refresh token is dead from now on: keep the new one before
    // anything else can fail.
    await saveAuth({
      ...auth,
      accessToken: next.accessToken,
      refreshToken: next.refreshToken || auth.refreshToken,
      expiresAt: next.expiresAt,
      lost: false,
    }).catch((err) => logger.warn(`Unable to store the renewed token: ${err.message}`));
    logger.info('WHOOP access token renewed');
    return next.accessToken;
  }

  /**
   * @description A valid access token, renewed when it ends soon (or when
   * forced after a 401). One renewal at a time: two concurrent refreshes would
   * make WHOOP refuse the second one.
   * @param {object} [options] - `{ force }`.
   * @returns {Promise<string>} The access token.
   */
  function freshToken({ force = false } = {}) {
    if (!force && auth.accessToken && auth.expiresAt - now() > TOKEN_MARGIN_MS) {
      return Promise.resolve(auth.accessToken);
    }
    if (!refreshing) {
      refreshing = renew().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  /**
   * @description Run a request with a valid token; after a 401, renew once and
   * try again.
   * @param {Function} task - `async (token) => value`.
   * @returns {Promise<unknown>} Its result.
   */
  async function withToken(task) {
    const token = await freshToken();
    try {
      return await task(token);
    } catch (err) {
      if (err.kind !== 'unauthorized') {
        throw err;
      }
      return task(await freshToken({ force: true }));
    }
  }

  // --- Snapshot of the kept data -----------------------------------------------------

  /**
   * @description The latest values kept from WHOOP.
   * @returns {object} `{ cycle, recovery, sleep, workout, body }`.
   */
  function snapshot() {
    const { cycles, recoveries, sleeps, workouts, body } = store.data;
    const scored = (entry) => entry.state === 'SCORED';
    return {
      // The current day: its strain grows until the member sleeps.
      cycle: cycles[0] ?? null,
      recovery: recoveries.find(scored) ?? null,
      sleep: sleeps.find((sleep) => scored(sleep) && !sleep.nap) ?? null,
      workout: workouts.find(scored) ?? null,
      body,
    };
  }

  // --- Devices and states ------------------------------------------------------------

  /**
   * @description Offer the member device on the Discovery screen, when it changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} The count.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices =
      linked() && store.data.userId === auth.userId
        ? [
            buildDevice(
              gladys,
              { userId: store.data.userId, name: store.data.name },
              { language: textLanguage() },
            ),
          ]
        : [];
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description Publish the states of the created device (only the changed ones).
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const id = deviceId();
    if (!id || !createdDevices.has(id)) {
      return;
    }
    const states = buildStates(gladys, store.data.userId, snapshot(), textLanguage());
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: 6 * HOUR_MS });
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Ask every open widget to pull its content again.
   */
  function refreshWidgets() {
    for (const key of Object.values(WIDGETS)) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  // --- Reading -----------------------------------------------------------------------

  /**
   * @description When the next reading is due.
   * @returns {number} The instant, in ms.
   */
  const nextReading = () =>
    store.data.fetchedAt
      ? store.data.fetchedAt + intervalMs() + jitterOf(auth.userId || 'whoop')
      : now();

  /**
   * @description A one-line summary of the kept data, for a message.
   * @param {string} l - The language.
   * @returns {string} "recovery 72 % (green) · strain 8.4 · sleep 84 %".
   */
  function dataText(l) {
    const s = snapshot();
    const parts = [];
    if (s.recovery?.score != null) {
      parts.push(
        `${t('tileRecovery', l).toLowerCase()} ${s.recovery.score} % (${zoneLabel(s.recovery.zone, l).toLowerCase()})`,
      );
    }
    if (s.cycle?.strain != null) {
      parts.push(`${t('tileStrain', l).toLowerCase()} ${formatNumber(s.cycle.strain, l, 1)}`);
    }
    if (s.sleep?.performance != null) {
      parts.push(`${t('feature_sleep_performance', l).toLowerCase()} ${s.sleep.performance} %`);
    }
    return parts.join(' · ') || t('summaryNothing', l);
  }

  /**
   * @description The status message after a reading.
   * @returns {object} The multi-language message.
   */
  function connectedMessage() {
    const next = Math.min(nextReading(), retryAt ?? Infinity);
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        t('statusConnected', l, {
          name: memberName(l),
          time: store.data.fetchedAt ? shortTime(store.data.fetchedAt, l, timeZone) : '-',
          next: shortTime(next, l, timeZone),
        }),
      ]),
    );
  }

  /**
   * @description The multi-language message of a failed reading.
   * @param {Error} err - The error.
   * @param {number} minutes - Minutes before the next try.
   * @returns {object} The message.
   */
  function errorMessage(err, minutes) {
    switch (err.kind) {
      case 'rate_limited':
        return all('statusRateLimited', { minutes });
      case 'server':
        return all('statusServer', { status: err.status || '?', minutes });
      case 'refused':
      case 'invalid':
      case 'not_found':
        return all('statusRefused', { detail: String(err.message).slice(0, 100), minutes });
      default:
        return all('statusUnreachable', { detail: String(err.message).slice(0, 80), minutes });
    }
  }

  /**
   * @description The delay before the next try after a failed reading.
   * @param {Error} err - The error.
   * @returns {number} The delay, in ms.
   */
  function retryDelay(err) {
    const backoff = RETRY_DELAYS_MIN[Math.min(failures, RETRY_DELAYS_MIN.length) - 1] * MINUTE_MS;
    if (err.kind === 'rate_limited') {
      return Math.max(backoff, RATE_LIMIT_DELAY_MIN * MINUTE_MS, (err.retryAfter ?? 0) * 1000);
    }
    return backoff;
  }

  /**
   * @description WHOOP refused the tokens: stop until the user connects again.
   * @returns {Promise<void>}
   */
  async function tokenLost() {
    logger.warn('WHOOP refused the tokens: connect again');
    await saveAuth({ ...auth, lost: true }).catch((err) =>
      logger.warn(`Unable to store the token state: ${err.message}`),
    );
    retryAt = null;
    await reportStatus(false, all('statusReauth'));
    refreshWidgets();
  }

  /**
   * @description Read WHOOP once, publish everything.
   * @returns {Promise<boolean>} True when the reading went through.
   */
  async function round() {
    if (!config.clientId || !config.clientSecret) {
      await reportStatus(false, all('statusNoClient'));
      return false;
    }
    if (!linked()) {
      await reportStatus(false, all('statusNotConnected'));
      return false;
    }
    if (auth.lost) {
      await reportStatus(false, all('statusReauth'));
      return false;
    }
    if (store.data.userId !== auth.userId) {
      // Another WHOOP member: everything kept belongs to the previous one.
      store.reset(auth.userId);
      lastDiscovery = null;
    }
    const read = { recoveries: false, sleeps: false, workouts: false };
    const errors = {};

    /**
     * @description Run one endpoint; only the errors that concern every
     * endpoint (tokens, permissions, rate limit) stop the reading.
     * @param {string} name - The endpoint.
     * @param {Function} task - `async () => void`.
     * @returns {Promise<void>}
     */
    const step = async (name, task) => {
      try {
        await task();
      } catch (err) {
        if (['unauthorized', 'grant', 'forbidden', 'rate_limited'].includes(err.kind)) {
          throw err;
        }
        errors[name] = err;
        logger.warn(`WHOOP ${name}: ${err.kind ?? 'error'} ${err.message}`);
      }
    };
    const startOf = (record) => record.start;

    try {
      if (!store.data.name) {
        await step('profile', async () => {
          const profile = parseProfile(await withToken((token) => client.profile(token)));
          store.data.name = profile?.firstName ?? null;
        });
      }
      await step('cycles', async () => {
        const list = readList(
          await withToken((token) => client.cycles(token, { limit: READ_LIMIT.cycles })),
          parseCycle,
          startOf,
        );
        store.data.cycles = mergeById(store.data.cycles, list, KEEP.cycles, startOf);
      });
      await step('recovery', async () => {
        const list = readList(
          await withToken((token) => client.recoveries(token, { limit: READ_LIMIT.recoveries })),
          parseRecovery,
          (recovery) => recovery.createdAt,
        );
        store.data.recoveries = mergeById(
          store.data.recoveries,
          list,
          KEEP.recoveries,
          (recovery) => recovery.createdAt,
        );
        read.recoveries = true;
      });
      await step('sleep', async () => {
        const list = readList(
          await withToken((token) => client.sleeps(token, { limit: READ_LIMIT.sleeps })),
          parseSleep,
          startOf,
        );
        store.data.sleeps = mergeById(store.data.sleeps, list, KEEP.sleeps, startOf);
        read.sleeps = true;
      });
      await step('workout', async () => {
        const list = readList(
          await withToken((token) => client.workouts(token, { limit: READ_LIMIT.workouts })),
          parseWorkout,
          startOf,
        );
        store.data.workouts = mergeById(store.data.workouts, list, KEEP.workouts, startOf);
        read.workouts = true;
      });
      if (now() - store.data.bodyAt >= BODY_EVERY_MS) {
        await step('body', async () => {
          store.data.body = parseBody(await withToken((token) => client.body(token)));
          store.data.bodyAt = now();
        });
      }
    } catch (err) {
      await store.save();
      lastError = { at: now(), kind: err.kind ?? 'error', message: err.message };
      if (err.kind === 'unauthorized' || err.kind === 'grant') {
        await tokenLost();
        return false;
      }
      if (err.kind === 'forbidden') {
        failures = 0;
        retryAt = null;
        logger.warn('WHOOP refused a permission (403): connect again with every scope');
        await reportStatus(false, all('statusForbidden'));
        return false;
      }
      failures += 1;
      const delay = retryDelay(err);
      retryAt = now() + delay;
      logger.warn(`WHOOP reading stopped (${err.kind}): ${err.message}`);
      await reportStatus(false, errorMessage(err, Math.round(delay / MINUTE_MS)));
      return false;
    }

    endpointErrors = Object.fromEntries(
      Object.entries(errors).map(([name, err]) => [name, `${err.kind}: ${err.message}`]),
    );
    const anyRead = Object.values(read).some(Boolean) || !errors.cycles;
    if (!anyRead) {
      const first = Object.values(errors)[0];
      failures += 1;
      const delay = retryDelay(first);
      retryAt = now() + delay;
      lastError = { at: now(), kind: first.kind ?? 'error', message: first.message };
      await store.save();
      await reportStatus(false, errorMessage(first, Math.round(delay / MINUTE_MS)));
      return false;
    }

    failures = 0;
    retryAt = null;
    lastError = Object.keys(errors).length
      ? { at: now(), kind: 'partial', message: Object.keys(errors).join(', ') }
      : null;
    store.data.fetchedAt = now();
    const lang = textLanguage();
    const { events, seen, baseline } = detectEvents({
      read,
      data: store.data,
      now: now(),
      context: { member: deviceId(), memberName: memberName(lang), language: lang },
    });
    store.data.seen = seen;
    store.data.baseline = baseline;
    await store.save();
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Unable to fire ${event.key}: ${err.message}`);
      }
    }
    logger.info(
      `WHOOP read: ${events.length} scene event(s), ${Object.keys(errors).length} endpoint error(s), ${client.stats.count} request(s) today`,
    );
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the device: ${err.message}`),
    );
    await publishQuietly();
    refreshWidgets();
    await reportStatus(true, connectedMessage());
    return true;
  }

  /**
   * @description Run one reading at a time.
   * @returns {Promise<boolean>} The result of round().
   */
  function read() {
    if (!running) {
      running = round().finally(() => {
        running = null;
      });
    }
    return running;
  }

  // --- Timer -------------------------------------------------------------------------

  /**
   * @description Arm the timer for the next reading or retry.
   */
  function schedule() {
    if (!timers || stopped) {
      return;
    }
    clearTimeout(timer);
    timer = null;
    if (!connected()) {
      return;
    }
    const at = Math.min(nextReading(), retryAt ?? Infinity);
    timer = setTimeout(tick, Math.max(1000, at - now()));
    timer.unref?.();
  }

  /**
   * @description What the timer does when it fires.
   * @returns {Promise<void>}
   */
  async function tick() {
    try {
      await read();
    } catch (err) {
      logger.error('Timer', err);
    }
    schedule();
  }

  /**
   * @description Read when due (or now), then arm the timer.
   * @param {object} [options] - `{ force }`.
   * @returns {Promise<void>}
   */
  async function refreshAll({ force = false } = {}) {
    if (!force && connected() && store.data.fetchedAt && now() < nextReading()) {
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the device: ${err.message}`),
      );
      await publishQuietly();
      refreshWidgets();
      await reportStatus(true, connectedMessage());
    } else {
      await read();
    }
    schedule();
  }

  // --- OAuth2 ------------------------------------------------------------------------

  gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => {
    if (key !== ACCOUNT_FIELD) {
      throw new Error(`Unknown account field: ${key}`);
    }
    if (!config.clientId || !config.clientSecret) {
      throw new Error(t('statusNoClient', textLanguage()));
    }
    if (!redirectUri) {
      throw new Error('Gladys gave no redirect URI: update Gladys');
    }
    const state = newState();
    pendingAuth = { state, redirectUri };
    // Persisted: the container may restart between "Connect" and the return
    // from WHOOP (the memory alone would then refuse a valid answer).
    await gladys.setConfig({
      [INTERNAL_KEYS.oauthState]: state,
      [INTERNAL_KEYS.oauthRedirectUri]: redirectUri,
    });
    logger.info(`WHOOP authorization started (redirect URI ${redirectUri})`);
    return buildAuthorizeUrl({ clientId: config.clientId, redirectUri, state });
  });

  /**
   * @description The connection itself: check the state, burn the code, then
   * exchange it (once), read the member id and read.
   * @param {object} params - `{ code, state, redirectUri, hash }`.
   * @returns {Promise<void>}
   */
  async function connect({ code, state, redirectUri, hash }) {
    let expected = pendingAuth;
    if (!expected.state) {
      expected = normalizeConfig(await gladys.getConfig()).pendingAuth;
    }
    if (!expected.state || expected.state !== state) {
      lastStatus = null;
      await reportStatus(false, all('connectState'));
      throw new Error('OAuth state mismatch');
    }
    // Burn the code and the state BEFORE sending the code to WHOOP: a second
    // callback with the same code (a reload, a retry, a restart) never
    // reaches the token endpoint.
    usedCodes = [...usedCodes.filter((used) => used !== hash), hash].slice(-MAX_USED_CODES);
    pendingAuth = { state: '', redirectUri: '' };
    await gladys.setConfig({
      [INTERNAL_KEYS.usedCodes]: usedCodes.join(','),
      [INTERNAL_KEYS.oauthState]: '',
      [INTERNAL_KEYS.oauthRedirectUri]: '',
    });
    const token = await client.exchangeCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      // WHOOP wants the redirect URI of the authorization request.
      redirectUri: expected.redirectUri || redirectUri,
    });
    if (!token.refreshToken) {
      lastStatus = null;
      await reportStatus(false, all('connectNoRefresh'));
      throw new WhoopApiError('oauth', 'WHOOP sent no refresh token (offline scope missing)', {
        code: 'no_refresh_token',
      });
    }
    const profile = parseProfile(await client.profile(token.accessToken));
    if (!profile) {
      throw new WhoopApiError('oauth', 'WHOOP sent no member id', { code: 'no_user_id' });
    }
    stopTimer();
    await saveAuth({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      userId: profile.userId,
      clientId: config.clientId,
      lost: false,
    });
    logger.info('Connected to WHOOP');
    if (store.data.userId !== profile.userId) {
      store.reset(profile.userId);
    }
    store.data.name = profile.firstName;
    failures = 0;
    retryAt = null;
    lastStatus = null;
    lastDiscovery = null;
    // The connection succeeded even if this first reading fails: its status
    // says why.
    await read().catch((err) => logger.error('First reading', err));
    schedule();
  }

  gladys.onOAuthCallback(async (key, { code, state, redirectUri } = {}) => {
    if (key !== ACCOUNT_FIELD) {
      throw new Error(`Unknown account field: ${key}`);
    }
    if (typeof code !== 'string' || !code) {
      lastStatus = null;
      await reportStatus(false, all('connectFailed', { reason: 'no code' }));
      throw new Error('WHOOP sent no authorization code');
    }
    const hash = fingerprint(code);
    // The same callback twice at once: the second one waits for the first.
    if (inflight.has(hash)) {
      return inflight.get(hash);
    }
    if (usedCodes.includes(hash)) {
      if (connected()) {
        logger.info('Authorization code already exchanged: nothing to do');
        return undefined;
      }
      lastStatus = null;
      await reportStatus(false, all('connectCodeUsed'));
      throw new Error('This authorization code was already used');
    }
    const run = connect({ code, state, redirectUri, hash })
      .catch(async (err) => {
        // The SDK turns the exception into a refused connection without
        // logging it: say why here (never the code nor a token).
        logger.error(`WHOOP connection failed: ${err.message}`);
        if (err instanceof WhoopApiError && err.code !== 'no_refresh_token') {
          lastStatus = null;
          await reportStatus(false, all('connectFailed', { reason: err.code || err.kind }));
        }
        throw err;
      })
      .finally(() => {
        // Only while it runs: afterwards `usedCodes` answers a replay.
        inflight.delete(hash);
      });
    inflight.set(hash, run);
    return run;
  });

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description The message a widget shows instead of data, or null.
   * @param {string} lang - The language.
   * @returns {object|null} A content, or null when there is data to show.
   */
  function widgetProblem(lang) {
    if (!linked() || auth.lost) {
      return messageContent(t(auth.lost ? 'statusReauth' : 'widgetNotConnected', lang), 60);
    }
    if (!store.data.fetchedAt || store.data.userId !== auth.userId) {
      return messageContent(t('widgetNotRead', lang), 60);
    }
    return null;
  }

  const timing = () => ({ fetchedAt: store.data.fetchedAt, timeZone });

  gladys.onWidgetGet(WIDGETS.TODAY, async ({ language: lang }) => {
    rememberLanguage(lang);
    const s = snapshot();
    return (
      widgetProblem(lang) ??
      buildTodayWidget({
        name: memberName(lang),
        recovery: s.recovery,
        cycle: s.cycle,
        language: lang,
        ...timing(),
      })
    );
  });

  gladys.onWidgetAction(WIDGETS.TODAY, async (actionKey) => {
    if (actionKey !== WIDGET_ACTIONS.SYNC) {
      throw new Error(`Unknown action ${actionKey}`);
    }
    return syncNow();
  });

  gladys.onWidgetGet(WIDGETS.SLEEP, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildSleepWidget({ sleep: snapshot().sleep, language: lang, ...timing() })
    );
  });

  gladys.onWidgetGet(WIDGETS.WORKOUTS, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildWorkoutsWidget({
        workouts: store.data.workouts,
        cycle: snapshot().cycle,
        language: lang,
        ...timing(),
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.WEEK, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildWeekWidget({
        data: store.data,
        today: today(),
        metric: readWeekSettings(settings).metric,
        language: lang,
      })
    );
  });

  // --- Scene action ------------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.GET_SUMMARY, async (fields = {}) => {
    const wanted = userIdOfDevice(fields.member);
    if (fields.member && !wanted) {
      throw new Error(`Unknown WHOOP member: ${fields.member}`);
    }
    if (!store.data.userId || (wanted && wanted !== store.data.userId)) {
      throw new Error('No WHOOP data for this member: connect it and wait for a reading');
    }
    return actionOutputs(snapshot(), { language: textLanguage() });
  });

  // --- Configuration screen actions --------------------------------------------------

  /**
   * @description Read WHOOP now (configuration button or widget button).
   * @returns {Promise<object>} The multi-language message (≤ 200 characters).
   */
  async function syncNow() {
    if (!config.clientId || !config.clientSecret) {
      return all('statusNoClient');
    }
    if (!linked()) {
      return all('statusNotConnected');
    }
    if (auth.lost) {
      return all('statusReauth');
    }
    const fetchedAt = store.data.fetchedAt;
    if (fetchedAt && now() - fetchedAt < REFRESH_MIN_INTERVAL_MS && !lastError) {
      return all('refreshTooSoon', {
        minutes: Math.max(1, Math.round((now() - fetchedAt) / MINUTE_MS)),
      });
    }
    const ok = await read();
    schedule();
    if (!ok) {
      return lastStatus ? JSON.parse(lastStatus)[1] : all('statusNotConnected');
    }
    return Object.fromEntries(
      LANGUAGES.map((l) => [l, t('refreshDone', l, { summary: dataText(l) }).slice(0, 200)]),
    );
  }

  gladys.onAction(ACTIONS.REFRESH, syncNow);

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    // Gladys passes no DEBUG variable to the container: this writes an
    // anonymized summary in the logs instead. No token, no name, no code.
    const s = snapshot();
    const iso = (instant) => (instant ? new Date(instant).toISOString() : null);
    const report = {
      version: VERSION,
      node: process.version,
      timeZone: timeZone ?? null,
      today: today(),
      interval: config.interval,
      language: textLanguage(),
      client: {
        id: config.clientId ? `set (${config.clientId.length} characters)` : 'missing',
        secret: config.clientSecret ? 'set' : 'missing',
      },
      token: {
        access: Boolean(auth.accessToken),
        refresh: Boolean(auth.refreshToken),
        sameClient: !auth.clientId || auth.clientId === config.clientId,
        lost: auth.lost,
        expiresAt: iso(auth.expiresAt),
        member: auth.userId ? `…${auth.userId.slice(-3)}` : null,
      },
      pendingAuthorization: Boolean(pendingAuth.state),
      deviceCreated: Boolean(deviceId() && createdDevices.has(deviceId())),
      fetchedAt: iso(store.data.fetchedAt),
      nextReading: iso(nextReading()),
      retryAt: iso(retryAt),
      lastError,
      endpointErrors,
      requests: client.stats,
      kept: Object.fromEntries(
        ['cycles', 'recoveries', 'sleeps', 'workouts'].map((kind) => [
          kind,
          store.data[kind].map((entry) => `${entry.date ?? iso(entry.createdAt)} ${entry.state}`),
        ]),
      ),
      bodyAt: iso(store.data.bodyAt),
      latest: {
        recovery: s.recovery?.score ?? null,
        strain: s.cycle?.strain ?? null,
        sleepPerformance: s.sleep?.performance ?? null,
      },
      seen: Object.fromEntries(Object.entries(store.data.seen).map(([k, v]) => [k, v.length])),
      baseline: store.data.baseline,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `WHOOP diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  gladys.onAction(ACTIONS.DISCONNECT, async () => {
    stopTimer();
    if (linked() && !auth.lost) {
      try {
        await withToken((token) => client.revoke(token));
        logger.info('WHOOP access revoked');
      } catch (err) {
        logger.warn(`Unable to revoke the WHOOP access: ${err.message}`);
      }
    }
    await saveAuth(NO_AUTH);
    await store.save();
    lastStatus = null;
    await publishDiscoveredDevices(true).catch(() => {});
    await reportStatus(false, all('statusNotConnected'));
    refreshWidgets();
    return all('disconnected');
  });

  // --- Devices -----------------------------------------------------------------------

  gladys.onScanRequest(async () => {
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} WHOOP member(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = { ...normalizeConfig(fallback), token: config.token };
      }
      logger.error('Unable to read the configuration', err);
    }
    // A renewal in progress owns the tokens: never overwrite them with an
    // older copy read from the configuration.
    if (!refreshing) {
      auth = { ...config.token };
    }
    usedCodes = [...new Set([...usedCodes, ...config.usedCodes])].slice(-MAX_USED_CODES);
    if (config.pendingAuth.state && !pendingAuth.state) {
      pendingAuth = config.pendingAuth;
    }
  }

  /**
   * @description Forget tokens that belong to another WHOOP app.
   * @returns {Promise<void>}
   */
  async function dropForeignToken() {
    if (
      auth.refreshToken &&
      auth.clientId &&
      config.clientId &&
      auth.clientId !== config.clientId
    ) {
      logger.info('The stored tokens belong to another Client ID: connect again');
      await saveAuth(NO_AUTH).catch((err) =>
        logger.warn(`Unable to clear the tokens: ${err.message}`),
      );
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const before = JSON.stringify([config.clientId, config.clientSecret, config.interval]);
    await loadConfig(rawConfig);
    await dropForeignToken();
    const after = JSON.stringify([config.clientId, config.clientSecret, config.interval]);
    lastDiscovery = null;
    if (before !== after) {
      logger.info('Configuration updated');
      lastStatus = null;
      failures = 0;
      retryAt = null;
      await refreshAll();
    } else {
      // A language change only rewrites the texts.
      await publishDiscoveredDevices().catch(() => {});
      await publishQuietly();
    }
  });

  // --- Connection lifecycle ----------------------------------------------------------

  /** Stop the timer. */
  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }

  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await dropForeignToken();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await refreshAll();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    stopTimer();
  });

  return {
    store,
    client,
    read,
    tick,
    refreshAll,
    snapshot,
    getAuth: () => ({ ...auth }),
    getConfig: () => config,
    getRetryAt: () => retryAt,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  RETRY_DELAYS_MIN,
  RATE_LIMIT_DELAY_MIN,
  REFRESH_MIN_INTERVAL_MS,
  BODY_EVERY_MS,
  TOKEN_MARGIN_MS,
  READ_LIMIT,
  fingerprint,
  newState,
  mergeById,
};
