# Instrumentations

An instrumentation is a JSON document that says what a station sounds like:
which sound each transport group plays, and how its events differ. The four
documents in this directory are what the sidebar offers; they use nothing a
document of your own could not use. Bringing one along still wants a way to
choose the file, which does not exist yet — for now a document joins the four by
being added here and imported in `../presets.js`.

## The shape of a document

```json
{
  "instrumentation": "Marimba (GM)",
  "sound": "marimba",
  "fernverkehr": {
    "note": 57,
    "gain": 0.42,
    "arrival": { "noteAdjust": 0, "pan": "center" },
    "dwell": { "intervalSeconds": 0.3333333333333333, "gainFactor": 0.42 }
  },
  "tram": { "dwellType": "none", "sound": "ride-cymbal", "gain": 0.3 }
}
```

Two levels deep, no more: the document holds transport groups, a transport group
holds events. An event block at the root is refused, so "event or transport
group, which is more specific?" never comes up.

| Key               | Where              | Meaning                                           |
| ----------------- | ------------------ | ------------------------------------------------- |
| `instrumentation` | root only          | the name in the dropdown; required                |
| `sound`           | root, group, event | a name from the table below; required at the root |
| `dwellType`       | root, group        | `none`, `once` or `repeat`                        |
| any sound setting | root, group, event | see _Settings_                                    |

The transport groups are `fernverkehr`, `interregio`, `regionalverkehr`, `tram`
and `bus`. The events are `arrival`, `departure`, `passthrough` and `dwell` (a
vehicle standing at the station).

## How a value is found

A setting is looked up along five layers. **The deepest mention wins** — no
accumulation, relative settings included.

```
1  the kind of sound      pitched or percussive: how it marks the events
2  the sound              its base sound (see the table)
3  the document           whatever the root says
4  the transport group
5  the event                                              ← wins
```

So a document may say as little as one sound for everything, and add only what
should differ. Leave out `arrival` and it sounds like its transport group; leave
out the group and it sounds like the document.

Changing `sound` deeper down re-bases layers 1 and 2 on the new sound while the
document's own values stay: a group that plays a drum takes the drum's way of
marking an arrival, but keeps the `gain` the document set.

## Settings

Everything that is not a key from the table above is a sound setting and is
handed to the audio engine as it stands. Common ones: `gain`, `note`, `pan`,
`attack`, `decay`, `sustain`, `release`, `duration`, `speed`, `cutoff`,
`resonance`, `bandf`, `bandq`, `fmi`, `fmh`. Unknown ones are passed through
rather than refused — the engine's vocabulary is larger than this list and is
not worth mirroring.

Three settings are ours:

- **`noteAdjust`** — semitones added to the resolved `note`. A sound without a
  pitch (the noise brush) has nothing to shift.
- **`gainFactor`** — multiplies the resolved `gain`.
- **`pan`** — `"left"`, `"center"`, `"right"`, or a number from 0 to 1.

`noteAdjust` and `gainFactor` are found by depth like everything else, so a
deeper one replaces a shallower one instead of adding to it. That is how a
document switches off what a kind of sound does by default: the drum kind makes
departures louder with `gainFactor: 1.5`, and a group that marks them with a
different drum instead says `"gainFactor": 1`.

`duration` is not sent to the engine; it is how long the sound is held.

## How the events differ by default

Set nothing, and the kind of sound decides:

| Kind         | arrival                   | departure                   | passthrough | dwell                                        |
| ------------ | ------------------------- | --------------------------- | ----------- | -------------------------------------------- |
| `pitched`    | `noteAdjust -5`, pan left | pan right                   | pan centre  | `repeat` every 2 s, an octave down and quiet |
| `percussive` | `speed 0.8`, pan left     | `gainFactor 1.5`, pan right | pan centre  | `repeat` every 0.125 s, quieter              |

An arrival that should sound like a departure is
`"arrival": { "noteAdjust": 0, "pan": "center" }`.

## Standing at the station

`dwellType` chooses the figure, the `dwell` block tunes it:

| `dwellType` | What happens                                            |
| ----------- | ------------------------------------------------------- |
| `none`      | silence while the vehicle stands                        |
| `once`      | one sound as it arrives, left to ring out               |
| `repeat`    | the same sound every `intervalSeconds` until it departs |

A quiet drum roll is `repeat` with a short interval and a small `gainFactor`; a
low hum is `once` with a deep `noteAdjust`, a long `decay` and a long
`duration`.

With `repeat`, one hit lasts as long as the gap to the next unless the `dwell`
block itself says `duration` — an inherited `duration` belongs to the single
strike, not to the repetition. A `repeat` needs an `intervalSeconds` greater
than zero.

Only a vehicle that stands for at least a minute of schedule time gets a figure
at all; that comes from the timetable and cannot be set here.

## The sounds

Every sound is one file in `../sounds/`, and only these names may be used: a
name outside the list is refused when the document is checked. That list is also
what the vendoring script mirrors, so a name it accepts is one it can play.
Every base setting can be overruled in a document.

### Pitched

| Name                | Base sound                 | Base settings                                                                                                              |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `fm-bell`           | `sine` with FM             | `fmi 8`, `fmh 3.01`, `note 76`, `attack .002`, `decay .15`, `sustain .15`, `release 1.2`, `gain .35`, `duration .3`        |
| `filtered-sawtooth` | `sawtooth`                 | `cutoff 1400`, `resonance 8`, `note 57`, `attack .005`, `decay .18`, `sustain 0`, `release .25`, `gain .25`, `duration .2` |
| `noise-brush`       | `pink` noise, no pitch     | `bandf 900`, `bandq 6`, `attack .001`, `decay .05`, `sustain 0`, `release .05`, `gain .18`, `duration .08`                 |
| `muted-guitar`      | `gm_electric_guitar_muted` | `note 60`, `attack .002`, `decay .08`, `sustain .2`, `release .2`, `gain .3`, `duration .15`                               |
| `marimba`           | `gm_marimba`               | `note 60`, `attack .001`, `decay .05`, `sustain 1`, `release .2`, `gain .3`, `duration .2`                                 |

### Percussive

All from the vendored uzu drum kit; a drum has no pitch, so `note` and
`noteAdjust` do nothing.

| Name           | Bank  | Base settings              |
| -------------- | ----- | -------------------------- |
| `bass-drum`    | `bd`  | `gain .4`, `duration .2`   |
| `snare`        | `sd`  | `gain .35`, `duration .2`  |
| `low-tom`      | `lt`  | `gain .35`, `duration .25` |
| `mid-tom`      | `mt`  | `gain .35`, `duration .25` |
| `high-tom`     | `ht`  | `gain .35`, `duration .25` |
| `ride-cymbal`  | `rd`  | `gain .3`, `duration .4`   |
| `closed-hihat` | `hh`  | `gain .3`, `duration .1`   |
| `open-hihat`   | `oh`  | `gain .3`, `duration .3`   |
| `rimshot`      | `rim` | `gain .3`, `duration .15`  |

## What is refused

A document is checked once, before it plays, and a mistake names its place: an
unknown sound, an unknown transport group, an unknown event, an unknown
`dwellType`, a `repeat` without an interval, a missing name, an event block at
the root. Everything else is handed on.
