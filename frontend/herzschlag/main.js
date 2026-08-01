import { loadSchedule } from '../viz-core/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { SECONDS_PER_DAY, TimeModel } from '../viz-core/timeModel.js';
import { HerzschlagPanel } from './panel.js';

// A service day's trips span more than 24 h (trains running past midnight). We
// loop a fixed 24-hour window whose seam sits in the pre-dawn lull (~03:00,
// almost no service), so wall-clock time stays continuous across the wrap.
// Playback opens on the morning ramp-up.
const DAY_CUT_SECONDS = 3 * 3600;
const PLAYBACK_START_SECONDS = 7 * 3600;

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
  time.seekToTime(PLAYBACK_START_SECONDS);

  const panel = new HerzschlagPanel(result.railBuffer, result.railStations);
  const shell = new PanelShell(root, panel, time);
  shell.start();
  time.play();

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
