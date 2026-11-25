// -----------------------------------------------------------------------------
// The answers of the WHOOP API v2, read into plain records.
//
// Field names come from the official API reference (developer.whoop.com/api,
// read on 2026-11-25):
//   - cycle (a physiological day, from waking to waking): `id` (int64),
//     `start`, `end` (absent while it runs), `timezone_offset` ("+01:00"),
//     `score_state`, `score.strain`, `score.kilojoule`,
//     `score.average_heart_rate`, `score.max_heart_rate`, `step_count`;
//   - recovery: `cycle_id`, `sleep_id` (UUID), `created_at`, `score_state`,
//     `score.recovery_score` (0-100 %), `score.resting_heart_rate`,
//     `score.hrv_rmssd_milli`, `score.spo2_percentage`,
//     `score.skin_temp_celsius` (both WHOOP 4.0 and later),
//     `score.user_calibrating`;
//   - sleep: `id` (UUID), `cycle_id`, `start`, `end`, `timezone_offset`,
//     `nap`, `score_state`, `score.stage_summary.*_milli`,
//     `score.sleep_needed.*_milli`, `score.respiratory_rate`,
//     `score.sleep_performance_percentage`,
//     `score.sleep_consistency_percentage`,
//     `score.sleep_efficiency_percentage`;
//   - workout: `id` (UUID), `start`, `end`, `timezone_offset`, `sport_name`,
//     `score_state`, `score.strain`, `score.average_heart_rate`,
//     `score.max_heart_rate`, `score.kilojoule`, `score.distance_meter`,
//     `score.altitude_gain_meter`, `score.zone_durations.zone_*_milli`;
//   - body measurement: `height_meter`, `weight_kilogram`, `max_heart_rate`;
//   - basic profile: `user_id` (int64), `first_name`.
// `score` only exists when `score_state` is SCORED (else PENDING_SCORE or
// UNSCORABLE). A missing or malformed value is null.
// -----------------------------------------------------------------------------

const KJ_PER_KCAL = 4.184;
const SCORE_STATES = ['SCORED', 'PENDING_SCORE', 'UNSCORABLE'];
// WHOOP's recovery zones: red 0-33 %, yellow 34-66 %, green 67-100 %.
const ZONES = ['red', 'yellow', 'green'];

// Families of sports, for the filter of the "workout scored" trigger. WHOOP
// gives a free sport name ("running", "functional-fitness"…): the family is
// read from it.
const SPORT_FAMILIES = ['running', 'cycling', 'walking', 'swimming', 'strength', 'other'];
const FAMILY_RULES = [
  ['swimming', /swim|water polo|diving/],
  ['running', /run|jog|track|cross country|ultramarathon|obstacle/],
  ['cycling', /cycl|bik|spin|peloton|assault/],
  ['walking', /walk|hik|rucking|stroller|dog/],
  [
    'strength',
    /weight|strength|lifting|powerlift|crossfit|functional|hiit|kettlebell|f45|barry|bootcamp|circuit|stairmaster|box|kickbox|martial|jiu|wrestling/,
  ],
];

/**
 * @description A finite number, or null.
 * @param {unknown} value - The value.
 * @returns {number|null} The number.
 */
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * @description A non-empty trimmed string, or null.
 * @param {unknown} value - The value.
 * @returns {string|null} The string.
 */
const str = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * @description An instant in ms from an RFC 3339 date-time, or null.
 * @param {unknown} value - '2026-11-25T06:42:10.000Z'.
 * @returns {number|null} The instant.
 */
function instant(value) {
  const text = str(value);
  if (!text) {
    return null;
  }
  const at = Date.parse(text);
  return Number.isFinite(at) ? at : null;
}

/**
 * @description An id (int64 or UUID) as a string, or null.
 * @param {unknown} value - The id.
 * @returns {string|null} The id.
 */
function id(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  const text = str(value);
  return text && /^[\w-]{1,64}$/.test(text) ? text : null;
}

/**
 * @description The offset of a `timezone_offset` in minutes ("+01:00", "-05:30", "Z").
 * @param {unknown} value - The offset.
 * @returns {number|null} Minutes east of UTC.
 */
