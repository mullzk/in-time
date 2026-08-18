import { loadSchedule } from '../viz-core/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { MAX_TEMPO, TimeModel } from '../viz-core/timeModel.js';
import { AusbreitungPanel } from './panel.js';

const root = document.getElementById('viz-root');

// The spread sets off in the morning, when the country is fully served -- an
// evening departure would show a picture of what no longer runs. The slider
// moves it from there.
const DEPARTURE_SECONDS = 7 * 3600;

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const panel = new AusbreitungPanel(
    result.railBuffer,
    result.railStations,
    DEPARTURE_SECONDS,
  );
  // The panel hands the clock the stretch its own spread covers as soon as it
  // has one; until then it runs from the departure. A spread is over when the
  // last vehicle has landed, so the clock does not start it again.
  const time = new TimeModel(DEPARTURE_SECONDS, DEPARTURE_SECONDS + 3600, {
    repeats: false,
  });
  const shell = new PanelShell(root, panel, time);
  shell.start();
  // A spread runs for hours of schedule; at the ordinary tempo one would watch
  // the country fill up for minutes, so it opens at the fastest one.
  time.setTempo(MAX_TEMPO);
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
