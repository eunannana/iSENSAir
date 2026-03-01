"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);

type Props = {
  rows: Record<string, unknown>[];
  schema: Record<string, string>;
};

type Agg = "all" | "daily" | "weekly" | "monthly";

/* ==============================
   PARAMETER SENSOR YANG DIPAKAI
============================== */
const SENSOR_KEYS = [
  "Tr_Sensor",
  "BOD_Sensor",
  "DO_Sensor",
  "COD_Sensor",
  "NH_Sensor",
  "TDS_Sensor",
  "CT_Sensor",
  "ORP_Sensor",
  "pH_Sensor",
];

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#f97316",
  "#0ea5e9",
  "#e11d48",
  "#14b8a6",
  "#f59e0b",
];

/* ==============================
   FORMAT ANGKA Y
============================== */
function formatNumber(value: number) {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString();
  }
  return value.toFixed(2);
}

/* ==============================
   BUILD SERIES PER PARAMETER
   (plus date formatting helpers)
============================== */

// convert a bucket string into a human-friendly label depending on aggregation strategy
function formatBucket(bucket: string, agg: Agg): string {
  switch (agg) {
    case "all":
      return bucket; // raw time string already
    case "daily":
      // bucket is already YYYY-MM-DD
      return dayjs(bucket).format("YYYY-MM-DD");
    case "weekly": {
      const [year, week] = bucket.split("-W");
      const start = dayjs()
        .year(Number(year))
        .isoWeek(Number(week))
        .startOf("isoWeek");
      const end = start.endOf("isoWeek");
      return `${start.format("YYYY-MM-DD")} – ${end.format("YYYY-MM-DD")}`;
    }
    case "monthly": {
      const date = dayjs(bucket + "-01");
      return date.format("MMMM YYYY");
    }
  }
}

function buildSeries(
  rows: Record<string, unknown>[],
  timeKey: string,
  param: string,
  agg: Agg
) {
  if (!timeKey || !param) return [];

  const cleaned = rows
    .filter(
      (r) =>
        r[timeKey] != null &&
        r[param] != null &&
        r[param] !== ""
    )
    .map((r) => ({
      t: dayjs(r[timeKey] as string, [
        "DD/MM/YYYY HH:mm:ss",
        "DD/MM/YYYY, HH:mm:ss",
        "YYYY-MM-DD HH:mm:ss",
        "YYYY-MM-DDTHH:mm:ss",
      ]),
      v: Number(r[param]),
      raw: r[timeKey] as string,
    }))
    .filter((x) => x.t.isValid() && !Number.isNaN(x.v))
    .sort((a, b) => a.t.valueOf() - b.t.valueOf());

  if (agg === "all") {
    return cleaned.map((x) => ({
      dateOnly: x.t.format("YYYY-MM-DD"),
      fullTime: x.raw,
      value: x.v,
    }));
  }

  const map = new Map<string, { values: number[] }>();

  for (const x of cleaned) {
    let key = "";

    if (agg === "daily") key = x.t.format("YYYY-MM-DD");
    if (agg === "weekly")
      key = `${x.t.year()}-W${x.t.isoWeek()}`;
    if (agg === "monthly")
      key = x.t.format("YYYY-MM");

    if (!map.has(key)) map.set(key, { values: [] });
    map.get(key)!.values.push(x.v);
  }

  return [...map.entries()]
    .map(([bucket, obj]) => ({
      dateOnly: bucket,
      fullTime: formatBucket(bucket, agg),
      value:
        obj.values.reduce((a, b) => a + b, 0) /
        obj.values.length,
    }))
    .sort((a, b) => a.dateOnly.localeCompare(b.dateOnly));
}

export default function TrendView({
  rows,
  schema,
}: Props) {
  const timeKey =
    Object.entries(schema).find(
      ([, t]) => t === "datetime"
    )?.[0] || "";

  const [param, setParam] =
    useState<string>("__all__");
  const [agg, setAgg] =
    useState<Agg>("all");

  return (
    <div>
      <h3 className="text-xl font-semibold text-gray-800">
        Parameter Trend Over Time
      </h3>

      {/* Controls */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-700">
          Select Parameter
          <div className="mt-1">
            <select
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
              value={param}
              onChange={(e) =>
                setParam(e.target.value)
              }
            >
              <option value="__all__">
                All Parameters
              </option>
              {SENSOR_KEYS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="text-sm text-gray-700">
          Aggregation
          <div className="mt-1">
            <select
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
              value={agg}
              onChange={(e) =>
                setAgg(e.target.value as Agg)
              }
            >
              <option value="all">
                All time
              </option>
              <option value="daily">
                Daily
              </option>
              <option value="weekly">
                Weekly
              </option>
              <option value="monthly">
                Monthly
              </option>
            </select>
          </div>
        </label>
      </div>

      {/* ===== SINGLE PARAMETER ===== */}
      {param !== "__all__" && (
        <SingleChart
          rows={rows}
          timeKey={timeKey}
          param={param}
          agg={agg}
          color={COLORS[0]}
        />
      )}

      {/* ===== ALL PARAMETERS ===== */}
      {param === "__all__" && (
        <div className="mt-6 space-y-10">
          {SENSOR_KEYS.map((p, idx) => (
            <SingleChart
              key={p}
              rows={rows}
              timeKey={timeKey}
              param={p}
              agg={agg}
              color={
                COLORS[idx % COLORS.length]
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ==============================
   COMPONENT CHART PER PARAMETER
============================== */
interface SingleChartProps {
  rows: Record<string, unknown>[];
  timeKey: string;
  param: string;
  agg: Agg;
  color: string;
}

function SingleChart({
  rows,
  timeKey,
  param,
  agg,
  color,
}: SingleChartProps) {
  const data = useMemo(
    () =>
      buildSeries(rows, timeKey, param, agg),
    [rows, timeKey, param, agg]
  );
  // choose x-axis key so every point has a unique x-value
  const xKey = agg === "all" ? "fullTime" : "dateOnly";

  if (!data.length) return null;

  const values = data.map((d: any) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.1;

  return (
    <div>
      <p className="mt-6 text-sm text-gray-600 mb-2">
        {agg === "all"
          ? "All time"
          : agg[0].toUpperCase() +
            agg.slice(1)}{" "}
        Trend – {param}
      </p>

      <div className="h-[340px] w-full">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 12 }}
              tickFormatter={(val) => {
                const s = val as string;
                return agg === "all" ? dayjs(s).format("YYYY-MM-DD") : formatBucket(s, agg);
              }}
            />
            <YAxis
              domain={[
                min - padding,
                max + padding,
              ]}
              tickFormatter={formatNumber}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={(label) => {
                const s = label as string;
                return agg === "all" ? s : formatBucket(s, agg);
              }}
              formatter={(value: any) =>
                formatNumber(Number(value))
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              dot={false}
              strokeWidth={2}
              stroke={color}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
