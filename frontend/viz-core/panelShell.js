import { Attribution } from './controls/attribution.js';
import { ChoiceList } from './controls/choiceList.js';
import { Clock } from './controls/clock.js';
import { Dock } from './controls/dock.js';
import { tilesToHang } from './controls/dockTiles.js';
import { element } from './controls/dom.js';
import { Headline } from './controls/headline.js';
import { InfoCard } from './controls/infoCard.js';
import { InstrumentationEditor } from './controls/instrumentationEditor.js';
import { StationSearch } from './controls/stationSearch.js';
import { TransportControls } from './controls/transportControls.js';
import { ViewSwitcher } from './controls/viewSwitcher.js';
import { NoWelcome, WelcomeOverlay } from './controls/welcomeOverlay.js';
import { KeyboardControls } from './interaction/keyboardControls.js';
import { MapSelection } from './interaction/mapSelection.js';
import { PanelContext } from './panelContext.js';
import { Camera } from './render/camera.js';
import { TileLayer } from './render/tiles/tileLayer.js';
import { BACKGROUNDS } from './render/tiles/tileSource.js';
import { VizCore } from './render/vizCore.js';
import { localStorageOrForgetful } from './session/browserStorage.js';
import { StationInUrl, stationMatchingSlug } from './session/stationInUrl.js';
import { WelcomeVisit } from './session/welcomeVisit.js';
import { AudioBridge } from './sonification/audioBridge.js';
import { CustomInstrumentationStore } from './sonification/customInstrumentation.js';
import { Sonifier } from './sonification/sonifier.js';

const isExhibition = () =>
  new URLSearchParams(window.location.search).get('mode') === 'exhibition';

const backgroundById = (id) =>
  BACKGROUNDS.find((background) => background.id === id) ?? null;

const BLACK_BACKGROUND = backgroundById('black');

const sectionWhen = (isOffered, section) => (isOffered ? [section] : []);

const NAME_A_STATION = 'Gib den Namen einer Haltestelle ein';

