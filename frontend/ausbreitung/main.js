import { loadSchedule } from '../viz-core/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { StationInUrl } from '../viz-core/stationInUrl.js';
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

  // The address is read before the first spread is worked out, so the panel
  // sets off from the station it names rather than computing a spread from a
  // station of its own and taking it back once the canvas stands.
  const stationInUrl = new StationInUrl();
  const panel = new AusbreitungPanel(
    result.railBuffer,
    result.railStations,
    DEPARTURE_SECONDS,
    stationInUrl.slug,
  );
  // The panel hands the clock the stretch its own spread covers as soon as it
  // has one; until then it runs from the departure. A spread is over when the
  // last vehicle has landed, so the clock does not start it again.
  const time = new TimeModel(DEPARTURE_SECONDS, DEPARTURE_SECONDS + 3600, {
    repeats: false,
  });
  const shell = new PanelShell(root, panel, time, stationInUrl);
  shell.start();
  // A spread runs for hours of schedule; at the ordinary tempo one would watch
  // the country fill up for minutes, so it opens at the fastest one.
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
