import { Popover } from './popover.js';
import { TapInteraction } from './tapInteraction.js';

// Tap-to-select on the map: a station shows a static popover, a vehicle one that
// follows it each frame until its trip ends. Wires the canvas tap interaction to
// the popover and the panel's pickers so the app entry point stays declarative.
// The panel supplies stationAt/vehicleAt for picking and, for vehicles,
// describeVehicle (category and route names) and vehiclePosition (live location).
export class MapSelection {
  constructor(container, panel, context, { onStationChosen } = {}) {
    this.panel = panel;
    this.context = context;
    this.camera = context.camera;
    this.time = context.time;
    this.popover = new Popover(container);
    this.followedVehicle = null;
    this.onStationChosen = onStationChosen;
  }

  attachTo(canvasElement) {
    new TapInteraction(canvasElement, {
      pick: (x, y) => this.#pick(x, y),
      sameTarget: (first, second) =>
        first.kind === 'station' &&
        second.kind === 'station' &&
        first.station === second.station,
      onSelect: (target) => this.#select(target),
      onActivate: (target) => this.#activate(target),
      onMiss: () => this.clear(),
    });
  }

  onFrameRendered() {
    if (this.followedVehicle === null) {
      return;
    }
    const position = this.panel.vehiclePosition(
      this.followedVehicle,
      this.time.current,
    );
    if (position === null) {
      this.clear();
      return;
    }
    const [x, y] = this.camera.worldToScreen(position.east, position.north);
    this.popover.moveTo(x, y);
  }

  // A zoom gesture recentres the view: a static station popover would drift off
  // its node, but a followed vehicle is re-pinned each frame, so keep it.
  onZoomGesture() {
    if (this.followedVehicle === null) {
      this.popover.hide();
    }
  }

  selectStation(station) {
    this.followedVehicle = null;
    const [x, y] = this.camera.worldToScreen(station.east, station.north);
    this.popover.showAt(x, y, station.name);
    this.onStationChosen?.(station);
  }

  clear() {
    this.followedVehicle = null;
    this.popover.hide();
  }

  #pick(screenX, screenY) {
    const station = this.panel.stationAt(screenX, screenY);
    if (station !== null) {
      return { kind: 'station', station };
    }
    const vehicle = this.panel.vehicleAt(screenX, screenY);
    return vehicle === null ? null : { kind: 'vehicle', vehicle };
  }

  #select(target) {
    if (target.kind === 'station') {
      this.selectStation(target.station);
    } else {
      this.#selectVehicle(target.vehicle);
    }
  }

  #selectVehicle(vehicle) {
    this.followedVehicle = vehicle;
    const { label, origin, destination } = this.panel.describeVehicle(vehicle);
    const [x, y] = this.camera.worldToScreen(vehicle.east, vehicle.north);
    this.popover.showLines(x, y, [
      label,
      `${origin ?? '?'} → ${destination ?? '?'}`,
    ]);
  }

  #activate(target) {
    if (target.kind === 'station') {
      this.context.focusStation(target.station.east, target.station.north);
      this.onStationChosen?.(target.station);
      return;
    }
    const position = this.panel.vehiclePosition(
      target.vehicle,
      this.time.current,
    );
    if (position !== null) {
      this.context.focusStation(position.east, position.north);
    }
  }
}
