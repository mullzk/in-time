import { Attribution } from '../viz-core/attribution.js';
import { Camera } from '../viz-core/camera.js';
import { Cockpit } from '../viz-core/cockpit.js';
import { KeyboardControls } from '../viz-core/keyboardControls.js';
import { loadSchedule } from '../viz-core/loader.js';
import { PanelContext } from '../viz-core/panelContext.js';
import { wgs84ToLv95 } from '../viz-core/projection.js';
import { Sidebar } from '../viz-core/sidebar.js';
import { StationInteraction } from '../viz-core/stationInteraction.js';
import { StationPopover } from '../viz-core/stationPopover.js';
import { StationSearch } from '../viz-core/stationSearch.js';
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
  const panel = new HerzschlagPanel(
    result.railBuffer,
    result.roadBuffer,
    result.railStations,
    result.roadStations,
  );
  const context = new PanelContext({
    camera,
    projection: wgs84ToLv95,
    time,
    tileLayer: new TileLayer(RELIEF_TILE_SOURCE),
  });

  const cockpit = new Cockpit(root, panel, time);
  const attribution = new Attribution(root);
  attribution.set(panel.background.attribution);
  const sidebar = new Sidebar(
    root,
    panel.buildSidebarSections(context, {
      onBackgroundChange: () => attribution.set(panel.background.attribution),
    }),
  );
  const popover = new StationPopover(root);

  // A search pick reveals the station: switch its stops layer on, centre on it,
  // and name it with a popover anchored to where it lands.
  const revealSearchedStation = (station) => {
    panel.activateStops();
    context.focusStation(station.east, station.north);
    const [x, y] = camera.worldToScreen(station.east, station.north);
    popover.showAt(x, y, station.name);
  };

  const bindings = {
    h: () => panel.toggleStops(),
    s: () => sidebar.toggle(),
  };
  if (panel.capabilities.stationSearch) {
    const stationSearch = new StationSearch(root, panel.stationCatalog(), {
      onSelect: revealSearchedStation,
    });
    bindings.g = () => stationSearch.focus();
  }
  new KeyboardControls(window, { time, camera, bindings });
  new VizCore(root, panel, context, {
    onFrameRendered: () => cockpit.sync(),
    // Wheel and pinch zoom shift the centre, so the popover would drift off its
    // station; the keyboard and sidebar keep it centred and leave it be.
    onZoomGesture: () => popover.hide(),
    onCanvasReady: (canvasElement) => {
      new StationInteraction(canvasElement, {
        pick: (x, y) => panel.stationAt(x, y),
        onSelect: (station, x, y) => popover.showAt(x, y, station.name),
        onActivate: (station) =>
          context.focusStation(station.east, station.north),
        onMiss: () => popover.hide(),
      });
    },
  });
  time.play();
}

bootstrap();
