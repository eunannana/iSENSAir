"use client";

import { useState, useEffect, useMemo } from "react";
import Visualizations from "@/components/Visualizations";
import OpenAIPanel from "@/components/openAIPanel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchLatestData, fetchDataByDateRange, validateLocation } from "@/lib/apiClient";

type Props = {
  initialArea: string;
};

export default function WeconTable({ initialArea }: Props) {
  const area = initialArea;

  const [data, setData] = useState<any[]>([]);
  const [latestData, setLatestData] = useState<any[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortAsc, setSortAsc] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // Fungsi untuk check apakah record punya minimal satu sensor value yang meaningful
  function hasValidSensorData(record: any): boolean {
    return sensorKeys.some(key => {
      const val = record[key];
      // Check apakah value adalah meaningful (bukan null, undefined, empty string, 0, atau NaN)
      return val !== null && val !== undefined && val !== "" && val !== 0 && !isNaN(val);
    });
  }

  // Fungsi untuk round angka ke 2 desimal
  function roundValue(value: any): string {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") {
      return value.toFixed(2);
    }
    const num = parseFloat(value);
    return isNaN(num) ? String(value) : num.toFixed(2);
  }

  /* ================= TIMESTAMP ================= */

  function parseTimestamp(ts: string) {
    if (!ts) return 0;

    // Handle ISO format: "2026-03-01T01:47:18"
    if (ts.includes("T")) {
      return new Date(ts).getTime();
    }

    // Handle old format: "01/03/2026, 01:47:18" or "01/03/2026 01:47:18"
    const [datePart, timePart] =
      ts.includes(",")
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

  /* ================= FETCH ================= */

  async function fetchHistorical(fetchStart: string, fetchEnd: string) {
    if (!fetchStart || !fetchEnd) {
      console.warn("Missing start or end date", { fetchStart, fetchEnd });
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      console.log(`Fetching data for area: ${area}, range: ${fetchStart} to ${fetchEnd}`);
      const json = await fetchDataByDateRange(area, fetchStart, fetchEnd);
      const arr = Array.isArray(json) ? json : [];
      if (arr.length === 0) {
        setErrorMsg("Tidak ada data dalam rentang tanggal");
      }
      setData(arr);
      setCurrentPage(1);
    } catch (error: any) {
      if (error.message && error.message.includes("Unsupported location")) {
        setErrorMsg(`Area '${area}' belum didukung`);
      } else {
        console.error("Error in fetchHistorical:", error);
        setErrorMsg("Gagal memuat data");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLatest() {
    try {
      console.log(`Fetching latest data for area: ${area}`);
      const latestRecord = await fetchLatestData(area);
      
      if (latestRecord && typeof latestRecord === 'object') {
        setLatestData([latestRecord]);
      } else {
        setLatestData([]);
      }
    } catch (error: any) {
      console.error("Error in fetchLatest:", error);
      if (error.message && error.message.includes("Unsupported location")) {
        setErrorMsg(`Area '${area}' belum didukung`);
      }
      setLatestData([]);
    }
  }

  /* ================= FIRST LOAD ================= */

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStart(today);
    setEnd(today);

    async function loadInitial() {
      setLoading(true);
      setErrorMsg(null);
      try {
        // validasi lokasi sebelum request
        await validateLocation(area);

        await Promise.all([
          fetchHistorical(today, today),
          fetchLatest()
        ]);
      } catch (error: any) {
        // hanya tampilkan log jika bukan masalah lokasi
        if (error.message && error.message.includes("Unsupported location")) {
          setErrorMsg(`Area '${area}' belum didukung`);
        } else {
          console.error("Error during initial load:", error);
        }
      } finally {
        setLoading(false);
      }
    }

    loadInitial();
  }, [area]);

  /* ================= SORT & FILTER ================= */

  const sortedData = useMemo(() => {
    // Filter data yang kosong, hanya yang ada sensor values
    const filtered = [...data].filter(hasValidSensorData);
    
    return filtered.sort((a, b) => {
      const timeA = parseTimestamp(a.Timestamp);
      const timeB = parseTimestamp(b.Timestamp);
      return sortAsc ? timeA - timeB : timeB - timeA;
    });
  }, [data, sortAsc]);

  const latestRow = useMemo(() => {
    // Filter latest data untuk yang punya valid sensor data
    const validLatest = latestData.filter(hasValidSensorData);
    return validLatest.length ? validLatest[0] : null;
  }, [latestData]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  const paginatedData = sortedData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const schema = useMemo(() => {
    if (!sortedData.length) return {};
    const first = sortedData[0];
    const obj: Record<string, string> = {};
    Object.keys(first).forEach((key) => {
      obj[key] = key.toLowerCase().includes("time")
        ? "datetime"
        : "number";
    });
    return obj;
  }, [sortedData]);

  /* ================= EXPORT PDF ================= */

  const handleExportPDF = () => {
  const pdf = new jsPDF("p", "mm", "a4");

  /* ===== HEADER ===== */
  pdf.setFontSize(16);
  pdf.text("iSENS-AIR River Monitoring Report", 105, 15, {
    align: "center",
  });

  pdf.setFontSize(10);
  pdf.text(
    `Area: ${area} | Generated: ${new Date().toLocaleString()}`,
    105,
    22,
    { align: "center" }
  );

  let currentY = 30;

  /* ===== SNAPSHOT ===== */
  if (latestRow) {
    pdf.setFontSize(12);
    pdf.text("Latest Snapshot", 14, currentY);
    currentY += 6;

    autoTable(pdf, {
      startY: currentY,
      head: [["Parameter", "Value"]],
      body: sensorKeys.map((k) => [
        k,
        roundValue(latestRow[k]),
      ]),
      styles: { fontSize: 9 },
      theme: "grid",
    });

    currentY = (pdf as any).lastAutoTable.finalY + 10;
  }

  /* ===== TREND GRAPH ===== */
  const canvas = document.querySelector("canvas");

  if (canvas) {
    pdf.addPage();

    pdf.setFontSize(12);
    pdf.text("Trend Visualization", 14, 15);

    const chartImage = canvas.toDataURL("image/png");

    pdf.addImage(
      chartImage,
      "PNG",
      10,
      20,
      190,
      100
    );
  }

  /* ===== HISTORICAL TABLE ===== */
  if (sortedData.length > 0) {
    pdf.addPage();

    pdf.setFontSize(12);
    pdf.text("Historical Data", 14, 15);

    const tableBody = sortedData.map((row) => [
      row.Timestamp,
      ...sensorKeys.map((k) => roundValue(row[k])),
    ]);

    autoTable(pdf, {
      startY: 20,
      head: [["Timestamp", ...sensorKeys]],
      body: tableBody,
      styles: { fontSize: 6 },
      theme: "grid",
      margin: { top: 20 },
    });
  }

  pdf.save(`iSENS-AIR-${area}-report.pdf`);
};

  /* ================= PAGINATION ================= */

  
  /* ================= SMART PAGINATION ================= */

  function renderPagination() {
    if (totalPages <= 1) return null;

    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">

        {/* PREV */}
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => p - 1)}
          className="px-3 py-1 border rounded disabled:opacity-40"
        >
          Prev
        </button>

        {/* FIRST + DOTS */}
        {startPage > 1 && (
          <>
            <button
              onClick={() => setCurrentPage(1)}
              className="px-3 py-1 border rounded"
            >
              1
            </button>
            {startPage > 2 && <span className="px-2">...</span>}
          </>
        )}

        {/* MAIN PAGES */}
        {pages.map((page) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`px-3 py-1 rounded ${
              currentPage === page
                ? "bg-blue-600 text-white"
                : "border"
            }`}
          >
            {page}
          </button>
        ))}

        {/* LAST + DOTS */}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && (
              <span className="px-2">...</span>
            )}
            <button
              onClick={() => setCurrentPage(totalPages)}
              className="px-3 py-1 border rounded"
            >
              {totalPages}
            </button>
          </>
        )}

        {/* NEXT */}
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="px-3 py-1 border rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>
    );
  }


  /* ================= UI ================= */

  return (
    <div className="mt-6 space-y-10">

      {errorMsg && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-red-100 text-red-800 p-3 rounded mb-4">
            {errorMsg}
          </div>
        </div>
      )}

      {/* ===== FILTER ===== */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex gap-6 items-end border-b pb-5">

          <div className="flex flex-col">
            <label className="text-xs text-gray-500">Start</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500">End</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={() => fetchHistorical(start, end)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm"
          >
            Load Data
          </button>
        </div>

        {/* ===== LOADING UNDER LINE ===== */}
        {loading && (
          <div className="flex justify-center items-center py-6">
            <div className="flex items-center gap-3 text-gray-600 text-sm">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading monitoring data...</span>
            </div>
          </div>
        )}
      </div>

      {/* ===== LATEST SNAPSHOT ===== */}
      {!loading && latestRow && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="border rounded-2xl p-6 bg-white">
            <div className="flex justify-between mb-4">
              <h2 className="font-semibold text-gray-800">
                Latest Snapshot
              </h2>
              <span className="text-sm text-gray-500">
                {latestRow.Timestamp}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {sensorKeys.map((key) => (
                <DataCard
                  key={key}
                  sensorKey={key}
                  value={latestRow[key]}
                  roundValue={roundValue}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== TREND ===== */}
      {!loading && sortedData.length > 0 && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-800">
              Trend Analysis
            </h2>

            <div className="flex gap-3">
              <button
                onClick={handleExportPDF}
                className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm"
              >
                Export PDF
              </button>

              <button
                onClick={() => setShowAI(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                🤖 AI Insight
              </button>
            </div>
          </div>

          <div className="border rounded-2xl p-6 bg-white">
            <Visualizations rows={sortedData} schema={schema} />
          </div>
        </div>
      )}

      {/* ===== TABLE ===== */}
      {!loading && paginatedData.length > 0 && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="border rounded-lg overflow-x-auto bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th
                    className="px-3 py-2 cursor-pointer"
                    onClick={() => setSortAsc(!sortAsc)}
                  >
                    Timestamp {sortAsc ? "↑" : "↓"}
                  </th>
                  {sensorKeys.map((key) => (
                    <th key={key} className="px-3 py-2">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{row.Timestamp}</td>
                    {sensorKeys.map((key) => (
                      <td key={key} className="px-3 py-2">
                        {roundValue(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {renderPagination()}
        </div>
      )}

      {/* ===== AI MODAL ===== */}
      {showAI && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl w-[90%] max-w-4xl p-6 relative">
            <button
              onClick={() => setShowAI(false)}
              className="absolute top-4 right-4"
            >
              ✕
            </button>
            <OpenAIPanel rows={sortedData} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== DATA CARD ===== */
function DataCard({
  sensorKey,
  value,
  roundValue,
}: {
  sensorKey: string;
  value: any;
  roundValue: (val: any) => string;
}) {
  const labels: Record<string, string> = {
    Tr_Sensor: "Turbidity",
    BOD_Sensor: "BOD",
    DO_Sensor: "DO",
    COD_Sensor: "COD",
    NH_Sensor: "Ammonia",
    TDS_Sensor: "TDS",
    CT_Sensor: "Conductivity",
    ORP_Sensor: "ORP",
    pH_Sensor: "pH",
  };

  return (
    <div className="border rounded-xl p-4 bg-gray-50">
      <p className="text-xs text-gray-500">
        {labels[sensorKey]}
      </p>
      <p className="text-xl font-semibold">
        {roundValue(value)}
      </p>
    </div>
  );
}