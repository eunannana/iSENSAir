"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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

type OverallNWQSClass = "I" | "II" | "III" | "IV" | "V" | "N/A";

type DriverSummary = {
  key: string;
  label: string;
  unit: string;
  latest: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  median: number | null;
  changePct: number | null;
  exceedanceCount: number;
  exceedanceRate: number;
  severityScore: number;
  direction: "increasing" | "decreasing" | "stable" | "fluctuating";
  likelyImpact: string;
};

type SourceHypothesis = {
  source: string;
  confidence: number;
  reason: string;
};

type AIDecisionResponse = {
  title?: string;
  historicalWindowLabel?: string;
  currentWaterQualityStatus: string;
  pollutionRiskLevel: string;
  confidenceScore: number;
  executiveSummary: string;
  recommendedAction: string;
  recommendations?: string[];
  mainContributorSummary?: string;
  predictedSourceOfPollution: string;
  sourceRationale?: string;
  dominantDrivers?: DriverSummary[];
  likelySources?: SourceHypothesis[];
  anomalyNotes?: string[];
};

type DetailedInsightResponse = {
  overallNarrative?: string;
  predictionTitle?: string;
  predictionDetail?: string;
  sourceTitle?: string;
  sourceDetail?: string;
  confidenceTitle?: string;
  confidenceDetail?: string;
  recommendationTitle?: string;
  recommendationDetail?: string;
  driverNarrative?: string;
  anomalyNarrative?: string;
  monthlyPatternNarrative?: string;
};

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

type RowData = Record<string, any>;

const AI_WINDOW_DAYS = 7;
const AI_MAX_ROWS = 168;
const REALTIME_ROTATION_MS = 120000;

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
    severityWeight: number;
  }
