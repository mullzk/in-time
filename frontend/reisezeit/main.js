import { loadSchedule } from '../viz-core/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
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

  const panel = new ReisezeitPanel(
    result.railBuffer,
    result.railStations,
    DEPARTURE_SECONDS,
  );
  const shell = new PanelShell(
    root,
    panel,
    new StoppedClock(DEPARTURE_SECONDS),
  );
  shell.start();

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
