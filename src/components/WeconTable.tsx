"use client";

import { useState, useEffect, useMemo } from "react";
import Visualizations from "@/components/Visualizations";
import LoadingScreen from "@/components/LoadingScreen";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getNWQSResult } from "@/lib/nwqs";
import { getAIInsightSummary } from "@/lib/aiInsights";
import {
  fetchLatestData,
  fetchDataByDateRange,
  validateLocation,
  setRetryCallback,
} from "@/lib/apiClient";

type Props = {
  initialArea: string;
};

type AIDecisionResponse = {
  currentWaterQualityStatus: string;
  pollutionRiskLevel: string;
  predictedSourceOfPollution: string;
  confidenceScore: number;
  recommendedAction: string;
  executiveSummary: string;
};

type DetailedInsightResponse = {
  overallNarrative?: string;
  predictionTitle?: string;
  predictionDetail?: string;
  interpretationTitle?: string;
  interpretationDetail?: string;
  sourceTitle?: string;
  sourceDetail?: string;
  confidenceTitle?: string;
  confidenceDetail?: string;
  recommendationTitle?: string;
  recommendationDetail?: string;
};

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
] as const;

export default function WeconTable({ initialArea }: Props) {
  const area = initialArea;

  const [data, setData] = useState<any[]>([]);
  const [latestData, setLatestData] = useState<any[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    "connecting" | "booting" | "loading"
  >("connecting");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshingLatest, setRefreshingLatest] = useState(false);

  const [aiDecision, setAIDecision] = useState<AIDecisionResponse | null>(null);
  const [loadingAIDecision, setLoadingAIDecision] = useState(false);
  const [aiDecisionError, setAIDecisionError] = useState<string | null>(null);

  const [showVisualization, setShowVisualization] = useState(false);
  const [showHistoricalTable, setShowHistoricalTable] = useState(false);

  const [showInsightModal, setShowInsightModal] = useState(false);
  const [loadingDetailedInsight, setLoadingDetailedInsight] = useState(false);
  const [detailedInsightError, setDetailedInsightError] = useState<string | null>(
    null
  );
  const [detailedInsight, setDetailedInsight] =
    useState<DetailedInsightResponse | null>(null);

  const rowsPerPage = 25;

  function hasValidSensorData(record: any): boolean {
    return SENSOR_KEYS.some((key) => {
      const val = record[key];
      return (
        val !== null &&
        val !== undefined &&
        val !== "" &&
        val !== 0 &&
        !isNaN(val)
      );
    });
  }

  function roundValue(value: any): string {
    if (value === null || value === undefined || value === "") return "-";
    const num = parseFloat(value);
    return isNaN(num) ? "-" : num.toFixed(2);
  }

  function formatDisplayDate(dateStr: string) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function formatDisplayDateTime(ts: string) {
    if (!ts) return "-";

    const date = new Date(ts);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");

    return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
  }

  function parseTimestamp(ts: string) {
    if (!ts) return 0;

    if (ts.includes("T")) {
      return new Date(ts).getTime();
    }

    const [datePart, timePart] = ts.includes(",")
      ? ts.split(",").map((s) => s.trim())
      : ts.split(" ");

    if (!datePart) return 0;

    const [day, month, year] = datePart.split("/");
    const timeArray = timePart ? timePart.split(":").map(Number) : [0, 0, 0];

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      timeArray[0] || 0,
      timeArray[1] || 0,
      timeArray[2] || 0
    ).getTime();
  }

  function getRiskBadgeClass(riskLevel: string) {
    switch (riskLevel) {
      case "Low":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "Moderate":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "High":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "Critical":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  }

  function getHeroStyles(riskLevel: string) {
    switch (riskLevel) {
      case "Low":
        return {
          shell:
            "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50",
          accent: "bg-emerald-500",
          ring: "ring-emerald-100",
        };
      case "Moderate":
        return {
          shell:
            "border-yellow-200 bg-gradient-to-br from-yellow-50 via-white to-amber-50",
          accent: "bg-yellow-500",
          ring: "ring-yellow-100",
        };
      case "High":
        return {
          shell:
            "border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50",
          accent: "bg-orange-500",
          ring: "ring-orange-100",
        };
      case "Critical":
        return {
          shell:
            "border-red-200 bg-gradient-to-br from-red-50 via-white to-rose-50",
          accent: "bg-red-500",
          ring: "ring-red-100",
        };
      default:
        return {
          shell:
            "border-gray-200 bg-gradient-to-br from-gray-50 via-white to-slate-50",
          accent: "bg-gray-500",
          ring: "ring-gray-100",
        };
    }
  }

  async function fetchHistorical(fetchStart: string, fetchEnd: string) {
    if (!fetchStart || !fetchEnd) return;

    setLoadingHistorical(true);
    setErrorMsg(null);

    try {
      const json = await fetchDataByDateRange(area, fetchStart, fetchEnd);
      const arr = Array.isArray(json) ? json : [];

      if (arr.length === 0) {
        setErrorMsg("Data not found for the selected date range");
      }

      setData(arr);
      setCurrentPage(1);
    } catch {
      setErrorMsg("Failed to load historical data");
      setData([]);
    } finally {
      setLoadingHistorical(false);
    }
  }

  async function fetchLatestSnapshot() {
    try {
      setRefreshingLatest(true);
      const latestRecord = await fetchLatestData(area);

      if (latestRecord && typeof latestRecord === "object") {
        setLatestData([latestRecord]);
      } else {
        setLatestData([]);
      }
    } catch (error) {
      console.error("Error refreshing latest:", error);
    } finally {
      setRefreshingLatest(false);
    }
  }

  async function generateAIDecisionPanel(
    latestRowParam: any,
    sortedDataParam: any[],
    aiInsightParam: any
  ) {
    if (!latestRowParam) return;

    setLoadingAIDecision(true);
    setAIDecisionError(null);

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          mode: "decision_summary",
          latestRow: latestRowParam,
          rows: sortedDataParam.slice(0, 100),
          aiInsight: aiInsightParam,
          nwqsSummary: {
            overallClass: aiInsightParam.overallClass,
            overallStatus: aiInsightParam.riskLevel,
            dominantParameters: aiInsightParam.dominantParameters,
            useRecommendation:
              aiInsightParam.recommendations?.[0] ||
              "Continue routine monitoring.",
            lastUpdated: latestRowParam?.Timestamp,
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.error || "Failed to generate AI decision.");
      }

      setAIDecision(result);
    } catch (error: any) {
      setAIDecisionError(
        error?.message || "Failed to generate AI decision panel."
      );
      setAIDecision(null);
    } finally {
      setLoadingAIDecision(false);
    }
  }

  async function handleGetMoreAIInsight() {
    if (!latestRow) return;

    setShowInsightModal(true);
    setLoadingDetailedInsight(true);
    setDetailedInsightError(null);

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          mode: "expanded_decision_detail",
          latestRow,
          rows: sortedData.slice(0, 150),
          aiInsight,
          aiDecision,
          nwqsSummary: {
            overallClass: aiInsight.overallClass,
            overallStatus: aiDecision?.pollutionRiskLevel || aiInsight.riskLevel,
            dominantParameters: aiInsight.dominantParameters,
            recommendations: aiInsight.recommendations || [],
            anomalies: aiInsight.anomalies || [],
            trendSummary: aiInsight.trendSummary || [],
            lastUpdated: latestRow?.Timestamp,
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          result?.error || "Failed to generate expanded AI insight."
        );
      }

      const fallbackPrediction = `${
        aiDecision?.currentWaterQualityStatus || `Class ${aiInsight.overallClass}`
      } is the predicted current water quality condition based on the latest sensor readings and recent historical trend pattern. This classification indicates that the river is currently operating under a degraded condition and requires closer attention from monitoring personnel.`;

      const fallbackInterpretation =
        aiDecision?.executiveSummary ||
        `The current water quality condition is interpreted as ${
          aiDecision?.pollutionRiskLevel || aiInsight.riskLevel
        }. This interpretation is supported by the dominance of ${
          aiInsight.dominantParameters?.length
            ? aiInsight.dominantParameters.join(", ")
            : "multiple critical parameters"
        }, together with recent anomaly signals and trend movement.`;

      const fallbackSource = `${
        aiDecision?.predictedSourceOfPollution || getPredictedSource(aiInsight)
      }. This hypothesis is derived from the pattern of elevated organic load, ammonia-related stress, conductivity or turbidity shifts, and supporting anomaly indicators.`;

      const fallbackConfidence = `The confidence score of ${
        aiDecision?.confidenceScore ||
        Math.min(95, Math.max(60, aiInsight.riskScore))
      }% indicates the model has reasonably strong certainty in its present assessment. This should still be interpreted alongside field validation and operational judgement.`;

      const fallbackRecommendation = `${
        aiDecision?.recommendedAction ||
        aiInsight.recommendations?.[0] ||
        "Continue routine monitoring."
      } This recommendation is prioritised because the current signal pattern suggests elevated environmental risk and should be followed by verification in the field.`;

      setDetailedInsight({
        overallNarrative:
          result?.overallNarrative ||
          `This expanded AI insight provides a more detailed explanation of the current river condition by elaborating the prediction, interpretation, possible pollution source, confidence level, and operational recommendation.`,
        predictionTitle: result?.predictionTitle || "AI Prediction",
        predictionDetail: result?.predictionDetail || fallbackPrediction,
        interpretationTitle: result?.interpretationTitle || "AI Interpretation",
        interpretationDetail:
          result?.interpretationDetail || fallbackInterpretation,
        sourceTitle: result?.sourceTitle || "Predicted Source of Pollution",
        sourceDetail: result?.sourceDetail || fallbackSource,
        confidenceTitle: result?.confidenceTitle || "AI Confidence",
        confidenceDetail: result?.confidenceDetail || fallbackConfidence,
        recommendationTitle: result?.recommendationTitle || "AI Recommendation",
        recommendationDetail:
          result?.recommendationDetail || fallbackRecommendation,
      });
    } catch (error: any) {
      setDetailedInsightError(
        error?.message || "Failed to generate more detailed AI insight."
      );
      setDetailedInsight(null);
    } finally {
      setLoadingDetailedInsight(false);
    }
  }

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];

    setStart(today);
    setEnd(today);
    setCurrentPage(1);
    setErrorMsg(null);
    setLoadingStage("connecting");
    setRetryAttempt(0);
    setDetailedInsight(null);
    setDetailedInsightError(null);
    setShowInsightModal(false);

    const handleRetry = (
      attempt: number,
      _totalRetries: number,
      isBootingError: boolean
    ) => {
      setRetryAttempt(attempt);
      if (isBootingError) {
        setLoadingStage("booting");
      }
    };

    setRetryCallback(handleRetry);

    async function loadInitial() {
      setLoadingInitial(true);

      try {
        setLoadingStage("connecting");
        await validateLocation(area);

        setLoadingStage("loading");
        await Promise.all([fetchHistorical(today, today), fetchLatestSnapshot()]);
      } catch {
        setErrorMsg("Failed to load initial data");
      } finally {
        setLoadingInitial(false);
        setRetryCallback(null);
      }
    }

    loadInitial();
  }, [area]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchLatestSnapshot();
    }, 60000);

    return () => clearInterval(interval);
  }, [area]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowInsightModal(false);
      }
    }

    if (showInsightModal) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeydown);
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [showInsightModal]);

  const sortedData = useMemo(() => {
    const filtered = [...data].filter(hasValidSensorData);

    return filtered.sort((a, b) => {
      const timeA = parseTimestamp(a.Timestamp);
      const timeB = parseTimestamp(b.Timestamp);
      return sortAsc ? timeA - timeB : timeB - timeA;
    });
  }, [data, sortAsc]);

  const latestRow = useMemo(() => {
    return latestData.length ? latestData[0] : null;
  }, [latestData]);

  const aiInsight = useMemo(() => {
    return getAIInsightSummary(latestRow, sortedData);
  }, [latestRow, sortedData]);

  const confidencePercentage = useMemo(() => {
    if (aiDecision?.confidenceScore) return aiDecision.confidenceScore;
    return Math.min(95, Math.max(60, aiInsight.riskScore));
  }, [aiDecision?.confidenceScore, aiInsight.riskScore]);

  const likelyContributor = useMemo(() => {
    return aiInsight.dominantParameters.length > 0
      ? aiInsight.dominantParameters.join(", ")
      : "Not identified";
  }, [aiInsight.dominantParameters]);

  const exceedanceIndicators = useMemo(() => {
    if (!latestRow) return [];

    return SENSOR_KEYS.map((key) => getNWQSResult(key as any, latestRow[key]))
      .filter((item) => item.className === "IV" || item.className === "V")
      .slice(0, 6);
  }, [latestRow]);

  const keyTrendItems = useMemo(() => {
    return aiInsight.trendSummary
      .filter(
        (item: any) =>
          item.direction === "increasing" ||
          item.direction === "decreasing" ||
          item.direction === "fluctuating"
      )
      .slice(0, 5);
  }, [aiInsight.trendSummary]);

  const anomalyHighlights = useMemo(() => {
  return (aiInsight.anomalies || []).slice(0, 3);
}, [aiInsight.anomalies]);

