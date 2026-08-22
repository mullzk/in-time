import { loadSchedule } from '../viz-core/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { StationInUrl } from '../viz-core/stationInUrl.js';
import { StoppedClock } from '../viz-core/stoppedClock.js';
import { ReisezeitPanel } from './panel.js';

const root = document.getElementById('viz-root');

// The picture is of the morning, when the country is fully served: the tree is
// what one reaches setting off at seven. Nothing moves in it, so the clock
// stands, and stands at that time.
const DEPARTURE_SECONDS = 7 * 3600;

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  // The address is read before the first tree is worked out, so the picture is
  // drawn from the station it names rather than from one of the panel's own,
  // which would have to be taken back once the canvas stands.
  const stationInUrl = new StationInUrl();
  const panel = new ReisezeitPanel(
    result.railBuffer,
    result.railStations,
    DEPARTURE_SECONDS,
    stationInUrl.slug,
  );
  const shell = new PanelShell(
    root,
    panel,
    new StoppedClock(DEPARTURE_SECONDS),
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
