import { Attribution } from './attribution.js';
import { localStorageOrForgetful } from './browserStorage.js';
import { Camera } from './camera.js';
import { ChoiceList } from './choiceList.js';
import { Dock } from './dock.js';
import { tilesToHang } from './dockTiles.js';
import { element } from './dom.js';
import { Headline } from './headline.js';
import { InfoCard } from './infoCard.js';
import { InstrumentationEditor } from './instrumentationEditor.js';
import { KeyboardControls } from './keyboardControls.js';
import { MapSelection } from './mapSelection.js';
import { PanelContext } from './panelContext.js';
import { wgs84ToLv95 } from './projection.js';
import { AudioBridge } from './sonification/audioBridge.js';
import { CustomInstrumentationStore } from './sonification/customInstrumentation.js';
import { Sonifier } from './sonification/sonifier.js';
import { StationInUrl, stationMatchingSlug } from './stationInUrl.js';
import { StationSearch } from './stationSearch.js';
import { TileLayer } from './tiles/tileLayer.js';
import { BACKGROUNDS } from './tiles/tileSource.js';
import { TransportControls } from './transportControls.js';
import { ViewSwitcher } from './viewSwitcher.js';
import { VizCore } from './vizCore.js';
import {
  ZOOM_STEPS,
  zoomFractionForPosition,
  zoomSliderPosition,
} from './zoomSlider.js';

const isExhibition = () =>
  new URLSearchParams(window.location.search).get('mode') === 'exhibition';

const backgroundById = (id) =>
  BACKGROUNDS.find((background) => background.id === id) ?? null;

const BLACK_BACKGROUND = backgroundById('black');

const sectionWhen = (isOffered, section) => (isOffered ? [section] : []);

const NAME_A_STATION = 'Gib den Namen einer Haltestelle ein';

// The frame every panel runs in: it owns the camera, the render core and all
// global controls (views, transport, background, zoom, info, search), and hangs
// them, together with the sections the panel supplies, in the dock at the left
// edge. The panel is asked for its own controls, its key bindings and its info
// text, and is told when a global choice has a consequence only it can decide.
export class PanelShell {
  constructor(root, panel, time, stationInUrl = new StationInUrl()) {
    this.root = root;
    this.panel = panel;
    this.time = time;
    this.exhibition = isExhibition();
    this.stationInUrl = stationInUrl;
    this.canvasReady = false;
    this.stationChosen = false;
    this.everyScheduleHasArrived = false;
    this.soundIsWaitedOn = false;
    this.invitationShown = false;
    // A panel that draws no map has no use for a ground under it: it gets the
    // black one and no chooser, rather than a relief nobody can see. A panel
    // that draws one may name the ground it reads best on; otherwise the first.
    this.background = panel.capabilities.mapBackground
      ? (backgroundById(panel.initialBackgroundId?.()) ?? BACKGROUNDS[0])
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
    this.topBar = element('div', 'l-topbar');
    this.root.appendChild(this.topBar);
    this.attribution = new Attribution(this.root);
    this.attribution.set(this.background.attribution);
    this.sonifier = this.panel.capabilities.sonification
      ? new Sonifier(this.panel, this.time, new AudioBridge())
      : null;
    if (this.sonifier) {
      this.customInstrumentationStore = new CustomInstrumentationStore(
        localStorageOrForgetful(),
      );
      this.#offerStoredInstrumentation();
      this.#mountInstrumentationEditor();
    }

    this.transport = new TransportControls(this.panel, this.time);
    // The exhibition shows one view, so there is nowhere to switch to.
    this.viewSwitcher = this.exhibition
      ? null
      : new ViewSwitcher(this.stationInUrl);
    this.infoCard = new InfoCard(this.panel.infoContent());
    this.dock = new Dock(this.root, this.#tiles());
    this.stationSearch = this.panel.capabilities.stationSearch
      ? new StationSearch(this.topBar, this.panel.stationCatalog(), {
          onSelect: (station) => this.#chooseStation(station),
          // A view that draws its whole picture from one station cannot be left
          // without one, so there the empty field says nothing.
          onClear: this.panel.capabilities.needsAStation
            ? () => {}
            : () => this.#forgetStation(),
        })
      : null;
    // Picking on the canvas needs a map to pick on: only a panel drawing one
    // gets tap, hover and their popovers. Elsewhere a station is chosen by name.
    this.selection = this.panel.capabilities.stationPicking
      ? new MapSelection(this.root, this.panel, this.context, {
          onStationChosen: (station) => this.#adoptStation(station),
        })
      : null;
    // A panel that has a question to put over its picture gets the writing; the
    // rest of the views carry none.
    this.headline = this.panel.headline
      ? new Headline(this.root, {
          besideAClock: this.panel.capabilities.stationClock,
        })
      : null;

    new KeyboardControls(window, {
      // Space plays; a view that does not play does not answer to it.
      togglePlay: this.panel.capabilities.simulationSpeed
        ? () => this.time.togglePlay()
        : null,
      camera: this.camera,
      bindings: this.#keyBindings(),
    });
    new VizCore(this.root, this.panel, this.context, {
      onFrameRendered: () => this.#onFrameRendered(),
      onCanvasReady: (canvasElement) => this.#onCanvasReady(canvasElement),
    });
  }

  // A panel drawing something other than a map picks on the canvas itself, in
  // its own coordinates. It is handed the canvas and the one way in that keeps
  // the search field and the sound in step with what it chose.
  #onCanvasReady(canvasElement) {
    this.selection?.attachTo(canvasElement);
    this.panel.attachToCanvas?.(canvasElement, {
      chooseStation: (station) => this.#chooseStation(station),
    });
    this.canvasReady = true;
    this.#openOnTheStationNamedInTheUrl();
  }

