import {
  categoryColor,
  categoryTextColor,
} from '../data/transportCategories.js';

// A popover bound to one map target that it shows and, each frame, re-anchors
// to the target's current screen position. A vehicle is followed through its
// live position and hides once its trip ends; a station sits on a fixed world
// point. A station is named by its name alone unless the panel has more to say
// about it through describeStation.
export class TrackedPopover {
  constructor(popover, panel, camera, time) {
    this.popover = popover;
    this.panel = panel;
    this.camera = camera;
    this.time = time;
    this.station = null;
    this.vehicle = null;
  }

  showStation(station) {
    this.vehicle = null;
    this.station = station;
    this.popover.showLines(
      ...this.#screen(station.east, station.north),
      this.panel.describeStation?.(station) ?? [station.name],
    );
  }

  showVehicle(vehicle) {
    this.station = null;
    this.vehicle = vehicle;
    const { label, origin, destination, category } =
      this.panel.describeVehicle(vehicle);
    this.popover.showLines(
      ...this.#screen(vehicle.east, vehicle.north),
      [label, `${origin ?? '?'} → ${destination ?? '?'}`],
      { ground: categoryColor(category), text: categoryTextColor(category) },
    );
  }

  clear() {
    this.station = null;
    this.vehicle = null;
    this.popover.hide();
  }

  reanchor() {
    if (this.vehicle !== null) {
      const position = this.panel.vehiclePosition(
        this.vehicle,
        this.time.current,
      );
      if (position === null) {
        this.clear();
        return;
      }
      this.#moveTo(position.east, position.north);
    } else if (this.station !== null) {
      this.#moveTo(this.station.east, this.station.north);
    }
  }

  target() {
    if (this.station !== null) {
      return { kind: 'station', station: this.station };
    }
    if (this.vehicle !== null) {
      return { kind: 'vehicle', vehicle: this.vehicle };
    }
    return null;
  }

  #screen(east, north) {
    return this.camera.worldToScreen(east, north);
  }

  #moveTo(east, north) {
    this.popover.moveTo(...this.#screen(east, north));
  }
}