const activeRiskLevel =
  aiDecision?.pollutionRiskLevel || aiInsight.riskLevel || "Moderate";

const riskDrivers = useMemo(() => {
  const items: string[] = [];

  if (aiInsight?.dominantParameters?.length) {
    items.push(
      `${aiInsight.dominantParameters.join(
        ", "
      )} are the strongest contributors to the current classification.`
    );
  }

  if (exceedanceIndicators.length > 0) {
    items.push(
      `${exceedanceIndicators
        .slice(0, 3)
        .map((item: any) => `${item.label} reaches Class ${item.className}`)
        .join(", ")}.`
    );
  }

  if (anomalyHighlights.length > 0) {
    items.push(
      `${anomalyHighlights
        .map((item: any) => `${item.label}: ${item.message}`)
        .join(" ")}`
    );
  }

  if (items.length === 0) {
    items.push(
      "The decision is based on combined threshold evaluation, recent trend movement, and overall parameter behaviour."
    );
  }

  return items.join(" ");
}, [aiInsight, exceedanceIndicators, anomalyHighlights]);

const evidenceNarrative = useMemo(() => {
  if (keyTrendItems.length > 0) {
    return keyTrendItems
      .map(
        (item: any) =>
          `${item.label} is ${item.direction} (${item.changePct}%)`
      )
      .join(". ");
  }

  if (anomalyHighlights.length > 0) {
    return anomalyHighlights
      .map((item: any) => `${item.label}: ${item.message}`)
      .join(". ");
  }

  return "No strong short-term movement was detected, so the current interpretation relies primarily on present threshold condition and dominant parameter levels.";
}, [keyTrendItems, anomalyHighlights]);

