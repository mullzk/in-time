// The interchanges of a previewed journey, each named by a quiet popover of its
// own. The popovers are pooled: a journey with fewer changes than the one before
// hides what it no longer needs instead of tearing the elements down.
export class InterchangeLabels {
  // `makePopover` builds one more popover whenever a journey needs it.
  constructor(camera, makePopover) {
    this.camera = camera;
    this.makePopover = makePopover;
    this.popovers = [];
    this.places = [];
  }

  // `places` carry a name and a world position; an empty list names nothing.
  show(places) {
    this.places = places;
    places.forEach((place, index) => {
      this.#popoverAt(index).showAt(...this.#screen(place), place.name);
    });
    this.popovers.slice(places.length).forEach((popover) => {
      popover.hide();
    });
  }

  reanchor() {
    this.places.forEach((place, index) => {
      this.popovers[index].moveTo(...this.#screen(place));
    });
  }

  #popoverAt(index) {
    if (this.popovers[index] === undefined) {
      this.popovers[index] = this.makePopover();
    }
    return this.popovers[index];
  }

  #screen({ east, north }) {
    return this.camera.worldToScreen(east, north);
  }
}
