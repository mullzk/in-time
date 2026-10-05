import { loadSchedule } from '../viz-core/data/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { clockOnTheLoopingDay } from '../viz-core/time/scheduleDay.js';
import { TaktPanel } from './panel.js';

const root = document.getElementById('viz-root');

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const panel = new TaktPanel(result.railBuffer, result.railStations);
  const shell = new PanelShell(root, panel, clockOnTheLoopingDay());
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
