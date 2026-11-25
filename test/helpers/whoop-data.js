// Made-up answers of the WHOOP API v2, shaped exactly like the samples of the
// official API reference (https://developer.whoop.com/api), for one member on
// Wednesday 25 November 2026 in Paris. Used by the tests and by the widget
// illustrations (docs/illustrations/gen.mjs). No real account behind.

const USER_ID = 10129;
// Wednesday 25 November 2026, 18:40 in Paris (UTC+1).
const NOW = Date.parse('2026-11-25T17:40:00Z');
const TZ = 'Europe/Paris';
const OFFSET = '+01:00';
const HOUR = 3600 * 1000;
const MIN = 60 * 1000;

const iso = (ms) => new Date(ms).toISOString();
const day = (n) => Date.parse('2026-11-25T00:00:00Z') - n * 24 * HOUR;
const uuid = (prefix, n) =>
  `${prefix}${String(n).padStart(4, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TOKEN_ANSWER = {
  access_token: 'access-token-1',
  expires_in: 3600,
  refresh_token: 'refresh-token-1',
  scope:
    'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement',
  token_type: 'bearer',
};

const PROFILE = {
  user_id: USER_ID,
  email: 'marie@example.com',
  first_name: 'Marie',
  last_name: 'Durand',
};

const BODY = { height_meter: 1.68, weight_kilogram: 61.2, max_heart_rate: 190 };

// Seven nights (index 0 = the night that ended this morning) and a nap.
const NIGHTS = [
  { bed: '22:05', wake: '06:18', perf: 84, eff: 91.6, rec: 72, hrv: 64.2, rhr: 52 },
  { bed: '23:12', wake: '06:45', perf: 76, eff: 88.1, rec: 55, hrv: 52.8, rhr: 55 },
  { bed: '22:40', wake: '06:30', perf: 88, eff: 93.4, rec: 81, hrv: 71.5, rhr: 50 },
  { bed: '00:20', wake: '06:40', perf: 61, eff: 84.2, rec: 29, hrv: 38.1, rhr: 60 },
  { bed: '22:30', wake: '06:25', perf: 82, eff: 90.7, rec: 66, hrv: 58.9, rhr: 53 },
  { bed: '23:00', wake: '07:10', perf: 90, eff: 94.0, rec: 77, hrv: 66.3, rhr: 51 },
  { bed: '22:50', wake: '06:35', perf: 79, eff: 89.5, rec: 60, hrv: 55.0, rhr: 54 },
];
const STRAINS = [9.8, 14.6, 7.2, 11.9, 16.3, 8.4, 12.1];

/**
 * @description An instant from a local clock time of a day (Paris, UTC+1).
 * @param {number} n - Days before today.
 * @param {string} clock - 'HH:MM' local.
 * @returns {number} The instant.
 */
function at(n, clock) {
  const [h, m] = clock.split(':').map(Number);
  return day(n) + (h - 1) * HOUR + m * MIN;
}

/**
 * @description The made-up answers, fresh for each test.
 * @returns {object} `{ token, profile, body, cycles, recoveries, sleeps, workouts }`.
 */
function answers() {
  const sleeps = NIGHTS.map((night, n) => {
    const end = at(n, night.wake);
    // A bedtime after midnight is on the same day as the wake-up.
    const start = night.bed < '12:00' ? at(n, night.bed) : at(n + 1, night.bed);
    const inBed = end - start;
    const awake = Math.round(inBed * (1 - night.eff / 100));
    const asleep = inBed - awake;
    return {
      id: uuid('5a1e', n + 1),
      cycle_id: 93845 - n,
      v1_id: 93845 - n,
      user_id: USER_ID,
      created_at: iso(end + 5 * MIN),
      updated_at: iso(end + 9 * MIN),
      start: iso(start),
      end: iso(end),
      timezone_offset: OFFSET,
      nap: false,
      score_state: 'SCORED',
      score: {
        stage_summary: {
          total_in_bed_time_milli: inBed,
          total_awake_time_milli: awake,
          total_no_data_time_milli: 0,
          total_light_sleep_time_milli: Math.round(asleep * 0.52),
          total_slow_wave_sleep_time_milli: Math.round(asleep * 0.24),
          total_rem_sleep_time_milli:
            asleep - Math.round(asleep * 0.52) - Math.round(asleep * 0.24),
          sleep_cycle_count: 4,
          disturbance_count: 11 - (n % 5),
        },
        sleep_needed: {
          baseline_milli: 27395716,
          need_from_sleep_debt_milli: 352230,
          need_from_recent_strain_milli: 208595,
          need_from_recent_nap_milli: -12312,
        },
        respiratory_rate: 15.2 + (n % 3) * 0.3,
        sleep_performance_percentage: night.perf,
        sleep_consistency_percentage: 78 + (n % 4) * 3,
        sleep_efficiency_percentage: night.eff,
      },
    };
  });
  sleeps.push({
    id: uuid('5a1e', 90),
    cycle_id: 93844,
    user_id: USER_ID,
    created_at: iso(at(1, '14:40')),
    updated_at: iso(at(1, '14:45')),
    start: iso(at(1, '13:50')),
    end: iso(at(1, '14:30')),
    timezone_offset: OFFSET,
    nap: true,
    score_state: 'SCORED',
    score: {
      stage_summary: {
        total_in_bed_time_milli: 40 * MIN,
        total_awake_time_milli: 6 * MIN,
        total_no_data_time_milli: 0,
        total_light_sleep_time_milli: 28 * MIN,
        total_slow_wave_sleep_time_milli: 6 * MIN,
        total_rem_sleep_time_milli: 0,
        sleep_cycle_count: 0,
        disturbance_count: 1,
      },
      respiratory_rate: 15.0,
      sleep_performance_percentage: 12,
      sleep_efficiency_percentage: 85.0,
    },
  });
  sleeps.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  const recoveries = NIGHTS.map((night, n) => ({
    cycle_id: 93845 - n,
    sleep_id: uuid('5a1e', n + 1),
    user_id: USER_ID,
    created_at: iso(at(n, night.wake) + 11 * MIN),
    updated_at: iso(at(n, night.wake) + 12 * MIN),
    score_state: 'SCORED',
    score: {
      user_calibrating: false,
      recovery_score: night.rec,
      resting_heart_rate: night.rhr,
      hrv_rmssd_milli: night.hrv,
      spo2_percentage: 96.4,
      skin_temp_celsius: 33.7 - (n % 3) * 0.2,
    },
  }));

  const cycles = STRAINS.map((strain, n) => {
    const start = at(n, NIGHTS[n].wake);
    return {
      id: 93845 - n,
      user_id: USER_ID,
      created_at: iso(start + 5 * MIN),
      updated_at: iso(n === 0 ? NOW - 20 * MIN : start + 23 * HOUR),
      start: iso(start),
      ...(n === 0 ? {} : { end: iso(at(n - 1, NIGHTS[n - 1].wake)) }),
      timezone_offset: OFFSET,
      score_state: 'SCORED',
      score: {
        strain,
        kilojoule: Math.round((6500 + strain * 320) * 10) / 10,
        average_heart_rate: 64 + Math.round(strain),
        max_heart_rate: 140 + Math.round(strain * 3),
      },
      step_count: 6000 + Math.round(strain * 400),
    };
  });

  const workout = (n, id, sport, startClock, minutes, strain, kj, avg, max, distance) => {
    const start = at(n, startClock);
    return {
      id: uuid('0b0e', id),
      user_id: USER_ID,
      created_at: iso(start + (minutes + 3) * MIN),
      updated_at: iso(start + (minutes + 6) * MIN),
      start: iso(start),
      end: iso(start + minutes * MIN),
      timezone_offset: OFFSET,
      sport_name: sport,
      score_state: 'SCORED',
      score: {
        average_heart_rate: avg,
        max_heart_rate: max,
        kilojoule: kj,
        percent_recorded: 100,
        ...(distance ? { distance_meter: distance, altitude_gain_meter: 46.5 } : {}),
        altitude_change_meter: 0,
        strain,
        zone_durations: {
          zone_zero_milli: 120000,
          zone_one_milli: 480000,
          zone_two_milli: 900000,
          zone_three_milli: 840000,
          zone_four_milli: 300000,
          zone_five_milli: 60000,
        },
      },
    };
  };
  const workouts = [
    workout(0, 6, 'running', '12:30', 42, 11.8, 2190, 152, 178, 8240),
    workout(1, 5, 'functional-fitness', '18:15', 55, 13.2, 2540, 141, 172, null),
    workout(3, 4, 'cycling', '17:40', 75, 12.4, 3120, 138, 166, 31400),
    workout(4, 3, 'yoga', '07:30', 30, 4.1, 520, 96, 118, null),
    workout(6, 2, 'running', '18:05', 35, 10.6, 1840, 149, 175, 6900),
  ];

  return {
    token: { ...TOKEN_ANSWER },
    profile: { ...PROFILE },
    body: { ...BODY },
    cycles,
    recoveries,
    sleeps,
    workouts,
  };
}

export {
  USER_ID,
  NOW,
  TZ,
  OFFSET,
  TOKEN_ANSWER,
  PROFILE,
  BODY,
  NIGHTS,
  STRAINS,
  answers,
  at,
  uuid,
};