// The frame every panel runs in: it owns the camera, the render core and the
// global controls (views, transport, background, zoom, info, search), and hangs
// them, together with the sections the panel supplies, in the dock.
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
    this.welcome = new NoWelcome();
    this.welcomeContent = null;
    this.playbackAwaitsTheWelcome = false;
    // A panel that draws no map gets the black ground and no chooser; one that
    // does may name the background it opens on.
    this.background = panel.capabilities.mapBackground
      ? (backgroundById(panel.initialBackgroundId?.()) ?? BACKGROUNDS[0])
      : BLACK_BACKGROUND;
    this.camera = new Camera(root.clientWidth, root.clientHeight);
    this.context = new PanelContext({
      camera: this.camera,
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
      this.#mountInstrumentationEditor();
    }

    this.transport = new TransportControls(this.panel, this.time);
    this.viewSwitcher = this.exhibition
      ? null
      : new ViewSwitcher(this.stationInUrl);
    this.#buildWelcome();
    this.infoCard = new InfoCard(this.panel.infoContent(), this.#infoActions());
    this.dock = new Dock(this.root, this.#tiles());
    // After the dock, since the offer goes into the sound control it built.
    if (this.sonifier) {
      this.#offerStoredInstrumentation();
    }
    this.stationSearch = this.panel.capabilities.stationSearch
      ? new StationSearch(this.topBar, this.panel.stationCatalog(), {
          onSelect: (station) => this.#chooseStation(station),
          stationMayBeGivenUp: !this.panel.capabilities.needsAStation,
          onClear: () => this.#forgetStation(),
          onDismiss: () => this.#turnDownTheAsk(),
        })
      : null;
    this.selection = this.panel.capabilities.stationPicking
      ? new MapSelection(this.root, this.panel, this.context, {
          onStationChosen: (station) => this.#adoptStation(station),
          onNothingTapped: () => this.#turnDownTheAsk(),
        })
      : null;
    this.headline = this.panel.headline ? new Headline(this.root) : null;
    this.clock = this.panel.capabilities.clock ? new Clock(this.topBar) : null;

    new KeyboardControls(window, {
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
  // its own coordinates; chooseStation keeps search field and sound in step.
  #onCanvasReady(canvasElement) {
    this.selection?.attachTo(canvasElement);
    this.panel.attachToCanvas?.(canvasElement, {
      chooseStation: (station) => this.#chooseStation(station),
    });
    this.canvasReady = true;
    this.#openOnTheStationNamedInTheUrl();
  }

  // The panel is handed the addressed station before it works anything out, so
  // it usually starts from it already; then it is only marked as chosen, since
  // computing the same picture again would send it back to its beginning.
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

  // Choosing by name takes the same path as choosing on the map, so the panel
  // is told once however the station was reached.
  #chooseStation(station) {
    if (this.selection) {
      this.selection.revealStation(station);
      return;
    }
    this.panel.revealStation(station);
    this.#adoptStation(station);
  }

  // Whichever way a station was reached -- searched, tapped, linked to -- it is
  // the one the address names from here on.
  #adoptStation(station) {
    this.stationChosen = true;
    this.sonifier?.setStation(station);
    this.stationSearch?.showSelection(station);
    this.stationInUrl.show(station);
    this.viewSwitcher?.refreshLinks();
  }

  // The chosen sound is given up with the station: left standing, it would ask
  // for a station again at once.
  #forgetStation() {
    this.stationChosen = false;
    this.selection?.clear();
    this.panel.forgetStation?.();
    this.sonifier?.forgetStation();
    this.#setInstrumentation(this.panel.silenceTheSound?.() ?? null);
    this.stationInUrl.forget();
    this.viewSwitcher?.refreshLinks();
    this.camera.fit();
  }

  // Only a view that offers a welcome has one, and only outside the exhibition,
  // where nobody would dismiss it. Whether it is shown is the visit's to say.
  #buildWelcome() {
    const content = this.exhibition ? undefined : this.panel.welcomeContent?.();
    if (content === undefined) {
      return;
    }
    this.welcomeContent = content;
    this.welcomeVisit = new WelcomeVisit();
    this.welcome = new WelcomeOverlay(this.root, content, {
      onDismiss: () => this.#onWelcomeDismissed(),
    });
    if (this.welcomeVisit.isDue()) {
      this.welcome.show();
    }
  }

  // Whoever wants the welcome again finds it under the info tile.
  #infoActions() {
    if (this.welcomeContent === null) {
      return [];
    }
    return [
      {
        label: this.welcomeContent.replayLabel,
        onActivate: () => {
          this.dock.close();
          this.welcome.show();
        },
      },
    ];
  }

  #onWelcomeDismissed() {
    this.welcomeVisit.recordDismissal();
    if (this.playbackAwaitsTheWelcome) {
      this.playbackAwaitsTheWelcome = false;
      this.time.play();
    }
  }

  // The clock waits behind the welcome: the schedule loads and the picture
  // stands, but nothing moves until the visitor has read it.
  startPlayback() {
    if (this.welcome.isOpen) {
      this.playbackAwaitsTheWelcome = true;
      return;
    }
    this.time.play();
  }

  // An own instrumentation outlives the page it was written on, so it is
  // offered again on every visit, the exhibition included.
  #offerStoredInstrumentation() {
    const stored = this.customInstrumentationStore.read();
    if (stored !== null) {
      this.panel.offerCustomInstrumentation?.(stored);
    }
  }

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

  // The panel is handed the toggle rather than told about the mode: without one
  // it builds no button.
  #instrumentationEditorToggle() {
    return this.exhibition
      ? null
      : (templateDocument) =>
          this.instrumentationEditor.toggle(templateDocument);
  }

  // An instrumentation without a station voices nothing, so choosing one is
  // when the view has to ask for a station.
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
  // after the first picture (the road blob).
  onPanelDataChanged() {
    this.everyScheduleHasArrived = true;
    this.sonifier?.refreshStation();
    // A linked-to bus stop is in no catalog until the road stations arrive.
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
    this.clock?.show(this.time.current);
    this.transport.sync();
    this.dock.showFaces();
    this.selection?.onFrameRendered();
    this.sonifier?.onFrameRendered();
    this.#syncStationInvitation();
  }

  // Nobody is there to answer in the exhibition, so it picks a station itself.
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

  // While the address still names a stop a schedule on its way may yet know,
  // asking would only have to be taken back a moment later.
  #aStationIsAwaited() {
    if (this.stationSearch === null || this.stationChosen) {
      return false;
    }
    if (this.stationInUrl.slug !== null && !this.everyScheduleHasArrived) {
      return false;
    }
    return this.panel.capabilities.needsAStation || this.soundIsWaitedOn;
  }

  // Only the ask a chosen sound puts can be turned down; a view that cannot
  // draw without a station has nothing to fall back to.
  #turnDownTheAsk() {
    if (!this.invitationShown || this.panel.capabilities.needsAStation) {
      return;
    }
    this.#setInstrumentation(this.panel.silenceTheSound?.() ?? null);
  }

  #chooseDrawnStation() {
    const drawn = this.panel.drawStation?.() ?? null;
    if (drawn !== null) {
      this.#chooseStation(drawn);
    }
  }

  // Which controls there are is decided here; which tile each one opens under
  // is decided for every view in dockTiles.
  #tiles() {
    const panelSections = this.panel.controlSections({
      setInstrumentation: (instrumentation) =>
        this.#setInstrumentation(instrumentation),
      toggleInstrumentationEditor: this.#instrumentationEditorToggle(),
    });
    const globalSections = [
      ...sectionWhen(this.viewSwitcher !== null, {
        id: 'views',
        title: 'Ansichten',
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
}
