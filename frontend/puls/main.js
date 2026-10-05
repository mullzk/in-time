import { StationClock } from '../viz-core/controls/stationClock.js';
import { loadSchedule } from '../viz-core/data/loader.js';
import { PanelShell } from '../viz-core/panelShell.js';
import { clockOnTheLoopingDay } from '../viz-core/time/scheduleDay.js';
import { HubLegend } from './hubLegend.js';
import { PulsPanel } from './panel.js';

// Fast enough that the swell and ebb of a half hour reads as one gesture.
const PULSE_TEMPO = 8 * 60;

const root = document.getElementById('viz-root');

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const time = clockOnTheLoopingDay();
  const panel = new PulsPanel(
    result.railBuffer,
    result.railStations,
    new StationClock(root),
    new HubLegend(root),
  );
  const shell = new PanelShell(root, panel, time);
  shell.start();
  time.setTempo(PULSE_TEMPO);
  shell.startPlayback();
}

bootstrap();
