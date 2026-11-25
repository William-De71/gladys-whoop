// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake WHOOP (test/helpers/fakes.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  RATE_LIMIT_DELAY_MIN,
  REFRESH_MIN_INTERVAL_MS,
  READ_LIMIT,
  fingerprint,
} from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS, ACTION_OUTPUTS } from '../src/events.js';
import { INTERNAL_KEYS } from '../src/config.js';
import { SCOPES } from '../src/whoop-api.js';
import { MINUTE_MS, HOUR_MS } from '../src/time.js';
import { NOW, TZ, USER_ID, OFFSET, at, uuid } from './helpers/whoop-data.js';
import { CLIENT, CONFIG, REDIRECT, silent, fakeWhoop, storePath } from './helpers/fakes.js';

const DEVICE = `ext:test-integration:member:${USER_ID}`;
const READING = ['cycles', 'recoveries', 'sleeps', 'workouts'];

/**
 * @description The integration, connected to a fake Gladys and a fake WHOOP.
 * @param {object} [options] - `{ config, server, path, now, gladys }`.
 * @returns {Promise<object>} `{ gladys, app, server, clock, path }`.
 */
async function startApp({
  config = CONFIG,
  server = fakeWhoop(),
  path = storePath(),
  now = NOW,
  gladys = createFakeGladys({ config }),
} = {}) {
  const clock = { now };
  const app = createApp(gladys, {
    fetch: server,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, server, clock, path };
}

/**
 * @description Click Connect, come back from WHOOP with a code.
 * @param {object} gladys - The fake Gladys.
 * @param {string} [code] - The code.
 * @returns {Promise<object>} `{ url, ack }`.
 */
async function link(gladys, code = 'auth-code-1') {
  const start = await gladys.fake.oauthAuthorizeUrl('whoop_account', REDIRECT);
  assert.equal(start.success, true, start.error);
  const url = new URL(start.data.authorize_url);
  const ack = await gladys.fake.oauthCallback('whoop_account', {
    code,
    state: url.searchParams.get('state'),
    redirectUri: REDIRECT,
  });
  return { url, ack };
}

/**
 * @description A linked integration, its device created.
 * @param {object} [options] - startApp options.
 * @returns {Promise<object>} startApp result.
 */
async function linkedApp(options) {
  const started = await startApp(options);
  const { ack } = await link(started.gladys);
  assert.equal(ack.success, true, ack.error);
  const device = started.gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE);
  assert.ok(device, 'the member is offered');
  await started.gladys.fake.deviceCreated(device);
  return started;
}

test('without a client: a status asking for it, no request to WHOOP', async (t) => {
  const { gladys, server } = await startApp({ config: {} });
  t.after(() => gladys.fake.shutdown());
  assert.equal(server.requests.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Client ID/);
  const start = await gladys.fake.oauthAuthorizeUrl('whoop_account', REDIRECT);
  assert.equal(start.success, false);
});

test('Connect: the WHOOP authorization URL, every scope, an 8-character state kept in the config', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.en, /press "Connect"/);
  const start = await gladys.fake.oauthAuthorizeUrl('whoop_account', REDIRECT);
  const url = new URL(start.data.authorize_url);
  assert.equal(url.origin + url.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), CLIENT.id);
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
  assert.deepEqual(url.searchParams.get('scope').split(' '), SCOPES);
  assert.ok(url.searchParams.get('scope').split(' ').includes('offline'));
  const state = url.searchParams.get('state');
  assert.match(state, /^[\w-]{8}$/);
  assert.equal(gladys.fake.config[INTERNAL_KEYS.oauthState], state);
  assert.equal(gladys.fake.config[INTERNAL_KEYS.oauthRedirectUri], REDIRECT);
});

