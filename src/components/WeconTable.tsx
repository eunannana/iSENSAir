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
  periodOverview?: string;
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
  interpretationTitle?: string;
  interpretationDetail?: string;
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
    label: "Turbidity (TR)",
    shortLabel: "TR",
    unit: "mg/L",
    min: 0,
    max: 10000,
    severityWeight: 0.95,
  },
  BOD_Sensor: {
    label: "Biochemical Oxygen Demand (BOD)",
    shortLabel: "BOD",
    unit: "mg/L",
    min: 0,
    max: 1000,
    severityWeight: 1.35,
  },
  DO_Sensor: {
    label: "Dissolved Oxygen (DO)",
    shortLabel: "DO",
    unit: "mg/L",
    min: 0,
    max: 20,
    severityWeight: 1.4,
  },
  COD_Sensor: {
    label: "Chemical Oxygen Demand (COD)",
    shortLabel: "COD",
    unit: "mg/L",
    min: 0,
    max: 2000,
    severityWeight: 1.3,
  },
  NH_Sensor: {
    label: "Ammonia (NH3)",
    shortLabel: "NH3",
    unit: "mg/L",
    min: 0,
    max: 1000,
    severityWeight: 1.45,
  },
  TDS_Sensor: {
    label: "Total Dissolved Solids (TDS)",
    shortLabel: "TDS",
    unit: "mg/L",
    min: 0,
    max: 100000,
    severityWeight: 0.8,
  },
  CT_Sensor: {
    label: "Conductivity (CT)",
    shortLabel: "CT",
    unit: "µS/cm",
    min: 0,
    max: 200000,
    severityWeight: 0.85,
  },
  ORP_Sensor: {
    label: "Oxidation Reduction Potential (ORP)",
    shortLabel: "ORP",
    unit: "mV",
    min: -2000,
    max: 2000,
    severityWeight: 0.75,
  },
  pH_Sensor: {
    label: "Potential of Hydrogen (pH)",
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
    description:
      "Does not fall under the beneficial uses of Classes I to IV.",
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

  async function fetchThirtyDayAIHistory(endDate: string) {
    const startDate = shiftDate(endDate, -29);

    setLoadingAIHistory(true);
    try {
      const json = await fetchDataByDateRange(area, startDate, endDate);
      const arr = Array.isArray(json) ? json : [];
      setAIHistoryRows(arr);
    } catch (error) {
      console.error("Failed to load 30-day AI history:", error);
      setAIHistoryRows([]);
    } finally {
      setLoadingAIHistory(false);
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
    historyRowsParam: any[],
    assessmentParam: OverallAssessment,
    historicalSummaryParam: any
  ) {
    if (!latestRowParam || historyRowsParam.length === 0) return;

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
          mode: "historical_decision_30d",
          latestRow: latestRowParam,
          rows: historyRowsParam.slice(0, 500),
          historicalWindowDays: 30,
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
        title: result?.title || "30-Day AI Decision Support",
        historicalWindowLabel:
          result?.historicalWindowLabel ||
          historicalSummaryParam?.windowLabel ||
          "Last 30 days",
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
          buildHistoricalExecutiveSummary(historicalSummaryParam, assessmentParam),
        periodOverview:
          result?.periodOverview ||
          buildPeriodOverview(historicalSummaryParam),
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
          "This source hypothesis is based on the 30-day parameter pattern.",
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
        error?.message || "Failed to generate AI decision panel."
      );

      setAIDecision({
        title: "30-Day AI Decision Support",
        historicalWindowLabel: historicalSummaryParam.windowLabel,
        currentWaterQualityStatus: `Class ${assessmentParam.className}`,
        pollutionRiskLevel: deriveRiskLevelFromClass(assessmentParam.className),
        confidenceScore: historicalSummaryParam.confidenceScore,
        executiveSummary: buildHistoricalExecutiveSummary(
          historicalSummaryParam,
          assessmentParam
        ),
        periodOverview: buildPeriodOverview(historicalSummaryParam),
        recommendedAction: buildRecommendedActionFallback(historicalSummaryParam),
        recommendations: buildRecommendationListFallback(historicalSummaryParam),
        predictedSourceOfPollution:
          historicalSummaryParam.primarySource?.source ||
          "Potential mixed-source pollution",
        sourceRationale:
          historicalSummaryParam.primarySource?.reason ||
          "This source hypothesis is based on the 30-day parameter pattern.",
        mainContributorSummary: buildMainContributorSummary(
          historicalSummaryParam.topDrivers
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
    if (!latestRow || aiThirtyDayRows.length === 0) return;

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
          mode: "expanded_historical_decision_detail",
          latestRow,
          rows: aiThirtyDayRows.slice(0, 500),
          aiDecision,
          historicalWindowDays: 30,
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
          result?.error || "Failed to generate expanded AI insight."
        );
      }

      setDetailedInsight({
        overallNarrative:
          result?.overallNarrative ||
          buildModalOverallNarrative(aiHistoricalSummary, latestAssessment),
        predictionTitle: result?.predictionTitle || "30-Day AI Prediction",
        predictionDetail:
          result?.predictionDetail ||
          buildPredictionDetail(aiHistoricalSummary, latestAssessment),
        interpretationTitle:
          result?.interpretationTitle || "Historical AI Interpretation",
        interpretationDetail:
          result?.interpretationDetail ||
          buildInterpretationDetail(aiHistoricalSummary, latestAssessment),
        sourceTitle:
          result?.sourceTitle || "Predicted Source of Pollution",
        sourceDetail:
          result?.sourceDetail || buildSourceDetail(aiHistoricalSummary),
        confidenceTitle: result?.confidenceTitle || "AI Confidence",
        confidenceDetail:
          result?.confidenceDetail || buildConfidenceDetail(aiHistoricalSummary),
        recommendationTitle:
          result?.recommendationTitle || "AI Recommendation",
        recommendationDetail:
          result?.recommendationDetail ||
          buildRecommendationDetail(aiHistoricalSummary),
        driverNarrative:
          result?.driverNarrative || buildDriverNarrative(aiHistoricalSummary),
        anomalyNarrative:
          result?.anomalyNarrative || buildAnomalyNarrative(aiHistoricalSummary),
        monthlyPatternNarrative:
          result?.monthlyPatternNarrative ||
          buildMonthlyPatternNarrative(aiHistoricalSummary),
      });
    } catch (error: any) {
      setDetailedInsightError(
        error?.message || "Failed to generate more detailed AI insight."
      );
      setDetailedInsight({
        overallNarrative: buildModalOverallNarrative(
          aiHistoricalSummary,
          latestAssessment
        ),
        predictionTitle: "30-Day AI Prediction",
        predictionDetail: buildPredictionDetail(
          aiHistoricalSummary,
          latestAssessment
        ),
        interpretationTitle: "Historical AI Interpretation",
        interpretationDetail: buildInterpretationDetail(
          aiHistoricalSummary,
          latestAssessment
        ),
        sourceTitle: "Predicted Source of Pollution",
        sourceDetail: buildSourceDetail(aiHistoricalSummary),
        confidenceTitle: "AI Confidence",
        confidenceDetail: buildConfidenceDetail(aiHistoricalSummary),
        recommendationTitle: "AI Recommendation",
        recommendationDetail: buildRecommendationDetail(aiHistoricalSummary),
        driverNarrative: buildDriverNarrative(aiHistoricalSummary),
        anomalyNarrative: buildAnomalyNarrative(aiHistoricalSummary),
        monthlyPatternNarrative: buildMonthlyPatternNarrative(aiHistoricalSummary),
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
        await Promise.all([
          fetchHistorical(today, today),
          fetchLatestSnapshot(),
          fetchThirtyDayAIHistory(today),
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
      const today = getTodayInMalaysia();
      fetchThirtyDayAIHistory(today);
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

  const aiThirtyDayRows = useMemo(() => {
    const filtered = [...aiHistoryRows].filter(hasValidSensorData);

    return filtered.sort(
      (a, b) => parseTimestamp(a.Timestamp) - parseTimestamp(b.Timestamp)
    );
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
    if (latestSnapshotRows.length <= 1) {
      setSnapshotRotationIndex(0);
      return;
    }

    const rotateInterval = setInterval(() => {
      setSnapshotRotationIndex(
        (prev) => (prev + 1) % latestSnapshotRows.length
      );
    }, 300000);

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

  const latestAssessment = useMemo(() => {
    return assessOverallWaterQuality(displayedSnapshotRow);
  }, [displayedSnapshotRow]);

  const aiHistoricalSummary = useMemo(() => {
    return buildThirtyDayHistoricalSummary(
      aiThirtyDayRows,
      latestRow,
      latestAssessment
    );
  }, [aiThirtyDayRows, latestRow, latestAssessment]);

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
          item.direction === "fluctuating"
      )
      .slice(0, 5);
  }, [aiHistoricalSummary.topDrivers]);

  const activeRiskLevel =
    aiDecision?.pollutionRiskLevel ||
    deriveRiskLevelFromClass(latestAssessment.className);

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
    if (latestRow && aiThirtyDayRows.length > 0) {
      generateAIDecisionPanel(
        latestRow,
        aiThirtyDayRows,
        latestAssessment,
        aiHistoricalSummary
      );
    }
  }, [latestRow, aiThirtyDayRows, latestAssessment, aiHistoricalSummary]);

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

    if (aiHistoricalSummary?.topDrivers?.length) {
      currentY =
        (pdf as any).lastAutoTable?.finalY !== undefined
          ? (pdf as any).lastAutoTable.finalY + 8
          : 100;

      autoTable(pdf, {
        startY: currentY,
        head: [
          [
            "30-Day Driver",
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
                <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_0.95fr]">
                  <div className="p-6 md:p-8">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-gray-700 backdrop-blur">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${heroStyles.accent}`}
                          />
                          {aiDecision?.title || "30-Day AI Decision Support"}
                        </div>

                        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                          {aiDecision?.currentWaterQualityStatus ||
                            `Class ${latestAssessment.className}`}
                        </h2>

                        <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-600 md:text-base">
                          {loadingAIHistory
                            ? "Preparing 30-day historical analysis..."
                            : aiDecision?.executiveSummary ||
                              buildHistoricalExecutiveSummary(
                                aiHistoricalSummary,
                                latestAssessment
                              )}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-medium text-gray-700">
                            Window:{" "}
                            {aiDecision?.historicalWindowLabel ||
                              aiHistoricalSummary.windowLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-medium text-gray-700">
                            Records: {aiHistoricalSummary.recordCount}
                          </span>
                        </div>
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

                    <div className="mb-4 rounded-2xl border border-white/70 bg-white/75 p-4 backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        30-Day Period Overview
                      </p>
                      <p className="mt-2 text-sm leading-7 text-gray-700">
                        {aiDecision?.periodOverview ||
                          buildPeriodOverview(aiHistoricalSummary)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <HeroMetricCard
                        title="Likely Main Contributors"
                        value={
                          aiDecision?.mainContributorSummary || likelyContributor
                        }
                        hint="Dominant parameters over the last 30 days"
                      />
                      <HeroMetricCard
                        title="Predicted Source of Pollution"
                        value={
                          aiDecision?.predictedSourceOfPollution ||
                          aiHistoricalSummary.primarySource?.source ||
                          "Potential mixed-source pollution"
                        }
                        hint="Historical pollution source hypothesis"
                      />
                      <HeroMetricCard
                        title="Recommended Action"
                        value={
                          aiDecision?.recommendedAction ||
                          buildRecommendedActionFallback(aiHistoricalSummary)
                        }
                        hint="Priority response based on the 30-day pattern"
                      />
                    </div>

                    {aiHistoricalSummary.topDrivers.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-white/70 bg-white/75 p-4 backdrop-blur">
                        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gray-500">
                          Top Parameter Drivers
                        </p>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {aiHistoricalSummary.topDrivers.slice(0, 3).map((driver) => (
                            <DriverImpactCard key={driver.key} driver={driver} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/60 bg-white/70 p-6 backdrop-blur lg:border-l lg:border-t-0">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                          AI Interpretation
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-gray-900">
                          30-Day Decision Summary
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
                          `Class ${latestAssessment.className}`
                        }
                      />
                      <MiniDecisionRow
                        label="Historical AI Interpretation"
                        value={activeRiskLevel}
                      />
                      <MiniDecisionRow
                        label="Analysis Window"
                        value={
                          aiDecision?.historicalWindowLabel ||
                          aiHistoricalSummary.windowLabel
                        }
                      />
                      <MiniDecisionRow
                        label="AI Confidence"
                        value={`${confidencePercentage}%`}
                      />
                      <MiniDecisionRow
                        label="Likely Pollution Source"
                        value={
                          aiDecision?.predictedSourceOfPollution ||
                          aiHistoricalSummary.primarySource?.source ||
                          "Potential mixed-source pollution"
                        }
                      />
                      <MiniDecisionRow
                        label="AI Recommendation"
                        value={
                          aiDecision?.recommendedAction ||
                          buildRecommendedActionFallback(aiHistoricalSummary)
                        }
                      />
                    </div>

                    <button
                      onClick={handleGetMoreAIInsight}
                      disabled={aiThirtyDayRows.length === 0 || loadingAIHistory}
                      className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                    AI decision uses the last 30 days, graphs remain available for
                    supporting interpretation
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
                  title="30-Day Trend Highlights"
                  items={
                    keyTrendItems.length > 0
                      ? keyTrendItems.map(
                          (item) =>
                            `${item.label}: ${item.direction}, avg ${formatMetric(
                              item.average,
                              item.unit
                            )}, latest ${formatMetric(item.latest, item.unit)}`
                        )
                      : ["No significant 30-day trend shift detected."]
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
          fallbackSource={
            aiDecision?.predictedSourceOfPollution ||
            aiHistoricalSummary.primarySource?.source ||
            "Potential mixed-source pollution"
          }
          fallbackClass={`Class ${latestAssessment.className}`}
          historicalSummary={aiHistoricalSummary}
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

function getDirection(first: number | null, last: number | null, series: number[]) {
  if (series.length < 3 || first === null || last === null) return "stable";

  const spread = (max(series) || 0) - (min(series) || 0);
  const delta = last - first;
  const pctBase = Math.abs(first) < 0.001 ? 1 : Math.abs(first);
  const changePct = (delta / pctBase) * 100;

  if (spread > 0 && Math.abs(changePct) < 5 && spread / Math.max(1, Math.abs(mean(series) || 1)) > 0.35) {
    return "fluctuating";
  }

  if (changePct > 5) return "increasing";
  if (changePct < -5) return "decreasing";
  return "stable";
}

function getThresholdClass(sensorKey: string, value: number | null): OverallNWQSClass {
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

function getLikelyImpact(sensorKey: string, direction: string, avg: number | null) {
  switch (sensorKey) {
    case "BOD_Sensor":
      return direction === "increasing"
        ? "Organic load is increasing and may elevate oxygen demand."
        : "Organic load remains a contributor to water stress.";
    case "COD_Sensor":
      return direction === "increasing"
        ? "Chemical/oxidizable pollution pressure is increasing."
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
  const latest = numericSeries.length ? numericSeries[numericSeries.length - 1] : null;
  const average = mean(numericSeries);
  const minimum = min(numericSeries);
  const maximum = max(numericSeries);
  const med = median(numericSeries);
  const direction = getDirection(first, latest, numericSeries);

  const changePct =
    first !== null &&
    latest !== null &&
    Math.abs(first) > 0.0001
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
    (Math.abs(changePct || 0) * 0.15) +
    (exceedanceRate * 0.7) +
    ((maximum || 0) > 0 ? Math.min((maximum || 0) * 0.05, 25) : 0);

  let classPenalty = 0;
  if (sensorKey === "BOD_Sensor") {
    classPenalty = classSeverity(getClassFromBOD(latest)) * 12;
  } else if (sensorKey === "COD_Sensor") {
    classPenalty = classSeverity(getClassFromCOD(latest)) * 12;
  } else if (sensorKey === "DO_Sensor") {
    classPenalty = classSeverity(getClassFromDO(latest)) * 12;
  } else if (sensorKey === "NH_Sensor") {
    classPenalty = classSeverity(getClassFromNH3N(convertNH3ToNH3N(latest))) * 12;
  } else if (sensorKey === "pH_Sensor") {
    classPenalty = classSeverity(getClassFromPH(latest)) * 10;
  } else {
    classPenalty = exceedanceRate * 0.25;
  }

  const severityScore = Number(
    (severityBase + classPenalty) * meta.severityWeight
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

function inferSourceHypotheses(topDrivers: DriverSummary[], latestRow: RowData | null) {
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
    (bod && bod.severityScore > 35) &&
    (nh && nh.severityScore > 35) &&
    (doVal && (doVal.latest ?? 99) < 4)
  ) {
    hypotheses.push({
      source: "Domestic wastewater or sewage discharge",
      confidence: 88,
      reason:
        "Elevated BOD and ammonia combined with low dissolved oxygen over the 30-day window strongly suggest untreated or partially treated wastewater input.",
    });
  }

  if (
    (cod && cod.severityScore > 35) &&
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
    (tr && tr.severityScore > 28) &&
    ((tds && tds.severityScore > 18) || (latestRow && toNullableNumber(latestRow.Tr_Sensor)! > 100))
  ) {
    hypotheses.push({
      source: "Sediment runoff, erosion, or land disturbance",
      confidence: 80,
      reason:
        "High and fluctuating turbidity across the month suggests suspended solids input from runoff, erosion, or disturbed riverbank activity.",
    });
  }

  if (
    (nh && nh.severityScore > 30) &&
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
        "The last 30 days show combined stress across several parameters, but the pattern is not specific enough to isolate a single dominant source.",
    });
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function buildThirtyDayHistoricalSummary(
  rows: RowData[],
  latestRow: RowData | null,
  assessment: OverallAssessment
) {
  const validRows = rows.filter(Boolean);
  const topDrivers = SENSOR_KEYS.map((key) => buildDriverSummary(validRows, key))
    .sort((a, b) => b.severityScore - a.severityScore)
    .slice(0, 5);

  const sourceHypotheses = inferSourceHypotheses(topDrivers, latestRow);
  const primarySource = sourceHypotheses[0] || null;

  const anomalyNotes = topDrivers.slice(0, 4).map((driver) => {
    const trendText =
      driver.changePct !== null
        ? `${driver.changePct >= 0 ? "+" : ""}${driver.changePct.toFixed(1)}%`
        : "insufficient trend data";

    return `${driver.label} shows ${driver.direction} behaviour over 30 days with avg ${formatMetric(
      driver.average,
      driver.unit
    )}, latest ${formatMetric(driver.latest, driver.unit)}, max ${formatMetric(
      driver.maximum,
      driver.unit
    )}, exceedance rate ${driver.exceedanceRate}%, trend ${trendText}.`;
  });

  const confidenceScore = Math.min(
    97,
    Math.max(
      62,
      Math.round(
        62 +
          topDrivers.slice(0, 3).reduce((sum, driver) => sum + driver.exceedanceRate * 0.18, 0) +
          (validRows.length >= 50 ? 8 : validRows.length >= 20 ? 5 : 2)
      )
    )
  );

  const pollutedDrivers = topDrivers
    .filter((driver) => driver.exceedanceRate >= 20 || driver.severityScore >= 30)
    .map((driver) => driver.label);

  const classLabel =
    assessment.className === "N/A"
      ? "Unclassified"
      : `Class ${assessment.className}`;

  return {
    recordCount: validRows.length,
    windowLabel: "Last 30 days",
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
          driver.unit
        )})`
    )
    .join("; ");
}

function buildPeriodOverview(summary: any) {
  if (!summary?.topDrivers?.length) {
    return "No sufficient 30-day data is available to describe the historical pattern.";
  }

  const first = summary.topDrivers[0];
  const second = summary.topDrivers[1];
  const third = summary.topDrivers[2];

  const segments = [
    `${first.label} was the strongest monthly driver with an average of ${formatMetric(
      first.average,
      first.unit
    )}, latest value ${formatMetric(first.latest, first.unit)}, and exceedance rate ${
      first.exceedanceRate
    }%.`,
  ];

  if (second) {
    segments.push(
      `${second.label} also remained influential with ${second.direction} movement and a monthly maximum of ${formatMetric(
        second.maximum,
        second.unit
      )}.`
    );
  }

  if (third) {
    segments.push(
      `${third.label} added supporting pressure with ${third.exceedanceRate}% exceedance occurrence during the analysis window.`
    );
  }

  return segments.join(" ");
}

function buildHistoricalExecutiveSummary(
  summary: any,
  assessment: OverallAssessment
) {
  if (!summary?.topDrivers?.length) {
    return "The 30-day historical analysis is still waiting for enough valid data points.";
  }

  const top = summary.topDrivers[0];
  const next = summary.topDrivers[1];
  const source = summary.primarySource?.source || "mixed-source pollution";

  return `Over the last 30 days, the river condition is assessed as ${assessment.status.toLowerCase()} (${assessment.className === "N/A" ? "unclassified" : `Class ${assessment.className}`}), mainly driven by ${top.label}${
    next ? ` and ${next.label}` : ""
  }. ${top.label} recorded an average of ${formatMetric(
    top.average,
    top.unit
  )}, latest value ${formatMetric(top.latest, top.unit)}, and exceedance rate ${
    top.exceedanceRate
  }%, indicating persistent monthly pressure rather than a one-time spike. The broader pattern suggests ${source.toLowerCase()}, so the result should be interpreted as a 30-day historical decision rather than a single-snapshot judgement.`;
}

function buildRecommendedActionFallback(summary: any) {
  const top = summary?.topDrivers?.[0];
  const source = summary?.primarySource?.source || "";

  if (!top) return "Continue routine monitoring and verify field conditions.";

  if (source.toLowerCase().includes("industrial")) {
    return "Increase monitoring frequency and inspect possible industrial or chemical discharge points upstream.";
  }

  if (source.toLowerCase().includes("wastewater")) {
    return "Increase monitoring frequency, inspect sewage/domestic discharge sources, and verify ammonia and BOD hotspots.";
  }

  if (source.toLowerCase().includes("sediment")) {
    return "Check upstream runoff pathways, erosion-prone zones, and recent land disturbance contributing to turbidity.";
  }

  if (source.toLowerCase().includes("agricultural")) {
    return "Inspect nearby agricultural or livestock runoff pathways and validate ammonia-related loading.";
  }

  if (top.key === "DO_Sensor") {
    return "Prioritise oxygen-stress verification in the field and inspect for organic pollution buildup.";
  }

  return "Increase monitoring frequency and investigate the dominant parameter drivers identified during the last 30 days.";
}

function buildRecommendationListFallback(summary: any) {
  const topDrivers: DriverSummary[] = summary?.topDrivers || [];

  const base = [
    "Increase monitoring frequency for the affected river section.",
    "Validate dominant sensor anomalies with field inspection.",
    "Review recent upstream discharge or runoff activity.",
  ];

  if (topDrivers.some((d) => d.key === "NH_Sensor")) {
    base.push("Prioritise ammonia source tracing near settlements, farms, or livestock areas.");
  }

  if (topDrivers.some((d) => d.key === "COD_Sensor")) {
    base.push("Check for chemical or industrial pollution signatures related to COD pressure.");
  }

  if (topDrivers.some((d) => d.key === "Tr_Sensor")) {
    base.push("Assess sediment input, stormwater runoff, and land disturbance near the catchment.");
  }

  return base.slice(0, 5);
}

function buildPredictionDetail(summary: any, assessment: OverallAssessment) {
  const top = summary?.topDrivers?.[0];
  const second = summary?.topDrivers?.[1];

  if (!top) {
    return "There is not enough 30-day historical data to build a stronger prediction narrative.";
  }

  return `The AI prediction is based on the historical behaviour of the last 30 days, not only the latest reading. The current condition is interpreted as ${
    assessment.className === "N/A" ? "an unclassified state" : `Class ${assessment.className}`
  }, because ${top.label} remained the dominant pressure parameter with an average of ${formatMetric(
    top.average,
    top.unit
  )}, latest value ${formatMetric(top.latest, top.unit)}, maximum ${formatMetric(
    top.maximum,
    top.unit
  )}, and exceedance rate ${top.exceedanceRate}%. ${
    second
      ? `${second.label} also contributed with ${second.direction} movement and monthly exceedance rate ${second.exceedanceRate}%.`
      : ""
  } This means the prediction reflects sustained river stress across the month rather than a temporary fluctuation.`;
}

function buildInterpretationDetail(summary: any, assessment: OverallAssessment) {
  const drivers: DriverSummary[] = summary?.topDrivers || [];
  if (!drivers.length) {
    return "Historical interpretation is unavailable because the 30-day dataset is insufficient.";
  }

  const driverLines = drivers.slice(0, 3).map(
    (driver) =>
      `${driver.label} avg ${formatMetric(driver.average, driver.unit)}, latest ${formatMetric(
        driver.latest,
        driver.unit
      )}, max ${formatMetric(driver.maximum, driver.unit)}, exceedance ${driver.exceedanceRate}%`
  );

  return `The AI interprets this river segment as ${assessment.status.toLowerCase()} because the dominant parameters consistently stayed under pressure during the 30-day window. The main numeric contributors are ${driverLines.join(
    "; "
  )}. These values show that the deterioration pattern is recurrent over time, which is why the model treats the current condition as a historically supported decision rather than a generic output.`;
}

function buildSourceDetail(summary: any) {
  const sources: SourceHypothesis[] = summary?.sourceHypotheses || [];
  if (!sources.length) {
    return "No specific source hypothesis could be formed from the available monthly pattern.";
  }

  return sources
    .map(
      (source, index) =>
        `${index + 1}. ${source.source} (${source.confidence}% confidence): ${source.reason}`
    )
    .join(" ");
}

function buildConfidenceDetail(summary: any) {
  return `The confidence score is ${summary?.confidenceScore ?? 70}% because the monthly interpretation is supported by repeated behaviour across ${summary?.recordCount ?? 0} valid records, recurring exceedance patterns, and consistent dominance of the same high-impact parameters. This confidence should still be verified with field inspection because source attribution remains a hypothesis, not direct proof.`;
}

function buildRecommendationDetail(summary: any) {
  const recommendation = buildRecommendedActionFallback(summary);
  const followUps = buildRecommendationListFallback(summary);

  return `${recommendation} Supporting follow-up actions include: ${followUps.join(
    " "
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
        `${driver.label} influenced the 30-day assessment through ${driver.direction} behaviour, average ${formatMetric(
          driver.average,
          driver.unit
        )}, latest ${formatMetric(driver.latest, driver.unit)}, and ${driver.exceedanceRate}% threshold exceedance. ${driver.likelyImpact}`
    )
    .join(" ");
}

function buildAnomalyNarrative(summary: any) {
  const notes: string[] = summary?.anomalyNotes || [];
  if (!notes.length) {
    return "No major anomaly note was generated from the 30-day dataset.";
  }
  return notes.join(" ");
}

function buildMonthlyPatternNarrative(summary: any) {
  const source = summary?.primarySource;
  const pollutedDrivers = summary?.pollutedDrivers || [];

  return `Across the monthly window, the pattern suggests repeated stress from ${pollutedDrivers.length ? pollutedDrivers.join(", ") : "multiple parameters"}. ${
    source
      ? `The strongest pollution hypothesis is ${source.source.toLowerCase()} because ${source.reason}`
      : "No single pollution source dominates the full monthly pattern."
  }`;
}

function buildModalOverallNarrative(
  summary: any,
  assessment: OverallAssessment
) {
  return `This expanded AI insight explains the water quality decision using the last 30 days of historical data. The current assessment is ${
    assessment.className === "N/A" ? "not fully classifiable" : `Class ${assessment.className}`
  }, and the explanation is grounded in repeated monthly behaviour of the dominant parameters, their numeric values, exceedance frequency, and the most plausible pollution-source hypothesis.`;
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

function DriverImpactCard({ driver }: { driver: DriverSummary }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">
        {driver.label}
      </p>
      <div className="mt-2 space-y-1 text-sm text-gray-700">
        <p>
          <span className="font-semibold text-gray-900">Avg:</span>{" "}
          {formatMetric(driver.average, driver.unit)}
        </p>
        <p>
          <span className="font-semibold text-gray-900">Latest:</span>{" "}
          {formatMetric(driver.latest, driver.unit)}
        </p>
        <p>
          <span className="font-semibold text-gray-900">Max:</span>{" "}
          {formatMetric(driver.maximum, driver.unit)}
        </p>
        <p>
          <span className="font-semibold text-gray-900">Trend:</span>{" "}
          {driver.direction}
        </p>
        <p>
          <span className="font-semibold text-gray-900">Exceedance:</span>{" "}
          {driver.exceedanceRate}%
        </p>
      </div>
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
  historicalSummary,
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
  historicalSummary: any;
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
                Detailed AI interpretation using historical data from the last 30
                days
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
                <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  Window: {historicalSummary?.windowLabel || "Last 30 days"}
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
                  OpenAI is expanding the 30-day historical decision into a fuller
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
                      "This expanded section explains the AI decision using the last 30 days of historical data so the user can understand the meaning, context, dominant parameter values, and operational implication of the current water quality assessment."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ExpandedDecisionCard
                    title={data?.predictionTitle || "30-Day AI Prediction"}
                    headline={decision?.currentWaterQualityStatus || fallbackClass}
                    description={
                      data?.predictionDetail ||
                      "This section explains the predicted water quality status in more detail."
                    }
                  />

                  <ExpandedDecisionCard
                    title={
                      data?.interpretationTitle || "Historical AI Interpretation"
                    }
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

                <div className="rounded-2xl border bg-white p-5">
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                    Driver Narrative
                  </p>
                  <p className="text-sm leading-7 text-gray-700">
                    {data?.driverNarrative ||
                      "This section explains which parameters most strongly influenced the 30-day decision."}
                  </p>
                </div>

                <div className="rounded-2xl border bg-white p-5">
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                    Monthly Pattern Narrative
                  </p>
                  <p className="text-sm leading-7 text-gray-700">
                    {data?.monthlyPatternNarrative ||
                      "This section explains how the parameter pattern evolved across the month."}
                  </p>
                </div>

                <div className="rounded-2xl border bg-white p-5">
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                    Anomaly Narrative
                  </p>
                  <p className="text-sm leading-7 text-gray-700">
                    {data?.anomalyNarrative ||
                      "This section explains the key anomalies observed across the 30-day historical window."}
                  </p>
                </div>

                {historicalSummary?.topDrivers?.length > 0 && (
                  <div className="rounded-2xl border bg-white p-5">
                    <p className="mb-4 text-xs uppercase tracking-wide text-gray-500">
                      Numeric Driver Breakdown
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {historicalSummary.topDrivers.slice(0, 6).map((driver: DriverSummary) => (
                        <DriverImpactCard key={driver.key} driver={driver} />
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