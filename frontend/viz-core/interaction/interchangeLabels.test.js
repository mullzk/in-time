import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InterchangeLabels } from './interchangeLabels.js';

const makeFakePopover = () => ({
  calls: [],
  showAt(x, y, text) {
    this.calls.push(['showAt', x, y, text]);
  },
  moveTo(x, y) {
    this.calls.push(['moveTo', x, y]);
  },
  hide() {
    this.calls.push(['hide']);
  },
});

// A camera whose horizontal pan the test can shift, so worldToScreen returns a
// different screen point after a camera move.
const makeLabels = () => {
  const camera = {
    pan: 0,
    worldToScreen(east, north) {
      return [east + this.pan, north];
    },
  };
  const popovers = [];
  const labels = new InterchangeLabels(camera, () => {
    const popover = makeFakePopover();
    popovers.push(popover);
    return popover;
  });
  return { labels, camera, popovers };
};

const place = (name, east, north) => ({ name, east, north });

test('every interchange of a journey is named where it stands', () => {
  const { labels, popovers } = makeLabels();

  labels.show([place('Olten', 100, 200), place('Bern', 300, 400)]);

  assert.equal(popovers.length, 2);
  assert.deepEqual(popovers[0].calls, [['showAt', 100, 200, 'Olten']]);
  assert.deepEqual(popovers[1].calls, [['showAt', 300, 400, 'Bern']]);
});

test('the labels follow the camera each frame', () => {
  const { labels, camera, popovers } = makeLabels();
  labels.show([place('Olten', 100, 200)]);

  camera.pan = 50;
  labels.reanchor();

  assert.deepEqual(popovers[0].calls.at(-1), ['moveTo', 150, 200]);
});

test('a shorter journey hides the labels it no longer needs', () => {
  const { labels, popovers } = makeLabels();
  labels.show([place('Olten', 100, 200), place('Bern', 300, 400)]);

  labels.show([place('Thun', 500, 600)]);

  assert.equal(popovers.length, 2);
  assert.deepEqual(popovers[0].calls.at(-1), ['showAt', 500, 600, 'Thun']);
  assert.deepEqual(popovers[1].calls.at(-1), ['hide']);
});

test('a hidden label stops following the camera', () => {
  const { labels, camera, popovers } = makeLabels();
  labels.show([place('Olten', 100, 200)]);
  labels.show([]);
  const callsAfterHiding = popovers[0].calls.length;

  camera.pan = 50;
  labels.reanchor();

  assert.equal(popovers[0].calls.length, callsAfterHiding);
});
