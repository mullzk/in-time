// An operating day runs past midnight, the clock on the wall does not.
export function formatTimeOfDay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
