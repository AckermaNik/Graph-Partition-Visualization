// Cache by the panel's node array: new results recalculate colors, while
// inspector/selection renders reuse the same map without resetting hulls.
const colorMaps = new WeakMap();
const fallbackColor = '#756363'; // Same fallback as backend/shaping.py.

function normalizeNodeColor(color) {
  const hex = typeof color === 'string' ? color.trim().toLowerCase() : '';
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${[...hex.slice(1)].map((digit) => digit.repeat(2)).join('')}`;
  }
  return fallbackColor;
}

export function getPartitionColorMap(nodes) {
  if (colorMaps.has(nodes)) return colorMaps.get(nodes);

  const countsByPid = new Map();
  for (const node of nodes) {
    if (node.pid === null || node.pid === undefined) continue;
    const pid = String(node.pid);
    if (!countsByPid.has(pid)) countsByPid.set(pid, new Map());
    const counts = countsByPid.get(pid);
    const color = normalizeNodeColor(node.color);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  const colors = Object.fromEntries(
    [...countsByPid].map(([pid, counts]) => {
      // Break ties by hex value so result ordering cannot change the winner.
      const [winner] = [...counts].sort(([colorA, countA], [colorB, countB]) =>
        countB - countA || colorA.localeCompare(colorB)
      )[0];
      return [pid, winner];
    })
  );
  colorMaps.set(nodes, colors);
  return colors;
}
