import { loadSchedule } from '../viz-core/data/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import {
  playbackToOpenOn,
  secondsOfDayInZurich,
} from '../viz-core/time/openingTime.js';
import { SECONDS_PER_DAY, TimeModel } from '../viz-core/time/timeModel.js';
import { TaktfahrplanPanel } from './panel.js';

// A service day's trips span more than 24 h (trains running past midnight). We
// loop a fixed 24-hour window whose seam sits in the pre-dawn lull (~03:00,
// almost no service), so wall-clock time stays continuous across the wrap.
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

  const panel = new TaktfahrplanPanel(result.railBuffer, result.railStations);
  const shell = new PanelShell(root, panel, time);
  shell.start();
  shell.startPlayback();

  result.roadBuffer
    .then((roadBuffer) => {
      panel.adoptSchedule(roadBuffer, result.roadStations);
      shell.onPanelDataChanged();
    })
    .catch((error) => {
      console.error('the road schedule stays unavailable', error);
    });
}

bootstrap();
