// Every widget content passes validateWidgetContent (the core's checks) in
// the four languages, the full and the empty cases, within the budget of a
// card (8 components, 1 main one, 6 tiles, 2 texts, 1 status, 4 buttons).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildTodayWidget,
  buildSleepWidget,
  buildWorkoutsWidget,
  buildWeekWidget,
  readWeekSettings,
  messageContent,
  zoneColor,
  sleepColor,
  WEEK_METRICS,
  WIDGET_ACTIONS,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { EMPTY } from '../src/store.js';
import { parseCycle, parseRecovery, parseSleep, parseWorkout, readList } from '../src/whoop.js';
import { answers, NOW, TZ } from './helpers/whoop-data.js';

const a = answers();
const data = {
  ...EMPTY(),
  cycles: readList(a.cycles, parseCycle, (c) => c.start),
  recoveries: readList(a.recoveries, parseRecovery, (r) => r.createdAt),
  sleeps: readList(a.sleeps, parseSleep, (s) => s.start),
  workouts: readList(a.workouts, parseWorkout, (w) => w.start),
};
const recovery = data.recoveries[0];
const cycle = data.cycles[0];
const sleep = data.sleeps.find((entry) => !entry.nap);
const common = { fetchedAt: NOW, timeZone: TZ };

const valid = (content, label) => {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
  assert.ok(content.components.length <= 8, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['text']) <= 2, label);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['status']) <= 1, label);
  assert.ok(count(['button']) <= 4, label);
};

test('today: recovery gauge in its zone color, four tiles, status and the sync button', () => {
  for (const language of LANGUAGES) {
    const full = buildTodayWidget({ ...common, name: 'Marie', recovery, cycle, language });
    valid(full, language);
    const gauge = full.components.find((c) => c.type === 'gauge');
    assert.equal(gauge.value, 72);
    assert.equal(gauge.color, 'success');
    assert.equal(full.components.filter((c) => c.type === 'value').length, 4);
    const button = full.components.find((c) => c.type === 'button');
    assert.equal(button.action.key, WIDGET_ACTIONS.SYNC);
    const empty = buildTodayWidget({
      ...common,
      name: 'Marie',
      recovery: null,
      cycle: null,
      language,
    });
    valid(empty, `${language} empty`);
    assert.ok(!empty.components.some((c) => c.type === 'gauge'));
  }
  const fr = buildTodayWidget({ ...common, name: 'Marie', recovery, cycle, language: 'fr' });
  const tiles = fr.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.label, tile.value]),
    [
      ['Effort', '9,8'],
      ['VFC', 64],
      ['FC repos', 52],
      ['Calories', 2303],
    ],
  );
  const zone = fr.components.find((c) => c.type === 'status').items[0];
  assert.deepEqual([zone.value, zone.color], ['Vert', 'success']);
  const calibrating = buildTodayWidget({
    ...common,
    name: 'Marie',
    recovery: { ...recovery, calibrating: true, score: 20, zone: 'red' },
    cycle,
    language: 'en',
  });
  assert.equal(calibrating.components.find((c) => c.type === 'gauge').color, 'danger');
  assert.equal(
    calibrating.components.find((c) => c.type === 'status').items[0].value,
    'Red · calibrating',
  );
});

test('sleep: performance, stages, then efficiency, breathing, need, window, disturbances', () => {
  for (const language of LANGUAGES) {
    valid(buildSleepWidget({ ...common, sleep, language }), language);
    valid(buildSleepWidget({ ...common, sleep: null, language }), `${language} empty`);
  }
  const en = buildSleepWidget({ ...common, sleep, language: 'en' });
  assert.equal(en.components[0].text, 'Night to Wed, Nov 25');
  const tiles = en.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    [84, '7 h 32', '1 h 48', '1 h 48'],
  );
  const items = en.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    items.map((item) => item.label),
    ['Efficiency', 'Breathing rate', 'Sleep need', 'In bed', 'Disturbances', 'Updated'],
  );
  assert.equal(items[3].value, '22:05 → 06:18');
});

test('workouts: a card list with the strain badge, and the day strain', () => {
  for (const language of LANGUAGES) {
    valid(buildWorkoutsWidget({ ...common, workouts: data.workouts, cycle, language }), language);
    valid(
      buildWorkoutsWidget({ ...common, workouts: [], cycle: null, language }),
      `${language} empty`,
    );
  }
  const fr = buildWorkoutsWidget({ ...common, workouts: data.workouts, cycle, language: 'fr' });
  const [first] = fr.components[0].items;
  assert.equal(first.title, 'Course à pied · 42 min');
  assert.match(first.subtitle, /^mer\. 25 nov\., 12:30 · 8,2 km · 523 kcal · 152 bpm$/);
  assert.deepEqual(first.badge, { text: 'Effort 11,8', color: 'primary' });
  assert.equal(fr.components[0].items[1].badge.text, 'Effort 13,2');
  assert.equal(fr.components[0].items[1].badge.color, 'primary');
});

test('week: one bar series per metric, a message when empty', () => {
  for (const language of LANGUAGES) {
    for (const metric of WEEK_METRICS) {
      const content = buildWeekWidget({ data, today: '2026-11-25', metric, language });
      valid(content, `${metric} ${language}`);
      assert.equal(content.components[0].series[0].points.length, 7, metric);
    }
    valid(
      buildWeekWidget({ data: EMPTY(), today: '2026-11-25', metric: 'recovery', language }),
      `${language} empty`,
    );
  }
  const recoveries = buildWeekWidget({
    data,
    today: '2026-11-25',
    metric: 'recovery',
    language: 'en',
  });
  assert.deepEqual(
    recoveries.components[0].series[0].points.map((point) => point.v),
    [60, 77, 66, 29, 81, 55, 72],
  );
  const strain = buildWeekWidget({ data, today: '2026-11-25', metric: 'strain', language: 'en' });
  assert.equal(strain.components[1].items[1].label, 'Hardest day');
  assert.match(strain.components[1].items[1].value, /16\.3 \/21$/);
  assert.deepEqual(readWeekSettings({ metric: 'hrv' }), { metric: 'hrv' });
  assert.deepEqual(readWeekSettings({ metric: 'steps' }), { metric: 'recovery' });
  assert.deepEqual(readWeekSettings(), { metric: 'recovery' });
});

test('colors and messages', () => {
  assert.equal(zoneColor('green'), 'success');
  assert.equal(zoneColor('yellow'), 'warning');
  assert.equal(zoneColor('red'), 'danger');
  assert.equal(zoneColor(null), 'neutral');
  assert.equal(sleepColor(90), 'success');
  assert.equal(sleepColor(75), 'warning');
  assert.equal(sleepColor(60), 'danger');
  assert.equal(sleepColor(null), 'neutral');
  const message = messageContent('x'.repeat(400));
  valid(message, 'message');
  assert.equal(message.components[0].text.length, 300);
});
