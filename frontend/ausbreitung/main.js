import { loadSchedule } from '../viz-core/data/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { StationInUrl } from '../viz-core/session/stationInUrl.js';
import {
  departureToOpenOn,
  secondsOfDayInZurich,
} from '../viz-core/time/openingTime.js';
import { MAX_TEMPO, TimeModel } from '../viz-core/time/timeModel.js';
import { AusbreitungPanel } from './panel.js';

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
  const panel = new AusbreitungPanel(
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
  time.setTempo(MAX_TEMPO);
  time.play();

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
