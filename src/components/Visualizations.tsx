"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import TrendView from "./viz/TrendView";
import HistogramView from "./viz/HistogramView";

const ScatterView = dynamic(() => import("./viz/ScatterView"), {
  ssr: false,
  loading: () => (
    <div className="text-sm text-gray-600">Loading scatter…</div>
  ),
});

type Props = {
  rows: Record<string, unknown>[];
  schema: Record<string, string>;
};

const TABS = [
  { key: "trend", label: "Parameter Trend" },
  { key: "hist", label: "Histogram" },
  { key: "scatter", label: "Scatter Plot" },
] as const;

export default function Visualizations({ rows, schema }: Props) {
  const [active, setActive] =
    useState<(typeof TABS)[number]["key"]>("trend");

  if (!rows || rows.length === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-400 to-cyan-400" />
        <h2 className="text-2xl font-semibold text-gray-800">
          Visualizations
        </h2>
      </div>

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={[
                "pb-3 transition-colors",
                active === t.key
                  ? "border-b-2 border-rose-500 text-rose-600"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {active === "trend" && (
          <TrendView rows={rows} schema={schema} />
        )}
        {active === "hist" && (
          <HistogramView rows={rows} schema={schema} />
        )}
        {active === "scatter" && (
          <ScatterView rows={rows} schema={schema} />
        )}
      </div>
    </section>
  );
}
