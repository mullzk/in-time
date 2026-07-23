// Reads the two schedule blobs referenced by /api/config: the routed BAV blob
// (rail + tram) and the straight-line road blob (buses).
export async function loadSchedule(configUrl) {
  const configResponse = await fetch(configUrl);
  if (configResponse.status === 503) {
    return { published: false };
  }
  if (!configResponse.ok) {
    throw new Error(`config request failed: ${configResponse.status}`);
  }

  const config = await configResponse.json();
  const [railBuffer, roadBuffer] = await Promise.all([
    fetchBlob(config.scheduleBlobUrl),
    fetchBlob(config.roadScheduleBlobUrl),
  ]);

  return { published: true, config, railBuffer, roadBuffer };
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`schedule blob request failed: ${response.status}`);
  }
  return response.arrayBuffer();
}
