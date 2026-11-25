// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The widgets of a made-up WHOOP member on Wednesday 25 November 2026 at
// 18:40 in Paris: the answers of test/helpers/whoop-data.js (shaped like the
// samples of the WHOOP API reference, no real account) are read by the real
// readers (src/whoop.js) and drawn by the real widget builders
// (src/widgets.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildTodayWidget, buildSleepWidget, buildWorkoutsWidget, buildWeekWidget } =
  await load('src/widgets.js');
const { parseCycle, parseRecovery, parseSleep, parseWorkout, readList } =
  await load('src/whoop.js');
const { EMPTY } = await load('src/store.js');
const { LANGUAGES } = await load('src/i18n.js');
const { answers, NOW, TZ } = await load('test/helpers/whoop-data.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const a = answers();
const data = {
  ...EMPTY(),
  cycles: readList(a.cycles, parseCycle, (cycle) => cycle.start),
  recoveries: readList(a.recoveries, parseRecovery, (recovery) => recovery.createdAt),
  sleeps: readList(a.sleeps, parseSleep, (sleep) => sleep.start),
  workouts: readList(a.workouts, parseWorkout, (workout) => workout.start),
};
const sleep = data.sleeps.find((entry) => !entry.nap);
const common = { fetchedAt: NOW - 6 * 60 * 1000, timeZone: TZ };

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    today: buildTodayWidget({
      ...common,
      name: 'Marie',
      recovery: data.recoveries[0],
      cycle: data.cycles[0],
      language,
    }),
    sleep: buildSleepWidget({ ...common, sleep, language }),
    workouts: buildWorkoutsWidget({
      ...common,
      workouts: data.workouts,
      cycle: data.cycles[0],
      language,
    }),
    week: buildWeekWidget({ data, today: '2026-11-25', metric: 'recovery', language }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
