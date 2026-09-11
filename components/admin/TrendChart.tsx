/**
 * Lightweight SVG line chart — replaces the original's Chart.js canvas
 * (#trendChart) without adding a charting library dependency for one
 * simple 7-point line. Server-renderable (no client JS needed).
 */
export function TrendChart({ data }: { data: { date: string; views: number }[] }) {
  const width = 600;
  const height = 200;
  const padding = 28;
  const max = Math.max(1, ...data.map((d) => d.views));

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y = height - padding - (d.views / max) * (height - padding * 2);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? padding} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r={3.5} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
      ))}
      {points.map((p) => (
        <text key={`${p.date}-lbl`} x={p.x} y={height - 8} fontSize={10} fill="#9ca3af" textAnchor="middle">
          {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </text>
      ))}
    </svg>
  );
}
