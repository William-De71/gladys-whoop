// The discovered device, checked against what the Gladys core expects
// (community thread 11005): every feature carries min / max / read_only /
// has_feedback, `should_poll` is explicit and no `poll_frequency` is sent
// (WHOOP is read on the integration's own timer), category / type pairs and
// units come from the SDK constants and the units the core allows per
// category (DEVICE_FEATURE_UNITS_BY_CATEGORY of server/utils/constants.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import { buildDevice, buildStates, FEATURES, userIdOfDevice } from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys } from './helpers/fakes.js';

// Units the core offers for the categories used here (Gladys 5.3.0);
// counter-sensor and text have none.
const UNITS_BY_CATEGORY = {
  [CATEGORIES.DURATION]: [UNITS.MILLISECONDS, UNITS.SECONDS, UNITS.MINUTES, UNITS.HOURS],
  [CATEGORIES.DISTANCE_SENSOR]: [UNITS.M, UNITS.KM],
  [CATEGORIES.LEVEL_SENSOR]: [UNITS.M, UNITS.PERCENT],
  [CATEGORIES.TEMPERATURE_SENSOR]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.COUNTER_SENSOR]: [],
  [CATEGORIES.TEXT]: [],
};
// Pairs the front knows (deviceFeatureCategory of front/src/config/i18n/en.json).
const PAIRS = [
  `${CATEGORIES.COUNTER_SENSOR}/${TYPES.SENSOR.INTEGER}`,
  `${CATEGORIES.DURATION}/${TYPES.DURATION.INTEGER}`,
  `${CATEGORIES.DURATION}/${TYPES.DURATION.DECIMAL}`,
  `${CATEGORIES.DISTANCE_SENSOR}/${TYPES.SENSOR.DECIMAL}`,
  `${CATEGORIES.LEVEL_SENSOR}/${TYPES.SENSOR.DECIMAL}`,
  `${CATEGORIES.TEMPERATURE_SENSOR}/${TYPES.SENSOR.DECIMAL}`,
  `${CATEGORIES.TEXT}/${TYPES.TEXT.TEXT}`,
];

const member = { userId: '10129', name: 'Marie' };

test('one device per member, its id from the WHOOP user id, never polled by Gladys', () => {
  const device = buildDevice(fakeGladys, member, { language: 'fr' });
  assert.equal(device.external_id, 'ext:test-integration:member:10129');
  assert.equal(device.name, 'WHOOP Marie');
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(device.params, [{ name: 'WHOOP_USER_ID', value: '10129' }]);
  assert.equal(buildDevice(fakeGladys, { userId: '1' }, { language: 'de' }).name, 'WHOOP');
  assert.equal(userIdOfDevice(device.external_id), '10129');
  assert.equal(userIdOfDevice(`${device.external_id}:skin_temperature`), '10129');
  assert.equal(userIdOfDevice('ext:x:spot:1'), null);
});

test('every feature: required fields, a known pair, an allowed unit, a name in 4 languages', () => {
  for (const language of LANGUAGES) {
    const device = buildDevice(fakeGladys, member, { language });
    assert.equal(device.features.length, FEATURES.length);
    for (const feature of device.features) {
      for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
      }
      assert.equal(feature.read_only, true);
      assert.ok(feature.min <= feature.max);
      assert.ok(PAIRS.includes(`${feature.category}/${feature.type}`), feature.external_id);
      if (feature.unit !== undefined) {
        assert.ok(UNITS_BY_CATEGORY[feature.category].includes(feature.unit), feature.external_id);
      }
      assert.ok(feature.name && !feature.name.startsWith('feature_'), feature.external_id);
      assert.match(feature.external_id, /^ext:test-integration:member:10129:[a-z0-9_]+$/);
    }
    assert.equal(new Set(device.features.map((f) => f.name)).size, FEATURES.length);
  }
});

test('states: numbers within the bounds, the text feature as text, nothing unknown', () => {
  const snapshot = {
    recovery: {
      score: 104,
      zone: 'yellow',
      restingHeartRate: 51,
      hrv: 48.27,
      spo2: 95.81,
      skinTemp: 33.456,
    },
    cycle: { strain: 23.4, kcal: 2345.6 },
    sleep: { performance: 77, asleepMs: 27000000, efficiency: 90.04, respiratoryRate: 14.83 },
    workout: { strain: 12.06 },
  };
  const states = buildStates(fakeGladys, '10129', snapshot, 'es');
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
  );
  assert.equal(byKey.recovery, 100, 'clamped to max');
  assert.equal(byKey.day_strain, 21, 'clamped to max');
  assert.equal(byKey.recovery_zone, 'Amarillo');
  assert.equal(byKey.hrv, 48.3);
  assert.equal(byKey.skin_temperature, 33.46);
  assert.equal(byKey.calories, 2346);
  assert.equal(byKey.sleep_time, 7.5);
  assert.equal(byKey.last_workout_strain, 12.1);
  assert.equal(states.find((s) => s.text).state, undefined);
  assert.deepEqual(buildStates(fakeGladys, '10129', {}, 'en'), []);
});
