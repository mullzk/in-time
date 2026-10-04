/**
 * The Puls view: the rail network on white, the trains of the three shown
 * classes, and the base hubs swelling with the trains standing in them.
 */
import { phasesIcon } from '../viz-core/controls/dockIcons.js';
import { categoryLabel } from '../viz-core/data/transportCategories.js';
import { Panel } from '../viz-core/panel.js';
import {
  nearestStation,
  stationPickRadiusPixels,
} from '../viz-core/render/stationNodes.js';
import { VehiclePositionEngine } from '../viz-core/travel/vehiclePositionEngine.js';
import {
  HUB_LAYER_OPACITY,
  HUB_NEUTRAL_COLOR,
  HUB_STEADY_COLOR,
  hubGrowthFactor,
} from './hubLayers.js';
import { everyHubStationIndex, hubsOf } from './hubs.js';
import { hubSpansByTrip, withinAHubSpan } from './hubVisits.js';
import { buildInfoContent } from './infoContent.js';
import { edgesTravelledBy } from './network.js';
import {
  hubPhaseColor,
  PULS_TRAIN_ARRIVAL_COLOR,
  PULS_TRAIN_DEPARTURE_COLOR,
  phaseOfTheHalfHour,
  trainPhaseColor,
} from './taktPhase.js';
import {
  drawRank,
  TRAIN_CLASSES,
  trainClassById,
  trainClassOf,
} from './trainClasses.js';

const GROUND_COLOR = [255, 255, 255];
const NETWORK_COLOR = [205, 205, 205];
const NETWORK_WIDTH_PIXELS = 1;
const OPAQUE = 255;

const VEHICLE_HIT_RADIUS_PIXELS = 10;
const ONLY_POSITION_ENGINE_INDEX = 0;

