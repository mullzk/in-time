import assert from 'node:assert/strict';
import { test } from 'node:test';
import baseline from './fixtures/sound-baseline.json' with { type: 'json' };
import { INSTRUMENTATIONS } from './presets.js';
import { TRANSPORT_GROUPS } from './scheduling.js';

// What the four instrumentations must sound like, event by event and parameter
// by parameter: the fixture holds every call they make to the audio bridge, the
// master gain and density damping excluded because the Sonifier adds those.

const BASELINE_SECONDS = 2;
const SIGNIFICANT_DIGITS = 12;

// Both sides arrive at the same numbers by different arithmetic, so compare
// them at the precision that carries meaning rather than to the last bit.
const rounded = (value) => {
  if (typeof value === 'number') {
    return Number(value.toPrecision(SIGNIFICANT_DIGITS));
  }
  if (Array.isArray(value)) {
    return value.map(rounded);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, entry]) => [key, rounded(entry)]),
    );
  }
  return value;
};

const hitsWithin = (figure, seconds) => {
  if (figure === null) {
    return null;
  }
  if (figure.intervalSeconds === null) {
    return [
      {
        offsetSeconds: 0,
        durationSeconds: figure.durationSeconds,
        parameters: figure.parameters,
      },
    ];
  }
  const count = Math.ceil(seconds / figure.intervalSeconds);
  return Array.from({ length: count }, (_, index) => ({
    offsetSeconds: index * figure.intervalSeconds,
    durationSeconds: figure.durationSeconds,
    parameters: figure.parameters,
  }));
};

const instrumentationNamed = (name) =>
  INSTRUMENTATIONS.find((candidate) => candidate.name === name);

Object.entries(baseline).forEach(([name, groups]) => {
  test(`${name} sounds as it did`, () => {
    const instrumentation = instrumentationNamed(name);
    assert.ok(instrumentation, `${name} is still offered`);

    TRANSPORT_GROUPS.forEach((group) => {
      const expected = groups[group];
      ['arrival', 'departure', 'passthrough'].forEach((eventKind) => {
        assert.deepEqual(
          rounded(instrumentation.parametersFor(group, eventKind)),
          rounded(expected[eventKind]),
          `${name} / ${group} / ${eventKind}`,
        );
      });
      assert.deepEqual(
        rounded(
          hitsWithin(instrumentation.dwellFigureFor(group), BASELINE_SECONDS),
        ),
        rounded(expected.dwell),
        `${name} / ${group} / dwell`,
      );
    });
  });
});

test('the instrumentations are still the four the sidebar offers', () => {
  assert.deepEqual(
    INSTRUMENTATIONS.map((instrumentation) => instrumentation.name),
    Object.keys(baseline),
  );
});
