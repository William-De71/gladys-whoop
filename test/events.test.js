// Scene trigger transitions and payloads, and the scene action outputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TRIGGERS,
  ACTION_OUTPUTS,
  MAX_WORKOUT_EVENTS,
  RECENT_MS,
  detectEvents,
  actionOutputs,
} from '../src/events.js';
import { EMPTY } from '../src/store.js';
import { parseCycle, parseRecovery, parseSleep, parseWorkout, readList } from '../src/whoop.js';
import { answers, NOW, uuid } from './helpers/whoop-data.js';

const ALL = { recoveries: true, sleeps: true, workouts: true };
const context = { member: 'ext:x:member:1', memberName: 'Marie', language: 'en' };
const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

/**
 * @description A store filled with the made-up answers.
 * @returns {object} The data.
 */
function data() {
  const a = answers();
  const store = EMPTY();
  store.cycles = readList(a.cycles, parseCycle, (c) => c.start);
  store.recoveries = readList(a.recoveries, parseRecovery, (r) => r.createdAt);
  store.sleeps = readList(a.sleeps, parseSleep, (s) => s.start);
  store.workouts = readList(a.workouts, parseWorkout, (w) => w.start);
  return store;
}

/**
 * @description An event payload is flat, bounded, and carries exactly the
 * variables the manifest declares for its trigger.
 * @param {object} event - `{ key, data }`.
 */
const checkPayload = (event) => {
  const entries = Object.entries(event.data);
  assert.ok(entries.length <= 30, event.key);
  for (const [key, value] of entries) {
    assert.ok(
      value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 1000),
      `${event.key}.${key}`,
    );
  }
  const trigger = manifest.scene_triggers.find((entry) => entry.key === event.key);
  assert.deepEqual(
    Object.keys(event.data).sort(),
    trigger.variables.map((variable) => variable.key).sort(),
    event.key,
  );
};

test('the first reading of each kind is a baseline: no event', () => {
  const store = data();
  const { events, seen, baseline } = detectEvents({ read: ALL, data: store, now: NOW, context });
  assert.deepEqual(events, []);
  assert.deepEqual(baseline, { recoveries: true, sleeps: true, workouts: true });
  assert.equal(seen.sleeps.length, 8);
  assert.equal(seen.recoveries.length, 7);
  assert.equal(seen.workouts.length, 5);
});

test('a kind not read this time keeps its baseline and announces nothing', () => {
  const store = data();
  const { baseline } = detectEvents({
    read: { recoveries: false, sleeps: true, workouts: false },
    data: store,
    now: NOW,
    context,
  });
  assert.deepEqual(baseline, { recoveries: false, sleeps: true, workouts: false });
});

test('new scored records: sleep first, then its recovery, then workouts; each once', () => {
  const store = data();
  let result = detectEvents({ read: ALL, data: store, now: NOW, context });
  Object.assign(store, { seen: result.seen, baseline: result.baseline });
  const a = answers();
  const sleepId = uuid('5a1e', 100);
  const sleep = parseSleep({
    ...a.sleeps.find((entry) => !entry.nap),
    id: sleepId,
    start: '2026-11-25T21:30:00.000Z',
    end: '2026-11-26T05:20:00.000Z',
  });
  const recovery = parseRecovery({
    ...a.recoveries[0],
    sleep_id: sleepId,
    cycle_id: 93846,
    created_at: '2026-11-26T05:30:00.000Z',
  });
  const workout = parseWorkout({ ...a.workouts[0], id: uuid('0b0e', 50) });
  store.sleeps.unshift(sleep);
  store.recoveries.unshift(recovery);
  store.workouts.unshift(workout);
  const later = Date.parse('2026-11-26T05:40:00Z');
  result = detectEvents({ read: ALL, data: store, now: later, context });
  assert.deepEqual(
    result.events.map((event) => event.key),
    [TRIGGERS.SLEEP_SCORED, TRIGGERS.RECOVERY_SCORED, TRIGGERS.WORKOUT_SCORED],
  );
  result.events.forEach(checkPayload);
  const [sleepEvent, recoveryEvent, workoutEvent] = result.events.map((event) => event.data);
  assert.equal(sleepEvent.kind, 'sleep');
  assert.equal(sleepEvent.sleep_start, '22:30');
  assert.equal(sleepEvent.sleep_end, '06:20');
  assert.equal(recoveryEvent.member, context.member);
  assert.equal(recoveryEvent.zone, 'green');
  assert.equal(recoveryEvent.sleep_performance, 84);
  assert.equal(recoveryEvent.wake_time, '06:20');
  assert.match(recoveryEvent.summary, /^Recovery 72 % \(green\), HRV 64 ms/);
  assert.equal(workoutEvent.sport_label, 'Running');
  assert.equal(workoutEvent.distance_km, 8.24);
  assert.match(workoutEvent.summary, /^Running: 42 min, strain 11\.8, 8\.2 km/);
  Object.assign(store, { seen: result.seen, baseline: result.baseline });
  result = detectEvents({ read: ALL, data: store, now: later, context });
  assert.deepEqual(result.events, []);
});

