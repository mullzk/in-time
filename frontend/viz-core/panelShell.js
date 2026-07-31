import { Attribution } from './attribution.js';
import { Camera } from './camera.js';
import { Cockpit } from './cockpit.js';
import { element } from './dom.js';
import { InfoModal } from './infoModal.js';
import { KeyboardControls } from './keyboardControls.js';
import { MapSelection } from './mapSelection.js';
import { PanelContext } from './panelContext.js';
import { wgs84ToLv95 } from './projection.js';
import { Sidebar } from './sidebar.js';
import { sectionsToMount } from './sidebarSections.js';
import { AudioBridge } from './sonification/audioBridge.js';
import { Sonifier } from './sonification/sonifier.js';
import { StationSearch } from './stationSearch.js';
import { TileLayer } from './tiles/tileLayer.js';
import { BACKGROUNDS } from './tiles/tileSource.js';
import { VizCore } from './vizCore.js';
import {
  ZOOM_STEPS,
  zoomFractionForPosition,
  zoomSliderPosition,
} from './zoomSlider.js';

const isExhibition = () =>
  new URLSearchParams(window.location.search).get('mode') === 'exhibition';

// The frame every panel runs in: it owns the camera, the render core and all
// global controls (background, zoom, info, fullscreen, search, cockpit), and
// mounts the sections the panel supplies. The panel is asked for its own
// controls, its key bindings and its info text, and is told when a global choice
// has a consequence only it can decide.
export class PanelShell {
  constructor(root, panel, time) {
    this.root = root;
    this.panel = panel;
    this.time = time;
    this.exhibition = isExhibition();
    this.background = BACKGROUNDS[0];
    this.camera = new Camera(root.clientWidth, root.clientHeight);
    this.context = new PanelContext({
      camera: this.camera,
      projection: wgs84ToLv95,
      time,
      tileLayer: new TileLayer(this.background.source),
    });
  }

  start() {
    this.cockpit = new Cockpit(this.root, this.panel, this.time);
    this.attribution = new Attribution(this.root);
    this.attribution.set(this.background.attribution);
    this.sonifier = this.panel.capabilities.sonification
      ? new Sonifier(this.panel, this.time, new AudioBridge())
      : null;

    this.sidebar = new Sidebar(this.root, this.#sections());
    this.stationSearch = this.panel.capabilities.stationSearch
      ? new StationSearch(this.root, this.panel.stationCatalog(), {
          onSelect: (station) => this.selection.revealStation(station),
        })
      : null;
    this.selection = new MapSelection(this.root, this.panel, this.context, {
      onStationChosen: (station) => {
        this.sonifier?.setStation(station);
        this.stationSearch?.showSelection(station);
      },
    });
    this.infoModal = new InfoModal(this.root, this.panel.infoContent());
    this.root.appendChild(this.#fullscreenToggle());

    new KeyboardControls(window, {
      time: this.time,
      camera: this.camera,
      bindings: this.#keyBindings(),
      overlays: [this.infoModal],
    });
    new VizCore(this.root, this.panel, this.context, {
      onFrameRendered: () => this.#onFrameRendered(),
      onCanvasReady: (canvasElement) => this.selection.attachTo(canvasElement),
    });
  }

  // Derived state the panel handed out earlier goes stale when it gains data
  // after the first picture (the road blob), so whoever adopts it says so.
  onPanelDataChanged() {
    this.sonifier?.refreshStation();
  }

  #keyBindings() {
    const bindings = {
      ...this.panel.keyBindings?.(),
      s: () => this.sidebar.toggle(),
    };
    if (this.stationSearch) {
      bindings.g = () => this.stationSearch.focus();
    }
    return bindings;
  }

  #onFrameRendered() {
    this.cockpit.sync();
    this.selection.onFrameRendered();
    this.sonifier?.onFrameRendered();
    this.#syncZoomSlider();
  }

  // Global sections come first, the panel's own below them: the sidebar reads as
  // "what is always here" followed by "what this view adds".
  #sections() {
    const panelSections = this.panel.sidebarSections({
      setInstrumentation: (instrumentation) =>
        this.sonifier?.setInstrumentation(instrumentation),
    });
    return sectionsToMount(
      [
        {
          id: 'background',
          title: 'Hintergrund',
          element: this.#backgroundControl(),
          keepInExhibition: true,
        },
        {
          id: 'zoom',
          title: 'Zoom',
          element: this.#zoomControl(),
          keepInExhibition: true,
        },
        ...panelSections,
      ],
      { exhibition: this.exhibition },
    );
  }

  #backgroundControl() {
    const group = element('div', 'sidebar-options');
    BACKGROUNDS.forEach((background, index) => {
      const input = element('input');
      input.type = 'radio';
      input.name = 'background';
      input.checked = index === 0;
      input.addEventListener('change', () =>
        this.#chooseBackground(background),
      );
      group.appendChild(this.#option(input, background.label));
    });
    return group;
  }

  #chooseBackground(background) {
    this.background = background;
    this.context.setBackground(background.source);
    this.attribution.set(background.attribution);
    this.panel.onBackgroundChange?.(background);
  }

  #zoomControl() {
    const group = element('div', 'sidebar-options');
    const slider = element('input', 'sidebar-zoom');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(ZOOM_STEPS - 1);
    slider.step = '1';
    slider.value = String(zoomSliderPosition(this.camera.zoomFraction()));
    slider.addEventListener('input', () => {
      this.zoomScrubbing = true;
      this.camera.setZoomFraction(
        zoomFractionForPosition(Number(slider.value)),
      );
    });
    slider.addEventListener('change', () => {
      this.zoomScrubbing = false;
    });
    this.zoomSlider = slider;
    group.appendChild(slider);
    return group;
  }

  // The camera also moves by wheel, pinch and keyboard, so the slider follows
  // the camera rather than the other way round -- except while it is being
  // dragged, when it would fight the hand holding it.
  #syncZoomSlider() {
    if (!this.zoomScrubbing) {
      this.zoomSlider.value = String(
        zoomSliderPosition(this.camera.zoomFraction()),
      );
    }
  }

  #option(input, label) {
    const option = element('label', 'sidebar-option');
    const text = element('span');
    text.textContent = label;
    option.append(input, text);
    return option;
  }

  #fullscreenToggle() {
    const button = element('button', 'panel-shell-fullscreen');
    button.type = 'button';
    button.textContent = '⛶';
    button.setAttribute('aria-label', 'Vollbild');
    button.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        this.root.requestFullscreen();
      }
    });
    return button;
  }
}