function offsetMinutes(value) {
  const text = str(value);
  if (text === 'Z') {
    return 0;
  }
  const match = text ? /^([+-])(\d{2}):?(\d{2})$/.exec(text) : null;
  if (!match) {
    return null;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * @description The local date of an instant at an offset: the day the member lived it.
 * @param {number|null} at - The instant.
 * @param {number|null} offset - Minutes east of UTC (null: UTC).
 * @returns {string|null} 'YYYY-MM-DD'.
 */
function localDateAt(at, offset) {
  if (at === null) {
    return null;
  }
  return new Date(at + (offset ?? 0) * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * @description The score state, UNSCORABLE when unknown.
 * @param {unknown} value - The raw state.
 * @returns {string} SCORED, PENDING_SCORE or UNSCORABLE.
 */
const stateOf = (value) => (SCORE_STATES.includes(value) ? value : 'UNSCORABLE');

/**
 * @description The score object when the record is scored, else null.
 * @param {object} raw - The record.
 * @returns {object|null} The score.
 */
const scoreOf = (raw) =>
  stateOf(raw?.score_state) === 'SCORED' && raw?.score && typeof raw.score === 'object'
    ? raw.score
    : null;

/**
 * @description Kilojoules in kilocalories.
 * @param {number|null} kj - Kilojoules.
 * @returns {number|null} Kilocalories.
 */
const kcalOf = (kj) => (kj === null ? null : kj / KJ_PER_KCAL);

/**
 * @description The recovery zone of a score.
 * @param {number|null} score - 0-100.
 * @returns {string|null} red, yellow or green.
 */
function zoneOf(score) {
  if (score === null) {
    return null;
  }
  if (score >= 67) {
    return 'green';
  }
  return score >= 34 ? 'yellow' : 'red';
}

/**
 * @description The family of a sport name.
 * @param {string|null} sport - 'running', 'functional-fitness'…
 * @returns {string} One of SPORT_FAMILIES.
 */
function familyOf(sport) {
  const name = (sport ?? '').toLowerCase().replace(/[-_]/g, ' ');
  for (const [family, rule] of FAMILY_RULES) {
    if (rule.test(name)) {
      return family;
    }
  }
  return 'other';
}

/**
 * @description A cycle.
 * @param {object} raw - A record of /v2/cycle.
 * @returns {object|null} The cycle.
 */
function parseCycle(raw) {
  const cycleId = id(raw?.id);
  const start = instant(raw?.start);
  if (!cycleId || start === null) {
    return null;
  }
  const score = scoreOf(raw);
  const offset = offsetMinutes(raw.timezone_offset);
  const kilojoule = num(score?.kilojoule);
  return {
    id: cycleId,
    start,
    end: instant(raw.end),
    offset,
    date: localDateAt(start, offset),
    state: stateOf(raw.score_state),
    strain: num(score?.strain),
    kcal: kcalOf(kilojoule),
    avgHeartRate: num(score?.average_heart_rate),
    maxHeartRate: num(score?.max_heart_rate),
    steps: num(raw.step_count),
  };
}

/**
 * @description A recovery.
 * @param {object} raw - A record of /v2/recovery.
 * @returns {object|null} The recovery.
 */
function parseRecovery(raw) {
  const sleepId = id(raw?.sleep_id);
  const cycleId = id(raw?.cycle_id);
  if (!sleepId && !cycleId) {
    return null;
  }
  const score = scoreOf(raw);
  const value = num(score?.recovery_score);
  return {
    // The v2 recovery has no id of its own: its sleep is its key.
    id: sleepId ?? `cycle-${cycleId}`,
    sleepId,
    cycleId,
    createdAt: instant(raw.created_at),
    updatedAt: instant(raw.updated_at),
    state: stateOf(raw.score_state),
    score: value,
    zone: zoneOf(value),
    restingHeartRate: num(score?.resting_heart_rate),
    hrv: num(score?.hrv_rmssd_milli),
    spo2: num(score?.spo2_percentage),
    skinTemp: num(score?.skin_temp_celsius),
    calibrating: score?.user_calibrating === true,
  };
}

/**
 * @description A sleep (or a nap).
 * @param {object} raw - A record of /v2/activity/sleep.
 * @returns {object|null} The sleep.
 */
function parseSleep(raw) {
  const sleepId = id(raw?.id);
  const start = instant(raw?.start);
  const end = instant(raw?.end);
  if (!sleepId || start === null) {
    return null;
  }
  const score = scoreOf(raw);
  const stages = score?.stage_summary ?? {};
  const need = score?.sleep_needed ?? {};
  const light = num(stages.total_light_sleep_time_milli);
  const deep = num(stages.total_slow_wave_sleep_time_milli);
  const rem = num(stages.total_rem_sleep_time_milli);
  const asleep =
    light === null && deep === null && rem === null
      ? null
      : (light ?? 0) + (deep ?? 0) + (rem ?? 0);
  const needParts = [
    need.baseline_milli,
    need.need_from_sleep_debt_milli,
    need.need_from_recent_strain_milli,
    need.need_from_recent_nap_milli,
  ].map(num);
  const offset = offsetMinutes(raw.timezone_offset);
  return {
    id: sleepId,
    cycleId: id(raw.cycle_id),
    start,
    end,
    offset,
    // The night belongs to the day the member wakes up.
    date: localDateAt(end ?? start, offset),
    nap: raw.nap === true,
    state: stateOf(raw.score_state),
    inBedMs: num(stages.total_in_bed_time_milli),
    awakeMs: num(stages.total_awake_time_milli),
    lightMs: light,
    deepMs: deep,
    remMs: rem,
    asleepMs: asleep,
    cycles: num(stages.sleep_cycle_count),
    disturbances: num(stages.disturbance_count),
    neededMs: needParts.every((part) => part === null)
      ? null
      : needParts.reduce((total, part) => total + (part ?? 0), 0),
    respiratoryRate: num(score?.respiratory_rate),
    performance: num(score?.sleep_performance_percentage),
    consistency: num(score?.sleep_consistency_percentage),
    efficiency: num(score?.sleep_efficiency_percentage),
  };
}

/**
 * @description A workout.
 * @param {object} raw - A record of /v2/activity/workout.
 * @returns {object|null} The workout.
 */
function parseWorkout(raw) {
  const workoutId = id(raw?.id);
  const start = instant(raw?.start);
  if (!workoutId || start === null) {
    return null;
  }
  const score = scoreOf(raw);
  const zones = score?.zone_durations ?? {};
  const sport = str(raw.sport_name)?.slice(0, 60) ?? null;
  const end = instant(raw.end);
  const offset = offsetMinutes(raw.timezone_offset);
  return {
    id: workoutId,
    start,
    end,
    offset,
    date: localDateAt(start, offset),
    durationMs: end !== null && end > start ? end - start : null,
    sport,
    family: familyOf(sport),
    state: stateOf(raw.score_state),
    strain: num(score?.strain),
    avgHeartRate: num(score?.average_heart_rate),
    maxHeartRate: num(score?.max_heart_rate),
    kcal: kcalOf(num(score?.kilojoule)),
    distanceMeters: num(score?.distance_meter),
    altitudeGain: num(score?.altitude_gain_meter),
    zonesMs: ['zero', 'one', 'two', 'three', 'four', 'five'].map((n) =>
      num(zones[`zone_${n}_milli`]),
    ),
  };
}

/**
 * @description The body measurement.
 * @param {object} raw - The answer of /v2/user/measurement/body.
 * @returns {object|null} `{ heightM, weightKg, maxHeartRate }`.
 */
function parseBody(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const body = {
    heightM: num(raw.height_meter),
    weightKg: num(raw.weight_kilogram),
    maxHeartRate: num(raw.max_heart_rate),
  };
  return Object.values(body).some((value) => value !== null) ? body : null;
}

/**
 * @description The basic profile: the user id and the first name only (never
 * the e-mail address nor the last name).
 * @param {object} raw - The answer of /v2/user/profile/basic.
 * @returns {object|null} `{ userId, firstName }`.
 */
function parseProfile(raw) {
  const userId = id(raw?.user_id);
  if (!userId || !/^\d+$/.test(userId)) {
    return null;
  }
  return { userId, firstName: str(raw.first_name)?.slice(0, 40) ?? null };
}

/**
 * @description Read a list of records, dropping the malformed ones, newest first.
 * @param {unknown[]} items - The raw records.
 * @param {Function} parse - The parser.
 * @param {Function} sortKey - `(record) => number`.
 * @returns {object[]} The records.
 */
function readList(items, parse, sortKey) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => parse(item))
    .filter((record) => record && !seen.has(record.id) && seen.add(record.id))
    .sort((a, b) => (sortKey(b) ?? 0) - (sortKey(a) ?? 0));
}

export {
  KJ_PER_KCAL,
  SCORE_STATES,
  ZONES,
  SPORT_FAMILIES,
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
};
