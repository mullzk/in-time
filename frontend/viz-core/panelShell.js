import { Attribution } from './attribution.js';
import { localStorageOrForgetful } from './browserStorage.js';
import { Camera } from './camera.js';
import { Cockpit } from './cockpit.js';
import { element } from './dom.js';
import { InfoModal } from './infoModal.js';
import { InstrumentationEditor } from './instrumentationEditor.js';
import { KeyboardControls } from './keyboardControls.js';
import { MapSelection } from './mapSelection.js';
import { PanelContext } from './panelContext.js';
import { wgs84ToLv95 } from './projection.js';
import { Sidebar } from './sidebar.js';
import { sectionsToMount } from './sidebarSections.js';
import { AudioBridge } from './sonification/audioBridge.js';
import { CustomInstrumentationStore } from './sonification/customInstrumentation.js';
import { Sonifier } from './sonification/sonifier.js';
import { StationSearch } from './stationSearch.js';
import { TileLayer } from './tiles/tileLayer.js';
import { BACKGROUNDS } from './tiles/tileSource.js';
import { VIEWS, viewAt } from './views.js';
import { VizCore } from './vizCore.js';
import {
  ZOOM_STEPS,
  zoomFractionForPosition,
  zoomSliderPosition,
} from './zoomSlider.js';

const isExhibition = () =>
  new URLSearchParams(window.location.search).get('mode') === 'exhibition';

const BLACK_BACKGROUND = BACKGROUNDS.find(
  (background) => background.id === 'black',
);

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
    // A panel that draws no map has no use for a ground under it: it gets the
    // black one and no chooser, rather than a relief nobody can see.
    this.background = panel.capabilities.mapBackground
      ? BACKGROUNDS[0]
      : BLACK_BACKGROUND;
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
    if (this.sonifier) {
      this.customInstrumentationStore = new CustomInstrumentationStore(
        localStorageOrForgetful(),
      );
      this.#offerStoredInstrumentation();
      this.#mountInstrumentationEditor();
    }
    this.stationSearch = this.panel.capabilities.stationSearch
      ? new StationSearch(this.root, this.panel.stationCatalog(), {
          onSelect: (station) => this.#chooseStation(station),
        })
      : null;
    // Picking on the canvas needs a map to pick on: only a panel drawing one
    // gets tap, hover and their popovers. Elsewhere a station is chosen by name.
    this.selection = this.panel.capabilities.stationPicking
      ? new MapSelection(this.root, this.panel, this.context, {
          onStationChosen: (station) => this.#adoptStation(station),
        })
      : null;
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
      onCanvasReady: (canvasElement) => this.selection?.attachTo(canvasElement),
    });
  }

  // Choosing by name goes the same way as choosing on the map, so a panel is
  // told once, however the station was reached.
  #chooseStation(station) {
    if (this.selection) {
      this.selection.revealStation(station);
      return;
    }
    this.panel.revealStation(station);
    this.#adoptStation(station);
  }

  #adoptStation(station) {
    this.sonifier?.setStation(station);
    this.panel.setSonifiedStation?.(station);
    this.stationSearch?.showSelection(station);
  }

  // An own instrumentation outlives the page it was written on, so it is offered
  // again on every visit -- in the exhibition too, which is how one reaches a
  // kiosk that has no editor.
  #offerStoredInstrumentation() {
    const stored = this.customInstrumentationStore.read();
    if (stored !== null) {
      this.panel.offerCustomInstrumentation?.(stored);
    }
  }

  // Writing an instrumentation is for the regular app; the exhibition shows only
  // what is finished, so the drawer is not built there at all.
  #mountInstrumentationEditor() {
    if (this.exhibition) {
      return;
    }
    this.instrumentationEditor = new InstrumentationEditor(
      this.root,
      this.customInstrumentationStore,
      {
        onInstrumentationChanged: (instrumentation) =>
          this.#adoptCustomInstrumentation(instrumentation),
        onInstrumentationDiscarded: () => this.#dropCustomInstrumentation(),
      },
    );
  }

  // The panel is handed the way in rather than told about the mode: without one
  // there is no button, which is what keeps the exhibition clear of it.
  #instrumentationEditorToggle() {
    return this.exhibition
      ? null
      : (templateDocument) =>
          this.instrumentationEditor.toggle(templateDocument);
  }

  #adoptCustomInstrumentation(instrumentation) {
    this.panel.useCustomInstrumentation?.(instrumentation);
    this.sonifier.setInstrumentation(instrumentation);
  }

  #dropCustomInstrumentation() {
    this.sonifier.setInstrumentation(
      this.panel.forgetCustomInstrumentation?.() ?? null,
    );
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
    this.selection?.onFrameRendered();
    this.sonifier?.onFrameRendered();
    this.#syncZoomSlider();
  }

  // Global sections come first, the panel's own below them: the sidebar reads as
  // "what is always here" followed by "what this view adds".
  #sections() {
    const panelSections = this.panel.sidebarSections({
      setInstrumentation: (instrumentation) =>
        this.sonifier?.setInstrumentation(instrumentation),
      toggleInstrumentationEditor: this.#instrumentationEditorToggle(),
      holdBackground: (backgroundId) => this.#holdBackground(backgroundId),
    });
    return sectionsToMount(
      [
        {
          id: 'view',
          title: 'Ansicht',
          element: this.#viewSwitcher(),
          keepInExhibition: false,
        },
        ...(this.panel.capabilities.mapBackground
          ? [
              {
                id: 'background',
                title: 'Hintergrund',
                element: this.#backgroundControl(),
                keepInExhibition: true,
              },
            ]
          : []),
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

  // Plain links, because switching views is a page load: they can be opened in a
  // new tab, and the current one is marked rather than made clickable to
  // nowhere. The exhibition shows one view, so the section is not mounted there.
  #viewSwitcher() {
    const group = element('div', 'sidebar-views');
    const current = viewAt(window.location.pathname);
    VIEWS.forEach((view) => {
      group.appendChild(
        view === current ? this.#currentView(view) : this.#viewLink(view),
      );
    });
    return group;
  }

  #currentView(view) {
    const marked = element('span', 'sidebar-view is-current');
    marked.textContent = view.label;
    marked.setAttribute('aria-current', 'page');
    return marked;
  }

  #viewLink(view) {
    const link = element('a', 'sidebar-view');
    link.textContent = view.label;
    link.href = view.path + window.location.search;
    return link;
  }

  #backgroundControl() {
    const group = element('div', 'sidebar-options');
    this.backgroundOptions = BACKGROUNDS.map((background, index) => {
      const input = element('input');
      input.type = 'radio';
      input.name = 'background';
      input.checked = index === 0;
      input.addEventListener('change', () =>
        this.#chooseBackground(background),
      );
      group.appendChild(this.#option(input, background.label));
      return { input, background };
    });
    return group;
  }

  // A panel mode may be legible on one ground only; while it holds the
  // background, the chooser shows that choice and cannot be moved. A null id
  // hands the chooser back without undoing the choice.
  #holdBackground(backgroundId) {
    if (backgroundId !== null) {
      this.#chooseBackground(
        BACKGROUNDS.find((background) => background.id === backgroundId),
      );
    }
    this.backgroundOptions.forEach(({ input, background }) => {
      input.disabled = backgroundId !== null;
      input.checked = background === this.background;
    });
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
