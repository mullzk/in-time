import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTypingElement, normalizedBindingKey } from './keyboardControls.js';

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
