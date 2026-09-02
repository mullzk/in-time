// Reads the two schedule blobs referenced by /api/config: the routed rail blob
// (rail + tram) and the straight-line road blob (buses). The road blob is much
// the larger and nothing in the first picture depends on it, so it is returned
// as a pending promise whose request starts only once the rest has arrived,
// instead of competing for the same bandwidth.
export async function loadSchedule(configUrl) {
  const configResponse = await fetch(configUrl);
  if (configResponse.status === 503) {
    return { published: false };
  }
  if (!configResponse.ok) {
    throw new Error(`config request failed: ${configResponse.status}`);
  }

  const config = await configResponse.json();
  const [railBuffer, railStations, roadStations] = await Promise.all([
    fetchBlob(config.railScheduleBlobUrl),
    fetchJson(config.railStationsUrl),
    fetchJson(config.roadStationsUrl),
  ]);

  return {
    published: true,
    config,
    railBuffer,
    railStations,
    roadStations,
    roadBuffer: fetchBlob(config.roadScheduleBlobUrl),
  };
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`schedule blob request failed: ${response.status}`);
  }
  return response.arrayBuffer();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`stations request failed: ${response.status}`);
  }
  return response.json();
}
