// -----------------------------------------------------------------------------
// Dashboard widgets of the WHOOP integration.
//
//   - `today`     the morning numbers: recovery as a gauge (colored by its
//                 zone), today's strain, HRV, resting heart rate, calories,
//                 the time of the last reading and a "Sync now" button;
//   - `sleep`     the last sleep: performance, time asleep, deep (slow wave)
//                 and REM sleep, then efficiency, breathing rate, sleep need,
//                 sleep window and disturbances;
//   - `workouts`  the last workouts as a card list (strain as a badge), and
//                 today's strain;
//   - `week`      the last seven days as a bar chart: recovery, strain, sleep
//                 performance or HRV.
//
// The contents come from what the last reading kept: a widget never costs a
// request to WHOOP. Colors are semantic. Every text exists in the four
// languages (the content is cached per language). Content budget of a card:
// 8 components, 1 main one, 6 tiles, 2 texts, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { addDays } from './time.js';
import {
  t,
  zoneLabel,
  sportLabel,
  formatNumber,
  formatMinutes,
  shortTime,
  shortDate,
  dayTimeAt,
  clockAt,
} from './i18n.js';

const WIDGETS = { TODAY: 'today', SLEEP: 'sleep', WORKOUTS: 'workouts', WEEK: 'week' };
const WIDGET_ACTIONS = { SYNC: 'sync' };
const WEEK_METRICS = ['recovery', 'strain', 'sleep_performance', 'hrv'];
const MAX_CARDS = 8;
// WHOOP is read every 15 to 60 minutes: ten minutes of cache, nudged after
// each reading.
const TTL = { data: 600, message: 300 };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

