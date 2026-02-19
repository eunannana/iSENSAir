"use client";

import { useMemo, useState, memo } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { lttb } from "@/lib/lttb";

type Props = {
  rows: Record<string, unknown>[];
  schema: Record<string, string>;
};

function _ScatterView({ rows, schema }: Props) {

  /* ==============================
     9 PARAMETER SENSOR SAJA
  =============================== */
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

  const numericColumns = useMemo(() => {
    return allowedParams.filter(
      (k) => schema[k] === "number"
    );
  }, [schema]);

  const [xKey, setXKey] = useState<string>(numericColumns[0] || "");
  const [yKey, setYKey] = useState<string>(
    numericColumns[1] || numericColumns[0] || ""
  );

  /* ==============================
     PERFORMANCE LIMIT
  =============================== */
  const RAW_LIMIT = 100_000;
  const DRAW_LIMIT = 2_000;

  const rawPoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    let count = 0;

    for (const r of rows) {
      if (count >= RAW_LIMIT) break;

      const xv = Number(r?.[xKey]);
      const yv = Number(r?.[yKey]);

      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;

      pts.push({ x: xv, y: yv });
      count++;
    }

    return pts;
  }, [rows, xKey, yKey]);

  const data = useMemo(() => lttb(rawPoints, DRAW_LIMIT), [rawPoints]);

  return (
    <div>
      <h3 className="text-xl font-semibold text-gray-800">
        Scatter Plot
      </h3>

      {/* SELECT AXIS */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-700">
          Select X-Axis
          <div className="mt-1">
            <select
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
              value={xKey}
              onChange={(e) => setXKey(e.target.value)}
            >
              {numericColumns.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="text-sm text-gray-700">
          Select Y-Axis
          <div className="mt-1">
            <select
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
              value={yKey}
              onChange={(e) => setYKey(e.target.value)}
            >
              {numericColumns.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <p className="mt-6 text-sm text-gray-600 font-medium">
        Relationship between {xKey || "—"} and {yKey || "—"}
      </p>

      <div className="mt-2 h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              type="number"
              dataKey="x"
              name={xKey}
              tick={{ fontSize: 12 }}
              label={{
                value: xKey,
                position: "insideBottom",
                offset: -4,
              }}
            />

            <YAxis
              type="number"
              dataKey="y"
              name={yKey}
              tick={{ fontSize: 12 }}
              label={{
                value: yKey,
                angle: -90,
                position: "insideLeft",
                offset: 10,
              }}
            />

            <Tooltip isAnimationActive={false} />

            <Scatter data={data} fill="#2563eb" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {!data.length && (
        <p className="mt-3 text-sm text-amber-700">
          Tidak ada pasangan nilai numerik untuk pilihan saat ini.
        </p>
      )}
    </div>
  );
}

export default memo(_ScatterView);
