// -----------------------------------------------------------------------------
// One Gladys device per linked WHOOP member: "WHOOP Marie".
//
// External ids: `ext:<selector>:member:<WHOOP user id>` and
// `…:member:<id>:<feature key>`. The id is the `user_id` of the basic
// profile (int64): renaming the member keeps the device.
//
// Features (category / type from the SDK constants, the same pairs as the
// other wearable integrations). Gladys has no health category and no heart
// rate or calorie unit, so:
//   - percentages (recovery, SpO2, sleep performance and efficiency):
//     `level-sensor` / `decimal`, percent;
//   - the recovery zone: `text`, in the configured language;
//   - counts without a Gladys unit (resting heart rate in bpm, kilocalories):
//     `counter-sensor` / `integer` without unit, the unit in the name;
//   - heart rate variability (RMSSD): `duration` / `decimal`, milliseconds;
//   - skin temperature: `temperature-sensor` / `decimal`, °C;
//   - strain (WHOOP's 0-21 scale) and breathing rate: `level-sensor` /
//     `decimal` without unit;
//   - time asleep: `duration` / `decimal`, hours.
// No weight feature (no mass unit in Gladys): the scene action gives it.
//
// A value is published once WHOOP has scored it (`score_state` SCORED);
// until then the feature keeps its last value. `should_poll` stays false:
// WHOOP is read on the integration's own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import { t, zoneLabel } from './i18n.js';

const DEVICE_TYPE = 'member';
const MODEL = 'WHOOP member (Developer Platform API)';

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const counter = (max, min = 0) => ({
  category: CATEGORIES.COUNTER_SENSOR,
  type: TYPES.SENSOR.INTEGER,
  ...sensor,
  min,
  max,
});
const level = (min, max, unit) => ({
  category: CATEGORIES.LEVEL_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  ...(unit ? { unit } : {}),
  ...sensor,
  min,
  max,
});

const round = (value, digits = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const clamp = (value, { min, max }) =>
  value === null ? null : Math.min(max, Math.max(min, value));

// The features: key (eternal), its shape, and its value from the snapshot
// `{ cycle, recovery, sleep, workout }` (null: nothing to publish).
const FEATURES = [
  {
    key: 'recovery',
    shape: level(0, 100, UNITS.PERCENT),
    value: (s) => round(s.recovery?.score),
  },
  {
    key: 'recovery_zone',
    shape: {
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 0,
    },
    text: true,
    value: (s, language) => (s.recovery?.zone ? zoneLabel(s.recovery.zone, language) : null),
  },
  {
    key: 'resting_heart_rate',
    shape: counter(250),
    value: (s) => round(s.recovery?.restingHeartRate),
  },
  {
    key: 'hrv',
    shape: {
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.MILLISECONDS,
      ...sensor,
      min: 0,
      max: 400,
    },
    value: (s) => round(s.recovery?.hrv, 1),
  },
  {
    key: 'spo2',
    shape: level(0, 100, UNITS.PERCENT),
    value: (s) => round(s.recovery?.spo2, 1),
  },
  {
    key: 'skin_temperature',
    shape: {
      category: CATEGORIES.TEMPERATURE_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.CELSIUS,
      ...sensor,
      min: 20,
      max: 45,
    },
    value: (s) => round(s.recovery?.skinTemp, 2),
  },
  { key: 'day_strain', shape: level(0, 21), value: (s) => round(s.cycle?.strain, 1) },
  { key: 'calories', shape: counter(20000), value: (s) => round(s.cycle?.kcal) },
  {
    key: 'sleep_performance',
    shape: level(0, 100, UNITS.PERCENT),
    value: (s) => round(s.sleep?.performance),
  },
  {
    key: 'sleep_time',
    shape: {
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.HOURS,
      ...sensor,
      min: 0,
      max: 24,
    },
    value: (s) => (s.sleep?.asleepMs == null ? null : round(s.sleep.asleepMs / 3600000, 2)),
  },
  {
    key: 'sleep_efficiency',
    shape: level(0, 100, UNITS.PERCENT),
    value: (s) => round(s.sleep?.efficiency, 1),
  },
  {
    key: 'respiratory_rate',
    shape: level(0, 60),
    value: (s) => round(s.sleep?.respiratoryRate, 1),
  },
  {
    key: 'last_workout_strain',
    shape: level(0, 21),
    value: (s) => round(s.workout?.strain, 1),
  },
];

/**
 * @description The ids of a member device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} userId - The WHOOP user id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, userId) => gladys.externalIds(DEVICE_TYPE, String(userId));

/**
 * @description The WHOOP member a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @returns {string|null} The WHOOP user id.
 * @example
 * userIdOfDevice('ext:whoop:member:10129'); // -> '10129'
 */
function userIdOfDevice(externalId) {
  const match = /:member:(\d{1,20})(?::[a-z0-9_]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The device of a member.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} member - `{ userId, name }`.
 * @param {object} [options] - `{ language }`.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, { userId, name }, { language = 'en' } = {}) {
  const ids = idsOf(gladys, userId);
  return {
    name: name ? t('deviceName', language, { name }) : t('deviceNameDefault', language),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [{ name: 'WHOOP_USER_ID', value: String(userId) }],
    features: FEATURES.map((spec) => ({
      name: t(`feature_${spec.key}`, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description The states of a member device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} userId - The WHOOP user id.
 * @param {object} snapshot - `{ cycle, recovery, sleep, workout }`.
 * @param {string} language - The language of the text features.
 * @returns {object[]} The states (none for an unknown value).
 */
function buildStates(gladys, userId, snapshot, language = 'en') {
  const ids = idsOf(gladys, userId);
  return FEATURES.flatMap((spec) => {
    const raw = spec.value(snapshot, language);
    if (raw === null || raw === undefined) {
      return [];
    }
    const id = ids.feature(spec.key);
    return spec.text
      ? [{ device_feature_external_id: id, text: String(raw) }]
      : [{ device_feature_external_id: id, state: clamp(raw, spec.shape) }];
  });
}

export { DEVICE_TYPE, MODEL, FEATURES, idsOf, userIdOfDevice, buildDevice, buildStates };
