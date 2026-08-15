// An instrumentation assigns one sound type to each of the five transport
// groups, so a vehicle's events are voiced by the sound type of its group. A
// group the preset leaves unset falls back to the regional rail sound type,
// mirroring how groupOf resolves an unknown category.

export class Instrumentation {
  constructor(soundTypeByGroup) {
    this.soundTypeByGroup = soundTypeByGroup;
  }

  soundTypeFor(group) {
    return (
      this.soundTypeByGroup[group] ?? this.soundTypeByGroup.regionalverkehr
    );
  }
}
