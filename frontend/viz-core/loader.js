// Reads the schedule blob referenced by /api/config.
export async function loadSchedule(configUrl) {
  const configResponse = await fetch(configUrl);
  if (configResponse.status === 503) {
    return { published: false };
  }
  if (!configResponse.ok) {
    throw new Error(`config request failed: ${configResponse.status}`);
  }

  const config = await configResponse.json();
  const blobResponse = await fetch(config.scheduleBlobUrl);
  if (!blobResponse.ok) {
    throw new Error(`schedule blob request failed: ${blobResponse.status}`);
  }

  return {
    published: true,
    config,
    scheduleBuffer: await blobResponse.arrayBuffer(),
  };
}
