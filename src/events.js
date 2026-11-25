// -----------------------------------------------------------------------------
// Scene triggers and the outputs of the scene action.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `recovery_scored`  WHOOP scored a new recovery: the member woke up and
//                        the morning numbers are there (recovery, zone,
//                        resting heart rate, HRV, SpO2, skin temperature);
//   - `sleep_scored`     WHOOP scored a new sleep or nap;
//   - `workout_scored`   WHOOP scored a new workout (the strap synced it).
// Only SCORED records count: a PENDING_SCORE one is announced at the reading
// where it gets its score. What was announced is kept in `seen` (in /data).
// The first successful reading of each kind only fills `seen` (`baseline`):
// installing the integration or restarting it never fires old events.
// Records older than two days are only remembered (a strap synced after a
// long trip), and at most five workouts are announced per reading. A scene
// action or a widget never fires an event.
// -----------------------------------------------------------------------------

import { KEEP } from './store.js';
import { t, zoneLabel, sportLabel, formatNumber, formatMinutes, clockAt } from './i18n.js';

const TRIGGERS = {
  RECOVERY_SCORED: 'recovery_scored',
  SLEEP_SCORED: 'sleep_scored',
  WORKOUT_SCORED: 'workout_scored',
};
const MAX_WORKOUT_EVENTS = 5;
// Records that ended longer ago than this are not announced.
const RECENT_MS = 2 * 24 * 60 * 60 * 1000;

const ACTION_OUTPUTS = [
  'recovery',
  'recovery_zone',
  'recovery_zone_label',
  'resting_heart_rate',
  'hrv',
  'spo2',
  'skin_temperature',
  'day_strain',
  'calories',
  'sleep_hours',
  'sleep_performance',
  'sleep_need_hours',
  'respiratory_rate',
  'last_workout_sport',
  'last_workout_strain',
  'last_workout_date',
  'last_workout_minutes',
  'weight_kg',
  'summary',
];