const round = (value, digits = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : null;
const minutesOf = (ms) => (ms == null ? null : Math.round(ms / 60000));

/**
 * @description A tile.
 * @param {string} label - The label.
 * @param {number|string|null} value - The value.
 * @param {string} [unit] - The unit.
 * @param {string} [icon] - A Feather icon.
 * @param {string} [color] - A semantic color.
 * @returns {object} The component.
 */
const tile = (label, value, unit, icon, color = 'neutral') => ({
  type: 'value',
  label: clip(label, 24),
  value:
    value === null || value === undefined
      ? '-'
      : typeof value === 'string'
        ? clip(value, 12)
        : value,
  ...(value === null || value === undefined || !unit ? {} : { unit }),
  ...(icon ? { icon } : {}),
  color,
});

/**
 * @description The color of a recovery zone.
 * @param {string|null} zone - red, yellow or green.
 * @returns {string} A semantic color.
 */
function zoneColor(zone) {
  switch (zone) {
    case 'green':
      return 'success';
    case 'yellow':
      return 'warning';
    case 'red':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * @description The color of a sleep performance.
 * @param {number|null} performance - 0-100 %.
 * @returns {string} A semantic color (WHOOP: 85 % and up is optimal, below 70 % poor).
 */
function sleepColor(performance) {
  if (typeof performance !== 'number') {
    return 'neutral';
  }
  if (performance >= 85) {
    return 'success';
  }
  return performance >= 70 ? 'warning' : 'danger';
}

/**
 * @description The "last reading" row.
 * @param {number|null} fetchedAt - When WHOOP was read, in ms.
 * @param {string} language - The language.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {object} The status item.
 */
const updatedItem = (fetchedAt, language, timeZone) => ({
  label: t('widgetUpdated', language),
  value: fetchedAt ? shortTime(fetchedAt, language, timeZone) : '-',
  color: 'neutral',
});

/**
 * @description The today widget.
 * @param {object} input - Input.
 * @param {string} input.name - The member name.
 * @param {object|null} input.recovery - The latest scored recovery.
 * @param {object|null} input.cycle - The current cycle.
 * @param {number|null} input.fetchedAt - When WHOOP was read, in ms.
 * @param {string} input.language - The language.
 * @param {string} [input.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildTodayWidget({ name, recovery, cycle, fetchedAt, language, timeZone }) {
  const components = [{ type: 'text', variant: 'heading', text: clip(name, 40) }];
  const items = [];
  if (recovery?.score != null) {
    components.push({
      type: 'gauge',
      label: clip(t('tileRecovery', language), 24),
      value: round(recovery.score),
      min: 0,
      max: 100,
      unit: '%',
      color: zoneColor(recovery.zone),
    });
    items.push({
      label: t('widgetZone', language),
      value: clip(
        recovery.calibrating
          ? `${zoneLabel(recovery.zone, language)} · ${t('widgetCalibrating', language)}`
          : zoneLabel(recovery.zone, language),
        40,
      ),
      color: zoneColor(recovery.zone),
    });
  } else {
    components.push({ type: 'text', variant: 'body', text: t('widgetNoRecovery', language) });
  }
  components.push(
    tile(
      t('tileStrain', language),
      cycle?.strain == null ? null : formatNumber(cycle.strain, language, 1),
      '/21',
      'zap',
      'primary',
    ),
    tile(t('tileHrv', language), round(recovery?.hrv), 'ms', 'activity'),
    tile(
      t('tileRestingHr', language),
      round(recovery?.restingHeartRate),
      t('bpm', language),
      'heart',
    ),
    tile(t('tileCalories', language), round(cycle?.kcal), 'kcal', 'sun'),
  );
  items.push(updatedItem(fetchedAt, language, timeZone));
  components.push(
    { type: 'status', items },
    {
      type: 'button',
      label: clip(t('buttonSync', language), 24),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.SYNC },
    },
  );
  return { ttl_seconds: TTL.data, components };
}

/**
 * @description The sleep widget.
 * @param {object} input - Input.
 * @param {object|null} input.sleep - The latest scored sleep (not a nap).
 * @param {number|null} input.fetchedAt - When WHOOP was read, in ms.
 * @param {string} input.language - The language.
 * @param {string} [input.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildSleepWidget({ sleep, fetchedAt, language, timeZone }) {
  if (!sleep) {
    return messageContent(t('widgetNoSleep', language));
  }
  const time = (ms) => (minutesOf(ms) === null ? null : formatMinutes(minutesOf(ms), language));
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: clip(t('widgetNightOf', language, { date: shortDate(sleep.date, language) }), 40),
    },
    tile(
      t('tilePerformance', language),
      round(sleep.performance),
      '%',
      'moon',
      sleepColor(sleep.performance),
    ),
    tile(t('tileAsleep', language), time(sleep.asleepMs), null, 'clock'),
    tile(t('tileDeep', language), time(sleep.deepMs), null, 'battery-charging'),
    tile(t('tileRem', language), time(sleep.remMs), null, 'eye'),
  ];
  const items = [];
  if (sleep.efficiency != null) {
    items.push({
      label: t('widgetEfficiency', language),
      value: `${formatNumber(sleep.efficiency, language, 0)} %`,
      color: 'neutral',
    });
  }
  if (sleep.respiratoryRate != null) {
    items.push({
      label: t('widgetBreathing', language),
      value: `${formatNumber(sleep.respiratoryRate, language, 1)} /min`,
      color: 'neutral',
    });
  }
  if (sleep.neededMs != null) {
    items.push({
      label: t('widgetSleepNeed', language),
      value: formatMinutes(minutesOf(sleep.neededMs), language),
      color: 'neutral',
    });
  }
  if (sleep.end != null) {
    items.push({
      label: t('widgetSleepWindow', language),
      value: `${clockAt(sleep.start, sleep.offset)} → ${clockAt(sleep.end, sleep.offset)}`,
      color: 'neutral',
    });
  }
  if (sleep.disturbances != null) {
    items.push({
      label: t('widgetDisturbances', language),
      value: sleep.disturbances,
      color: 'neutral',
    });
  }
  items.push(updatedItem(fetchedAt, language, timeZone));
  components.push({ type: 'status', items });
  return { ttl_seconds: TTL.data, components };
}

/**
 * @description The workouts widget.
 * @param {object} input - Input.
 * @param {object[]} input.workouts - The workouts, newest first.
 * @param {object|null} input.cycle - The current cycle.
 * @param {number|null} input.fetchedAt - When WHOOP was read, in ms.
 * @param {string} input.language - The language.
 * @param {string} [input.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildWorkoutsWidget({ workouts, cycle, fetchedAt, language, timeZone }) {
  const components = [];
  const scored = workouts.filter((workout) => workout.state !== 'UNSCORABLE');
  if (scored.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t('widgetNoWorkout', language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: scored.slice(0, MAX_CARDS).map((workout) => {
        const minutes = minutesOf(workout.durationMs);
        const details = [dayTimeAt(workout.start, workout.offset, language)];
        if (workout.distanceMeters) {
          details.push(`${formatNumber(workout.distanceMeters / 1000, language, 1)} km`);
        }
        if (workout.kcal != null) {
          details.push(`${formatNumber(workout.kcal, language, 0)} kcal`);
        }
        if (workout.avgHeartRate != null) {
          details.push(`${workout.avgHeartRate} ${t('bpm', language)}`);
        }
        const label = sportLabel(workout.sport, language);
        return {
          title: clip(
            minutes === null ? label : `${label} · ${formatMinutes(minutes, language)}`,
            60,
          ),
          subtitle: clip(details.filter(Boolean).join(' · '), 60),
          ...(workout.strain == null
            ? {}
            : {
                badge: {
                  text: clip(
                    t('badgeStrain', language, {
                      value: formatNumber(workout.strain, language, 1),
                    }),
                    16,
                  ),
                  color: workout.strain >= 14 ? 'warning' : 'primary',
                },
              }),
        };
      }),
    });
  }
  const items = [];
  if (cycle?.strain != null) {
    items.push({
      label: t('widgetDayStrain', language),
      value: `${formatNumber(cycle.strain, language, 1)} / 21`,
      color: 'primary',
    });
  }
  items.push(updatedItem(fetchedAt, language, timeZone));
  components.push({ type: 'status', items });
  return { ttl_seconds: TTL.data, components };
}

/**
 * @description The day of a recovery: the day its sleep ended.
 * @param {object} recovery - The recovery.
 * @param {object[]} sleeps - The sleeps.
 * @returns {string|null} 'YYYY-MM-DD'.
 */
function recoveryDate(recovery, sleeps) {
  return sleeps.find((sleep) => sleep.id === recovery.sleepId)?.date ?? recovery.date ?? null;
}

/**
 * @description The week widget.
 * @param {object} input - Input.
 * @param {object} input.data - The store data (cycles, recoveries, sleeps).
 * @param {string} input.today - Today, 'YYYY-MM-DD'.
 * @param {string} input.metric - One of WEEK_METRICS.
 * @param {string} input.language - The language.
 * @returns {object} The content.
 */
function buildWeekWidget({ data, today, metric, language }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const scored = (list) => list.filter((entry) => entry.state === 'SCORED');
  const valueOf = (date) => {
    if (metric === 'strain') {
      return round(scored(data.cycles).find((cycle) => cycle.date === date)?.strain, 1);
    }
    if (metric === 'sleep_performance') {
      return round(
        scored(data.sleeps).find((sleep) => !sleep.nap && sleep.date === date)?.performance,
      );
    }
    const recovery = scored(data.recoveries).find(
      (entry) => recoveryDate(entry, data.sleeps) === date,
    );
    return metric === 'hrv' ? round(recovery?.hrv) : round(recovery?.score);
  };
  const points = days
    .map((date) => ({ t: `${date}T00:00:00.000Z`, v: valueOf(date) }))
    .filter((point) => point.v !== null);
  if (points.length === 0) {
    return messageContent(t('widgetNoWeek', language));
  }
  const unit = { recovery: '%', strain: '/21', sleep_performance: '%', hrv: 'ms' }[metric];
  const digits = metric === 'strain' ? 1 : 0;
  const values = points.map((point) => point.v);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const best = points.reduce((top, point) => (point.v > top.v ? point : top), points[0]);
  const format = (value) => `${formatNumber(value, language, digits)} ${unit}`;
  return {
    ttl_seconds: TTL.data,
    components: [
      {
        type: 'chart',
        chart_type: 'bar',
        title: clip(t(`chart_${metric}`, language), 40),
        unit,
        series: [{ name: clip(t(`series_${metric}`, language), 24), points }],
      },
      {
        type: 'status',
        items: [
          { label: t('widgetAverage', language), value: format(average), color: 'neutral' },
          {
            label: t(metric === 'strain' ? 'widgetHardestDay' : 'widgetBestDay', language),
            value: clip(`${shortDate(best.t.slice(0, 10), language)} · ${format(best.v)}`, 40),
            color: 'success',
          },
        ],
      },
    ],
  };
}

/**
 * @description Read the settings of the week widget.
 * @param {object} [settings] - The settings.
 * @returns {{ metric: string }} The metric.
 */
function readWeekSettings(settings = {}) {
  return { metric: WEEK_METRICS.includes(settings?.metric) ? settings.metric : 'recovery' };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  WEEK_METRICS,
  MAX_CARDS,
  TTL,
  clip,
  messageContent,
  zoneColor,
  sleepColor,
  recoveryDate,
  buildTodayWidget,
  buildSleepWidget,
  buildWorkoutsWidget,
  buildWeekWidget,
  readWeekSettings,
};
