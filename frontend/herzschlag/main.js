import { Camera } from '../viz-core/camera.js';
import { Cockpit } from '../viz-core/cockpit.js';
import { KeyboardControls } from '../viz-core/keyboardControls.js';
import { loadSchedule } from '../viz-core/loader.js';
import { PanelContext } from '../viz-core/panelContext.js';
import { wgs84ToLv95 } from '../viz-core/projection.js';
import { Sidebar } from '../viz-core/sidebar.js';
import { TileLayer } from '../viz-core/tiles/tileLayer.js';
import { RELIEF_TILE_SOURCE } from '../viz-core/tiles/tileSource.js';
import { SECONDS_PER_DAY, TimeModel } from '../viz-core/timeModel.js';
import { VizCore } from '../viz-core/vizCore.js';
import { HerzschlagPanel } from './panel.js';

// A service day's trips span more than 24 h (trains running past midnight). We
// loop a fixed 24-hour window whose seam sits in the pre-dawn lull (~03:00,
// almost no service), so wall-clock time stays continuous across the wrap.
// Playback opens on the morning ramp-up.
const DAY_CUT_SECONDS = 3 * 3600;
const PLAYBACK_START_SECONDS = 7 * 3600;

const root = document.getElementById('viz-root');

async function bootstrap() {
  const result = await loadSchedule(root.dataset.configUrl);
  if (!result.published) {
    root.textContent = 'Kein Fahrplan publiziert.';
    return;
  }

  const time = new TimeModel(
    DAY_CUT_SECONDS,
    DAY_CUT_SECONDS + SECONDS_PER_DAY,
  );
  time.seekToTime(PLAYBACK_START_SECONDS);
  const camera = new Camera(root.clientWidth, root.clientHeight);
  const panel = new HerzschlagPanel(result.railBuffer, result.roadBuffer);
  const context = new PanelContext({
    camera,
    projection: wgs84ToLv95,
    time,
    tileLayer: new TileLayer(RELIEF_TILE_SOURCE),
  });

  const cockpit = new Cockpit(root, panel, time);
  new Sidebar(root, panel.buildSidebarSections(context));
  new KeyboardControls(window, { time, camera });
  new VizCore(root, panel, context, {
    onFrameRendered: () => cockpit.sync(),
  });
  time.play();
}

bootstrap();
