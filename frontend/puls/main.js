import { loadSchedule } from '../viz-core/data/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import {
  playbackToOpenOn,
  secondsOfDayInZurich,
} from '../viz-core/time/openingTime.js';
import { SECONDS_PER_DAY, TimeModel } from '../viz-core/time/timeModel.js';
import { HubLegend } from './hubLegend.js';
import { PulsPanel } from './panel.js';
import { StationClock } from './stationClock.js';

const DAY_CUT_SECONDS = 3 * 3600;
const PLAYBACK_LEAD_SECONDS = 10 * 60;

const root = document.getElementById('viz-root');

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const time = new TimeModel(
    DAY_CUT_SECONDS,
    DAY_CUT_SECONDS + SECONDS_PER_DAY,
  );
  time.seekToTime(
    playbackToOpenOn(secondsOfDayInZurich(), {
      leadSeconds: PLAYBACK_LEAD_SECONDS,
    }),
  );

  const panel = new PulsPanel(
    result.railBuffer,
    result.railStations,
    new StationClock(root),
  );
  const shell = new PanelShell(root, panel, time);
  shell.start();
  new HubLegend(root);
  shell.startPlayback();
}

bootstrap();