test('callback: one token request (credentials in the body), the member id, a reading', async (t) => {
  const { gladys, server } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const { ack } = await link(gladys);
  assert.equal(ack.success, true, ack.error);
  assert.equal(server.calls('token').length, 1);
  const [token] = server.calls('token');
  assert.equal(token.headers.Authorization, undefined, 'no Basic header');
  assert.equal(token.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(token.form, {
    grant_type: 'authorization_code',
    code: 'auth-code-1',
    redirect_uri: REDIRECT,
    client_id: CLIENT.id,
    client_secret: CLIENT.secret,
  });
  assert.deepEqual(
    server.requests.map((request) => request.name),
    ['token', 'profile', ...READING, 'body'],
  );
  assert.deepEqual(server.limits, [
    READ_LIMIT.cycles,
    READ_LIMIT.recoveries,
    READ_LIMIT.sleeps,
    READ_LIMIT.workouts,
  ]);
  // Tokens are stored outside the config_schema; the state is burnt.
  assert.equal(gladys.fake.config[INTERNAL_KEYS.accessToken], 'access-token-2');
  assert.equal(gladys.fake.config[INTERNAL_KEYS.refreshToken], 'refresh-token-2');
  assert.equal(gladys.fake.config[INTERNAL_KEYS.expiresAt], String(NOW + HOUR_MS));
  assert.equal(gladys.fake.config[INTERNAL_KEYS.userId], String(USER_ID));
  assert.equal(gladys.fake.config[INTERNAL_KEYS.oauthState], '');
  assert.equal(gladys.fake.config[INTERNAL_KEYS.usedCodes], fingerprint('auth-code-1'));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /Connecté à WHOOP \(Marie\)/);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, DEVICE);
  assert.equal(device.name, 'WHOOP Marie');
  assert.equal(device.should_poll, false);
  // First reading: a baseline, no event.
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('a code is never sent twice: replay, concurrent callbacks, restart', async (t) => {
  const path = storePath();
  const server = fakeWhoop();
  const { gladys } = await startApp({ server, path });
  t.after(() => gladys.fake.shutdown());
  const start = await gladys.fake.oauthAuthorizeUrl('whoop_account', REDIRECT);
  const state = new URL(start.data.authorize_url).searchParams.get('state');
  const params = { code: 'abc123', state, redirectUri: REDIRECT };
  const [first, second] = await Promise.all([
    gladys.fake.oauthCallback('whoop_account', params),
    gladys.fake.oauthCallback('whoop_account', params),
  ]);
  assert.equal(first.success, true, first.error);
  assert.equal(second.success, true, second.error);
  const replay = await gladys.fake.oauthCallback('whoop_account', params);
  assert.equal(replay.success, true);
  assert.equal(server.calls('token').length, 1);
  assert.equal(server.revoked, false);

  const restarted = createFakeGladys({ config: { ...gladys.fake.config } });
  const again = await startApp({ server, path, gladys: restarted });
  t.after(() => again.gladys.fake.shutdown());
  const replayAfterRestart = await restarted.fake.oauthCallback('whoop_account', params);
  assert.equal(replayAfterRestart.success, true);
  assert.equal(server.calls('token').length, 1);
  assert.equal(server.revoked, false);
});

test('a wrong state is refused before any request to WHOOP', async (t) => {
  const { gladys, server } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.oauthAuthorizeUrl('whoop_account', REDIRECT);
  const ack = await gladys.fake.oauthCallback('whoop_account', {
    code: 'abc',
    state: 'forged00',
    redirectUri: REDIRECT,
  });
  assert.equal(ack.success, false);
  assert.equal(server.calls('token').length, 0);
  assert.match(gladys.fake.connectionStatus.message.fr, /ne correspond pas/);
  const ok = await link(gladys, 'abc');
  assert.equal(ok.ack.success, true, ok.ack.error);
});

test('the state survives a restart between Connect and the return from WHOOP', async (t) => {
  const path = storePath();
  const server = fakeWhoop();
  const { gladys } = await startApp({ server, path });
  t.after(() => gladys.fake.shutdown());
  const start = await gladys.fake.oauthAuthorizeUrl('whoop_account', REDIRECT);
  const state = new URL(start.data.authorize_url).searchParams.get('state');
  const restarted = createFakeGladys({ config: { ...gladys.fake.config } });
  const again = await startApp({ server, path, gladys: restarted });
  t.after(() => again.gladys.fake.shutdown());
  const ack = await restarted.fake.oauthCallback('whoop_account', {
    code: 'late',
    state,
    redirectUri: REDIRECT,
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(server.calls('token').length, 1);
});

test('the token endpoint refuses the client: a status naming the reason, nothing stored', async (t) => {
  const { gladys } = await startApp({
    config: { ...CONFIG, client_secret: 'wrong-secret' },
  });
  t.after(() => gladys.fake.shutdown());
  const { ack } = await link(gladys);
  assert.equal(ack.success, false);
  assert.match(gladys.fake.connectionStatus.message.en, /invalid_client/);
  assert.equal(gladys.fake.config[INTERNAL_KEYS.refreshToken] ?? '', '');
});

test('no refresh token (offline refused): the connection is refused with its reason', async (t) => {
  const server = fakeWhoop({ offline: false });
  const { gladys } = await startApp({ server });
  t.after(() => gladys.fake.shutdown());
  const { ack } = await link(gladys);
  assert.equal(ack.success, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /offline/);
  assert.equal(gladys.fake.config[INTERNAL_KEYS.refreshToken] ?? '', '');
  assert.equal(server.calls('profile').length, 0);
});

test('states: recovery, zone, heart, sleep, strain; republished on creation', async (t) => {
  const { gladys } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  const state = (key) => gladys.fake.lastState(`${DEVICE}:${key}`);
  assert.equal(state('recovery'), 72);
  assert.equal(state('recovery_zone'), 'Vert');
  assert.equal(state('resting_heart_rate'), 52);
  assert.equal(state('hrv'), 64.2);
  assert.equal(state('spo2'), 96.4);
  assert.equal(state('skin_temperature'), 33.7);
  assert.equal(state('day_strain'), 9.8);
  assert.equal(state('calories'), 2303);
  assert.equal(state('sleep_performance'), 84);
  assert.equal(state('sleep_time'), 7.53);
  assert.equal(state('sleep_efficiency'), 91.6);
  assert.equal(state('respiratory_rate'), 15.2);
  assert.equal(state('last_workout_strain'), 11.8);
});

test('scene events: none at first, then one per new scored sleep, recovery and workout', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.sceneEvents.length, 0);
  clock.now += 40 * MINUTE_MS;
  // An evening nap, then a workout still being scored.
  server.answers.sleeps.unshift({
    ...server.answers.sleeps.find((sleep) => sleep.nap),
    id: uuid('5a1e', 91),
    start: new Date(at(0, '17:00')).toISOString(),
    end: new Date(at(0, '17:30')).toISOString(),
  });
  server.answers.workouts.unshift({
    ...server.answers.workouts[0],
    id: uuid('0b0e', 7),
    sport_name: 'cycling',
    start: new Date(at(0, '17:45')).toISOString(),
    end: new Date(at(0, '18:30')).toISOString(),
    score_state: 'PENDING_SCORE',
    score: undefined,
  });
  assert.equal(await app.read(), true);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.SLEEP_SCORED],
  );
  const nap = gladys.fake.sceneEvents[0].data;
  assert.equal(nap.member, DEVICE);
  assert.equal(nap.kind, 'nap');
  assert.equal(nap.sleep_start, '17:00');
  // Scored at the next reading: announced then, once.
  server.answers.workouts[0] = {
    ...server.answers.workouts[1],
    id: uuid('0b0e', 7),
    sport_name: 'cycling',
    start: new Date(at(0, '17:45')).toISOString(),
    end: new Date(at(0, '18:30')).toISOString(),
  };
  clock.now += 40 * MINUTE_MS;
  assert.equal(await app.read(), true);
  const ride = gladys.fake.sceneEvents[1];
  assert.equal(ride.key, TRIGGERS.WORKOUT_SCORED);
  assert.equal(ride.data.sport_label, 'Vélo');
  assert.equal(ride.data.sport_family, 'cycling');
  assert.equal(ride.data.duration_minutes, 45);
  assert.equal(ride.data.start_time, '17:45');
  clock.now += 40 * MINUTE_MS;
  await app.read();
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('the next morning: sleep then recovery, with the morning numbers', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  const tomorrow = Date.parse('2026-11-26T05:31:00Z');
  const sleepId = uuid('5a1e', 100);
  server.answers.sleeps.unshift({
    ...server.answers.sleeps.find((sleep) => !sleep.nap),
    id: sleepId,
    cycle_id: 93846,
    start: '2026-11-25T21:30:00.000Z',
    end: '2026-11-26T05:20:00.000Z',
    timezone_offset: OFFSET,
  });
  server.answers.recoveries.unshift({
    ...server.answers.recoveries[0],
    cycle_id: 93846,
    sleep_id: sleepId,
    created_at: '2026-11-26T05:30:00.000Z',
    score: { ...server.answers.recoveries[0].score, recovery_score: 25, hrv_rmssd_milli: 31.5 },
  });
  clock.now = tomorrow;
  assert.equal(await app.read(), true);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.SLEEP_SCORED, TRIGGERS.RECOVERY_SCORED],
  );
  const recovery = gladys.fake.sceneEvents[1].data;
  assert.equal(recovery.recovery, 25);
  assert.equal(recovery.zone, 'red');
  assert.equal(recovery.zone_label, 'Rouge');
  assert.equal(recovery.hrv, 31.5);
  assert.equal(recovery.wake_time, '06:20');
  assert.equal(gladys.fake.lastState(`${DEVICE}:recovery_zone`), 'Rouge');
});

