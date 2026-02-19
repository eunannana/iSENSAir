"use client";

import { useState, useMemo, useEffect } from "react";
import Visualizations from "@/components/Visualizations";
import DeepSeekPanel from "@/components/openAIPanel";

export default function WeconTable() {
  const [data, setData] = useState<any[]>([]);
  const [latestData, setLatestData] = useState<any[]>([]);
  const [area, setArea] = useState("semantan");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortAsc, setSortAsc] = useState(false);

  const rowsPerPage = 25;

  const sensorKeys = [
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

  function parseTimestamp(ts: string) {
    if (!ts) return 0;

    const [datePart, timePart] =
      ts.split(",").length > 1
        ? ts.split(",").map((s) => s.trim())
        : ts.split(" ");

    if (!datePart) return 0;

    const [day, month, year] = datePart.split("/");
    const timeArray = timePart
      ? timePart.split(":").map(Number)
      : [0, 0, 0];

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      timeArray[0] || 0,
      timeArray[1] || 0,
      timeArray[2] || 0
    ).getTime();
  }

  async function fetchHistorical(fetchStart: string, fetchEnd: string) {
    if (!fetchStart || !fetchEnd) return;

    setLoading(true);

    try {
      const res = await fetch(
        `/api/wecon?start=${fetchStart}&end=${fetchEnd}&area=${area}`
      );
      const json = await res.json();
      setData(json);
      setCurrentPage(1);
    } catch (err) {
      console.error("Failed to fetch historical:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLatest() {
    const today = new Date().toISOString().split("T")[0];

    try {
      const res = await fetch(
        `/api/wecon?start=${today}&end=${today}&area=${area}`
      );
      const json = await res.json();
      setLatestData(json);
    } catch (err) {
      console.error("Failed to fetch latest:", err);
    }
  }

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStart(today);
    setEnd(today);
  }, []);

  useEffect(() => {
    if (start && end) {
      fetchHistorical(start, end);
    }
  }, [start, end, area]);

  useEffect(() => {
    fetchLatest();
  }, [area]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const timeA = parseTimestamp(a.Timestamp);
      const timeB = parseTimestamp(b.Timestamp);
      return sortAsc ? timeA - timeB : timeB - timeA;
    });
  }, [data, sortAsc]);

  const latestRow = useMemo(() => {
    if (!latestData.length) return null;

    const sorted = [...latestData].sort(
      (a, b) =>
        parseTimestamp(b.Timestamp) -
        parseTimestamp(a.Timestamp)
    );

    return sorted[0];
  }, [latestData]);

  const totalPages = Math.ceil(
    sortedData.length / rowsPerPage
  );

  const paginatedData = sortedData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  function getVisiblePages(current: number, total: number) {
    const pages: (number | string)[] = [];

    if (total <= 7) {
      return Array.from(
        { length: total },
        (_, i) => i + 1
      );
    }

    pages.push(1);

    if (current > 4) pages.push("...");

    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 3) pages.push("...");

    pages.push(total);

    return pages;
  }

  const schema = useMemo(() => {
    if (!sortedData.length) return {};
    const first = sortedData[0];
    const obj: Record<string, string> = {};

    Object.keys(first).forEach((key) => {
      obj[key] = key
        .toLowerCase()
        .includes("time")
        ? "datetime"
        : "number";
    });

    return obj;
  }, [sortedData]);

  return (
    <div className="mt-10">

      {/* ===========================
         LATEST SNAPSHOT (IMPROVED)
      ============================ */}
      {latestRow && (
        <div className="max-w-6xl mx-auto px-4 mb-14">
          <div className="max-w-6xl mx-auto px-4 mb-16">
  <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 
                  border border-blue-100 
                  rounded-3xl 
                  p-10 
                  shadow-lg">

    <div className="flex items-center justify-between mb-10">
      <p className="text-sm text-gray-500">
        🌊 Latest Today ({area})
      </p>

      <p className="text-sm text-gray-400">
        {latestRow.Timestamp}
      </p>
    </div>

  
  {/* ROW 1 – 5 CARDS */}
  <div className="flex flex-col gap-8">

  {/* ROW 1 */}
  <div className="grid grid-cols-5 gap-6">
    {sensorKeys.slice(0, 5).map((key) => (
      <DataCard
        key={key}
        sensorKey={key}
        value={latestRow[key]}
      />
    ))}
  </div>

  {/* ROW 2 */}
  <div className="grid grid-cols-4 gap-6 justify-center">
    {sensorKeys.slice(5, 9).map((key) => (
      <DataCard
        key={key}
        sensorKey={key}
        value={latestRow[key]}
      />
    ))}
  </div>

</div>

</div>


          </div>
        </div>
      )}

      {/* FILTER */}
{/* FILTER */}
<div className="max-w-6xl mx-auto px-4 mb-10">
  <div className="bg-gradient-to-r from-gray-50 via-white to-gray-50 
                  border border-gray-200 
                  rounded-3xl 
                  p-8 
                  shadow-md 
                  backdrop-blur-sm">

    <p className="text-sm text-gray-500 mb-6">
      🔎 Filter Historical Data
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 items-end">

      {/* AREA */}
      <div>
        <label className="block text-sm mb-2 text-gray-600">
          📍 Area
        </label>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-full border border-gray-300 
                     px-4 py-2 rounded-xl 
                     focus:ring-2 focus:ring-blue-400 
                     focus:outline-none 
                     transition-all duration-200"
        >
          <option value="semantan">Semantan</option>
          <option value="kechau">Kechau</option>
          <option value="bilut">Bilut</option>
        </select>
      </div>

      {/* START DATE */}
      <div>
        <label className="block text-sm mb-2 text-gray-600">
          📅 Start Date
        </label>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-full border border-gray-300 
                     px-4 py-2 rounded-xl 
                     focus:ring-2 focus:ring-blue-400 
                     focus:outline-none 
                     transition-all duration-200"
        />
      </div>

      {/* END DATE */}
      <div>
        <label className="block text-sm mb-2 text-gray-600">
          📅 End Date
        </label>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full border border-gray-300 
                     px-4 py-2 rounded-xl 
                     focus:ring-2 focus:ring-blue-400 
                     focus:outline-none 
                     transition-all duration-200"
        />
      </div>

      {/* BUTTON */}
      <button
        onClick={() => fetchHistorical(start, end)}
        className="bg-blue-600 hover:bg-blue-700 
                   text-white 
                   px-6 py-2 
                   rounded-xl 
                   shadow-sm 
                   transition-all duration-200 
                   hover:shadow-lg"
      >
        🚀 Load Data
      </button>

    </div>
  </div>
</div>


      {/* TABLE + OTHERS (UNCHANGED) */}
      <div className="max-w-6xl mx-auto px-4">

        {loading && <p>Loading...</p>}

        {paginatedData.length > 0 && (
          <>
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th
                      className="px-3 py-2 border cursor-pointer"
                      onClick={() =>
                        setSortAsc(!sortAsc)
                      }
                    >
                      Timestamp {sortAsc ? "↑" : "↓"}
                    </th>
                    {sensorKeys.map((key) => (
                      <th
                        key={key}
                        className="px-3 py-2 border"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 border">
                        {row.Timestamp}
                      </td>
                      {sensorKeys.map((key) => (
                        <td
                          key={key}
                          className="px-3 py-2 border"
                        >
                          {row[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-center items-center mt-6 gap-2">
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.max(1, p - 1)
                  )
                }
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border disabled:opacity-40"
              >
                Prev
              </button>

              {getVisiblePages(
                currentPage,
                totalPages
              ).map((page, i) =>
                page === "..." ? (
                  <span
                    key={i}
                    className="px-2"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={i}
                    onClick={() =>
                      setCurrentPage(page as number)
                    }
                    className={`px-3 py-1 rounded border ${
                      currentPage === page
                        ? "bg-blue-600 text-white"
                        : "bg-white"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(
                      totalPages,
                      p + 1
                    )
                  )
                }
                disabled={
                  currentPage === totalPages
                }
                className="px-3 py-1 rounded border disabled:opacity-40"
              >
                Next
              </button>
            </div>

            <section className="mt-16 border-t pt-10">
              <Visualizations
                rows={sortedData}
                schema={schema}
              />
            </section>

            <section className="mt-16">
              <DeepSeekPanel
                rows={sortedData}
                schema={schema}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ===========================
   ENHANCED CARD
=========================== */
function DataCard({
  sensorKey,
  value,
}: {
  sensorKey: string;
  value: any;
}) {
  const sensorMeta: Record<
    string,
    { label: string; emoji: string }
  > = {
    Tr_Sensor: { label: "Turbidity", emoji: "🌊" },
    BOD_Sensor: { label: "Biochemical Oxygen Demand", emoji: "🧪" },
    DO_Sensor: { label: "Dissolved Oxygen", emoji: "💧" },
    COD_Sensor: { label: "Chemical Oxygen Demand", emoji: "🧫" },
    NH_Sensor: { label: "Ammonia", emoji: "⚗️" },
    TDS_Sensor: { label: "Total Dissolved Solids", emoji: "🧂" },
    CT_Sensor: { label: "Conductivity", emoji: "⚡" },
    ORP_Sensor: { label: "Oxidation Reduction Potential", emoji: "🔋" },
    pH_Sensor: { label: "pH Level", emoji: "🧬" },
  };

  const meta = sensorMeta[sensorKey];

  return (
    <div className="
      h-44
      bg-white
      border border-gray-200
      rounded-2xl
      shadow-sm
      px-6
      py-6
      flex flex-col
      justify-between
      transition-all duration-300
      hover:shadow-xl
      hover:-translate-y-1
    ">

      {/* LABEL AREA */}
      <div className="flex gap-3">
        <span className="text-lg mt-1">
          {meta?.emoji}
        </span>

        <div className="min-h-[48px] flex items-center">
          <p className="
            text-sm
            text-gray-500
            leading-snug
          ">
            {meta?.label}
          </p>
        </div>
      </div>

      {/* VALUE */}
      <div className="text-right">
        <p className="
          text-3xl
          font-semibold
          text-gray-900
          tracking-tight
        ">
          {value ?? "-"}
        </p>
      </div>

    </div>
  );
}
