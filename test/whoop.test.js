// The readers of the WHOOP answers and the HTTP client.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  offsetMinutes,
  localDateAt,
  zoneOf,
  familyOf,
  parseCycle,
  parseRecovery,
  parseSleep,
  parseWorkout,
  parseBody,
  parseProfile,
  readList,
} from '../src/whoop.js';
import {
  buildAuthorizeUrl,
  createWhoopClient,
  readRateLimit,
  AUTHORIZE_URL,
  TOKEN_URL,
  API_URL,
  SCOPES,
  PAGE_LIMIT,
} from '../src/whoop-api.js';
import { localDate, addDays, isDate, safeTimeZone, jitterOf, JITTER_SECONDS } from '../src/time.js';
import { answers, USER_ID } from './helpers/whoop-data.js';
import { fakeWhoop, CLIENT, REDIRECT } from './helpers/fakes.js';

test('offsets and local dates of a record', () => {
  assert.equal(offsetMinutes('+01:00'), 60);
  assert.equal(offsetMinutes('-05:30'), -330);
  assert.equal(offsetMinutes('Z'), 0);
  assert.equal(offsetMinutes('+0200'), 120);
  assert.equal(offsetMinutes('Paris'), null);
  // 23:30 UTC is already the next day at UTC+1.
  assert.equal(localDateAt(Date.parse('2026-11-24T23:30:00Z'), 60), '2026-11-25');
  assert.equal(localDateAt(Date.parse('2026-11-24T23:30:00Z'), null), '2026-11-24');
  assert.equal(localDateAt(null, 60), null);
});

test('recovery zones and sport families', () => {
  assert.equal(zoneOf(67), 'green');
  assert.equal(zoneOf(66), 'yellow');
  assert.equal(zoneOf(34), 'yellow');
  assert.equal(zoneOf(33), 'red');
  assert.equal(zoneOf(null), null);
  assert.equal(familyOf('running'), 'running');
  assert.equal(familyOf('functional-fitness'), 'strength');
  assert.equal(familyOf('weightlifting'), 'strength');
  assert.equal(familyOf('spin'), 'cycling');
  assert.equal(familyOf('hiking'), 'walking');
  assert.equal(familyOf('swimming'), 'swimming');
  assert.equal(familyOf('yoga'), 'other');
  assert.equal(familyOf(null), 'other');
});

test('cycle: the day it started, strain, kilocalories from kilojoules', () => {
  const [today, yesterday] = answers().cycles;
  const cycle = parseCycle(today);
  assert.equal(cycle.id, '93845');
  assert.equal(cycle.date, '2026-11-25');
  assert.equal(cycle.end, null, 'the current cycle has no end');
  assert.equal(cycle.state, 'SCORED');
  assert.equal(cycle.strain, 9.8);
  assert.equal(Math.round(cycle.kcal), 2303);
  assert.equal(cycle.steps, 9920);
  assert.ok(parseCycle(yesterday).end > parseCycle(yesterday).start);
  const pending = parseCycle({ ...today, score_state: 'PENDING_SCORE' });
  assert.equal(pending.strain, null, 'no score unless SCORED');
  assert.equal(parseCycle({ ...today, score_state: 'WEIRD' }).state, 'UNSCORABLE');
  assert.equal(parseCycle({}), null);
});

test('recovery: keyed by its sleep, the morning numbers, the zone', () => {
  const recovery = parseRecovery(answers().recoveries[0]);
  assert.equal(recovery.id, recovery.sleepId);
  assert.equal(recovery.cycleId, '93845');
  assert.equal(recovery.score, 72);
  assert.equal(recovery.zone, 'green');
  assert.equal(recovery.restingHeartRate, 52);
  assert.equal(recovery.hrv, 64.2);
  assert.equal(recovery.spo2, 96.4);
  assert.equal(recovery.skinTemp, 33.7);
  assert.equal(recovery.calibrating, false);
  const unscorable = parseRecovery({ cycle_id: 1, score_state: 'UNSCORABLE' });
  assert.equal(unscorable.id, 'cycle-1');
  assert.equal(unscorable.score, null);
  assert.equal(unscorable.zone, null);
  assert.equal(parseRecovery({}), null);
});