test('a restart fires nothing again (the store in /data)', async (t) => {
  const path = storePath();
  const server = fakeWhoop();
  const first = await linkedApp({ server, path });
  t.after(() => first.gladys.fake.shutdown());
  server.answers.workouts.unshift({ ...server.answers.workouts[0], id: uuid('0b0e', 8) });
  first.clock.now += 20 * MINUTE_MS;
  await first.app.read();
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  const restarted = createFakeGladys({
    config: { ...first.gladys.fake.config },
    devices: [...first.gladys.fake.devices],
  });
  const again = await startApp({
    server,
    path,
    gladys: restarted,
    now: first.clock.now + 20 * MINUTE_MS,
  });
  t.after(() => again.gladys.fake.shutdown());
  await again.app.read();
  assert.equal(restarted.fake.sceneEvents.length, 0);
});

test('an access token ending soon is renewed first; the new pair is stored before use', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  clock.now += HOUR_MS - MINUTE_MS;
  assert.equal(await app.read(), true);
  const [, refresh] = server.calls('token');
  assert.deepEqual(refresh.form, {
    grant_type: 'refresh_token',
    refresh_token: 'refresh-token-2',
    client_id: CLIENT.id,
    client_secret: CLIENT.secret,
    scope: 'offline',
  });
  assert.equal(gladys.fake.config[INTERNAL_KEYS.accessToken], 'access-token-3');
  assert.equal(gladys.fake.config[INTERNAL_KEYS.refreshToken], 'refresh-token-3');
  // Every request after the refresh carries the new token.
  const after = server.requests.slice(server.requests.indexOf(refresh) + 1);
  assert.ok(after.length >= 4);
  for (const request of after) {
    assert.equal(request.headers.Authorization, 'Bearer access-token-3');
  }
  assert.equal(server.revoked, false);
});

