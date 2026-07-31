import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeShortcuts,
  isTypingElement,
  KeyboardControls,
  normalizedBindingKey,
} from './keyboardControls.js';

test('a text field is a typing target so shortcuts yield to it', () => {
  assert.equal(isTypingElement('INPUT', 'text', false), true);
  assert.equal(isTypingElement('INPUT', 'search', false), true);
  assert.equal(isTypingElement('TEXTAREA', undefined, false), true);
  assert.equal(isTypingElement('DIV', undefined, true), true);
});

test('a checkbox, radio or slider keeps shortcuts working while focused', () => {
  assert.equal(isTypingElement('INPUT', 'checkbox', false), false);
  assert.equal(isTypingElement('INPUT', 'radio', false), false);
  assert.equal(isTypingElement('INPUT', 'range', false), false);
});

test('a plain element is not a typing target', () => {
  assert.equal(isTypingElement('DIV', undefined, false), false);
  assert.equal(isTypingElement('BUTTON', undefined, false), false);
});

test('normalizedBindingKey folds letters so Shift and Caps Lock still bind', () => {
  assert.equal(normalizedBindingKey('H'), 'h');
  assert.equal(normalizedBindingKey('h'), 'h');
  // Named and symbol keys pass through untouched.
  assert.equal(normalizedBindingKey(' '), ' ');
  assert.equal(normalizedBindingKey('ArrowUp'), 'ArrowUp');
});

const controlsWithModal = (isModalOpen) => {
  const fired = [];
  let listener = null;
  new KeyboardControls(
    { addEventListener: (_type, handler) => (listener = handler) },
    {
      time: { togglePlay: () => fired.push('play') },
      camera: { fit: () => fired.push('fit') },
      bindings: { h: () => fired.push('stops') },
      overlays: [
        {
          get isOpen() {
            return isModalOpen();
          },
          bindings: { i: () => fired.push('info') },
        },
      ],
    },
  );
  const press = (key) =>
    listener({ key, target: null, preventDefault: () => {} });
  return { press, fired };
};

test('panel shortcuts work while no modal dialog is open', () => {
  const { press, fired } = controlsWithModal(() => false);
  ['h', ' ', 'f', 'i'].forEach(press);
  assert.deepEqual(fired, ['stops', 'play', 'fit', 'info']);
});

test('an open modal dialog silences the panel and playback shortcuts', () => {
  const { press, fired } = controlsWithModal(() => true);
  ['h', ' ', 'f', '+'].forEach(press);
  assert.deepEqual(fired, []);
});

test('an open modal dialog keeps its own shortcut working', () => {
  const { press, fired } = controlsWithModal(() => true);
  press('i');
  assert.deepEqual(fired, ['info']);
});

const PANEL_BINDINGS = { h: 'stops', s: 'sidebar' };
const overlay = (isOpen, bindings) => ({ isOpen, bindings });
const info = (isOpen) => overlay(isOpen, { i: 'info' });
const drawer = (isOpen) => overlay(isOpen, { s: 'drawer' });

test('with every overlay closed the panel keeps its shortcuts', () => {
  const active = activeShortcuts(PANEL_BINDINGS, [info(false)]);
  assert.deepEqual(active.bindings, { h: 'stops', s: 'sidebar', i: 'info' });
  assert.equal(active.viewControlsActive, true);
});

test('an open overlay leaves only the overlays own shortcuts', () => {
  const active = activeShortcuts(PANEL_BINDINGS, [info(true)]);
  assert.deepEqual(active.bindings, { i: 'info' });
  assert.equal(active.viewControlsActive, false);
});

// Modal is a state, not a component: whichever overlay is open silences the
// panel, and the small-viewport sidebar will be one of them.
test('any open overlay silences the panel, not just the first', () => {
  const active = activeShortcuts(PANEL_BINDINGS, [info(false), drawer(true)]);
  assert.deepEqual(active.bindings, { i: 'info', s: 'drawer' });
  assert.equal(active.viewControlsActive, false);
});

test('a closed overlay still owns its key against the panel', () => {
  const active = activeShortcuts(PANEL_BINDINGS, [drawer(false)]);
  assert.equal(active.bindings.s, 'drawer');
});

test('without overlays the panel bindings stand alone', () => {
  const active = activeShortcuts(PANEL_BINDINGS, []);
  assert.deepEqual(active.bindings, PANEL_BINDINGS);
  assert.equal(active.viewControlsActive, true);
});
