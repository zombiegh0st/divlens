// Tiny SVG line chart on a real time axis. The line breaks where snapshots
// are more than GAP_DAYS apart, so missing history stays visible.

const W = 600;
const H = 160;
const PAD = { top: 10, right: 8, bottom: 28, left: 8 };
const GAP_DAYS = 7;
const DAY = 86400000;

// points: [{ date: 'YYYY-MM-DD', value: cents }], sorted by date
export function lineChart(points, formatValue, formatDate) {
  if (points.length < 2) return '';
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.value);
  const [x0, x1] = [xs[0], xs.at(-1)];
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(0, ...ys);
  const sx = (x) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const sy = (y) => PAD.top + (1 - (y - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);

  const segments = [[]];
  points.forEach((p, i) => {
    if (i && xs[i] - xs[i - 1] > GAP_DAYS * DAY) segments.push([]);
    segments.at(-1).push(`${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`);
  });
  const lines = segments.map((s) => `<polyline class="line" points="${s.join(' ')}"/>`).join('');
  const dots = points.map((_, i) => `<circle class="dot" r="2" cx="${sx(xs[i]).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}"/>`).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf">
    <line class="axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${sy(0)}" y2="${sy(0)}"/>
    ${lines}${dots}
    <text x="${PAD.left}" y="${PAD.top + 2}" dominant-baseline="hanging">${formatValue(y1)}</text>
    <text x="${PAD.left}" y="${H - PAD.bottom - 4}">${formatValue(y0)}</text>
    <text x="${PAD.left}" y="${H - 4}">${formatDate(points[0].date)}</text>
    <text x="${W - PAD.right}" y="${H - 4}" text-anchor="end">${formatDate(points.at(-1).date)}</text>
  </svg>`;
}
