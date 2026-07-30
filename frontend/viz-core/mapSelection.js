import { HoverInteraction } from './hoverInteraction.js';
import { Popover } from './popover.js';
import { TapInteraction } from './tapInteraction.js';
import { TrackedPopover } from './trackedPopover.js';

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

// Tap- and hover-to-select on the map, sharing one ranked picker so a hover
// previews exactly what a click would take: a rail station wins, then a vehicle,
// then a tram or bus stop. The committed selection and the hover each drive their
// own tracked popover -- the hover's drawn weaker and beneath -- and both follow
// the moving camera every frame. The panel supplies the pickers and, for
// vehicles, describeVehicle and vehiclePosition.
export class MapSelection {
  constructor(
    container,
    panel,
    context,
    { onStationChosen, popover, hoverPopover } = {},
  ) {
    this.panel = panel;
    this.context = context;
    this.camera = context.camera;
    this.time = context.time;
    this.selection = new TrackedPopover(
      popover ?? new Popover(container),
      panel,
      this.camera,
      this.time,
    );
    this.hover = new TrackedPopover(
      hoverPopover ?? new Popover(container, 'popover-hover'),
      panel,
      this.camera,
      this.time,
    );
    this.onStationChosen = onStationChosen;
  }

  attachTo(canvasElement) {
    const pick = (x, y) => this.#pick(x, y);
    new TapInteraction(canvasElement, {
      pick,
      sameTarget: sameSelectionTarget,
      onSelect: (target) => this.#select(target),
      onActivate: (target) => this.#activate(target),
      onMiss: () => this.clear(),
    });
    new HoverInteraction(canvasElement, {
      pick,
      sameTarget: sameSelectionTarget,
      onHover: (target) => this.#hover(target),
    });
  }

  onFrameRendered() {
    this.selection.reanchor();
    this.hover.reanchor();
  }

  revealStation(station) {
    this.panel.revealStation(station);
    this.context.focusStation(station.east, station.north);
    this.selectStation(station);
  }

  selectStation(station) {
    this.selection.showStation(station);
    this.#suppressHover({ kind: 'station', station });
    this.onStationChosen?.(station);
  }

  clear() {
    this.selection.clear();
  }

  #hover(target) {
    if (target === null || this.#isSelected(target)) {
      this.hover.clear();
    } else if (target.kind === 'station') {
      this.hover.showStation(target.station);
    } else {
      this.hover.showVehicle(target.vehicle);
    }
  }

  #select(target) {
    if (target.kind === 'station') {
      this.revealStation(target.station);
    } else {
      this.selection.showVehicle(target.vehicle);
      this.#suppressHover(target);
    }
  }

  #activate(target) {
    if (target.kind === 'station') {
      this.revealStation(target.station);
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

  #pick(screenX, screenY) {
    const railStation = this.panel.railStationNear(screenX, screenY);
    if (railStation !== null) {
      return { kind: 'station', station: railStation };
    }
    const vehicle = this.panel.vehicleAt(screenX, screenY);
    if (vehicle !== null) {
      return { kind: 'vehicle', vehicle };
    }
    const station = this.panel.minorStationNear(screenX, screenY);
    return station === null ? null : { kind: 'station', station };
  }

  #isSelected(target) {
    const selected = this.selection.target();
    return selected !== null && sameSelectionTarget(selected, target);
  }

  #suppressHover(selected) {
    const hovered = this.hover.target();
    if (hovered !== null && sameSelectionTarget(hovered, selected)) {
      this.hover.clear();
    }
  }
}