test('concurrent readings and a restart never use a refresh token twice', async (t) => {
  const path = storePath();
  const server = fakeWhoop();
  const { gladys, app, clock } = await linkedApp({ server, path });
  t.after(() => gladys.fake.shutdown());
  clock.now += 2 * HOUR_MS;
  // A reading, a widget sync and the scene of a user at the same moment.
  await Promise.all([
    app.read(),
    gladys.fake.widgetAction(WIDGETS.TODAY, WIDGET_ACTIONS.SYNC),
    app.read(),
  ]);
  assert.equal(server.refreshes.length, 1);
  // A restart reads the stored (rotated) refresh token, never the old one.
  const restarted = createFakeGladys({
    config: { ...gladys.fake.config },
    devices: [...gladys.fake.devices],
  });
  const again = await startApp({ server, path, gladys: restarted, now: clock.now + 2 * HOUR_MS });
  t.after(() => again.gladys.fake.shutdown());
  assert.deepEqual(server.refreshes, ['refresh-token-2', 'refresh-token-3']);
  assert.equal(server.revoked, false);
  assert.equal(restarted.fake.connectionStatus.connected, true);
});

test('a 401 in the middle of a reading: renewed once, then the reading goes on', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  server.expired = true;
  clock.now += 20 * MINUTE_MS;
  assert.equal(await app.read(), true);
  assert.equal(server.refreshes.length, 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a refused refresh token: stop, ask to connect again, remember it across restarts', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  server.revoked = true;
  clock.now += 2 * HOUR_MS;
  const before = server.requests.length;
  assert.equal(await app.read(), false);
  assert.equal(server.requests.length, before + 1, 'stopped at the refused refresh');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /appuyez de nouveau sur « Connecter »/);
  assert.equal(gladys.fake.config[INTERNAL_KEYS.lost], 'true');
  await app.read();
  assert.equal(server.requests.length, before + 1, 'no request while the tokens are lost');
  const widget = await gladys.fake.widgetGet(WIDGETS.TODAY, { language: 'en' });
  assert.match(widget.data.content.components[0].text, /refused the connection/);
  // Connecting again starts afresh.
  const { ack } = await link(gladys, 'auth-code-2');
  assert.equal(ack.success, true, ack.error);
  assert.equal(gladys.fake.config[INTERNAL_KEYS.lost], '');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a missing permission (403): a status asking to connect again with every scope', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  server.errors.recoveries = 403;
  clock.now += 20 * MINUTE_MS;
  assert.equal(await app.read(), false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused a permission/);
});

