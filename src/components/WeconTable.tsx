"use client";

import { useState, useEffect, useMemo } from "react";
import Visualizations from "@/components/Visualizations";
import LoadingScreen from "@/components/LoadingScreen";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getAIInsightSummary } from "@/lib/aiInsights";
import { getNWQSResult } from "@/lib/nwqs";
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

type OverallNWQSClass = "I" | "II" | "III" | "IV" | "V" | "N/A";

type OverallAssessment = {
  className: OverallNWQSClass;
  status: string;
  description: string;
  colorClass: string;
  badgeClass: string;
  explanation: string;
  dominantReason: string;
  drivers: {
    key: string;
    label: string;
    value: number | null;
    className: OverallNWQSClass;
    displayValue: string;
  }[];
  convertedNH3N: number | null;
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

const SENSOR_META: Record<
  string,
  {
    label: string;
    shortLabel: string;
    unit: string;
    min: number;
    max: number;
  }
> = {
  Tr_Sensor: {
    label: "Turbidity (TR)",
    shortLabel: "TR",
    unit: "mg/L",
    min: 0,
    max: 10000,
  },
  BOD_Sensor: {
    label: "Biochemical Oxygen Demand (BOD)",
    shortLabel: "BOD",
    unit: "mg/L",
    min: 0,
    max: 1000,
  },
  DO_Sensor: {
    label: "Dissolved Oxygen (DO)",
    shortLabel: "DO",
    unit: "mg/L",
    min: 0,
    max: 20,
  },
  COD_Sensor: {
    label: "Chemical Oxygen Demand (COD)",
    shortLabel: "COD",
    unit: "mg/L",
    min: 0,
    max: 2000,
  },
  NH_Sensor: {
    label: "Ammonia (NH3)",
    shortLabel: "NH3",
    unit: "mg/L",
    min: 0,
    max: 1000,
  },
  TDS_Sensor: {
    label: "Total Dissolved Solids (TDS)",
    shortLabel: "TDS",
    unit: "mg/L",
    min: 0,
    max: 100000,
  },
  CT_Sensor: {
    label: "Conductivity (CT)",
    shortLabel: "CT",
    unit: "µS/cm",
    min: 0,
    max: 200000,
  },
  ORP_Sensor: {
    label: "Oxidation Reduction Potential (ORP)",
    shortLabel: "ORP",
    unit: "mV",
    min: -2000,
    max: 2000,
  },
  pH_Sensor: {
    label: "Potential of Hydrogen (pH)",
    shortLabel: "pH",
    unit: "",
    min: 0,
    max: 14,
  },
};

const CLASS_DISPLAY: Record<
  Exclude<OverallNWQSClass, "N/A">,
  {
    status: string;
    description: string;
    colorClass: string;
    badgeClass: string;
  }
> = {
  I: {
    status: "Clean",
    description:
      "Conservation of natural environment, practically no treatment required, and suitable for very sensitive aquatic species.",
    colorClass: "text-emerald-700",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  II: {
    status: "Good",
    description:
      "Suitable for conventional water treatment, sensitive aquatic species, and recreational use depending on subclass.",
    colorClass: "text-green-700",
    badgeClass: "border-green-200 bg-green-50 text-green-700",
  },
  III: {
    status: "Moderate",
    description:
      "Water supply requires extensive treatment; suitable only for tolerant aquatic species and livestock drinking.",
    colorClass: "text-amber-700",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  IV: {
    status: "Polluted",
    description: "Generally suitable only for irrigation use.",
    colorClass: "text-orange-700",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
  },
  V: {
    status: "Critical",
    description:
      "Does not fall under the beneficial uses of Classes I to IV.",
    colorClass: "text-red-700",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
};

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
  const [snapshotRotationIndex, setSnapshotRotationIndex] = useState(0);
  const [currentDisplayTime, setCurrentDisplayTime] = useState(
    () => new Date().toISOString()
  );
  const [snapshotAnimating, setSnapshotAnimating] = useState(false);

  const [aiDecision, setAIDecision] = useState<AIDecisionResponse | null>(null);
  const [loadingAIDecision, setLoadingAIDecision] = useState(false);
  const [aiDecisionError, setAIDecisionError] = useState<string | null>(null);

  const [aiQuickInsight, setAIQuickInsight] = useState("");
  const [loadingQuickInsight, setLoadingQuickInsight] = useState(false);

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
      const val = record?.[key];
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
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  function formatDisplayDateTime(ts: string) {
    if (!ts) return "-";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;

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
      const t = new Date(ts).getTime();
      return Number.isNaN(t) ? 0 : t;
    }

    const [datePart, timePart] = ts.includes(",")
      ? ts.split(",").map((s) => s.trim())
      : ts.split(" ");

    if (!datePart) return 0;

    const [day, month, year] = datePart.split("/");
    const timeArray = timePart ? timePart.split(":").map(Number) : [0, 0, 0];

    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      timeArray[0] || 0,
      timeArray[1] || 0,
      timeArray[2] || 0
    ).getTime();

    return Number.isNaN(parsed) ? 0 : parsed;
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

  async function generateQuickAIInsight(
    latestRowParam: any,
    sortedDataParam: any[],
    aiInsightParam: any,
    assessmentParam: OverallAssessment
  ) {
    if (!latestRowParam) return;

    setLoadingQuickInsight(true);

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          mode: "quick_insight",
          latestRow: latestRowParam,
          rows: sortedDataParam.slice(0, 60),
          aiInsight: aiInsightParam,
          nwqsSummary: {
            overallClass: assessmentParam.className,
            overallStatus: assessmentParam.status,
            dominantReason: assessmentParam.dominantReason,
            drivers: assessmentParam.drivers,
            lastUpdated: latestRowParam?.Timestamp,
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.error || "Failed to generate quick insight.");
      }

      setAIQuickInsight(
        result?.insight ||
          buildQuickInsightFallback(aiInsightParam, assessmentParam)
      );
    } catch (error) {
      console.error("Failed to generate quick AI insight:", error);
      setAIQuickInsight(buildQuickInsightFallback(aiInsightParam, assessmentParam));
    } finally {
      setLoadingQuickInsight(false);
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
          "This expanded AI insight provides a more detailed explanation of the current river condition by elaborating the prediction, interpretation, possible pollution source, confidence level, and operational recommendation.",
        predictionTitle: result?.predictionTitle || "AI Prediction",
        predictionDetail: result?.predictionDetail || fallbackPrediction,
        interpretationTitle:
          result?.interpretationTitle || "AI Interpretation",
        interpretationDetail:
          result?.interpretationDetail || fallbackInterpretation,
        sourceTitle:
          result?.sourceTitle || "Predicted Source of Pollution",
        sourceDetail: result?.sourceDetail || fallbackSource,
        confidenceTitle: result?.confidenceTitle || "AI Confidence",
        confidenceDetail: result?.confidenceDetail || fallbackConfidence,
        recommendationTitle:
          result?.recommendationTitle || "AI Recommendation",
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
    setAIQuickInsight("");

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
    const clockInterval = setInterval(() => {
      setCurrentDisplayTime(new Date().toISOString());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

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

  const latestSnapshotRows = useMemo(() => {
    const merged = [...latestData, ...sortedData];
    const uniqueByTimestamp = new Map<string, any>();

    merged.forEach((row) => {
      if (!row || !row.Timestamp) return;
      if (!hasValidSensorData(row)) return;
      if (!uniqueByTimestamp.has(row.Timestamp)) {
        uniqueByTimestamp.set(row.Timestamp, row);
      }
    });

    return Array.from(uniqueByTimestamp.values())
      .sort((a, b) => parseTimestamp(b.Timestamp) - parseTimestamp(a.Timestamp))
      .slice(0, 3);
  }, [latestData, sortedData]);

  const displayedSnapshotRow = useMemo(() => {
    if (latestSnapshotRows.length === 0) return latestRow;
    const index = snapshotRotationIndex % latestSnapshotRows.length;
    return latestSnapshotRows[index];
  }, [latestSnapshotRows, snapshotRotationIndex, latestRow]);

  useEffect(() => {
    if (latestSnapshotRows.length <= 1) {
      setSnapshotRotationIndex(0);
      return;
    }

    const rotateInterval = setInterval(() => {
      setSnapshotRotationIndex(
        (prev) => (prev + 1) % latestSnapshotRows.length
      );
    }, 30000);

    return () => clearInterval(rotateInterval);
  }, [latestSnapshotRows]);

  useEffect(() => {
    setSnapshotAnimating(true);
    const animationTimeout = setTimeout(() => {
      setSnapshotAnimating(false);
    }, 700);

    return () => clearTimeout(animationTimeout);
  }, [snapshotRotationIndex, latestRow?.Timestamp]);

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

  const latestAssessment = useMemo(() => {
    return assessOverallWaterQuality(displayedSnapshotRow);
  }, [displayedSnapshotRow]);

  const activeRiskLevel =
    aiDecision?.pollutionRiskLevel || aiInsight.riskLevel || "Moderate";

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

  useEffect(() => {
    if (displayedSnapshotRow) {
      generateQuickAIInsight(
        displayedSnapshotRow,
        sortedData,
        aiInsight,
        latestAssessment
      );
    }
  }, [displayedSnapshotRow, sortedData, aiInsight, latestAssessment]);

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
        body: SENSOR_KEYS.map((k) => [
          SENSOR_META[k].label,
          `${roundValue(latestRow[k])}${
            SENSOR_META[k].unit ? ` ${SENSOR_META[k].unit}` : ""
          }`,
        ]),
        styles: { fontSize: 9 },
        theme: "grid",
      });

      currentY =
        (pdf as any).lastAutoTable?.finalY !== undefined
          ? (pdf as any).lastAutoTable.finalY + 8
          : currentY + 50;

      autoTable(pdf, {
        startY: currentY,
        head: [["Overall Class", "Status", "Description", "Dominant Reason"]],
        body: [
          [
            latestAssessment.className,
            latestAssessment.status,
            latestAssessment.description,
            latestAssessment.dominantReason,
          ],
        ],
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
        head: [["Timestamp", ...SENSOR_KEYS.map((k) => SENSOR_META[k].shortLabel)]],
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
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      Latest Snapshot
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Real-time parameter overview for the selected monitoring area
                    </p>
                  </div>

                  <span
                    className={`whitespace-nowrap text-sm text-gray-500 transition-colors duration-500 ${
                      snapshotAnimating ? "text-blue-600" : ""
                    }`}
                  >
                    {formatDisplayDateTime(currentDisplayTime)}
                    {refreshingLatest ? " · Refreshing..." : ""}
                  </span>
                </div>

                <div
                  className={`grid grid-cols-1 gap-4 transition-all duration-700 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 ${
                    snapshotAnimating
                      ? "scale-[0.995] opacity-70"
                      : "scale-100 opacity-100"
                  }`}
                >
                  {SENSOR_KEYS.map((key) => (
                    <DataCard
                      key={key}
                      sensorKey={key}
                      value={displayedSnapshotRow?.[key]}
                      roundValue={roundValue}
                    />
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Overall Water Quality Summary
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <h3
                      className={`text-4xl font-bold tracking-tight ${latestAssessment.colorClass}`}
                    >
                      Class {latestAssessment.className}
                    </h3>

                    <span
                      className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold ${latestAssessment.badgeClass}`}
                    >
                      {latestAssessment.status}
                    </span>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      AI Insight
                    </p>

                    {loadingQuickInsight ? (
                      <p className="mt-2 text-sm leading-6 text-gray-400">
                        Generating brief AI insight...
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-gray-700">
                        {aiQuickInsight ||
                          buildQuickInsightFallback(aiInsight, latestAssessment)}
                      </p>
                    )}
                  </div>
                </div>
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
                          {aiDecision?.executiveSummary || buildInsightText(aiInsight)}
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
                        <span className="text-xs text-gray-500">Generating...</span>
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

          <div className="mx-auto max-w-6xl px-4">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-gray-800">
                    <span>📊</span>
                    <span>Supporting Data Visualization</span>
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    AI decides first, graphs and indicators support the
                    interpretation
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
                  <h2 className="font-semibold text-gray-800">Historical Data</h2>
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
                              {SENSOR_META[key].shortLabel}
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

function buildQuickInsightFallback(
  aiInsight: any,
  assessment: OverallAssessment
) {
  const drivers =
    aiInsight?.dominantParameters?.length > 0
      ? aiInsight.dominantParameters.join(", ")
      : "multiple core parameters";

  const recommendation =
    aiInsight?.recommendations?.[0] || "Closer monitoring is recommended.";

  return `The latest snapshot indicates a ${assessment.status.toLowerCase()} water quality condition at Class ${
    assessment.className
  }, mainly influenced by ${drivers}. This suggests that the river is currently under elevated pollution stress and should be reviewed together with recent trend movement. ${recommendation}`;
}

function isValueOutOfPhysicalRange(sensorKey: string, value: any) {
  if (value === null || value === undefined || value === "") return false;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return false;

  const meta = SENSOR_META[sensorKey];
  if (!meta) return false;

  return numericValue < meta.min || numericValue > meta.max;
}

function toNullableNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getClassFromBOD(value: number | null): OverallNWQSClass {
  if (value === null) return "N/A";
  if (value < 1) return "I";
  if (value <= 3) return "II";
  if (value <= 6) return "III";
  if (value <= 12) return "IV";
  return "V";
}

function getClassFromCOD(value: number | null): OverallNWQSClass {
  if (value === null) return "N/A";
  if (value < 10) return "I";
  if (value <= 25) return "II";
  if (value <= 50) return "III";
  if (value <= 100) return "IV";
  return "V";
}

function getClassFromDO(value: number | null): OverallNWQSClass {
  if (value === null) return "N/A";
  if (value > 7) return "I";
  if (value >= 5) return "II";
  if (value >= 3) return "III";
  if (value >= 1) return "IV";
  return "V";
}

function getClassFromPH(value: number | null): OverallNWQSClass {
  if (value === null) return "N/A";
  if (value >= 6.5 && value <= 8.5) return "I";
  if (value >= 6 && value < 6.5) return "II";
  if (value > 8.5 && value <= 9) return "II";
  if (value >= 5 && value < 6) return "III";
  if (value >= 5 && value <= 9) return "IV";
  return "V";
}

function convertNH3ToNH3N(nh3: number | null): number | null {
  if (nh3 === null) return null;
  return nh3 * 0.822;
}

function getClassFromNH3N(value: number | null): OverallNWQSClass {
  if (value === null) return "N/A";
  if (value < 0.1) return "I";
  if (value <= 0.3) return "II";
  if (value <= 0.9) return "III";
  if (value <= 2.7) return "IV";
  return "V";
}

function classSeverity(className: OverallNWQSClass): number {
  switch (className) {
    case "I":
      return 1;
    case "II":
      return 2;
    case "III":
      return 3;
    case "IV":
      return 4;
    case "V":
      return 5;
    default:
      return 0;
  }
}

function assessOverallWaterQuality(row: any): OverallAssessment {
  if (!row) {
    return {
      className: "N/A",
      status: "Unavailable",
      description: "No latest sensor data available for classification.",
      colorClass: "text-gray-600",
      badgeClass: "border-gray-200 bg-gray-50 text-gray-600",
      explanation: "Waiting for valid latest snapshot data.",
      dominantReason: "No data",
      drivers: [],
      convertedNH3N: null,
    };
  }

  const bod = toNullableNumber(row.BOD_Sensor);
  const cod = toNullableNumber(row.COD_Sensor);
  const doValue = toNullableNumber(row.DO_Sensor);
  const ph = toNullableNumber(row.pH_Sensor);
  const nh3 = toNullableNumber(row.NH_Sensor);
  const nh3n = convertNH3ToNH3N(nh3);

  const drivers = [
    {
      key: "BOD_Sensor",
      label: "BOD",
      value: bod,
      className: getClassFromBOD(bod),
      displayValue: bod !== null ? `${bod.toFixed(2)} mg/L` : "-",
    },
    {
      key: "COD_Sensor",
      label: "COD",
      value: cod,
      className: getClassFromCOD(cod),
      displayValue: cod !== null ? `${cod.toFixed(2)} mg/L` : "-",
    },
    {
      key: "DO_Sensor",
      label: "DO",
      value: doValue,
      className: getClassFromDO(doValue),
      displayValue: doValue !== null ? `${doValue.toFixed(2)} mg/L` : "-",
    },
    {
      key: "pH_Sensor",
      label: "pH",
      value: ph,
      className: getClassFromPH(ph),
      displayValue: ph !== null ? ph.toFixed(2) : "-",
    },
    {
      key: "NH_Sensor",
      label: "NH3 → NH3-N",
      value: nh3n,
      className: getClassFromNH3N(nh3n),
      displayValue: nh3n !== null ? `${nh3n.toFixed(2)} mg/L` : "-",
    },
  ];

  const validDrivers = drivers.filter((driver) => driver.className !== "N/A");

  if (validDrivers.length === 0) {
    return {
      className: "N/A",
      status: "Unavailable",
      description: "Core NWQS parameters are not available for classification.",
      colorClass: "text-gray-600",
      badgeClass: "border-gray-200 bg-gray-50 text-gray-600",
      explanation: "Please provide valid BOD, COD, DO, pH, and NH3 readings.",
      dominantReason: "Core parameters unavailable",
      drivers,
      convertedNH3N: nh3n,
    };
  }

  const worstDriver = validDrivers.reduce((worst, current) => {
    return classSeverity(current.className) > classSeverity(worst.className)
      ? current
      : worst;
  });

  const finalClass = worstDriver.className as Exclude<
    OverallNWQSClass,
    "N/A"
  >;
  const display = CLASS_DISPLAY[finalClass];

  return {
    className: finalClass,
    status: display.status,
    description: display.description,
    colorClass: display.colorClass,
    badgeClass: display.badgeClass,
    explanation: `The overall class follows the worst core parameter class. In this snapshot, ${worstDriver.label} is the limiting parameter and drives the final class.`,
    dominantReason: `${worstDriver.label} is at Class ${worstDriver.className} (${worstDriver.displayValue})`,
    drivers,
    convertedNH3N: nh3n,
  };
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

function MiniDecisionRow({ label, value }: { label: string; value: string }) {
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
  const meta = SENSOR_META[sensorKey];
  const outOfRange = isValueOutOfPhysicalRange(sensorKey, value);

  return (
    <div className="rounded-xl border bg-gray-50 p-5">
      <p className="text-sm font-medium leading-6 text-gray-500">
        {meta.label}
      </p>
      <div className="mt-3 flex items-end gap-2">
        <p
          className={`text-3xl font-bold tracking-tight ${
            outOfRange ? "text-red-600" : "text-gray-900"
          }`}
        >
          {roundValue(value)}
        </p>
        {meta.unit ? (
          <span className="pb-1 text-sm font-medium text-gray-500">
            {meta.unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SmallInfoPanel({ title, items }: { title: string; items: string[] }) {
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
                  OpenAI is expanding each AI decision component into a fuller
                  explanation
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
                    title={
                      data?.sourceTitle || "Predicted Source of Pollution"
                    }
                    headline={
                      decision?.predictedSourceOfPollution || fallbackSource
                    }
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
  if (isNaN(date.getTime())) return ts;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
}