const impactNarrative = useMemo(() => {
  if (activeRiskLevel === "Critical" || activeRiskLevel === "High") {
    return `Current conditions suggest a high likelihood of ecological stress. Elevated ${likelyContributor} may reduce water suitability, disturb aquatic balance, and indicate pollutant pressure requiring operational follow-up.`;
  }

  if (activeRiskLevel === "Moderate") {
    return `The river condition shows moderate concern. Continued monitoring is important because changes in ${likelyContributor} may escalate if the present pattern persists.`;
  }

  return `Current signals suggest relatively controlled conditions, but continued observation remains necessary to ensure parameter stability over time.`;
}, [likelyContributor, activeRiskLevel]);

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
      obj[key] = key.toLowerCase().includes("time") ? "datetime" : "number";
    });
    return obj;
  }, [sortedData]);

  useEffect(() => {
    if (latestRow && sortedData.length > 0) {
      generateAIDecisionPanel(latestRow, sortedData, aiInsight);
    }
  }, [latestRow, sortedData, aiInsight]);

  const handleExportPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");

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

    if (latestRow) {
      pdf.setFontSize(12);
      pdf.text("Latest Snapshot", 14, currentY);
      currentY += 6;

      autoTable(pdf, {
        startY: currentY,
        head: [["Parameter", "Value"]],
        body: SENSOR_KEYS.map((k) => [k, roundValue(latestRow[k])]),
        styles: { fontSize: 9 },
        theme: "grid",
      });
    }

    const canvas = document.querySelector("canvas");

    if (canvas) {
      pdf.addPage();
      pdf.setFontSize(12);
      pdf.text("Trend Visualization", 14, 15);

      const chartImage = canvas.toDataURL("image/png");
      pdf.addImage(chartImage, "PNG", 10, 20, 190, 100);
    }

    if (sortedData.length > 0) {
      pdf.addPage();
      pdf.setFontSize(12);
      pdf.text("Historical Data", 14, 15);

      const tableBody = sortedData.map((row) => [
        row.Timestamp,
        ...SENSOR_KEYS.map((k) => roundValue(row[k])),
      ]);

      autoTable(pdf, {
        startY: 20,
        head: [["Timestamp", ...SENSOR_KEYS]],
        body: tableBody,
        styles: { fontSize: 6 },
        theme: "grid",
        margin: { top: 20 },
      });
    }

    pdf.save(`iSENS-AIR-${area}-report.pdf`);
  };

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
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => p - 1)}
          className="rounded-lg border px-3 py-1 disabled:opacity-40"
        >
          Prev
        </button>

        {startPage > 1 && (
          <>
            <button
              onClick={() => setCurrentPage(1)}
              className="rounded-lg border px-3 py-1"
            >
              1
            </button>
            {startPage > 2 && <span className="px-2">...</span>}
          </>
        )}

        {pages.map((page) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`rounded-lg px-3 py-1 ${
              currentPage === page ? "bg-blue-600 text-white" : "border"
            }`}
          >
            {page}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-2">...</span>}
            <button
              onClick={() => setCurrentPage(totalPages)}
              className="rounded-lg border px-3 py-1"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="rounded-lg border px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    );
  }
  const heroStyles = getHeroStyles(activeRiskLevel);

  return (
    <>
      <LoadingScreen
        isVisible={loadingInitial}
        stage={loadingStage}
        message={
          loadingStage === "booting"
            ? `Waking up API (Attempt ${retryAttempt})`
            : undefined
        }
      />

      {loadingInitial ? null : (
        <div className="mt-6 space-y-8">
          {errorMsg && (
            <div className="mx-auto max-w-6xl px-4">
              <div className="mb-4 rounded-xl bg-red-100 p-3 text-red-800">
                {errorMsg}
              </div>
            </div>
          )}

          {latestRow && (
            <div className="mx-auto max-w-6xl px-4">
              <div
                className={`overflow-hidden rounded-3xl border p-0 shadow-sm ring-4 ${heroStyles.shell} ${heroStyles.ring}`}
              >
                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr]">
                  <div className="p-6 md:p-8">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-gray-700 backdrop-blur">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${heroStyles.accent}`}
                          />
                          AI Decision Support
                        </div>

                        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                          {aiDecision?.currentWaterQualityStatus ||
                            `Class ${aiInsight.overallClass}`}
                        </h2>

                        <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-600 md:text-base">
                          {aiDecision?.executiveSummary ||
                            buildInsightText(aiInsight)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${getRiskBadgeClass(
                            activeRiskLevel
                          )}`}
                        >
                          {activeRiskLevel} Risk
                        </span>
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700">
                          Confidence {confidencePercentage}%
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <HeroMetricCard
                        title="Predicted Source of Pollution"
                        value={
                          aiDecision?.predictedSourceOfPollution ||
                          getPredictedSource(aiInsight)
                        }
                        hint="Likely pollution hypothesis"
                      />
                      <HeroMetricCard
                        title="Recommended Action"
                        value={
                          aiDecision?.recommendedAction ||
                          aiInsight.recommendations?.[0] ||
                          "Continue routine monitoring."
                        }
                        hint="Primary next step"
                      />
                      <HeroMetricCard
                        title="Likely Contributor"
                        value={likelyContributor}
                        hint="Dominant detected parameter"
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/60 bg-white/70 p-6 backdrop-blur lg:border-l lg:border-t-0">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                          AI Interpretation
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-gray-900">
                          Decision Summary
                        </h3>
                      </div>

                      {loadingAIDecision ? (
                        <span className="text-xs text-gray-500">
                          Generating...
                        </span>
                      ) : null}
                    </div>

                    {aiDecisionError && (
                      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {aiDecisionError}
                      </div>
                    )}

                    <div className="space-y-3">
                      <MiniDecisionRow
                        label="AI Prediction"
                        value={
                          aiDecision?.currentWaterQualityStatus ||
                          `Class ${aiInsight.overallClass}`
                        }
                      />
                      <MiniDecisionRow
                        label="AI Interpretation"
                        value={activeRiskLevel}
                      />
                      <MiniDecisionRow
                        label="AI Confidence"
                        value={`${confidencePercentage}%`}
                      />
                      <MiniDecisionRow
                        label="AI Recommendation"
                        value={
                          aiDecision?.recommendedAction ||
                          aiInsight.recommendations?.[0] ||
                          "Continue routine monitoring."
                        }
                      />
                    </div>

                    <button
                      onClick={handleGetMoreAIInsight}
                      className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
                    >
                      Get More AI Insight
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {latestRow && (
            <div id="latest-ai-assessment" className="mx-auto max-w-6xl px-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-gray-800">
                      <span>⚡</span>
                      <span>AI Key Indicators</span>
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Supporting signals derived from AI analysis without repeating the main decision
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${getRiskBadgeClass(
                      activeRiskLevel
                    )}`}
                  >
                    {activeRiskLevel} Alert
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <FancySummaryCard
                    title="Trend Direction"
                    value={
                      keyTrendItems.length > 0
                        ? capitalizeText(keyTrendItems[0].direction)
                        : "Stable"
                    }
                    subtitle="Recent dominant movement"
                    accent="indigo"
                  />
                  <FancySummaryCard
                    title="Anomaly Detection"
                    value={
                      aiInsight.anomalies?.length > 0 ? "Detected" : "No anomaly"
                    }
                    subtitle="Based on recent sensor behaviour"
                    accent="amber"
                  />
                  <FancySummaryCard
                    title="Dominant Parameter"
                    value={likelyContributor}
                    subtitle="Strongest impact factor"
                    accent="red"
                  />
                  <FancySummaryCard
                    title="Risk Score"
                    value={`${aiInsight.riskScore}/100`}
                    subtitle="Computed severity index"
                    accent="emerald"
                  />
                </div>
              </div>
            </div>
          )}

          {latestRow && (
            <div className="mx-auto max-w-6xl px-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="flex items-center gap-2 font-semibold text-gray-800">
                    <span>🧠</span>
                    <span>Why & Evidence Analysis</span>
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Explanation of why the AI reached this decision based on threshold, trend, and environmental interpretation
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <InsightPanelCard
                    title="Why This Classification"
                    content={riskDrivers}
                  />
                  <InsightPanelCard
                    title="Supporting Evidence"
                    content={evidenceNarrative}
                  />
                  <InsightPanelCard
                    title="Environmental Impact Insight"
                    content={impactNarrative}
                  />
                </div>
              </div>
            </div>
          )}

          {latestRow && (
            <div className="mx-auto max-w-6xl px-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      Latest Snapshot
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Real-time parameter overview for the selected monitoring
                      area
                    </p>
                  </div>

                  <span className="whitespace-nowrap text-sm text-gray-500">
                    {formatDisplayDateTime(latestRow.Timestamp)}
                    {refreshingLatest ? " · Refreshing..." : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3">
                      {SENSOR_KEYS.map((key) => (
                        <DataCard
                          key={key}
                          sensorKey={key}
                          value={latestRow[key]}
                          roundValue={roundValue}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="xl:sticky xl:top-24 xl:self-start">
                    <WaterClassCompactReference />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-6xl px-4">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-gray-800">
                    <span>📊</span>
                    <span>Supporting Data Visualization</span>
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    AI decides first, graphs and indicators support the interpretation
                  </p>
                </div>

                <button
                  onClick={() => setShowVisualization((prev) => !prev)}
                  className="rounded-lg border px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  {showVisualization ? "Hide Visualization" : "Show Visualization"}
                </button>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SmallInfoPanel
                  title="Trend Highlights"
                  items={
                    keyTrendItems.length > 0
                      ? keyTrendItems.map(
                          (item: any) =>
                            `${item.label}: ${item.direction} (${item.changePct}%)`
                        )
                      : ["No significant trend shift detected."]
                  }
                />

                <SmallInfoPanel
                  title="Parameter Comparison"
                  items={[
                    `Likely contributor: ${likelyContributor}`,
                    `Risk level: ${activeRiskLevel}`,
                    `Class prediction: ${aiInsight.overallClass}`,
                  ]}
                />

                <SmallInfoPanel
                  title="Threshold Exceedance Indicators"
                  items={
                    exceedanceIndicators.length > 0
                      ? exceedanceIndicators.map(
                          (item: any) => `${item.label}: Class ${item.className}`
                        )
                      : ["No major threshold exceedance detected."]
                  }
                />
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col">
                    <label className="mb-1 text-xs text-gray-500">Start</label>
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="mb-1 text-xs text-gray-500">End</label>
                    <input
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    onClick={() => fetchHistorical(start, end)}
                    disabled={loadingHistorical}
                    className={`h-[38px] rounded-lg px-4 py-2 text-sm text-white ${
                      loadingHistorical
                        ? "cursor-not-allowed bg-blue-400"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {loadingHistorical ? "Loading..." : "Load Data"}
                  </button>
                </div>

                <button
                  onClick={handleExportPDF}
                  className="h-[38px] rounded-lg bg-gray-800 px-4 py-2 text-sm text-white"
                >
                  Export PDF
                </button>
              </div>

              {loadingHistorical && (
                <div className="flex items-center justify-center py-10">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                    <span>Loading historical data...</span>
                  </div>
                </div>
              )}

              {showVisualization && (
                <div className="rounded-2xl border bg-gray-50 p-6">
                  <Visualizations rows={sortedData} schema={schema} />
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-4">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-800">
                    Historical Data
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Reference table for detailed review when needed
                  </p>
                </div>

                <button
                  onClick={() => setShowHistoricalTable((prev) => !prev)}
                  className="rounded-lg border px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  {showHistoricalTable ? "Hide Table" : "Show Table"}
                </button>
              </div>

              {showHistoricalTable && paginatedData.length > 0 && (
                <>
                  <div className="mb-6 text-center">
                    <p className="mt-1 text-sm text-gray-500">
                      {formatDisplayDate(start)} - {formatDisplayDate(end)}
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      Total Records: {sortedData.length}
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th
                            className="cursor-pointer px-3 py-2 text-left"
                            onClick={() => setSortAsc(!sortAsc)}
                          >
                            Timestamp {sortAsc ? "↑" : "↓"}
                          </th>
                          {SENSOR_KEYS.map((key) => (
                            <th key={key} className="px-3 py-2 text-left">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {paginatedData.map((row, i) => (
                          <tr
                            key={i}
                            className="border-t transition hover:bg-gray-50"
                          >
                            <td className="px-3 py-2">
                              {formatDisplayDateTime(row.Timestamp)}
                            </td>
                            {SENSOR_KEYS.map((key) => (
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
                </>
              )}

              {showHistoricalTable &&
                paginatedData.length === 0 &&
                !loadingHistorical && (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
                    No historical data available for the selected range.
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {showInsightModal && (
        <DetailedInsightModal
          isOpen={showInsightModal}
          onClose={() => setShowInsightModal(false)}
          loading={loadingDetailedInsight}
          error={detailedInsightError}
          data={detailedInsight}
          riskLevel={activeRiskLevel}
          timestamp={latestRow?.Timestamp || ""}
          decision={aiDecision}
          confidencePercentage={confidencePercentage}
          fallbackSource={getPredictedSource(aiInsight)}
          fallbackClass={`Class ${aiInsight.overallClass}`}
        />
      )}
    </>
  );
}

function getPredictedSource(aiInsight: any) {
  const dominant = aiInsight?.dominantParameters || [];
  const anomalyText = (aiInsight?.anomalies || [])
    .map((a: any) => `${a.label} ${a.message}`)
    .join(" ");

  if (
    dominant.includes("Ammonia") &&
    (dominant.includes("COD") || dominant.includes("BOD"))
  ) {
    return "Possible domestic wastewater or organic discharge";
  }

  if (dominant.includes("Turbidity")) {
    return "Possible sediment runoff or land disturbance";
  }

  if (
    dominant.includes("Conductivity") ||
    anomalyText.toLowerCase().includes("ph")
  ) {
    return "Possible chemical or industrial discharge";
  }

  if (dominant.includes("DO")) {
    return "Possible oxygen depletion caused by organic contamination";
  }

  return "Potential mixed-source pollution requires further investigation";
}

function buildInsightText(aiInsight: any) {
  const contributor =
    aiInsight?.dominantParameters?.length > 0
      ? aiInsight.dominantParameters.join(", ")
      : "multiple water quality parameters";

  return `${contributor} show the strongest influence on current water quality deterioration. The overall pattern indicates elevated pollution pressure with ${aiInsight.riskLevel.toLowerCase()} to critical monitoring concern depending on recent parameter movement.`;
}

function capitalizeText(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function HeroMetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 backdrop-blur">
      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <p className="text-sm font-semibold leading-6 text-gray-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function MiniDecisionRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium leading-6 text-gray-800">
        {value}
      </p>
    </div>
  );
}

function DataCard({
  sensorKey,
  value,
  roundValue,
}: {
  sensorKey: string;
  value: any;
  roundValue: (val: any) => string;
}) {
  const nwqs = getNWQSResult(sensorKey as any, value);

  return (
    <div className="space-y-3 rounded-xl border bg-gray-50 p-4">
      <div>
        <p className="text-xs text-gray-500">{nwqs.label}</p>
        <p className="text-xl font-semibold text-gray-900">
          {roundValue(value)}
          {nwqs.unit ? (
            <span className="ml-1 text-sm font-normal text-gray-500">
              {nwqs.unit}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${nwqs.colorClass}`}
        >
          Class {nwqs.className}
        </span>

        <span className="text-xs text-gray-600">{nwqs.status}</span>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-500">
        {nwqs.description}
      </p>
    </div>
  );
}

function FancySummaryCard({
  title,
  value,
  subtitle,
  accent = "indigo",
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent?: "emerald" | "red" | "amber" | "indigo";
}) {
  const accentMap: Record<string, string> = {
    emerald: "from-emerald-500 to-teal-500",
    red: "from-red-500 to-orange-500",
    amber: "from-amber-500 to-yellow-500",
    indigo: "from-indigo-500 to-purple-500",
  };

  return (
    <div className="rounded-2xl border bg-gray-50 p-4 transition hover:shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div
          className={`h-2.5 w-10 rounded-full bg-gradient-to-r ${accentMap[accent]}`}
        />
      </div>

      <p className="mb-1 text-xs text-gray-500">{title}</p>
      <p className="break-words text-base font-semibold leading-snug text-gray-900">
        {value}
      </p>

      {subtitle ? (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function InsightPanelCard({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div className="rounded-xl border bg-gradient-to-b from-gray-50 to-white p-4 transition hover:shadow-sm">
      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <p className="text-sm leading-relaxed text-gray-700">{content}</p>
    </div>
  );
}

function SmallInfoPanel({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <p key={idx} className="text-sm leading-relaxed text-gray-700">
            • {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function WaterClassCompactReference() {
  const classItems = [
    { className: "Class I", use: "Conservation, Water Supply I, sensitive fishery" },
    { className: "Class IIA", use: "Water Supply II, sensitive aquatic species" },
    { className: "Class IIB", use: "Recreational use with body contact" },
    { className: "Class III", use: "Water Supply III, common fishery, livestock" },
    { className: "Class IV", use: "Irrigation" },
    { className: "Class V", use: "None of the above" },
  ];

  return (
    <div className="rounded-2xl border bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          NWQS / WQI Reference
        </p>
        <h3 className="mt-1 text-sm font-semibold text-gray-900">
          Water Class Uses
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          Compact reference for Class I–V based on National Water Quality
          Standards and Water Quality Index.
        </p>
      </div>

      <div className="space-y-2">
        {classItems.map((item) => (
          <div
            key={item.className}
            className="rounded-xl border bg-white px-3 py-2"
          >
            <p className="text-xs font-semibold text-gray-800">
              {item.className}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">
              {item.use}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailedInsightModal({
  isOpen,
  onClose,
  loading,
  error,
  data,
  riskLevel,
  timestamp,
  decision,
  confidencePercentage,
  fallbackSource,
  fallbackClass,
}: {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  data: DetailedInsightResponse | null;
  riskLevel: string;
  timestamp: string;
  decision: AIDecisionResponse | null;
  confidencePercentage: number;
  fallbackSource: string;
  fallbackClass: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl border bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b bg-gradient-to-r from-indigo-50 to-white px-6 py-5">
            <div>
              <h3 className="text-2xl font-semibold text-gray-900">
                More AI Insight
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Detailed AI interpretation for current river condition
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  Risk Level: {riskLevel}
                </span>
                <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  Timestamp: {timestamp ? formatModalDateTime(timestamp) : "-"}
                </span>
                <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  Confidence: {confidencePercentage}%
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="h-10 w-10 rounded-full border text-lg text-gray-500 hover:bg-gray-50"
            >
              ×
            </button>
          </div>

          <div className="max-h-[calc(90vh-92px)] overflow-y-auto px-6 py-6">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                <p className="text-base font-medium text-gray-800">
                  Generating detailed AI insight...
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  OpenAI is expanding each AI decision component into a fuller explanation
                </p>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-6">
                <div className="rounded-2xl border bg-gray-50 p-5">
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                    Overall Narrative
                  </p>
                  <p className="text-sm leading-7 text-gray-700">
                    {data?.overallNarrative ||
                      "This expanded section explains the AI decision in more detail so the user can understand the meaning, context, and operational implication of the current water quality assessment."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ExpandedDecisionCard
                    title={data?.predictionTitle || "AI Prediction"}
                    headline={decision?.currentWaterQualityStatus || fallbackClass}
                    description={
                      data?.predictionDetail ||
                      "This section explains the predicted water quality status in more detail."
                    }
                  />

                  <ExpandedDecisionCard
                    title={data?.interpretationTitle || "AI Interpretation"}
                    headline={decision?.pollutionRiskLevel || riskLevel}
                    description={
                      data?.interpretationDetail ||
                      "This section explains why the AI interpreted the condition at the current severity level."
                    }
                  />

                  <ExpandedDecisionCard
                    title={data?.sourceTitle || "Predicted Source of Pollution"}
                    headline={decision?.predictedSourceOfPollution || fallbackSource}
                    description={
                      data?.sourceDetail ||
                      "This section explains the likely source hypothesis behind the current river condition."
                    }
                  />

                  <ExpandedDecisionCard
                    title={data?.confidenceTitle || "AI Confidence"}
                    headline={`${confidencePercentage}%`}
                    description={
                      data?.confidenceDetail ||
                      "This section explains how the confidence level should be interpreted."
                    }
                  />

                  <div className="lg:col-span-2">
                    <ExpandedDecisionCard
                      title={data?.recommendationTitle || "AI Recommendation"}
                      headline={
                        decision?.recommendedAction ||
                        "Continue routine monitoring."
                      }
                      description={
                        data?.recommendationDetail ||
                        "This section explains the recommended follow-up action in more detail."
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandedDecisionCard({
  title,
  headline,
  description,
}: {
  title: string;
  headline: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <p className="mb-3 text-lg font-semibold leading-snug text-gray-900">
        {headline}
      </p>
      <p className="text-sm leading-7 text-gray-700">{description}</p>
    </div>
  );
}

function formatModalDateTime(ts: string) {
  if (!ts) return "-";

  const date = new Date(ts);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
}