import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TEMPO, MIN_TEMPO } from '../time/timeModel.js';
import {
  sliderPositionForTempo,
  tempoForSliderPosition,
} from './tempoSlider.js';

test('the travel spans the whole tempo range', () => {
  assert.equal(tempoForSliderPosition(0), MIN_TEMPO);
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
  const slowDoubling =
    sliderPositionForTempo(2 * MIN_TEMPO) - sliderPositionForTempo(MIN_TEMPO);
  const fastDoubling =
    sliderPositionForTempo(MAX_TEMPO) - sliderPositionForTempo(MAX_TEMPO / 2);

  assert.ok(Math.abs(slowDoubling - fastDoubling) < 1e-9);
});

test('no position stands for a standstill: the slowest tempo still moves', () => {
  assert.ok(tempoForSliderPosition(0) > 0);
});

test('a position outside the travel stays within the range', () => {
  assert.equal(tempoForSliderPosition(-1), MIN_TEMPO);
  assert.equal(tempoForSliderPosition(2), MAX_TEMPO);
  assert.equal(sliderPositionForTempo(MIN_TEMPO / 2), 0);
  assert.equal(sliderPositionForTempo(MAX_TEMPO * 2), 1);
});