test('sleep: stages, time asleep, need, the day of the wake-up, naps', () => {
  const sleeps = answers().sleeps.map(parseSleep);
  const night = sleeps.find((sleep) => !sleep.nap);
  assert.equal(night.date, '2026-11-25');
  assert.equal(night.inBedMs, 29580000);
  assert.equal(night.asleepMs, night.lightMs + night.deepMs + night.remMs);
  assert.equal(night.asleepMs, 27095280);
  assert.equal(night.performance, 84);
  assert.equal(night.efficiency, 91.6);
  assert.equal(night.respiratoryRate, 15.2);
  assert.equal(night.neededMs, 27395716 + 352230 + 208595 - 12312);
  const nap = sleeps.find((sleep) => sleep.nap);
  assert.equal(nap.neededMs, null, 'a nap without sleep_needed');
  assert.equal(nap.asleepMs, 34 * 60 * 1000);
  assert.equal(parseSleep({ id: 'x' }), null);
});

test('workout: sport, duration, strain, distance, zones', () => {
  const run = parseWorkout(answers().workouts[0]);
  assert.equal(run.sport, 'running');
  assert.equal(run.family, 'running');
  assert.equal(run.durationMs, 42 * 60 * 1000);
  assert.equal(run.strain, 11.8);
  assert.equal(Math.round(run.kcal), 523);
  assert.equal(run.distanceMeters, 8240);
  assert.equal(run.zonesMs.length, 6);
  assert.equal(run.date, '2026-11-25');
  const yoga = parseWorkout(answers().workouts[3]);
  assert.equal(yoga.distanceMeters, null);
  assert.equal(yoga.family, 'other');
  assert.equal(parseWorkout({ id: 'x', start: 'never' }), null);
});

test('body and profile: never the e-mail address nor the last name', () => {
  assert.deepEqual(parseBody(answers().body), { heightM: 1.68, weightKg: 61.2, maxHeartRate: 190 });
  assert.equal(parseBody({}), null);
  assert.deepEqual(parseProfile(answers().profile), {
    userId: String(USER_ID),
    firstName: 'Marie',
  });
  assert.equal(parseProfile({ user_id: 'abc' }), null);
});

test('lists: unreadable items and duplicates dropped, newest first', () => {
  const raw = answers().workouts;
  const list = readList([raw[2], null, raw[0], { id: 1 }, raw[0]], parseWorkout, (w) => w.start);
  assert.deepEqual(
    list.map((workout) => workout.sport),
    ['running', 'cycling'],
  );
  assert.deepEqual(
    readList('nope', parseWorkout, (w) => w.start),
    [],
  );
});