test('rate limited (429): a pause of at least 15 minutes, from X-RateLimit-Reset', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  server.errors.sleeps = 429;
  clock.now += 20 * MINUTE_MS;
  assert.equal(await app.read(), false);
  assert.equal(server.calls('workouts').length, 1, 'nothing after the 429');
  // X-RateLimit-Reset says 1,200 s: longer than the 15-minute floor.
  assert.equal(app.getRetryAt() - clock.now, 20 * MINUTE_MS);
  assert.ok(RATE_LIMIT_DELAY_MIN * MINUTE_MS < 20 * MINUTE_MS);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
});

test('one endpoint failing does not stop the others', async (t) => {
  const { gladys, app, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  server.errors.workouts = 500;
  clock.now += 20 * MINUTE_MS;
  assert.equal(await app.read(), true);
  assert.equal(server.calls('sleeps').length, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  server.errors['*'] = 'network';
  clock.now += 20 * MINUTE_MS;
  assert.equal(await app.read(), false);
  assert.equal(app.getRetryAt() - clock.now, 5 * MINUTE_MS);
  assert.match(gladys.fake.connectionStatus.message.fr, /injoignable/);
});

test('widgets: valid contents in four languages, a message before linking', async (t) => {
  const before = await startApp();
  t.after(() => before.gladys.fake.shutdown());
  const empty = await before.gladys.fake.widgetGet(WIDGETS.SLEEP, { language: 'de' });
  assert.match(empty.data.content.components[0].text, /Verbinde dein WHOOP-Konto/);

  const { gladys } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const [key, settings] of [
      [WIDGETS.TODAY, {}],
      [WIDGETS.SLEEP, {}],
      [WIDGETS.WORKOUTS, {}],
      [WIDGETS.WEEK, { metric: 'recovery' }],
      [WIDGETS.WEEK, { metric: 'strain' }],
      [WIDGETS.WEEK, { metric: 'sleep_performance' }],
      [WIDGETS.WEEK, { metric: 'hrv' }],
    ]) {
      const ack = await gladys.fake.widgetGet(key, { language, settings });
      assert.equal(ack.success, true, ack.error);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
});

test('the Sync button reads WHOOP, but not twice within two minutes', async (t) => {
  const { gladys, server, clock } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  const reads = () => server.calls('sleeps').length;
  const soon = await gladys.fake.widgetAction(WIDGETS.TODAY, WIDGET_ACTIONS.SYNC);
  assert.match(soon.data.message.en, /was read 1 min ago/);
  assert.equal(reads(), 1);
  clock.now += REFRESH_MIN_INTERVAL_MS + 1000;
  const done = await gladys.fake.widgetAction(WIDGETS.TODAY, WIDGET_ACTIONS.SYNC);
  assert.equal(reads(), 2);
  assert.equal(
    done.data.message.fr,
    'WHOOP lu : récupération 72 % (vert) · effort 9,8 · performance du sommeil 84 %',
  );
  for (const text of Object.values(done.data.message)) {
    assert.ok(text.length <= 200);
  }
});

test('scene action: only the declared outputs, from the kept data, no request', async (t) => {
  const { gladys, server } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  const before = server.requests.length;
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_SUMMARY, { member: DEVICE });
  assert.equal(ack.success, true, ack.error);
  const outputs = ack.data.outputs;
  assert.deepEqual(Object.keys(outputs), ACTION_OUTPUTS);
  assert.equal(server.requests.length, before);
  assert.equal(outputs.recovery, 72);
  assert.equal(outputs.recovery_zone, 'green');
  assert.equal(outputs.recovery_zone_label, 'Vert');
  assert.equal(outputs.day_strain, 9.8);
  assert.equal(outputs.sleep_hours, 7.53);
  assert.equal(outputs.last_workout_sport, 'Course à pied');
  assert.equal(outputs.last_workout_minutes, 42);
  assert.equal(outputs.weight_kg, 61.2);
  assert.match(outputs.summary, /^Récupération 72 % \(vert\)/);
  for (const value of Object.values(outputs)) {
    assert.ok(value === null || ['string', 'number'].includes(typeof value));
  }
  const other = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_SUMMARY, {
    member: 'ext:test-integration:member:42',
  });
  assert.equal(other.success, false);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('Unlink: revokes the access, forgets the tokens, offers no device', async (t) => {
  const { gladys, server } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.DISCONNECT);
  assert.match(ack.data.message.en, /revoked/);
  assert.equal(server.calls('revoke').length, 1);
  assert.equal(server.calls('revoke')[0].headers.Authorization, 'Bearer access-token-2');
  assert.equal(gladys.fake.config[INTERNAL_KEYS.accessToken], '');
  assert.equal(gladys.fake.config[INTERNAL_KEYS.refreshToken], '');
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('diagnostic: in the logs, never a token, the secret or the name', async (t) => {
  const lines = [];
  const logger = { ...silent, info: (line) => lines.push(String(line)) };
  const gladys = createFakeGladys({ config: CONFIG });
  const server = fakeWhoop();
  const app = createApp(gladys, {
    fetch: server,
    storePath: storePath(),
    now: () => NOW,
    timeZone: TZ,
    timers: false,
    logger,
  });
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  await app.whenReady();
  await link(gladys);
  const ack = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(ack.data.message.en, /Diagnostic written/);
  const text = lines.filter((line) => line.startsWith('WHOOP diagnostic')).join('\n');
  assert.ok(text.length > 100);
  for (const secret of [
    'access-token-2',
    'refresh-token-2',
    CLIENT.secret,
    CLIENT.id,
    'Marie',
    'Durand',
    'marie@example.com',
  ]) {
    assert.ok(!text.includes(secret), secret);
  }
  const everything = lines.join('\n');
  assert.ok(!everything.includes('access-token-2') && !everything.includes('refresh-token-2'));
});

test('another Client ID saved: the old tokens are dropped', async (t) => {
  const { gladys, app } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.configUpdated({ ...gladys.fake.config, client_id: 'another-client' });
  assert.equal(app.getAuth().refreshToken, '');
  assert.match(gladys.fake.connectionStatus.message.en, /press "Connect"/);
});

test('the user agent names the project; /data keeps no token, no e-mail address', async (t) => {
  const { gladys, server, path } = await linkedApp();
  t.after(() => gladys.fake.shutdown());
  for (const request of server.requests) {
    assert.match(request.headers['User-Agent'], /^gladys-whoop\/\d+\.\d+\.\d+ /);
  }
  const kept = readFileSync(path, 'utf8');
  const data = JSON.parse(kept);
  assert.equal(data.userId, String(USER_ID));
  assert.equal(data.name, 'Marie');
  for (const secret of ['access-token', 'refresh-token', 'marie@example.com', 'Durand']) {
    assert.ok(!kept.includes(secret), secret);
  }
});
