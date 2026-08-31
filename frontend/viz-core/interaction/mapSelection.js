import { HoverInteraction } from './hoverInteraction.js';
import { Popover } from './popover.js';
import { TapInteraction } from './tapInteraction.js';
import { TrackedPopover } from './trackedPopover.js';

// Whether two picks mean the same target -- what a double click and a finger's
// second tap are recognised by. Stations are stable objects, but vehicleAt
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
    first.vehicle.positionEngineIndex === second.vehicle.positionEngineIndex &&
    first.vehicle.tripIndex === second.vehicle.tripIndex
  );
}

// Tap- and hover-to-select on the map, sharing one ranked picker so a hover
// previews exactly what a click would take: a rail station wins, then a vehicle,
// then a tram or bus stop. The committed selection and the preview each drive
// their own tracked popover, both following the moving camera every frame. A
// mouse previews by hovering and commits by clicking; a finger, which cannot
// hover, previews with its first tap and commits with a second one on the same
// target. The panel supplies the pickers and, for vehicles, describeVehicle and
// vehiclePosition.
export class MapSelection {
  constructor(
    container,
    panel,
    context,
    { onStationChosen, onNothingTapped, popover, hoverPopover } = {},
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
    this.onNothingTapped = onNothingTapped;
    this.previewed = null;
  }

  attachTo(canvasElement) {
    const pick = (x, y) => this.#pick(x, y);
    new TapInteraction(canvasElement, {
      pick,
      sameTarget: sameSelectionTarget,
      onSelect: (target, pointerType) => this.#select(target, pointerType),
      onActivate: (target) => this.#activate(target),
      onPointerDown: () => this.clear(),
      onNothingTapped: () => {
        this.#dropPreview();
        this.onNothingTapped?.();
      },
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
    this.#bringIntoView(station);
    this.selectStation(station);
  }

  // A panel that frames a station itself is asked instead of the camera.
  #bringIntoView(station) {
    if (this.panel.frameStation) {
      this.panel.frameStation(this.context, station);
      return;
    }
    this.context.focusStation(station.east, station.north);
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
      return;
    }
    this.#preview(target);
  }

  #preview(target) {
    if (target.kind === 'station') {
      this.hover.showStation(target.station);
    } else {
      this.hover.showVehicle(target.vehicle);
    }
    this.previewed = target;
  }

  #dropPreview() {
    this.previewed = null;
    this.hover.clear();
  }

  // A finger has no hover, so its first tap on a target only names it and the
  // second one takes it; a mouse has hovered it already.
  #awaitsAnotherTap(target, pointerType) {
    return (
      pointerType !== 'mouse' &&
      !this.#isSelected(target) &&
      (this.previewed === null || !sameSelectionTarget(this.previewed, target))
    );
  }

  #select(target, pointerType) {
    if (this.#awaitsAnotherTap(target, pointerType)) {
      this.#preview(target);
      return;
    }
    this.previewed = null;
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
