import { loadSchedule } from '../viz-core/data/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { StationInUrl } from '../viz-core/session/stationInUrl.js';
import {
  departureToOpenOn,
  secondsOfDayInZurich,
} from '../viz-core/time/openingTime.js';
import { TimeModel } from '../viz-core/time/timeModel.js';
import { KaskadePanel } from './panel.js';

// A spread covers an hour and is worth watching in a minute, so it runs far
// faster than the default -- but not at the tempo scale's own maximum.
const SPREAD_TEMPO = 15 * 60;

const root = document.getElementById('viz-root');

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const departure = departureToOpenOn(secondsOfDayInZurich());

  // The address is read before the first spread is worked out, so the panel
  // starts from the station it names instead of computing one twice.
  const stationInUrl = new StationInUrl();
  const panel = new KaskadePanel(
    result.railBuffer,
    result.railStations,
    departure,
    stationInUrl.slug,
  );
  // The panel hands the clock the range its spread covers as soon as it has
  // one; a spread ends with the last arrival, so the clock does not repeat.
  const time = new TimeModel(departure, departure + 3600, {
    repeats: false,
  });
  const shell = new PanelShell(root, panel, time, stationInUrl);
  shell.start();
  time.setTempo(SPREAD_TEMPO);
  shell.startPlayback();

  result.roadBuffer
    .then((roadBuffer) => {
      panel.adoptSchedule(roadBuffer, result.roadStations);
    })
    .catch((error) => {
      console.error('the road schedule stays unavailable', error);
    })
    .finally(() => {
      panel.noFurtherScheduleIsComing();
      shell.onPanelDataChanged();
    });
}

bootstrap();
