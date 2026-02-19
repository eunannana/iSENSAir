"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Jakarta");

type Props = {
  rows: Record<string, unknown>[];
  schema: Record<string, string>;
};

/* ==============================
   9 PARAMETER SENSOR SAJA
================================ */
const allowedParams = [
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

/* ==============================
   WARNA SAMA SEPERTI TREND
================================ */
const colorMap: Record<string, string> = {
  Tr_Sensor: "#2563eb",
  BOD_Sensor: "#dc2626",
  DO_Sensor: "#16a34a",
  COD_Sensor: "#9333ea",
  NH_Sensor: "#f97316",
  TDS_Sensor: "#0ea5e9",
  CT_Sensor: "#e11d48",
  ORP_Sensor: "#14b8a6",
  pH_Sensor: "#f59e0b",
};

/* ==============================
   HELPER
================================ */
function guessTimeKey(schema: Record<string, string>) {
  const candidates = ["time", "timestamp", "datetime", "date"];
  return Object.keys(schema).find((k) =>
    candidates.includes(k.toLowerCase())
  );
}

function makeHistogram(xs: number[]) {
  if (!xs.length) return [];

  const sorted = xs.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];

  const bins = 20;
  const step = (max - min) / bins || 1;

  const counts = Array.from({ length: bins }, () => 0);

  for (const x of sorted) {
    const idx = Math.min(
      bins - 1,
      Math.floor((x - min) / step)
    );
    counts[idx]++;
  }

  return Array.from({ length: bins }, (_, i) => ({
    bin: min + i * step,
    freq: counts[i],
  }));
}

/* ==============================
   COMPONENT
================================ */
export default function HistogramView({ rows, schema }: Props) {

  const timeKey = guessTimeKey(schema);

  const numCols = useMemo(() => {
    return allowedParams.filter(
      (k) => schema[k] === "number"
    );
  }, [schema]);

  const [col, setCol] = useState<string>("__all__");

  /* ==============================
     FILTER DATA BULAN INI
  =============================== */
  const month = dayjs().format("YYYY-MM");

  const monthFilteredRows = rows;


  /* ==============================
     SINGLE MODE
  =============================== */
  const singleData = useMemo(() => {
    if (col === "__all__") return [];

    const xs = monthFilteredRows
      .map((r) => Number(r[col]))
      .filter((v) => Number.isFinite(v));

    return makeHistogram(xs);
  }, [monthFilteredRows, col]);

  return (
    <div>
      <h3 className="text-xl font-semibold text-gray-800">
        Histogram
      </h3>

      {/* SELECT */}
      <div className="mt-4">
        <label className="text-sm text-gray-700">
          Select Parameter
          <div className="mt-1">
            <select
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
              value={col}
              onChange={(e) => setCol(e.target.value)}
            >
              <option value="__all__">All Parameters</option>
              {numCols.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {/* SINGLE HISTOGRAM */}
      {col !== "__all__" && (
        <div className="mt-6 h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={singleData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="bin"
                tick={{ fontSize: 12 }}
                label={{
                  value: col,
                  position: "insideBottom",
                  offset: -4,
                }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{
                  value: "Frequency",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                }}
              />
              <Tooltip />
              <Bar
                dataKey="freq"
                fill={colorMap[col] || "#2563eb"}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ALL MODE */}
      {col === "__all__" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {numCols.map((k) => {
            const xs = monthFilteredRows
              .map((r) => Number(r[k]))
              .filter((v) => Number.isFinite(v));

            const data = makeHistogram(xs);

            return (
              <div key={k} className="border rounded-lg p-3 bg-white">
                <p className="text-sm text-gray-700 mb-2">
                  {k}
                </p>

                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bin" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="freq"
                        fill={colorMap[k] || "#2563eb"}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