> = {
  Tr_Sensor: {
    label: "Turbidity",
    shortLabel: "TR",
    unit: "NTU",
    min: 0,
    max: 1000,
    severityWeight: 0.95,
  },
  BOD_Sensor: {
    label: "Biochemical Oxygen Demand",
    shortLabel: "BOD",
    unit: "mg/L",
    min: 0,
    max: 100,
    severityWeight: 1.35,
  },
  DO_Sensor: {
    label: "Dissolved Oxygen",
    shortLabel: "DO",
    unit: "mg/L",
    min: 0,
    max: 20,
    severityWeight: 1.4,
  },
  COD_Sensor: {
    label: "Chemical Oxygen Demand",
    shortLabel: "COD",
    unit: "mg/L",
    min: 0,
    max: 500,
    severityWeight: 1.3,
  },
  NH_Sensor: {
    label: "Ammonia",
    shortLabel: "NH3",
    unit: "mg/L",
    min: 0,
    max: 50,
    severityWeight: 1.45,
  },
  TDS_Sensor: {
    label: "Total Dissolved Solids",
    shortLabel: "TDS",
    unit: "mg/L",
    min: 0,
    max: 2000,
    severityWeight: 0.8,
  },
  CT_Sensor: {
    label: "Conductivity",
    shortLabel: "CT",
    unit: "µS/cm",
    min: 0,
    max: 5000,
    severityWeight: 0.85,
  },
  ORP_Sensor: {
    label: "Oxidation Reduction Potential",
    shortLabel: "ORP",
    unit: "mV",
    min: -500,
    max: 500,
    severityWeight: 0.75,
  },
  pH_Sensor: {
    label: "Potential of Hydrogen",
    shortLabel: "pH",
    unit: "",
    min: 0,
    max: 14,
    severityWeight: 1.0,
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
    description: "Does not fall under the beneficial uses of Classes I to IV.",
    colorClass: "text-red-700",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
};

export default function WeconTable({ initialArea }: Props) {
  const area = initialArea;

  const [data, setData] = useState<RowData[]>([]);
  const [latestData, setLatestData] = useState<RowData[]>([]);
  const [aiHistoryRows, setAIHistoryRows] = useState<RowData[]>([]);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    "connecting" | "booting" | "loading"
  >("connecting");
  const [retryAttempt, setRetryAttempt] = useState(0);

  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [loadingAIHistory, setLoadingAIHistory] = useState(false);

  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [refreshingLatest, setRefreshingLatest] = useState(false);
  const [snapshotRotationIndex, setSnapshotRotationIndex] = useState(0);
  const [currentDisplayTime, setCurrentDisplayTime] = useState(() =>
    new Date().toISOString(),
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
  const [detailedInsightError, setDetailedInsightError] = useState<
    string | null
  >(null);
  const [detailedInsight, setDetailedInsight] =
    useState<DetailedInsightResponse | null>(null);
  const quickInsightCacheRef = useRef<Record<string, string>>({});

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
      timeArray[2] || 0,
    ).getTime();

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function getHourBucketKey(ts: string) {
    const time = parseTimestamp(ts);
    if (!time) return "";
    const d = new Date(time);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:00`;
  }

  function compressRowsToHourlyRepresentative(rows: RowData[]) {
    const sorted = [...rows].sort(
      (a, b) => parseTimestamp(a.Timestamp) - parseTimestamp(b.Timestamp),
    );

    const hourMap = new Map<string, RowData>();

    for (const row of sorted) {
      if (!row?.Timestamp) continue;
      if (!hasValidSensorData(row)) continue;
      const bucket = getHourBucketKey(row.Timestamp);
      if (!bucket) continue;
      hourMap.set(bucket, row);
    }

    return Array.from(hourMap.values())
      .sort((a, b) => parseTimestamp(a.Timestamp) - parseTimestamp(b.Timestamp))
      .slice(-AI_MAX_ROWS);
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

  function getClassBadgeClass(className: OverallNWQSClass) {
    switch (className) {
      case "I":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "II":
        return "bg-green-100 text-green-700 border-green-200";
      case "III":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "IV":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "V":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  }

  function getConfidenceBadgeClass(confidence: number) {
    if (confidence >= 80) {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }

    if (confidence >= 60) {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (confidence >= 40) {
      return "bg-amber-100 text-amber-700 border-amber-200";
    }

    return "bg-red-100 text-red-700 border-red-200";
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

  function getTodayInMalaysia() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    return formatter.format(new Date());
  }

  function shiftDate(dateString: string, diffDays: number) {
    const [year, month, day] = dateString.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + diffDays);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
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

  async function fetchSevenDayAIHistory() {
    const today = getTodayInMalaysia();
    const endDate = shiftDate(today, -1); // kemarin
    const startDate = shiftDate(endDate, -(AI_WINDOW_DAYS - 1)); // 7 hari termasuk kemarin

    setLoadingAIHistory(true);
    try {
      const json = await fetchDataByDateRange(area, startDate, endDate);
      const arr = Array.isArray(json) ? json : [];
      setAIHistoryRows(arr);
    } catch (error) {
      console.error("Failed to load 7-day AI history:", error);
      setAIHistoryRows([]);
    } finally {
      setLoadingAIHistory(false);
    }
  }

  const generateQuickAIInsight = useCallback(
    async (
      latestRowParam: any,
      sortedDataParam: any[],
      aiInsightParam: any,
      assessmentParam: OverallAssessment,
    ) => {
      if (!latestRowParam) return "";

      setLoadingQuickInsight(true);

      try {
        const quickRows = (() => {
          const rows = Array.isArray(sortedDataParam) ? [...sortedDataParam] : [];

          const parseTime = (ts: string) => {
            if (!ts) return 0;
            if (ts.includes("T")) {
              const value = new Date(ts).getTime();
              return Number.isNaN(value) ? 0 : value;
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
              timeArray[2] || 0,
            ).getTime();

            return Number.isNaN(parsed) ? 0 : parsed;
          };

          const getHourBucketKey = (ts: string) => {
            const time = parseTime(ts);
            if (!time) return "";
            const d = new Date(time);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const hh = String(d.getHours()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd} ${hh}:00`;
          };

          const hourMap = new Map<string, RowData>();
          rows
            .sort((a, b) => parseTime(a.Timestamp) - parseTime(b.Timestamp))
            .forEach((row) => {
              if (!row?.Timestamp) return;
              if (
                !SENSOR_KEYS.some((key) => {
                  const val = row?.[key];
                  return (
                    val !== null &&
                    val !== undefined &&
                    val !== "" &&
                    val !== 0 &&
                    !Number.isNaN(val)
                  );
                })
              ) {
                return;
              }

              const bucket = getHourBucketKey(row.Timestamp);
              if (!bucket) return;
              hourMap.set(bucket, row);
            });

          return Array.from(hourMap.values()).slice(-48);
        })();

        const res = await fetch("/api/openai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: "openai",
            mode: "quick_insight",
            latestRow: latestRowParam,
            rows: quickRows,
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

        return (
          result?.insight ||
          buildQuickInsightFallback(aiInsightParam, assessmentParam)
        );
      } catch (error) {
        console.error("Failed to generate quick AI insight:", error);
        return buildQuickInsightFallback(aiInsightParam, assessmentParam);
      } finally {
        setLoadingQuickInsight(false);
      }
    },
    [],
  );

  async function generateAIDecisionPanel(
    latestRowParam: any,
    historyRowsParam: any[],
    assessmentParam: OverallAssessment,
    historicalSummaryParam: any,
  ) {
    if (!latestRowParam || historyRowsParam.length === 0) return;

    setLoadingAIDecision(true);
    setAIDecisionError(null);

    try {
      const hourlyRows = compressRowsToHourlyRepresentative(historyRowsParam);

      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          mode: "historical_decision_7d",
          latestRow: latestRowParam,
          rows: hourlyRows,
          historicalWindowDays: AI_WINDOW_DAYS,
          historicalSummary: historicalSummaryParam,
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
        throw new Error(result?.error || "Failed to generate AI decision.");
      }

      setAIDecision({
        title: result?.title || `${AI_WINDOW_DAYS}-Day AI Decision Support`,
        historicalWindowLabel:
          result?.historicalWindowLabel ||
          historicalSummaryParam?.windowLabel ||
          `Last ${AI_WINDOW_DAYS} days`,
        currentWaterQualityStatus:
          result?.currentWaterQualityStatus ||
          `Class ${assessmentParam.className}`,
        pollutionRiskLevel:
          result?.pollutionRiskLevel ||
          deriveRiskLevelFromClass(assessmentParam.className),
        confidenceScore:
          typeof result?.confidenceScore === "number"
            ? result.confidenceScore
            : historicalSummaryParam.confidenceScore,
        executiveSummary:
          result?.executiveSummary ||
          buildCombinedHistoricalSummary(
            historicalSummaryParam,
            assessmentParam,
          ),
        recommendedAction:
          result?.recommendedAction ||
          buildRecommendedActionFallback(historicalSummaryParam),
        recommendations:
          result?.recommendations ||
          buildRecommendationListFallback(historicalSummaryParam),
        predictedSourceOfPollution:
          result?.predictedSourceOfPollution ||
          historicalSummaryParam.primarySource?.source ||
          "Potential mixed-source pollution",
        sourceRationale:
          result?.sourceRationale ||
          historicalSummaryParam.primarySource?.reason ||
          `This source hypothesis is based on the ${AI_WINDOW_DAYS}-day parameter pattern.`,
        mainContributorSummary:
          result?.mainContributorSummary ||
          buildMainContributorSummary(historicalSummaryParam.topDrivers),
        dominantDrivers:
          result?.dominantDrivers || historicalSummaryParam.topDrivers,
        likelySources:
          result?.likelySources || historicalSummaryParam.sourceHypotheses,
        anomalyNotes:
          result?.anomalyNotes || historicalSummaryParam.anomalyNotes,
      });
    } catch (error: any) {
      setAIDecisionError(
        error?.message || "Failed to generate AI decision panel.",
      );

      setAIDecision({
        title: `${AI_WINDOW_DAYS}-Day AI Decision Support`,
        historicalWindowLabel: historicalSummaryParam.windowLabel,
        currentWaterQualityStatus: `Class ${assessmentParam.className}`,
        pollutionRiskLevel: deriveRiskLevelFromClass(assessmentParam.className),
        confidenceScore: historicalSummaryParam.confidenceScore,
        executiveSummary: buildCombinedHistoricalSummary(
          historicalSummaryParam,
          assessmentParam,
        ),
        recommendedAction: buildRecommendedActionFallback(
          historicalSummaryParam,
        ),
        recommendations: buildRecommendationListFallback(
          historicalSummaryParam,
        ),
        predictedSourceOfPollution:
          historicalSummaryParam.primarySource?.source ||
          "Potential mixed-source pollution",
        sourceRationale:
          historicalSummaryParam.primarySource?.reason ||
          `This source hypothesis is based on the ${AI_WINDOW_DAYS}-day parameter pattern.`,
        mainContributorSummary: buildMainContributorSummary(
          historicalSummaryParam.topDrivers,
        ),
        dominantDrivers: historicalSummaryParam.topDrivers,
        likelySources: historicalSummaryParam.sourceHypotheses,
        anomalyNotes: historicalSummaryParam.anomalyNotes,
      });
    } finally {
      setLoadingAIDecision(false);
    }
  }

  async function handleGetMoreAIInsight() {
    if (!latestRow || aiWindowRows.length === 0) return;

    setShowInsightModal(true);
    setLoadingDetailedInsight(true);
    setDetailedInsightError(null);

    try {
      const hourlyRows = compressRowsToHourlyRepresentative(aiWindowRows);

      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          mode: "expanded_historical_decision_detail",
          latestRow,
          rows: hourlyRows,
          aiDecision,
          historicalWindowDays: AI_WINDOW_DAYS,
          historicalSummary: aiHistoricalSummary,
          nwqsSummary: {
            overallClass: latestAssessment.className,
            overallStatus: latestAssessment.status,
            dominantReason: latestAssessment.dominantReason,
            drivers: latestAssessment.drivers,
            lastUpdated: latestRow?.Timestamp,
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          result?.error || "Failed to generate expanded AI insight.",
        );
      }

      setDetailedInsight({
        overallNarrative:
          result?.overallNarrative ||
          buildModalOverallNarrative(aiHistoricalSummary, latestAssessment),
        predictionTitle:
          result?.predictionTitle || "7-Day Water Quality Summary",
        predictionDetail:
          result?.predictionDetail ||
          buildPredictionDetail(aiHistoricalSummary, latestAssessment),
        sourceTitle: result?.sourceTitle || "Likely Pollution Source",
        sourceDetail:
          result?.sourceDetail || buildSourceDetail(aiHistoricalSummary),
        recommendationTitle:
          result?.recommendationTitle || "Recommended Follow-up",
        recommendationDetail:
          result?.recommendationDetail ||
          buildRecommendationDetail(aiHistoricalSummary),
        driverNarrative:
          result?.driverNarrative || buildDriverNarrative(aiHistoricalSummary),
        anomalyNarrative:
          result?.anomalyNarrative ||
          buildAnomalyNarrative(aiHistoricalSummary),
        monthlyPatternNarrative:
          result?.monthlyPatternNarrative ||
          buildMonthlyPatternNarrative(aiHistoricalSummary),
      });
    } catch (error: any) {
      setDetailedInsightError(
        error?.message || "Failed to generate more detailed AI insight.",
      );

      setDetailedInsight({
        overallNarrative: buildModalOverallNarrative(
          aiHistoricalSummary,
          latestAssessment,
        ),
        predictionTitle: "7-Day Water Quality Summary",
        predictionDetail: buildPredictionDetail(
          aiHistoricalSummary,
          latestAssessment,
        ),
        sourceTitle: "Likely Pollution Source",
        sourceDetail: buildSourceDetail(aiHistoricalSummary),
        recommendationTitle: "Recommended Follow-up",
        recommendationDetail: buildRecommendationDetail(aiHistoricalSummary),
        driverNarrative: buildDriverNarrative(aiHistoricalSummary),
        anomalyNarrative: buildAnomalyNarrative(aiHistoricalSummary),
        monthlyPatternNarrative:
          buildMonthlyPatternNarrative(aiHistoricalSummary),
      });
    } finally {
      setLoadingDetailedInsight(false);
    }
  }

  useEffect(() => {
    const today = getTodayInMalaysia();
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
    quickInsightCacheRef.current = {};

    const handleRetry = (
      attempt: number,
      _totalRetries: number,
      isBootingError: boolean,
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
        await Promise.all([
          fetchHistorical(today, today),
          fetchLatestSnapshot(),
          fetchSevenDayAIHistory(),
        ]);
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

  const aiWindowRows = useMemo(() => {
    const filtered = [...aiHistoryRows].filter(hasValidSensorData);

    return compressRowsToHourlyRepresentative(filtered);
  }, [aiHistoryRows]);

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
    const snapshotCount = latestSnapshotRows.length;

    if (snapshotCount <= 1) {
      setSnapshotRotationIndex(0);
      return;
    }

    const rotateInterval = setInterval(() => {
      setSnapshotRotationIndex((prev) => (prev + 1) % snapshotCount);
    }, REALTIME_ROTATION_MS);

    return () => clearInterval(rotateInterval);
  }, [latestSnapshotRows.length]);

  useEffect(() => {
    setSnapshotAnimating(true);
    const animationTimeout = setTimeout(() => {
      setSnapshotAnimating(false);
    }, 700);

    return () => clearTimeout(animationTimeout);
  }, [snapshotRotationIndex, latestRow?.Timestamp]);

  // Helper function untuk mendapatkan data daily (rata-rata harian)
  const getDailyAggregatedData = (dataRows: RowData[]): any | null => {
    if (!dataRows || dataRows.length === 0) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Filter data untuk hari ini
    let todayRows = dataRows.filter((row) => {
      if (!row?.Timestamp) return false;
      const rowTime = parseTimestamp(row.Timestamp);
      const rowDate = new Date(rowTime);
      rowDate.setHours(0, 0, 0, 0);
      return rowDate.getTime() === today.getTime();
    });

    // Jika tidak ada data hari ini, gunakan kemarin
    if (todayRows.length === 0) {
      todayRows = dataRows.filter((row) => {
        if (!row?.Timestamp) return false;
        const rowTime = parseTimestamp(row.Timestamp);
        const rowDate = new Date(rowTime);
        rowDate.setHours(0, 0, 0, 0);
        return rowDate.getTime() === yesterday.getTime();
      });
    }

    if (todayRows.length === 0) return null;

    // Aggregate data: hitung rata-rata untuk setiap sensor
    const aggregated: Record<string, number> = {};

    SENSOR_KEYS.forEach((key) => {
      const values = todayRows
        .map((row) => toNullableNumber(row[key]))
        .filter((v) => v !== null) as number[];

      if (values.length > 0) {
        aggregated[key] = values.reduce((sum, val) => sum + val, 0) / values.length;
      }
    });

    return {
      ...aggregated,
      Timestamp: todayRows[0]?.Timestamp || new Date().toISOString(),
    };
  };

  const dailyData = useMemo(() => {
    return getDailyAggregatedData(sortedData);
  }, [sortedData]);

  const latestAssessment = useMemo(() => {
    return assessOverallWaterQuality(displayedSnapshotRow);
  }, [displayedSnapshotRow]);

  const dailyAssessment = useMemo(() => {
    return assessOverallWaterQuality(dailyData);
  }, [dailyData]);

  const aiInsight = useMemo(() => {
    return getAIInsightSummary(dailyData, sortedData);
  }, [dailyData, sortedData]);

  const historicalAssessment = useMemo<OverallAssessment>(() => {
    if (aiWindowRows.length === 0) {
      return {
        className: "N/A",
        status: "Unavailable",
        description: "No 7-day historical data available for classification.",
        colorClass: "text-gray-600",
        badgeClass: "border-gray-200 bg-gray-50 text-gray-600",
        explanation: "Waiting for sufficient historical data.",
        dominantReason: "No data",
        drivers: [],
        convertedNH3N: null,
      };
    }
    const lastHourlyRow = aiWindowRows[aiWindowRows.length - 1];
    return assessOverallWaterQuality(lastHourlyRow);
  }, [aiWindowRows]);

  const aiHistoricalSummary = useMemo(() => {
    return buildHistoricalSummary(aiWindowRows, null, historicalAssessment);
  }, [aiWindowRows, historicalAssessment]);

  const confidencePercentage = useMemo(() => {
    if (typeof aiDecision?.confidenceScore === "number") {
      return aiDecision.confidenceScore;
    }
    return aiHistoricalSummary.confidenceScore;
  }, [aiDecision?.confidenceScore, aiHistoricalSummary.confidenceScore]);

  const likelyContributor = useMemo(() => {
    if (aiDecision?.dominantDrivers?.length) {
      return aiDecision.dominantDrivers
        .slice(0, 3)
        .map((item) => item.label)
        .join(", ");
    }

    if (aiHistoricalSummary.topDrivers.length > 0) {
      return aiHistoricalSummary.topDrivers
        .slice(0, 3)
        .map((item) => item.label)
        .join(", ");
    }

    return "Not identified";
  }, [aiDecision?.dominantDrivers, aiHistoricalSummary.topDrivers]);

  const exceedanceIndicators = useMemo(() => {
    if (!latestRow) return [];

    return SENSOR_KEYS.map((key) => getNWQSResult(key as any, latestRow[key]))
      .filter((item) => item.className === "IV" || item.className === "V")
      .slice(0, 6);
  }, [latestRow]);

  const keyTrendItems = useMemo(() => {
    return aiHistoricalSummary.topDrivers
      .filter(
        (item) =>
          item.direction === "increasing" ||
          item.direction === "decreasing" ||
          item.direction === "fluctuating",
      )
      .slice(0, 5);
  }, [aiHistoricalSummary.topDrivers]);

  const activeRiskLevel =
    aiDecision?.pollutionRiskLevel ||
    deriveRiskLevelFromClass(latestAssessment.className);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  const paginatedData = sortedData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
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
    if (latestRow && aiWindowRows.length > 0) {
      generateAIDecisionPanel(
        latestRow,
        aiWindowRows,
        latestAssessment,
        aiHistoricalSummary,
      );
    }
  }, [aiWindowRows, aiHistoricalSummary]);

  useEffect(() => {
    const dailyTimestamp = dailyData?.Timestamp ?? "";

    if (!dailyData || !dailyTimestamp) return;

    const cachedInsight = quickInsightCacheRef.current[dailyTimestamp];
    if (cachedInsight) {
      setAIQuickInsight(cachedInsight);
      return;
    }

    let cancelled = false;

    (async () => {
      const insightText = await generateQuickAIInsight(
        dailyData,
        sortedData,
        aiInsight,
        dailyAssessment,
      );

      if (cancelled) return;

      const resolvedInsight =
        insightText || buildQuickInsightFallback(aiInsight, dailyAssessment);

      quickInsightCacheRef.current[dailyTimestamp] = resolvedInsight;
      setAIQuickInsight(resolvedInsight);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    generateQuickAIInsight,
    dailyData,
    sortedData,
    aiInsight,
    dailyAssessment,
  ]);

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
      { align: "center" },
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

    if (aiHistoricalSummary?.topDrivers?.length) {
      currentY =
        (pdf as any).lastAutoTable?.finalY !== undefined
          ? (pdf as any).lastAutoTable.finalY + 8
          : 100;

      autoTable(pdf, {
        startY: currentY,
        head: [
          [
            `${AI_WINDOW_DAYS}-Day Driver`,
            "Average",
            "Latest",
            "Max",
            "Trend",
            "Exceedance Rate",
          ],
        ],
        body: aiHistoricalSummary.topDrivers.map((driver: DriverSummary) => [
          driver.label,
          formatMetric(driver.average, driver.unit),
          formatMetric(driver.latest, driver.unit),
          formatMetric(driver.maximum, driver.unit),
          driver.direction,
          `${driver.exceedanceRate}%`,
        ]),
        styles: { fontSize: 8 },
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
        head: [
          ["Timestamp", ...SENSOR_KEYS.map((k) => SENSOR_META[k].shortLabel)],
        ],
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

          {dailyData && (
            <div className="mx-auto max-w-6xl px-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                {/* HEADER */}
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Daily Water Quality Summary
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Daily aggregated water quality assessment based on daily
                      average readings
                    </p>
                  </div>
                </div>

                {/* MINI STATUS */}
                <div className="rounded-2xl border bg-gray-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Daily Classification
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xl font-semibold ${dailyAssessment.colorClass}`}
                    >
                      Class {dailyAssessment.className}
                    </span>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${dailyAssessment.badgeClass}`}
                    >
                      {dailyAssessment.status}
                    </span>
                  </div>

                  {/* EXPLANATION */}
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm leading-6 text-gray-700">
                      {dailyAssessment.explanation}
                    </p>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-500">
                      Daily AI Insight
                    </p>

                    {loadingQuickInsight ? (
                      <p className="mt-2 text-sm leading-6 text-gray-400">
                        Generating AI insight...
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-gray-700">
                        {aiQuickInsight ||
                          buildQuickInsightFallback(aiInsight, dailyAssessment)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {latestRow && (
            <div className="mx-auto max-w-6xl px-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                {/* HEADER */}
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      Real-Time Water Quality Assessment
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Live monitoring of key water quality parameters in the
                      selected area
                    </p>
                  </div>

                  {/* TIME */}
                  <span
                    className={`whitespace-nowrap text-sm text-gray-500 transition-all duration-500 ${
                      snapshotAnimating ? "text-blue-600 opacity-90" : ""
                    }`}
                  >
                    {formatDisplayDateTime(currentDisplayTime)}
                    {refreshingLatest ? " · Refreshing..." : ""}
                  </span>
                </div>

                {/* SENSOR GRID */}
                <div
                  className={`grid grid-cols-1 gap-5 rounded-2xl border border-slate-100 bg-white/60 p-1 transition-all duration-700 ease-out sm:grid-cols-2 xl:grid-cols-3 ${
                    snapshotAnimating
                      ? "scale-[0.985] translate-y-0.5 opacity-75 shadow-inner"
                      : "scale-100 translate-y-0 opacity-100 shadow-sm"
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
              </div>
            </div>
          )}

          {latestRow && (
            <div className="mx-auto max-w-6xl px-4">
              <div
                className={`rounded-2xl border p-6 shadow-sm ${heroStyles.shell}`}
              >
                {/* Header */}
                <div className="text-center">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-1.5 text-sm font-semibold text-indigo-700">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" />
                    AI Decision Support (7-Day Analysis)
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {loadingAIDecision ? (
                      <>
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700">
                          Generating class...
                        </span>

                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700">
                          Generating risk...
                        </span>

                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700">
                          Generating confidence...
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${getClassBadgeClass(
                            latestAssessment.className,
                          )}`}
                        >
                          Class {latestAssessment.className}
                        </span>

                        <span
                          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${getRiskBadgeClass(
                            activeRiskLevel,
                          )}`}
                        >
                          {activeRiskLevel} Risk
                        </span>

                        <span
                          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${getConfidenceBadgeClass(
                            confidencePercentage,
                          )}`}
                        >
                          Confidence {confidencePercentage}%
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Overview */}
                <div className="mt-8 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50 p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
                    AI 7-Day Interpretation
                  </p>

                  <p className="mt-3 text-sm leading-8 text-gray-700 md:text-base">
                    {loadingAIDecision
                      ? "Generating AI decision support..."
                      : loadingAIHistory
                      ? "Analyzing historical river condition..."
                      : aiDecision?.executiveSummary ||
                        buildCombinedHistoricalSummary(
                          aiHistoricalSummary,
                          latestAssessment,
                        )}
                  </p>
                </div>

                {/* Cards */}
                <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <HeroMetricCard
                    title="Likely Main Contributors"
                    value={
                      loadingAIDecision
                        ? "Generating contributor summary..."
                        : aiDecision?.mainContributorSummary || likelyContributor
                    }
                    hint={`Dominant parameters over the last ${AI_WINDOW_DAYS} days`}
                  />

                  <HeroMetricCard
                    title="Predicted Source of Pollution"
                    value={
                      loadingAIDecision
                        ? "Generating source hypothesis..."
                        : aiDecision?.predictedSourceOfPollution ||
                          aiHistoricalSummary.primarySource?.source ||
                          "Potential mixed-source pollution"
                    }
                    hint="Historical pollution source hypothesis"
                  />

                  <HeroMetricCard
                    title="Recommended Action"
                    value={
                      loadingAIDecision
                        ? "Generating recommended action..."
                        : aiDecision?.recommendedAction ||
                          buildRecommendedActionFallback(aiHistoricalSummary)
                    }
                    hint={`Primary response based on the ${AI_WINDOW_DAYS}-day pattern`}
                  />
                </div>

                {/* Button */}
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={handleGetMoreAIInsight}
                    disabled={aiWindowRows.length === 0 || loadingAIHistory}
                    className="w-full max-w-xl rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Get More AI Insight
                  </button>
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
                    AI decision uses the last {AI_WINDOW_DAYS} days, graphs
                    remain available for supporting interpretation
                  </p>
                </div>

                <button
                  onClick={() => setShowVisualization((prev) => !prev)}
                  className="rounded-lg border px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  {showVisualization
                    ? "Hide Visualization"
                    : "Show Visualization"}
                </button>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SmallInfoPanel
                  title={`${AI_WINDOW_DAYS}-Day Trend Highlights`}
                  items={
                    keyTrendItems.length > 0
                      ? keyTrendItems.map(
                          (item) =>
                            `${item.label}: ${item.direction}, avg ${formatMetric(
                              item.average,
                              item.unit,
                            )}, latest ${formatMetric(item.latest, item.unit)}`,
                        )
                      : [
                          `No significant ${AI_WINDOW_DAYS}-day trend shift detected.`,
                        ]
                  }
                />

                <SmallInfoPanel
                  title="Parameter Comparison"
                  items={[
                    `Likely contributor: ${likelyContributor}`,
                    `Risk level: ${activeRiskLevel}`,
                    `Predicted source: ${
                      aiDecision?.predictedSourceOfPollution ||
                      aiHistoricalSummary.primarySource?.source ||
                      "Potential mixed-source pollution"
                    }`,
                  ]}
                />

                <SmallInfoPanel
                  title="Threshold Exceedance Indicators"
                  items={
                    exceedanceIndicators.length > 0
                      ? exceedanceIndicators.map(
                          (item: any) =>
                            `${item.label}: Class ${item.className}`,
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
          decision={aiDecision}
          fallbackSource={
            aiDecision?.predictedSourceOfPollution ||
            aiHistoricalSummary.primarySource?.source ||
            "Potential mixed-source pollution"
          }
          fallbackClass={`Class ${latestAssessment.className}`}
          historicalSummary={aiHistoricalSummary}
          windowDays={AI_WINDOW_DAYS}
        />
      )}
    </>
  );
}



function buildQuickInsightFallback(
  aiInsight: any,
  assessment: OverallAssessment,
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

function deriveRiskLevelFromClass(className: OverallNWQSClass) {
  switch (className) {
    case "I":
    case "II":
      return "Low";
    case "III":
      return "Moderate";
    case "IV":
      return "High";
    case "V":
      return "Critical";
    default:
      return "Moderate";
  }
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

  const finalClass = worstDriver.className as Exclude<OverallNWQSClass, "N/A">;
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

function formatMetric(value: number | null, unit?: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) {
    return (arr[mid - 1] + arr[mid]) / 2;
  }
  return arr[mid];
}

function min(values: number[]) {
  if (values.length === 0) return null;
  return Math.min(...values);
}

function max(values: number[]) {
  if (values.length === 0) return null;
  return Math.max(...values);
}

function getDirection(
  first: number | null,
  last: number | null,
  series: number[],
) {
  if (series.length < 3 || first === null || last === null) return "stable";

  const spread = (max(series) || 0) - (min(series) || 0);
  const delta = last - first;
  const pctBase = Math.abs(first) < 0.001 ? 1 : Math.abs(first);
  const changePct = (delta / pctBase) * 100;

  if (
    spread > 0 &&
    Math.abs(changePct) < 5 &&
    spread / Math.max(1, Math.abs(mean(series) || 1)) > 0.35
  ) {
    return "fluctuating";
  }

  if (changePct > 5) return "increasing";
  if (changePct < -5) return "decreasing";
  return "stable";
}

function getThresholdClass(
  sensorKey: string,
  value: number | null,
): OverallNWQSClass {
  switch (sensorKey) {
    case "BOD_Sensor":
      return getClassFromBOD(value);
    case "COD_Sensor":
      return getClassFromCOD(value);
    case "DO_Sensor":
      return getClassFromDO(value);
    case "pH_Sensor":
      return getClassFromPH(value);
    case "NH_Sensor":
      return getClassFromNH3N(convertNH3ToNH3N(value));
    default:
      if (value === null) return "N/A";
      return "II";
  }
}

function getLikelyImpact(
  sensorKey: string,
  direction: string,
  avg: number | null,
) {
  switch (sensorKey) {
    case "BOD_Sensor":
      return direction === "increasing"
        ? "Organic load is increasing and may elevate oxygen demand."
        : "Organic load remains a contributor to water stress.";
    case "COD_Sensor":
      return direction === "increasing"
        ? "Chemical or oxidizable pollution pressure is increasing."
        : "COD indicates persistent oxidizable pollutant load.";
    case "NH_Sensor":
      return direction === "increasing"
        ? "Ammonia accumulation suggests wastewater or agricultural influence."
        : "Ammonia remains an important toxicity-related parameter.";
    case "DO_Sensor":
      return avg !== null && avg < 3
        ? "Low dissolved oxygen suggests ecological stress and organic pollution."
        : "DO variation indicates changing oxygen balance in the river.";
    case "Tr_Sensor":
      return "Turbidity indicates runoff, erosion, or suspended solids input.";
    case "CT_Sensor":
      return "Conductivity may reflect dissolved ions and possible effluent input.";
    case "TDS_Sensor":
      return "TDS indicates elevated dissolved solids concentration.";
    case "pH_Sensor":
      return "pH shift suggests chemical imbalance affecting aquatic suitability.";
    case "ORP_Sensor":
      return "ORP change reflects shifts in oxidation-reduction conditions.";
    default:
      return "This parameter contributes to overall water quality behaviour.";
  }
}

function buildDriverSummary(rows: RowData[], sensorKey: string): DriverSummary {
  const meta = SENSOR_META[sensorKey];
  const numericSeries = rows
    .map((row) => toNullableNumber(row[sensorKey]))
    .filter((v): v is number => v !== null);

  const first = numericSeries.length ? numericSeries[0] : null;
  const latest = numericSeries.length
    ? numericSeries[numericSeries.length - 1]
    : null;
  const average = mean(numericSeries);
  const minimum = min(numericSeries);
  const maximum = max(numericSeries);
  const med = median(numericSeries);
  const direction = getDirection(first, latest, numericSeries);

  const changePct =
    first !== null && latest !== null && Math.abs(first) > 0.0001
      ? ((latest - first) / Math.abs(first)) * 100
      : first === 0 && latest !== null
        ? latest * 100
        : null;

  const exceedanceCount = numericSeries.filter((value) => {
    const className = getThresholdClass(sensorKey, value);
    return className === "IV" || className === "V";
  }).length;

  const exceedanceRate =
    numericSeries.length > 0
      ? Math.round((exceedanceCount / numericSeries.length) * 100)
      : 0;

  const severityBase =
    Math.abs(changePct || 0) * 0.15 +
    exceedanceRate * 0.7 +
    ((maximum || 0) > 0 ? Math.min((maximum || 0) * 0.05, 25) : 0);

  let classPenalty = 0;
  if (sensorKey === "BOD_Sensor") {
    classPenalty = classSeverity(getClassFromBOD(latest)) * 12;
  } else if (sensorKey === "COD_Sensor") {
    classPenalty = classSeverity(getClassFromCOD(latest)) * 12;
  } else if (sensorKey === "DO_Sensor") {
    classPenalty = classSeverity(getClassFromDO(latest)) * 12;
  } else if (sensorKey === "NH_Sensor") {
    classPenalty =
      classSeverity(getClassFromNH3N(convertNH3ToNH3N(latest))) * 12;
  } else if (sensorKey === "pH_Sensor") {
    classPenalty = classSeverity(getClassFromPH(latest)) * 10;
  } else {
    classPenalty = exceedanceRate * 0.25;
  }

  const severityScore = Number(
    (severityBase + classPenalty) * meta.severityWeight,
  );

  return {
    key: sensorKey,
    label: meta.shortLabel,
    unit: meta.unit,
    latest,
    average,
    minimum,
    maximum,
    median: med,
    changePct,
    exceedanceCount,
    exceedanceRate,
    severityScore,
    direction,
    likelyImpact: getLikelyImpact(sensorKey, direction, average),
  };
}

function inferSourceHypotheses(
  topDrivers: DriverSummary[],
  latestRow: RowData | null,
) {
  const getDriver = (key: string) => topDrivers.find((d) => d.key === key);

  const bod = getDriver("BOD_Sensor");
  const cod = getDriver("COD_Sensor");
  const nh = getDriver("NH_Sensor");
  const tr = getDriver("Tr_Sensor");
  const ct = getDriver("CT_Sensor");
  const tds = getDriver("TDS_Sensor");
  const ph = getDriver("pH_Sensor");
  const doVal = getDriver("DO_Sensor");

  const hypotheses: SourceHypothesis[] = [];

  if (
    bod &&
    bod.severityScore > 35 &&
    nh &&
    nh.severityScore > 35 &&
    doVal &&
    (doVal.latest ?? 99) < 4
  ) {
    hypotheses.push({
      source: "Domestic wastewater or sewage discharge",
      confidence: 88,
      reason:
        "Elevated BOD and ammonia combined with low dissolved oxygen during the analysis window strongly suggest untreated or partially treated wastewater input.",
    });
  }

  if (
    cod &&
    cod.severityScore > 35 &&
    ((ct && ct.severityScore > 25) || (ph && ph.exceedanceRate > 20))
  ) {
    hypotheses.push({
      source: "Industrial or chemical discharge",
      confidence: 84,
      reason:
        "Persistent COD stress together with conductivity or pH abnormality suggests the presence of chemical or industrial effluent influence.",
    });
  }

  if (
    tr &&
    tr.severityScore > 28 &&
    ((tds && tds.severityScore > 18) ||
      (latestRow && (toNullableNumber(latestRow.Tr_Sensor) || 0) > 100))
  ) {
    hypotheses.push({
      source: "Sediment runoff, erosion, or land disturbance",
      confidence: 80,
      reason:
        "High and fluctuating turbidity suggests suspended solids input from runoff, erosion, or disturbed riverbank activity.",
    });
  }

  if (
    nh &&
    nh.severityScore > 30 &&
    !(cod && cod.severityScore > 35) &&
    !(ct && ct.severityScore > 25)
  ) {
    hypotheses.push({
      source: "Agricultural runoff or livestock-related pollution",
      confidence: 77,
      reason:
        "Ammonia pressure without equally dominant chemical conductivity signals may indicate nutrient-rich runoff from agriculture or livestock areas.",
    });
  }

  if (hypotheses.length === 0) {
    hypotheses.push({
      source: "Mixed-source pollution requiring field verification",
      confidence: 68,
      reason:
        "The recent pattern shows combined stress across several parameters, but the signal is not specific enough to isolate a single dominant source.",
    });
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function buildHistoricalSummary(
  rows: RowData[],
  latestRow: RowData | null,
  assessment: OverallAssessment,
) {
  const validRows = rows.filter(Boolean);
  const topDrivers = SENSOR_KEYS.map((key) =>
    buildDriverSummary(validRows, key),
  )
    .sort((a, b) => b.severityScore - a.severityScore)
    .slice(0, 5);

  const sourceHypotheses = inferSourceHypotheses(topDrivers, latestRow);
  const primarySource = sourceHypotheses[0] || null;

  const anomalyNotes = topDrivers.slice(0, 4).map((driver) => {
    const trendText =
      driver.changePct !== null
        ? `${driver.changePct >= 0 ? "+" : ""}${driver.changePct.toFixed(1)}%`
        : "insufficient trend data";

    return `${driver.label} shows ${driver.direction} behaviour with avg ${formatMetric(
      driver.average,
      driver.unit,
    )}, latest ${formatMetric(driver.latest, driver.unit)}, max ${formatMetric(
      driver.maximum,
      driver.unit,
    )}, exceedance rate ${driver.exceedanceRate}%, trend ${trendText}.`;
  });

  const confidenceScore = Math.min(
    97,
    Math.max(
      62,
      Math.round(
        62 +
          topDrivers
            .slice(0, 3)
            .reduce((sum, driver) => sum + driver.exceedanceRate * 0.18, 0) +
          (validRows.length >= 100
            ? 8
            : validRows.length >= 50
              ? 6
              : validRows.length >= 20
                ? 4
                : 2),
      ),
    ),
  );

  const pollutedDrivers = topDrivers
    .filter(
      (driver) => driver.exceedanceRate >= 20 || driver.severityScore >= 30,
    )
    .map((driver) => driver.label);

  const classLabel =
    assessment.className === "N/A"
      ? "Unclassified"
      : `Class ${assessment.className}`;

  return {
    recordCount: validRows.length,
    windowLabel: `Last ${AI_WINDOW_DAYS} days`,
    classLabel,
    topDrivers,
    sourceHypotheses,
    primarySource,
    anomalyNotes,
    pollutedDrivers,
    confidenceScore,
  };
}

function buildMainContributorSummary(drivers: DriverSummary[]) {
  if (!drivers.length) return "No dominant parameter identified.";
  return drivers
    .slice(0, 3)
    .map(
      (driver) =>
        `${driver.label} (avg ${formatMetric(driver.average, driver.unit)}, latest ${formatMetric(
          driver.latest,
          driver.unit,
        )})`,
    )
    .join("; ");
}



function buildCombinedHistoricalSummary(
  summary: any,
  assessment: OverallAssessment,
) {
  if (!summary?.topDrivers?.length) {
    return `The ${AI_WINDOW_DAYS}-day historical analysis is still waiting for enough valid data points.`;
  }

  const top = summary.topDrivers[0];
  const second = summary.topDrivers[1];
  const third = summary.topDrivers[2];
  const source = summary.primarySource?.source || "mixed-source pollution";

  const firstSentence = `Over the last ${AI_WINDOW_DAYS} days, the river condition is assessed as ${assessment.status.toLowerCase()} (${
    assessment.className === "N/A"
      ? "unclassified"
      : `Class ${assessment.className}`
  }), mainly driven by ${top.label}${second ? ` and ${second.label}` : ""}.`;

  const secondSentence = `${top.label} recorded an average of ${formatMetric(
    top.average,
    top.unit,
  )}, latest value ${formatMetric(top.latest, top.unit)}, and exceedance rate ${
    top.exceedanceRate
  }%, indicating persistent short-term pressure rather than a one-time spike.`;

  const thirdSentence = `The broader pattern suggests ${source.toLowerCase()}, so the result should be interpreted as a ${AI_WINDOW_DAYS}-day historical decision rather than a single-snapshot judgement.`;

  const fourthSentence = `${top.label} was the strongest driver with an average of ${formatMetric(
    top.average,
    top.unit,
  )}, latest value ${formatMetric(top.latest, top.unit)}, and exceedance rate ${
    top.exceedanceRate
  }%.`;

  const fifthSentence = second
    ? `${second.label} also remained influential with ${second.direction} movement and a maximum of ${formatMetric(
        second.maximum,
        second.unit,
      )}.`
    : "";

  const sixthSentence = third
    ? `${third.label} added supporting pressure with ${third.exceedanceRate}% exceedance occurrence during the analysis window.`
    : "";

  return [
    firstSentence,
    secondSentence,
    thirdSentence,
    fourthSentence,
    fifthSentence,
    sixthSentence,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildRecommendedActionFallback(summary: any) {
  const top = summary?.topDrivers?.[0];
  const source = summary?.primarySource?.source || "";

  if (!top) return "Continue routine monitoring and verify field conditions.";

  if (source.toLowerCase().includes("industrial")) {
    return "Increase monitoring frequency and inspect possible industrial or chemical discharge points upstream.";
  }

  if (
    source.toLowerCase().includes("wastewater") ||
    source.toLowerCase().includes("sewage")
  ) {
    return "Increase monitoring frequency, inspect sewage or domestic discharge sources, and verify ammonia and BOD hotspots.";
  }

  if (source.toLowerCase().includes("sediment")) {
    return "Check runoff pathways, erosion-prone zones, and recent land disturbance contributing to turbidity.";
  }

  if (source.toLowerCase().includes("agricultural")) {
    return "Inspect nearby agricultural or livestock runoff pathways and validate ammonia-related loading.";
  }

  if (top.key === "DO_Sensor") {
    return "Prioritise oxygen-stress verification in the field and inspect for organic pollution buildup.";
  }

  return `Increase monitoring frequency and investigate the dominant parameter drivers identified during the last ${AI_WINDOW_DAYS} days.`;
}

function buildRecommendationListFallback(summary: any) {
  const topDrivers: DriverSummary[] = summary?.topDrivers || [];

  const base = [
    "Increase monitoring frequency for the affected river section.",
    "Validate dominant sensor anomalies with field inspection.",
    "Review recent upstream discharge or runoff activity.",
  ];

  if (topDrivers.some((d) => d.key === "NH_Sensor")) {
    base.push(
      "Prioritise ammonia source tracing near settlements, farms, or livestock areas.",
    );
  }

  if (topDrivers.some((d) => d.key === "COD_Sensor")) {
    base.push(
      "Check for chemical or industrial pollution signatures related to COD pressure.",
    );
  }

  if (topDrivers.some((d) => d.key === "Tr_Sensor")) {
    base.push(
      "Assess sediment input, stormwater runoff, and land disturbance near the catchment.",
    );
  }

  return base.slice(0, 5);
}

function buildPredictionDetail(summary: any, assessment: OverallAssessment) {
  const top = summary?.topDrivers?.[0];
  const second = summary?.topDrivers?.[1];

  if (!top) {
    return `There is not enough ${AI_WINDOW_DAYS}-day historical data to build a stronger prediction narrative.`;
  }

  return `The AI prediction is based on the historical behaviour of the last ${AI_WINDOW_DAYS} days, using one representative record per hour instead of all raw readings. The current condition is interpreted as ${
    assessment.className === "N/A"
      ? "an unclassified state"
      : `Class ${assessment.className}`
  }, because ${top.label} remained the dominant pressure parameter with an average of ${formatMetric(
    top.average,
    top.unit,
  )}, latest value ${formatMetric(top.latest, top.unit)}, maximum ${formatMetric(
    top.maximum,
    top.unit,
  )}, and exceedance rate ${top.exceedanceRate}%. ${
    second
      ? `${second.label} also contributed with ${second.direction} movement and exceedance rate ${second.exceedanceRate}%.`
      : ""
  } This means the prediction reflects sustained river stress across the recent monitoring window rather than a temporary fluctuation.`;
}

function buildSourceDetail(summary: any) {
  const sources: SourceHypothesis[] = summary?.sourceHypotheses || [];
  if (!sources.length) {
    return `No specific source hypothesis could be formed from the available ${AI_WINDOW_DAYS}-day pattern.`;
  }

  return sources
    .map(
      (source, index) =>
        `${index + 1}. ${source.source} (${source.confidence}% confidence): ${source.reason}`,
    )
    .join(" ");
}


function buildRecommendationDetail(summary: any) {
  const recommendation = buildRecommendedActionFallback(summary);
  const followUps = buildRecommendationListFallback(summary);

  return `${recommendation} Supporting follow-up actions include: ${followUps.join(
    " ",
  )}`;
}

function buildDriverNarrative(summary: any) {
  const drivers: DriverSummary[] = summary?.topDrivers || [];
  if (!drivers.length) {
    return "No dominant driver pattern could be summarised.";
  }

  return drivers
    .slice(0, 4)
    .map(
      (driver) =>
        `${driver.label} influenced the assessment through ${driver.direction} behaviour, average ${formatMetric(
          driver.average,
          driver.unit,
        )}, latest ${formatMetric(driver.latest, driver.unit)}, and ${driver.exceedanceRate}% threshold exceedance. ${driver.likelyImpact}`,
    )
    .join(" ");
}

function buildAnomalyNarrative(summary: any) {
  const notes: string[] = summary?.anomalyNotes || [];
  if (!notes.length) {
    return `No major anomaly note was generated from the ${AI_WINDOW_DAYS}-day dataset.`;
  }
  return notes.join(" ");
}

function buildMonthlyPatternNarrative(summary: any) {
  const source = summary?.primarySource;
  const pollutedDrivers = summary?.pollutedDrivers || [];

  return `Across the ${AI_WINDOW_DAYS}-day window, the pattern suggests repeated stress from ${
    pollutedDrivers.length ? pollutedDrivers.join(", ") : "multiple parameters"
  }. ${
    source
      ? `The strongest pollution hypothesis is ${source.source.toLowerCase()} because ${source.reason}`
      : "No single pollution source dominates the recent pattern."
  }`;
}

function buildModalOverallNarrative(
  summary: any,
  assessment: OverallAssessment,
) {
  return `This expanded AI insight explains the water quality decision using the last ${AI_WINDOW_DAYS} days of historical data, with one representative reading per hour. The current assessment is ${
    assessment.className === "N/A"
      ? "not fully classifiable"
      : `Class ${assessment.className}`
  }, and the explanation is grounded in repeated parameter behaviour, numeric evidence, exceedance frequency, and the most plausible pollution-source hypothesis.`;
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
    <div className="flex min-h-[210px] flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-500">
          {title}
        </p>
        <p className="text-sm font-semibold leading-7 text-gray-900">{value}</p>
      </div>

      {hint && <p className="mt-4 text-xs text-gray-500">{hint}</p>}
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
  const numericValue = Number(value);
  const isInactive =
    value !== null && value !== undefined && value !== "" &&
    Number.isFinite(numericValue) &&
    numericValue === 0;
  const outOfRange = !isInactive && isValueOutOfPhysicalRange(sensorKey, value);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      {/* top accent */}
      <div
        className={`absolute inset-x-0 top-0 h-1 opacity-80 ${
          isInactive
            ? "bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600"
            : outOfRange
            ? "bg-gradient-to-r from-amber-500 via-orange-500 to-red-500"
            : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
        }`}
      />

      <div className="flex items-start justify-between gap-3">
        <p className="pr-3 text-sm font-medium leading-6 text-slate-600">
          {meta.label}
        </p>

        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {meta.shortLabel}
        </span>
      </div>

      <div className="mt-8 flex items-end gap-2">
        <p className="text-4xl font-bold tracking-tight text-slate-900">
          <span
            className={
              isInactive
                ? "text-slate-400"
                : outOfRange
                ? "text-red-600"
                : "text-slate-900"
            }
          >
            {isInactive ? "Inactive" : roundValue(value)}
          </span>
        </p>

        {!isInactive && meta.unit ? (
          <span className="pb-1 text-sm font-medium text-slate-500">
            {meta.unit}
          </span>
        ) : null}

        {outOfRange && (
          <span className="mb-1 inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-700">
            Out of Range
          </span>
        )}
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
  decision,
  fallbackSource,
  fallbackClass,
  historicalSummary,
}: {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  data: DetailedInsightResponse | null;
  riskLevel: string;
  decision: AIDecisionResponse | null;
  fallbackSource: string;
  fallbackClass: string;
  historicalSummary: any;
  windowDays: number;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-hidden rounded-3xl border bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b bg-gradient-to-r from-indigo-50 to-white px-6 py-5">
            <div>
              <h3 className="text-2xl font-semibold text-gray-900">
                More AI Insight
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Focused 7-day interpretation of the main abnormal parameters,
                likely pollution source, and operational follow-up
              </p>
            </div>

            <button
              onClick={onClose}
              className="h-10 w-10 rounded-full border text-lg text-gray-500 hover:bg-gray-50"
            >
              ×
            </button>
          </div>

          <div className="max-h-[calc(100dvh-9.5rem)] overflow-y-auto px-6 py-6">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                <p className="text-base font-medium text-gray-800">
                  Generating AI insight...
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Summarising the most important 7-day evidence
                </p>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-5">
                <div className="rounded-2xl border bg-gray-50 p-5">
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                    Overall Narrative
                  </p>
                  <p className="text-sm leading-7 text-gray-700">
                    {data?.overallNarrative ||
                      `This section summarises the strongest 7-day pollution evidence, the likely source hypothesis, and the operational response needed.`}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ExpandedDecisionCard
                    title={
                      data?.predictionTitle || "7-Day Water Quality Summary"
                    }
                    headline={
                      decision?.currentWaterQualityStatus || fallbackClass
                    }
                    description={
                      data?.predictionDetail ||
                      "This section explains the main abnormal parameter evidence."
                    }
                  />

                  <ExpandedDecisionCard
                    title={data?.sourceTitle || "Likely Pollution Source"}
                    headline={
                      decision?.predictedSourceOfPollution || fallbackSource
                    }
                    description={
                      data?.sourceDetail ||
                      "This section explains the most likely pollution source hypothesis."
                    }
                  />
                </div>

                <ExpandedDecisionCard
                  title={data?.recommendationTitle || "Recommended Follow-up"}
                  headline={
                    decision?.recommendedAction ||
                    "Increase monitoring frequency and inspect the suspected upstream source."
                  }
                  description={
                    data?.recommendationDetail ||
                    "This section explains the immediate operational response."
                  }
                  fullWidth
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <CompactInfoCard
                    title="Main Parameter Evidence"
                    content={
                      data?.driverNarrative ||
                      "This section summarises the strongest parameter evidence."
                    }
                  />

                  <CompactInfoCard
                    title="7-Day Pattern"
                    content={
                      data?.monthlyPatternNarrative ||
                      "This section explains the short-term pattern across the 7-day window."
                    }
                  />

                  <CompactInfoCard
                    title="Key Anomalies"
                    content={
                      data?.anomalyNarrative ||
                      "This section explains the main anomalies affecting the river condition."
                    }
                  />
                </div>

                {historicalSummary?.topDrivers?.length > 0 && (
                  <div className="rounded-2xl border bg-white p-5">
                    <p className="mb-4 text-xs uppercase tracking-wide text-gray-500">
                      Parameter Evidence
                    </p>

                    <div className="overflow-x-auto rounded-2xl border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                              Parameter
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                              Avg
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                              Latest
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                              Max
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                              Trend
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">
                              Exceedance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalSummary.topDrivers
                            .slice(0, 5)
                            .map((driver: DriverSummary) => (
                              <tr key={driver.key} className="border-t">
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {driver.label}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatMetric(driver.average, driver.unit)}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatMetric(driver.latest, driver.unit)}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatMetric(driver.maximum, driver.unit)}
                                </td>
                                <td className="px-4 py-3 text-gray-700 capitalize">
                                  {driver.direction || "-"}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {driver.exceedanceRate ?? 0}%
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {historicalSummary?.sourceHypotheses?.length > 0 && (
                  <div className="rounded-2xl border bg-white p-5">
                    <p className="mb-4 text-xs uppercase tracking-wide text-gray-500">
                      Source Hypotheses
                    </p>

                    <div className="space-y-3">
                      {historicalSummary.sourceHypotheses
                        .slice(0, 2)
                        .map((item: SourceHypothesis, idx: number) => (
                          <div
                            key={idx}
                            className="rounded-xl border bg-gray-50 p-4"
                          >
                            <p className="font-semibold text-gray-900">
                              {item.source}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-gray-700">
                              {item.reason}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
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
  fullWidth = false,
}: {
  title: string;
  headline: string;
  description: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${fullWidth ? "w-full" : ""}`}
    >
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
function CompactInfoCard({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <p className="text-sm leading-7 text-gray-700">{content}</p>
    </div>
  );
}