export class PulsPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    timeScrubber: true,
    stationPicking: true,
  };

  constructor(railBuffer, railStations, stationClock, hubLegend) {
    super();
    this.stationClock = stationClock;
    this.hubLegend = hubLegend;
    this.engine = new VehiclePositionEngine(railBuffer);
    this.railStations = railStations;
    this.networkEdges = edgesTravelledBy(this.engine.trips, this.engine.edges);
    this.hubs = hubsOf(railStations, this.engine.stations, this.engine.trips);
    this.hubSpansByTrip = hubSpansByTrip(
      this.engine.trips,
      everyHubStationIndex(railStations),
    );
    this.trains = [];
    this.camera = null;
    this.currentTimeSeconds = 0;
    this.phaseColorsInUse = false;
  }

  init(context) {
    this.camera = context.camera;
  }

  groundColor() {
    return GROUND_COLOR;
  }

  keyBindings() {
    return { c: () => this.#togglePhaseColors() };
  }

  #togglePhaseColors() {
    this.phaseColorsInUse = !this.phaseColorsInUse;
    this.hubLegend.showPhaseColors(this.phaseColorsInUse);
  }

  #trainColor(discColor, tripIndex) {
    return this.phaseColorsInUse &&
      withinAHubSpan(
        this.hubSpansByTrip[tripIndex],
        phaseOfTheHalfHour(this.currentTimeSeconds),
        this.currentTimeSeconds,
      )
      ? trainPhaseColor(discColor, this.currentTimeSeconds)
      : discColor;
  }

  #hubColor() {
    return this.phaseColorsInUse
      ? hubPhaseColor(HUB_NEUTRAL_COLOR, this.currentTimeSeconds)
      : HUB_STEADY_COLOR;
  }

  // A press tile rather than a card, and wearing what pressing it will do next:
  // the phase colours are the one thing here to switch, and without the tile
  // they would be out of reach on a screen without a keyboard.
  controlSections() {
    return [
      {
        id: 'phases',
        title: 'Farb-Phasen',
        onActivate: () => this.#togglePhaseColors(),
        face: () =>
          this.phaseColorsInUse
            ? {
                icon: 'phasesSteady',
                label: 'Farb-Phasen aus',
                draw: () => phasesIcon(HUB_STEADY_COLOR, HUB_STEADY_COLOR),
              }
            : {
                icon: 'phases',
                label: 'Farb-Phasen',
                draw: () =>
                  phasesIcon(
                    PULS_TRAIN_DEPARTURE_COLOR,
                    PULS_TRAIN_ARRIVAL_COLOR,
                  ),
              },
        keepInExhibition: true,
      },
    ];
  }

  infoContent() {
    return buildInfoContent();
  }

  update(currentTimeSeconds, deltaSeconds) {
    this.currentTimeSeconds = currentTimeSeconds;
    this.stationClock.show(currentTimeSeconds);
    this.hubs.forEach((hub) => {
      hub.easeTowardsTheTrainsStandingAt(currentTimeSeconds, deltaSeconds);
    });
    this.trains = this.engine
      .activeAt(currentTimeSeconds)
      .map((train) => ({
        ...train,
        trainClass: trainClassOf(train.category),
        positionEngineIndex: ONLY_POSITION_ENGINE_INDEX,
      }))
      .filter(({ trainClass }) => trainClass !== null)
      .sort(
        (first, second) =>
          drawRank(first.trainClass) - drawRank(second.trainClass),
      );
  }

  drawWorld(p, context) {
    const { camera } = context;
    const worldPerPixel = camera.worldPerPixel();
    this.#drawNetwork(p, worldPerPixel);
    this.#drawTrains(p, worldPerPixel);
    this.#drawHubs(
      p,
      worldPerPixel,
      hubGrowthFactor(camera.viewportWidth, camera.viewportHeight),
    );
  }

  #drawNetwork(p, worldPerPixel) {
    p.noFill();
    p.stroke(...NETWORK_COLOR);
    p.strokeWeight(NETWORK_WIDTH_PIXELS * worldPerPixel);
    this.networkEdges.forEach((polyline) => {
      p.beginShape();
      polyline.forEach(([east, north]) => {
        p.vertex(east, north);
      });
      p.endShape();
    });
  }

  #drawTrains(p, worldPerPixel) {
    p.noStroke();
    this.trains.forEach(({ trainClass, tripIndex, east, north }) => {
      const { discColor, discDiameterPixels } = trainClassById(trainClass);
      p.fill(...this.#trainColor(discColor, tripIndex));
      p.circle(east, north, discDiameterPixels * worldPerPixel);
    });
  }

  #drawHubs(p, worldPerPixel, growthFactor) {
    const hubColor = this.#hubColor();
    this.hubs.forEach((hub) => {
      const radii = hub.layerRadii(growthFactor);
      TRAIN_CLASSES.forEach(({ id }) => {
        this.#drawHubLayer(
          p,
          hub,
          radii[id],
          hubColor,
          HUB_LAYER_OPACITY[id] * OPAQUE,
          worldPerPixel,
        );
      });
    });
  }

  // A ring is stroked along its middle rather than laid as a disc beneath the
  // inner layers, so translucent layers never stack and each keeps its opacity.
  #drawHubLayer(p, hub, { inner, outer }, color, alpha, worldPerPixel) {
    if (outer <= inner) {
      return;
    }
    if (inner === 0) {
      p.noStroke();
      p.fill(...color, alpha);
      p.circle(hub.east, hub.north, 2 * outer * worldPerPixel);
      return;
    }
    p.noFill();
    p.stroke(...color, alpha);
    p.strokeWeight((outer - inner) * worldPerPixel);
    p.circle(hub.east, hub.north, (inner + outer) * worldPerPixel);
  }

  railStationNear(screenX, screenY) {
    if (this.camera === null) {
      return null;
    }
    return nearestStation(
      this.hubs,
      this.camera,
      screenX,
      screenY,
      stationPickRadiusPixels(this.camera.zoomFraction()),
    );
  }

  minorStationNear() {
    return null;
  }

  revealStation() {}

  vehicleAt(screenX, screenY) {
    if (this.camera === null) {
      return null;
    }
    return nearestStation(
      this.trains,
      this.camera,
      screenX,
      screenY,
      VEHICLE_HIT_RADIUS_PIXELS,
    );
  }

  describeVehicle({ tripIndex, category }) {
    const { originStation, destinationStation } =
      this.engine.tripEndpoints(tripIndex);
    return {
      label: categoryLabel(category),
      category,
      origin: this.railStations[originStation]?.name,
      destination: this.railStations[destinationStation]?.name,
    };
  }

  vehiclePosition({ tripIndex }, currentTimeSeconds) {
    return this.engine.positionAt(tripIndex, currentTimeSeconds);
  }
}