const round = (value, digits = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const minutes = (ms) => (ms == null ? null : round(ms / 60000));
const hours = (ms) => (ms == null ? null : round(ms / 3600000, 2));
const km = (meters) => (meters == null ? null : round(meters / 1000, 2));
const clip = (value, max = 1000) => String(value ?? '').slice(0, max);

/**
 * @description The sentence of a recovery.
 * @param {object} recovery - The recovery.
 * @param {string} language - The language.
 * @returns {string} "Recovery 72 % (green), HRV 64 ms, resting heart rate 52 bpm".
 */
function recoverySummary(recovery, language) {
  return t('summaryRecovery', language, {
    score: recovery.score ?? '?',
    zone: recovery.zone ? zoneLabel(recovery.zone, language).toLowerCase() : '?',
    hrv: formatNumber(recovery.hrv, language, 0),
    rhr: recovery.restingHeartRate ?? '?',
  });
}

/**
 * @description The sentence of a sleep.
 * @param {object} sleep - The sleep.
 * @param {string} language - The language.
 * @returns {string} "Slept 7 h 12, sleep performance 84 %".
 */
function sleepSummary(sleep, language) {
  return t(sleep.nap ? 'summaryNap' : 'summarySleep', language, {
    duration: formatMinutes(minutes(sleep.asleepMs), language),
    performance: sleep.performance ?? '?',
  });
}

/**
 * @description The sentence of a workout.
 * @param {object} workout - The workout.
 * @param {string} language - The language.
 * @returns {string} "Running: 45 min, strain 12.4, 520 kcal, average heart rate 148".
 */
function workoutSummary(workout, language) {
  const parts = [formatMinutes(minutes(workout.durationMs), language)];
  if (workout.strain != null) {
    parts.push(t('strainText', language, { value: formatNumber(workout.strain, language, 1) }));
  }
  if (workout.distanceMeters) {
    parts.push(`${formatNumber(km(workout.distanceMeters), language, 1)} km`);
  }
  if (workout.kcal != null) {
    parts.push(`${formatNumber(workout.kcal, language, 0)} kcal`);
  }
  if (workout.avgHeartRate != null) {
    parts.push(t('heartRateAvgText', language, { value: workout.avgHeartRate }));
  }
  return `${sportLabel(workout.sport, language)}: ${parts.join(', ')}`;
}

/**
 * @description The data of a `recovery_scored` event.
 * @param {object} recovery - The recovery.
 * @param {object} context - `{ member, memberName, language, sleeps }`.
 * @returns {object} Flat data, scalars only.
 */
function recoveryData(recovery, { member, memberName, language, sleeps = [] }) {
  const sleep = sleeps.find((entry) => entry.id === recovery.sleepId) ?? null;
  return {
    member,
    member_name: clip(memberName, 100),
    recovery: round(recovery.score),
    zone: recovery.zone,
    zone_label: recovery.zone ? zoneLabel(recovery.zone, language) : null,
    resting_heart_rate: round(recovery.restingHeartRate),
    hrv: round(recovery.hrv, 1),
    spo2: round(recovery.spo2, 1),
    skin_temperature: round(recovery.skinTemp, 2),
    calibrating: recovery.calibrating,
    sleep_hours: hours(sleep?.asleepMs),
    sleep_performance: round(sleep?.performance),
    wake_time: sleep?.end == null ? null : clockAt(sleep.end, sleep.offset),
    summary: clip(recoverySummary(recovery, language)),
  };
}

/**
 * @description The data of a `sleep_scored` event.
 * @param {object} sleep - The sleep.
 * @param {object} context - `{ member, memberName, language }`.
 * @returns {object} Flat data, scalars only.
 */
function sleepData(sleep, { member, memberName, language }) {
  return {
    member,
    member_name: clip(memberName, 100),
    kind: sleep.nap ? 'nap' : 'sleep',
    date: sleep.date,
    sleep_hours: hours(sleep.asleepMs),
    sleep_minutes: minutes(sleep.asleepMs),
    in_bed_minutes: minutes(sleep.inBedMs),
    deep_minutes: minutes(sleep.deepMs),
    rem_minutes: minutes(sleep.remMs),
    light_minutes: minutes(sleep.lightMs),
    awake_minutes: minutes(sleep.awakeMs),
    disturbances: round(sleep.disturbances),
    sleep_performance: round(sleep.performance),
    sleep_efficiency: round(sleep.efficiency, 1),
    sleep_consistency: round(sleep.consistency),
    respiratory_rate: round(sleep.respiratoryRate, 1),
    sleep_need_hours: hours(sleep.neededMs),
    sleep_start: clockAt(sleep.start, sleep.offset),
    sleep_end: sleep.end == null ? null : clockAt(sleep.end, sleep.offset),
    summary: clip(sleepSummary(sleep, language)),
  };
}

/**
 * @description The data of a `workout_scored` event.
 * @param {object} workout - The workout.
 * @param {object} context - `{ member, memberName, language }`.
 * @returns {object} Flat data, scalars only.
 */
function workoutData(workout, { member, memberName, language }) {
  return {
    member,
    member_name: clip(memberName, 100),
    workout_id: clip(workout.id, 100),
    sport: clip(workout.sport ?? 'activity', 100),
    sport_label: clip(sportLabel(workout.sport, language), 100),
    sport_family: workout.family,
    date: workout.date,
    start_time: clockAt(workout.start, workout.offset),
    duration_minutes: minutes(workout.durationMs),
    strain: round(workout.strain, 1),
    calories: round(workout.kcal),
    heart_rate_avg: round(workout.avgHeartRate),
    heart_rate_max: round(workout.maxHeartRate),
    distance_km: km(workout.distanceMeters),
    summary: clip(workoutSummary(workout, language)),
  };
}

/**
 * @description Add values to a remembered list, keep the last ones.
 * @param {string[]} list - The list.
 * @param {string[]} values - New values.
 * @param {number} max - How many to keep.
 * @returns {string[]} The list.
 */
function remember(list, values, max) {
  const next = [...list.filter((value) => !values.includes(value)), ...values];
  return next.slice(-max);
}

/**
 * @description The events of a reading, and what is remembered after it.
 * @param {object} input - Input.
 * @param {object} input.read - The kinds read successfully this time:
 * `{ recoveries, sleeps, workouts }` booleans.
 * @param {object} input.data - The store data.
 * @param {number} input.now - Now, in ms.
 * @param {object} input.context - `{ member, memberName, language }`.
 * @returns {{ events: object[], seen: object, baseline: object }} The result.
 */
function detectEvents({ read, data, now, context }) {
  const seen = { ...data.seen };
  const baseline = { ...data.baseline };
  const events = [];
  const recentFrom = now - RECENT_MS;

  const kind = (name, list, trigger, build, { when, max = Infinity }) => {
    if (!read[name]) {
      return;
    }
    const fresh = list.filter(
      (entry) => entry.state === 'SCORED' && !seen[name].includes(entry.id),
    );
    if (baseline[name]) {
      // Oldest first, the newest `max` at most.
      [...fresh]
        .reverse()
        .filter((entry) => (when(entry) ?? now) >= recentFrom)
        .slice(-max)
        .forEach((entry) => events.push({ key: trigger, data: build(entry, context) }));
    }
    seen[name] = remember(
      seen[name],
      fresh.map((entry) => entry.id),
      KEEP.seenIds,
    );
    baseline[name] = true;
  };

  // The sleep first: the recovery of the same morning comes right after it.
  kind('sleeps', data.sleeps, TRIGGERS.SLEEP_SCORED, sleepData, {
    when: (sleep) => sleep.end ?? sleep.start,
  });
  kind(
    'recoveries',
    data.recoveries,
    TRIGGERS.RECOVERY_SCORED,
    (recovery) => recoveryData(recovery, { ...context, sleeps: data.sleeps }),
    { when: (recovery) => recovery.createdAt },
  );
  kind('workouts', data.workouts, TRIGGERS.WORKOUT_SCORED, workoutData, {
    when: (workout) => workout.end ?? workout.start,
    max: MAX_WORKOUT_EVENTS,
  });
  return { events, seen, baseline };
}

/**
 * @description The outputs of the `get_summary` scene action, from what the
 * last reading kept (no request to WHOOP).
 * @param {object} snapshot - `{ cycle, recovery, sleep, workout, body }`.
 * @param {object} options - `{ language }`.
 * @returns {object} Only the declared outputs, scalars or null.
 */
function actionOutputs({ cycle, recovery, sleep, workout, body }, { language }) {
  const parts = [];
  if (recovery) {
    parts.push(`${recoverySummary(recovery, language)}.`);
  }
  if (sleep) {
    parts.push(`${sleepSummary(sleep, language)}.`);
  }
  if (cycle?.strain != null) {
    parts.push(
      `${t('summaryStrain', language, { value: formatNumber(cycle.strain, language, 1) })}.`,
    );
  }
  const data = {
    recovery: round(recovery?.score),
    recovery_zone: recovery?.zone,
    recovery_zone_label: recovery?.zone ? zoneLabel(recovery.zone, language) : null,
    resting_heart_rate: round(recovery?.restingHeartRate),
    hrv: round(recovery?.hrv, 1),
    spo2: round(recovery?.spo2, 1),
    skin_temperature: round(recovery?.skinTemp, 2),
    day_strain: round(cycle?.strain, 1),
    calories: round(cycle?.kcal),
    sleep_hours: hours(sleep?.asleepMs),
    sleep_performance: round(sleep?.performance),
    sleep_need_hours: hours(sleep?.neededMs),
    respiratory_rate: round(sleep?.respiratoryRate, 1),
    last_workout_sport: workout ? sportLabel(workout.sport, language) : null,
    last_workout_strain: round(workout?.strain, 1),
    last_workout_date: workout?.date,
    last_workout_minutes: minutes(workout?.durationMs),
    weight_kg: round(body?.weightKg, 1),
    summary: parts.length > 0 ? parts.join(' ') : t('summaryNothing', language),
  };
  return Object.fromEntries(ACTION_OUTPUTS.map((key) => [key, data[key] ?? null]));
}

export {
  TRIGGERS,
  MAX_WORKOUT_EVENTS,
  RECENT_MS,
  ACTION_OUTPUTS,
  recoverySummary,
  sleepSummary,
  workoutSummary,
  recoveryData,
  sleepData,
  workoutData,
  detectEvents,
  actionOutputs,
};
