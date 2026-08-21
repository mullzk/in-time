import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isPausePosition,
  PAUSE_POSITION,
  PAUSE_SHARE,
  sliderPositionForTempo,
  tempoForSliderPosition,
} from './tempoSlider.js';
import { MAX_TEMPO, MIN_TEMPO } from './timeModel.js';

test('the running stretch spans the whole tempo range', () => {
  assert.equal(tempoForSliderPosition(PAUSE_SHARE), MIN_TEMPO);
  assert.equal(tempoForSliderPosition(1), MAX_TEMPO);
});

test('every tempo maps back to the position it came from', () => {
  [MIN_TEMPO, 30, 60, 240, MAX_TEMPO].forEach((tempo) => {
    assert.ok(
      Math.abs(tempoForSliderPosition(sliderPositionForTempo(tempo)) - tempo) <
        1e-9,
    );
  });
});

test('equal travel doubles the tempo wherever it is spent', () => {
  const positionOf = (tempo) => sliderPositionForTempo(tempo);
  const slowDoubling = positionOf(2 * MIN_TEMPO) - positionOf(MIN_TEMPO);
  const fastDoubling = positionOf(MAX_TEMPO) - positionOf(MAX_TEMPO / 2);

  assert.ok(Math.abs(slowDoubling - fastDoubling) < 1e-9);
});

test('the left anchor pauses and the running stretch does not', () => {
  assert.ok(isPausePosition(PAUSE_POSITION));
  assert.ok(!isPausePosition(PAUSE_SHARE));
  assert.ok(!isPausePosition(1));
});

test('a position outside the running stretch stays within the range', () => {
  assert.equal(tempoForSliderPosition(0), MIN_TEMPO);
  assert.equal(tempoForSliderPosition(2), MAX_TEMPO);
  assert.equal(sliderPositionForTempo(MIN_TEMPO / 2), PAUSE_SHARE);
  assert.equal(sliderPositionForTempo(MAX_TEMPO * 2), 1);
});
