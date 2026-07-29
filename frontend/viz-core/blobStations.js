// Reads the station-coordinate section of a schedule blob (ITSB v1): the shared
// source both the vehicle-position engine and the station catalog use to turn a
// blob station index into its LV95 point. Mirrors the column layout of the
// Python writer (backend/pipeline/schedule_blob.py).

const MAGIC = 'ITSB';
const VERSION = 1;

const OFFSET_VERSION = 4;
const OFFSET_ORIGIN_EAST = 12;
const OFFSET_ORIGIN_NORTH = 16;
const OFFSET_STATION_COUNT = 24;
const OFFSET_STATIONS_SECTION = 48;

const readU32Column = (view, start, count) => {
  const column = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = view.getUint32(start + index * 4, true);
  }
  return column;
};

export function readStationPoints(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== MAGIC) {
    throw new Error(`not an ITSB blob: ${magic}`);
  }
  if (view.getUint16(OFFSET_VERSION, true) !== VERSION) {
    throw new Error('unsupported ITSB version');
  }

  const stationCount = view.getUint32(OFFSET_STATION_COUNT, true);
  const originEast = view.getUint32(OFFSET_ORIGIN_EAST, true);
  const originNorth = view.getUint32(OFFSET_ORIGIN_NORTH, true);
  const start = view.getUint32(OFFSET_STATIONS_SECTION, true);
  const east = readU32Column(view, start, stationCount);
  const north = readU32Column(view, start + stationCount * 4, stationCount);
  return Array.from({ length: stationCount }, (_, index) => [
    east[index] + originEast,
    north[index] + originNorth,
  ]);
}
