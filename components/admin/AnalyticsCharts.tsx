"use client";

import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, ArcElement } from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { useRef } from "react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, ArcElement);

interface SourceRow {
  source: string;
  views: number;
  pct: number;
  label: string;
  color: string;
}
interface CountryRow {
  country: string;
  views: number;
  pct: number;
  name: string;
  flag: string;
  color: string;
}

/**
 * Ports admin/analytics.php's three Chart.js canvases (views-over-time
 * line chart with a purple gradient fill, source-breakdown doughnut,
 * country-breakdown doughnut) exactly, including the gradient fill,
 * line tension/point styling, and suggestedMax padding above the peak
 * value — an earlier pass here used plain CSS divs for a bar chart
 * instead of real Chart.js visuals.
 */
export function CountryDoughnutChart({ countryBreakdown }: { countryBreakdown: CountryRow[] }) {
  return (
    <div className="an-responsive-chart small">
      <Doughnut
        data={{
          labels: countryBreakdown.map((c) => c.name),
          datasets: [{ data: countryBreakdown.map((c) => c.views), backgroundColor: countryBreakdown.map((c) => c.color), borderWidth: 0 }],
        }}
        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "68%" }}
      />
    </div>
  );
}

export function AnalyticsCharts({
  seriesLabels,
  seriesData,
  rangeLabel,
  sourceBreakdown,
}: {
  seriesLabels: string[];
  seriesData: number[];
  rangeLabel: string;
  sourceBreakdown: SourceRow[];
}) {
  const hasSeries = seriesData.some((v) => v > 0);
  const peakVal = Math.max(0, ...seriesData);

  return (
    <div className="an-charts">
      <div className="an-card">
        <div className="an-card-header">
          <div className="an-card-title">
            <i className="fas fa-chart-line" /> Views Over Time
          </div>
          <div className="an-card-title-sub">{rangeLabel}</div>
        </div>
        <div className="an-responsive-chart">
          {!hasSeries ? (
            <div className="an-empty-note">No views recorded for this period yet</div>
          ) : (
            <ViewsLineChart labels={seriesLabels} data={seriesData} peakVal={peakVal} />
          )}
        </div>
      </div>

      <div className="an-card">
        <div className="an-card-header">
          <div className="an-card-title">
            <i className="fas fa-globe" /> Traffic Sources
          </div>
        </div>
        {sourceBreakdown.length === 0 ? (
          <div className="an-empty-note">No source data for this period yet</div>
        ) : (
          <>
            <div className="an-responsive-chart small">
              <Doughnut
                data={{
                  labels: sourceBreakdown.map((s) => s.label),
                  datasets: [{ data: sourceBreakdown.map((s) => s.views), backgroundColor: sourceBreakdown.map((s) => s.color), borderWidth: 0 }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "68%" }}
              />
            </div>
            <ul className="an-source-list">
              {sourceBreakdown.map((s) => (
                <li className="an-source-row" key={s.source}>
                  <span className="an-source-dot" style={{ background: s.color }} />
                  <span className="an-source-name">
                    <span className="an-source-label">{s.label}</span>
                  </span>
                  <span className="an-source-views">{s.views >= 1000 ? `${(s.views / 1000).toFixed(2)}K` : s.views}</span>
                  <span className="an-source-pct">{s.pct}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function ViewsLineChart({ labels, data, peakVal }: { labels: string[]; data: number[]; peakVal: number }) {
  const chartRef = useRef<ChartJS<"line">>(null);

  return (
    <Line
      ref={chartRef}
      data={{
        labels,
        datasets: [
          {
            label: "Views",
            data,
            borderColor: "#7c3aed",
            borderWidth: 2.5,
            pointRadius: 0,
            pointHitRadius: 12,
            pointHoverRadius: 5,
            pointHoverBorderWidth: 2,
            pointHoverBackgroundColor: "#7c3aed",
            pointHoverBorderColor: "#fff",
            fill: true,
            tension: 0.4,
            cubicInterpolationMode: "monotone",
            // A CanvasGradient needs a rendering context, which only
            // exists once Chart.js has created the canvas — computed via
            // a scriptable option (called with the chart instance) so it
            // isn't evaluated before the canvas exists, matching the
            // reference's ctx.createLinearGradient() call exactly.
            backgroundColor: (context: { chart: ChartJS }) => {
              const { ctx, chartArea } = context.chart;
              if (!chartArea) return "rgba(124, 58, 237, 0.1)";
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, "rgba(124, 58, 237, 0.25)");
              gradient.addColorStop(1, "rgba(124, 58, 237, 0.02)");
              return gradient;
            },
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 10, right: 8 } },
        interaction: { intersect: false, mode: "index" },
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: peakVal > 0 ? peakVal * 1.25 : 4,
            grid: { color: "rgba(0,0,0,0.05)" },
            border: { display: false },
          },
          x: {
            grid: { display: false },
            border: { display: false },
          },
        },
      }}
    />
  );
}
