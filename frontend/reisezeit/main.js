import { loadSchedule } from '../viz-core/loader.js';
import {
  departureToOpenOn,
  secondsOfDayInZurich,
} from '../viz-core/openingTime.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { StationInUrl } from '../viz-core/stationInUrl.js';
import { StoppedClock } from '../viz-core/stoppedClock.js';
import { ReisezeitPanel } from './panel.js';

const root = document.getElementById('viz-root');

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  // The tree is of the journey one could set off on now; the dock offers every
  // other departure. Nothing moves in the picture, so the clock stands.
  const departure = departureToOpenOn(secondsOfDayInZurich());

  // The address is read before the first tree is worked out, so the picture is
  // drawn from the station it names rather than from one of the panel's own,
  // which would have to be taken back once the canvas stands.
  const stationInUrl = new StationInUrl();
  const panel = new ReisezeitPanel(
    result.railBuffer,
    result.railStations,
    departure,
    stationInUrl.slug,
  );
  const shell = new PanelShell(
    root,
    panel,
    new StoppedClock(departure),
    stationInUrl,
  );
  shell.start();

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
