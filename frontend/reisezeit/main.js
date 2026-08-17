import { loadSchedule } from '../viz-core/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { StoppedClock } from '../viz-core/stoppedClock.js';
import { ReisezeitPanel } from './panel.js';

const root = document.getElementById('viz-root');

// The picture is taken now: the tree is what one reaches setting off at this
// moment. The clock therefore stands, and stands at this time.
const secondsSinceMidnight = () => {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
};

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const departureTime = secondsSinceMidnight();
  const panel = new ReisezeitPanel(
    result.railBuffer,
    result.railStations,
    departureTime,
  );
  const shell = new PanelShell(root, panel, new StoppedClock(departureTime));
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