test('days in the timezone of Gladys', () => {
  assert.equal(localDate(Date.parse('2026-10-29T23:30:00Z'), 'Europe/Paris'), '2026-10-30');
  assert.equal(localDate(Date.parse('2026-10-29T23:30:00Z'), 'America/New_York'), '2026-10-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.ok(isDate('2026-10-30'));
  assert.ok(!isDate('2026-1-3'));
  assert.equal(safeTimeZone('Nowhere/City'), undefined);
  assert.equal(jitterOf('10129'), jitterOf('10129'));
  assert.ok(jitterOf('x') < JITTER_SECONDS * 1000);
});

test('the documented endpoints and scopes', () => {
  assert.equal(AUTHORIZE_URL, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.equal(TOKEN_URL, 'https://api.prod.whoop.com/oauth/oauth2/token');
  assert.equal(API_URL, 'https://api.prod.whoop.com/developer');
  assert.deepEqual(SCOPES, [
    'offline',
    'read:recovery',
    'read:cycles',
    'read:sleep',
    'read:workout',
    'read:profile',
    'read:body_measurement',
  ]);
  assert.equal(PAGE_LIMIT, 25);
  const url = new URL(
    buildAuthorizeUrl({ clientId: 'abc', redirectUri: REDIRECT, state: 'Ab3dEf7h' }),
  );
  assert.equal(url.searchParams.get('state'), 'Ab3dEf7h');
  assert.equal(url.searchParams.get('scope'), SCOPES.join(' '));
});

test('client: code exchange, refresh with rotation, their refusals', async () => {
  const server = fakeWhoop();
  const client = createWhoopClient({ fetch: server, now: () => 1000 });
  const first = await client.exchangeCode({
    clientId: CLIENT.id,
    clientSecret: CLIENT.secret,
    code: 'c1',
    redirectUri: REDIRECT,
  });
  assert.deepEqual(first, {
    accessToken: 'access-token-2',
    refreshToken: 'refresh-token-2',
    expiresAt: 1000 + 3600 * 1000,
    scope: answers().token.scope,
  });
  await assert.rejects(
    client.exchangeCode({ clientId: CLIENT.id, clientSecret: CLIENT.secret, code: 'c1' }),
    (err) => err.kind === 'oauth' && err.code === 'invalid_grant',
  );
  server.revoked = false;
  server.tokens = { access: 'access-token-2', refresh: 'refresh-token-2' };
  const renewed = await client.refresh({
    clientId: CLIENT.id,
    clientSecret: CLIENT.secret,
    refreshToken: 'refresh-token-2',
  });
  assert.equal(renewed.refreshToken, 'refresh-token-3');
  // The old refresh token is refused: final (`grant`).
  await assert.rejects(
    client.refresh({
      clientId: CLIENT.id,
      clientSecret: CLIENT.secret,
      refreshToken: 'refresh-token-2',
    }),
    (err) =>
      err.kind === 'grant' && err.code === 'invalid_grant' && !/refresh-token/.test(err.message),
  );
  // A server fault at the token endpoint is not final.
  server.errors.token = 503;
  await assert.rejects(
    client.refresh({ clientId: CLIENT.id, clientSecret: CLIENT.secret, refreshToken: 'x' }),
    (err) => err.kind === 'server',
  );
  delete server.errors.token;
  await assert.rejects(
    client.exchangeCode({ clientId: CLIENT.id, clientSecret: 'wrong', code: 'c9' }),
    (err) => err.kind === 'oauth' && err.code === 'invalid_client',
  );
});

test('client: collections, errors with their kind, rate limit headers', async () => {
  const server = fakeWhoop();
  const client = createWhoopClient({ fetch: server, now: () => 5000 });
  const token = server.tokens.access;
  const cycles = await client.cycles(token, { limit: 3 });
  assert.equal(cycles.length, 3);
  const query = new URL(server.requests[0].url).searchParams;
  assert.equal(query.get('limit'), '3');
  assert.equal(query.has('start'), false, 'no empty parameter');
  assert.equal((await client.recoveries(token, { limit: 99 })).length, 7, 'limit capped at 25');
  assert.equal(new URL(server.requests[1].url).searchParams.get('limit'), '25');
  assert.equal(client.stats.rateLimit.remaining, 96);
  assert.equal(client.stats.count, 2);
  await assert.rejects(client.sleeps('wrong'), (err) => err.kind === 'unauthorized');
  server.errors.workouts = 429;
  await assert.rejects(
    client.workouts(token),
    (err) => err.kind === 'rate_limited' && err.retryAfter === 1200,
  );
  server.errors.body = 'network';
  await assert.rejects(client.body(token), (err) => err.kind === 'network');
  server.errors.profile = 403;
  await assert.rejects(client.profile(token), (err) => err.kind === 'forbidden');
  await client.revoke(token);
  assert.equal(server.revoked, true);
  assert.deepEqual(readRateLimit(new Headers({ 'X-RateLimit-Limit': '100, 100;window=60' })), {
    limit: 100,
    remaining: null,
    reset: null,
  });
  assert.equal(readRateLimit(new Headers({})), null);
});