  // A view is linked to with a station in its address, and opens on that one
  // rather than on whatever the panel would have picked itself. The panel is
  // handed the name before it works anything out, so it usually sets off from
  // that station already: then the station is only marked as chosen, since
  // working the same picture out again would send it back to its beginning.
  #openOnTheStationNamedInTheUrl() {
    if (this.stationChosen || this.stationInUrl.slug === null) {
      return;
    }
    const station = stationMatchingSlug(
      this.panel.stationCatalog?.().entries ?? [],
      this.stationInUrl.slug,
    );
    if (station === null) {
      return;
    }
    if (this.panel.startsFrom?.() === station) {
      this.#markAsChosen(station);
      return;
    }
    this.#chooseStation(station);
  }

  #markAsChosen(station) {
    if (this.selection) {
      this.selection.selectStation(station);
      return;
    }
    this.#adoptStation(station);
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

  // Whichever way a station was reached -- searched, tapped, linked to -- it is
  // the one the address names from here on, so the picture can be handed on and
  // the other views open on it too.
  #adoptStation(station) {
    this.stationChosen = true;
    this.sonifier?.setStation(station);
    this.stationSearch?.showSelection(station);
    this.stationInUrl.show(station);
    this.viewSwitcher?.refreshLinks();
  }

  // The station is given up again: nothing is marked on the map, nothing sounds,
  // the address names the view alone, and the camera pulls back to the whole
  // picture -- the view one starts from, now that no place is being looked at.
  #forgetStation() {
    this.stationChosen = false;
    this.selection?.clear();
    this.sonifier?.forgetStation();
    this.stationInUrl.forget();
    this.viewSwitcher?.refreshLinks();
    this.camera.fit();
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

  // An instrument that has nobody to listen to voices nothing, so choosing one
  // is the moment the view has to know which station it is meant to sound.
  #setInstrumentation(instrumentation) {
    this.soundIsWaitedOn = instrumentation !== null;
    this.sonifier?.setInstrumentation(instrumentation);
  }

  #adoptCustomInstrumentation(instrumentation) {
    this.panel.useCustomInstrumentation?.(instrumentation);
    this.#setInstrumentation(instrumentation);
  }

  #dropCustomInstrumentation() {
    this.#setInstrumentation(
      this.panel.forgetCustomInstrumentation?.() ?? null,
    );
  }

  // Derived state the panel handed out earlier goes stale when it gains data
  // after the first picture (the road blob), so whoever adopts it says so.
  onPanelDataChanged() {
    this.everyScheduleHasArrived = true;
    this.sonifier?.refreshStation();
    // A linked-to bus stop is in no catalog until the road stations arrive, so
    // the address is read again once they have.
    if (this.canvasReady) {
      this.#openOnTheStationNamedInTheUrl();
    }
  }

  #keyBindings() {
    const bindings = {
      ...this.panel.keyBindings?.(),
      i: () => this.dock.toggle('info'),
    };
    if (this.stationSearch) {
      bindings.g = () => this.stationSearch.focus();
    }
    return bindings;
  }

  #onFrameRendered() {
    this.headline?.show(this.panel.headline());
    this.transport.sync();
    this.dock.showFaces();
    this.selection?.onFrameRendered();
    this.sonifier?.onFrameRendered();
    this.#syncZoomSlider();
    this.#syncStationInvitation();
  }

  // Nobody is there to answer an exhibition, so what the ask offers as a button
  // it does for itself and gets on with the picture.
  #syncStationInvitation() {
    const awaited = this.#aStationIsAwaited();
    if (awaited && this.exhibition) {
      this.#chooseDrawnStation();
      return;
    }
    if (awaited === this.invitationShown) {
      return;
    }
    this.invitationShown = awaited;
    if (awaited) {
      this.stationSearch.invite(NAME_A_STATION, () =>
        this.#chooseDrawnStation(),
      );
      return;
    }
    this.stationSearch.endInvitation();
  }

  // A view whose picture is drawn from one station has nothing to show until it
  // has one, and a sound voices one station or none; either way the ask belongs
  // in the middle of what would otherwise be an empty stage. While the address
  // still names a stop that a schedule on its way may yet know, asking would
  // only have to be taken back a moment later.
  #aStationIsAwaited() {
    if (this.stationSearch === null || this.stationChosen) {
      return false;
    }
    if (this.stationInUrl.slug !== null && !this.everyScheduleHasArrived) {
      return false;
    }
    return this.panel.capabilities.needsAStation || this.soundIsWaitedOn;
  }

  #chooseDrawnStation() {
    const drawn = this.panel.drawStation?.() ?? null;
    if (drawn !== null) {
      this.#chooseStation(drawn);
    }
  }

  // Which controls there are is decided here; which tile each one opens under
  // is decided once for every view in dockTiles.
  #tiles() {
    const panelSections = this.panel.controlSections({
      setInstrumentation: (instrumentation) =>
        this.#setInstrumentation(instrumentation),
      toggleInstrumentationEditor: this.#instrumentationEditorToggle(),
    });
    const globalSections = [
      ...sectionWhen(this.viewSwitcher !== null, {
        id: 'views',
        title: 'Ansicht',
        element: this.viewSwitcher?.root,
        keepInExhibition: false,
      }),
      ...this.transport.sections(),
      ...sectionWhen(this.panel.capabilities.mapBackground, {
        id: 'background',
        title: 'Hintergrund',
        element: this.#backgroundControl(),
        keepInExhibition: true,
      }),
      ...sectionWhen(this.panel.capabilities.zoomSlider, {
        id: 'zoom',
        title: 'Zoom',
        element: this.#zoomControl(),
        keepInExhibition: true,
      }),
      {
        id: 'info',
        title: 'Info',
        element: this.infoCard.root,
        keepInExhibition: true,
      },
    ];
    return tilesToHang([...globalSections, ...panelSections], {
      exhibition: this.exhibition,
    });
  }

  #backgroundControl() {
    return new ChoiceList(
      BACKGROUNDS.map(({ id, label }) => ({ value: id, label })),
      {
        chosen: this.background.id,
        onChoose: (id) => this.#chooseBackground(backgroundById(id)),
      },
    ).root;
  }

  #chooseBackground(background) {
    this.background = background;
    this.context.setBackground(background.source);
    this.attribution.set(background.attribution);
    this.panel.onBackgroundChange?.(background);
  }

  #zoomControl() {
    const group = element('div', 'control-options');
    const slider = element('input', 'control-slider');
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
    if (this.zoomSlider && !this.zoomScrubbing) {
      this.zoomSlider.value = String(
        zoomSliderPosition(this.camera.zoomFraction()),
      );
    }
  }
}
