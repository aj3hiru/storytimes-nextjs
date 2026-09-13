"use client";

import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

/**
 * Real bug fixed here: this used to be a plain SVG chart connecting data
 * points with straight line segments (sharp angular joints) — the
 * reference's own dashboard "Traffic Trend" widget uses Chart.js with a
 * smooth, flowing curve (high tension/monotone cubic interpolation), a
 * green stroke, and a soft gradient-filled area beneath it, verified
 * directly against the live newbase dashboard. Rebuilt with Chart.js
 * (already a dependency — see AnalyticsCharts.tsx) to match exactly,
 * instead of hand-rolling straight-line SVG paths.
 */
export function TrendChart({ data }: { data: { date: string; views: number }[] }) {
  const labels = data.map((d) => new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const values = data.map((d) => d.views);
  const peak = Math.max(0, ...values);

  return (
    <div style={{ position: "relative", height: 260, width: "100%" }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              data: values,
              borderColor: "#10b981",
              borderWidth: 2.5,
              pointRadius: 0,
              pointHitRadius: 12,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: "#10b981",
              pointHoverBorderColor: "#fff",
              pointHoverBorderWidth: 2,
              fill: true,
              tension: 0.45,
              cubicInterpolationMode: "monotone",
              backgroundColor: (context: { chart: ChartJS }) => {
                const { ctx, chartArea } = context.chart;
                if (!chartArea) return "rgba(16, 185, 129, 0.12)";
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, "rgba(16, 185, 129, 0.25)");
                gradient.addColorStop(1, "rgba(16, 185, 129, 0.02)");
                return gradient;
              },
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 8, right: 4 } },
          interaction: { intersect: false, mode: "index" },
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: peak > 0 ? peak * 1.2 : 4,
              grid: { color: "rgba(0,0,0,0.05)" },
              border: { display: false },
              ticks: { color: "#9ca3af", font: { size: 11 } },
            },
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: "#9ca3af", font: { size: 11 } },
            },
          },
        }}
      />
    </div>
  );
}
