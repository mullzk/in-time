import { Popover } from './popover.js';
import { TapInteraction } from './tapInteraction.js';

// Double-tap identity for a pick. Stations are stable objects, but vehicleAt
// rebuilds its picks every frame, so vehicles compare by their engine and trip
// index instead of reference.
export function sameSelectionTarget(first, second) {
  if (first.kind !== second.kind) {
    return false;
  }
  if (first.kind === 'station') {
    return first.station === second.station;
  }
  return (
    first.vehicle.engineIndex === second.vehicle.engineIndex &&
    first.vehicle.tripIndex === second.vehicle.tripIndex
  );
}

// Tap-to-select on the map: a station shows a popover pinned to its node, a
// vehicle one that follows the vehicle until its trip ends. Both are re-anchored
// to the moving camera every frame, so any camera change -- wheel, pinch,
// keyboard zoom, the sidebar slider or a focus jump -- keeps them on target.
// Wires the canvas tap interaction to the popover and the panel's pickers so the
// app entry point stays declarative. The panel supplies stationAt/vehicleAt for
// picking and, for vehicles, describeVehicle (category and route names) and
// vehiclePosition (live location).
export class MapSelection {
  constructor(container, panel, context, { onStationChosen, popover } = {}) {
    this.panel = panel;
    this.context = context;
    this.camera = context.camera;
    this.time = context.time;
    this.popover = popover ?? new Popover(container);
    this.followedVehicle = null;
    this.selectedStation = null;
    this.onStationChosen = onStationChosen;
  }

  attachTo(canvasElement) {
    new TapInteraction(canvasElement, {
      pick: (x, y) => this.#pick(x, y),
      sameTarget: sameSelectionTarget,
      onSelect: (target) => this.#select(target),
      onActivate: (target) => this.#activate(target),
      onMiss: () => this.clear(),
    });
  }

  onFrameRendered() {
    if (this.followedVehicle !== null) {
      this.#followVehicle();
    } else if (this.selectedStation !== null) {
      this.#anchorTo(this.selectedStation.east, this.selectedStation.north);
    }
  }

  #followVehicle() {
    const position = this.panel.vehiclePosition(
      this.followedVehicle,
      this.time.current,
    );
    if (position === null) {
      this.clear();
      return;
    }
    this.#anchorTo(position.east, position.north);
  }

  #anchorTo(east, north) {
    const [x, y] = this.camera.worldToScreen(east, north);
    this.popover.moveTo(x, y);
  }

  selectStation(station) {
    this.followedVehicle = null;
    this.selectedStation = station;
    const [x, y] = this.camera.worldToScreen(station.east, station.north);
    this.popover.showAt(x, y, station.name);
    this.onStationChosen?.(station);
  }

  clear() {
    this.followedVehicle = null;
    this.selectedStation = null;
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
    this.selectedStation = null;
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
