// -----------------------------------------------------------------------------
// Entry point of the WHOOP external integration.
//
// Brings the data of a WHOOP membership into Gladys through the official
// WHOOP Developer Platform API v2, with the user's own WHOOP app:
//   - device: one per linked member, with the recovery, the day strain, the
//     last sleep and the last workout (see src/device.js);
//   - scene triggers: recovery scored, sleep scored, workout scored;
//   - scene action: read the latest values;
//   - dashboard widgets: today, sleep, workouts, seven days.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: "today" follows it)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the WHOOP integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