test('pending records wait for their score; old records are only remembered', () => {
  const store = data();
  let result = detectEvents({ read: ALL, data: store, now: NOW, context });
  Object.assign(store, { seen: result.seen, baseline: result.baseline });
  const a = answers();
  const pending = parseWorkout({
    ...a.workouts[0],
    id: uuid('0b0e', 60),
    score_state: 'PENDING_SCORE',
  });
  const old = parseWorkout({
    ...a.workouts[0],
    id: uuid('0b0e', 61),
    start: new Date(NOW - RECENT_MS - 3600000).toISOString(),
    end: new Date(NOW - RECENT_MS - 1800000).toISOString(),
  });
  store.workouts = [pending, ...store.workouts, old];
  result = detectEvents({ read: ALL, data: store, now: NOW, context });
  assert.deepEqual(result.events, []);
  assert.ok(!result.seen.workouts.includes(pending.id), 'pending: not seen yet');
  assert.ok(result.seen.workouts.includes(old.id), 'old: remembered');
  Object.assign(store, { seen: result.seen });
  store.workouts[0] = parseWorkout({ ...a.workouts[0], id: pending.id });
  result = detectEvents({ read: ALL, data: store, now: NOW, context });
  assert.deepEqual(
    result.events.map((event) => event.key),
    [TRIGGERS.WORKOUT_SCORED],
  );
});

test(`at most ${MAX_WORKOUT_EVENTS} workouts per reading, the newest ones`, () => {
  const store = data();
  const result = detectEvents({ read: ALL, data: store, now: NOW, context });
  Object.assign(store, { seen: result.seen, baseline: result.baseline });
  const a = answers();
  const extra = Array.from({ length: 8 }, (_, n) =>
    parseWorkout({
      ...a.workouts[0],
      id: uuid('0b0e', 70 + n),
      start: new Date(NOW - (n + 1) * 600000).toISOString(),
      end: new Date(NOW - n * 600000).toISOString(),
    }),
  );
  store.workouts = [...extra, ...store.workouts];
  const { events } = detectEvents({ read: ALL, data: store, now: NOW, context });
  assert.equal(events.length, MAX_WORKOUT_EVENTS);
  assert.equal(events.at(-1).data.workout_id, uuid('0b0e', 70), 'the newest last');
});

test('scene action: the declared outputs only, in the asked language', () => {
  const store = data();
  const scored = (entry) => entry.state === 'SCORED';
  const snapshot = {
    cycle: store.cycles[0],
    recovery: store.recoveries.find(scored),
    sleep: store.sleeps.find((sleep) => scored(sleep) && !sleep.nap),
    workout: store.workouts[0],
    body: { weightKg: 61.24 },
  };
  const outputs = actionOutputs(snapshot, { language: 'de' });
  assert.deepEqual(Object.keys(outputs), ACTION_OUTPUTS);
  assert.equal(outputs.recovery_zone_label, 'Grün');
  assert.equal(outputs.last_workout_sport, 'Laufen');
  assert.equal(outputs.weight_kg, 61.2);
  assert.match(outputs.summary, /^Erholung 72 % \(grün\).+Tagesbelastung 9,8\.$/);
  const declared = manifest.scene_actions[0].outputs.map((output) => output.key);
  assert.deepEqual(declared, ACTION_OUTPUTS);
  const empty = actionOutputs({}, { language: 'fr' });
  assert.equal(empty.summary, 'Pas encore de données WHOOP.');
  assert.equal(empty.recovery, null);
});
