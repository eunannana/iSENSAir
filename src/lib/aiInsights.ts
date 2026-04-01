import {
  getOverallNWQSClass,
  getDominantParameters,
  type NWQSClass,
} from "@/lib/nwqs";

export type SensorKey =
  | "Tr_Sensor"
  | "BOD_Sensor"
  | "DO_Sensor"
  | "COD_Sensor"
  | "NH_Sensor"
  | "TDS_Sensor"
  | "CT_Sensor"
  | "ORP_Sensor"
  | "pH_Sensor";

export type TrendDirection = "increasing" | "decreasing" | "stable" | "fluctuating";

export type TrendSummaryItem = {
  sensorKey: SensorKey;
  label: string;
  direction: TrendDirection;
  changePct: number;
  firstAvg: number;
  lastAvg: number;
};

export type AnomalyItem = {
  sensorKey: SensorKey;
  label: string;
  timestamp?: string;
  currentValue: number;
  previousValue: number;
  percentChange: number;
  message: string;
};

export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export type AIInsightSummary = {
  overallClass: NWQSClass;
  riskScore: number;
  riskLevel: RiskLevel;
  dominantParameters: string[];
  trendSummary: TrendSummaryItem[];
  anomalies: AnomalyItem[];
  recommendations: string[];
  narrative: string;
};

const SENSOR_LABELS: Record<SensorKey, string> = {
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

const SENSOR_KEYS: SensorKey[] = [
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

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function getPercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    if (newValue === 0) return 0;
    return 100;
  }
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

function getRecentRows(rows: any[], count = 24): any[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, count);
}

function getOldestRows(rows: any[], count = 24): any[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(-count);
}

/**
 * Trend:
 * Compare average of recent rows vs oldest rows.
 * Assumption: rows already sorted latest -> oldest in WeconTable.
 */
export function getTrendSummary(rows: any[]): TrendSummaryItem[] {
  if (!Array.isArray(rows) || rows.length < 4) return [];

  const recent = getRecentRows(rows, Math.min(12, rows.length));
  const oldest = getOldestRows(rows, Math.min(12, rows.length));

  return SENSOR_KEYS.map((sensorKey) => {
    const recentValues = recent
      .map((r) => toNumber(r[sensorKey]))
      .filter((v): v is number => v !== null);

    const oldestValues = oldest
      .map((r) => toNumber(r[sensorKey]))
      .filter((v): v is number => v !== null);

    const lastAvg = average(recentValues);
    const firstAvg = average(oldestValues);

    const changePct = firstAvg === 0 && lastAvg === 0
      ? 0
      : getPercentChange(firstAvg, lastAvg);

    let direction: TrendDirection = "stable";

    const absChange = Math.abs(changePct);

    if (recentValues.length >= 4) {
      const maxVal = Math.max(...recentValues);
      const minVal = Math.min(...recentValues);
      const spreadPct =
        average(recentValues) === 0
          ? 0
          : ((maxVal - minVal) / Math.abs(average(recentValues))) * 100;

      if (spreadPct > 35 && absChange < 15) {
        direction = "fluctuating";
      } else if (changePct >= 15) {
        direction = "increasing";
      } else if (changePct <= -15) {
        direction = "decreasing";
      } else {
        direction = "stable";
      }
    }

    return {
      sensorKey,
      label: SENSOR_LABELS[sensorKey],
      direction,
      changePct: round2(changePct),
      firstAvg: round2(firstAvg),
      lastAvg: round2(lastAvg),
    };
  });
}

/**
 * Anomaly:
 * Detect sudden jump/drop between consecutive recent points.
 */
export function detectAnomalies(rows: any[]): AnomalyItem[] {
  if (!Array.isArray(rows) || rows.length < 2) return [];

  const anomalies: AnomalyItem[] = [];
  const recentRows = rows.slice(0, Math.min(20, rows.length));

  for (const sensorKey of SENSOR_KEYS) {
    for (let i = 0; i < recentRows.length - 1; i++) {
      const currentRow = recentRows[i];
      const previousRow = recentRows[i + 1];

      const currentValue = toNumber(currentRow[sensorKey]);
      const previousValue = toNumber(previousRow[sensorKey]);

      if (currentValue === null || previousValue === null) continue;
      if (currentValue === 0 && previousValue === 0) continue;

      const percentChange = getPercentChange(previousValue, currentValue);
      const absPercentChange = Math.abs(percentChange);

      let threshold = 60;

      // More sensitive for selected water-quality parameters
      if (
        sensorKey === "NH_Sensor" ||
        sensorKey === "COD_Sensor" ||
        sensorKey === "BOD_Sensor" ||
        sensorKey === "DO_Sensor"
      ) {
        threshold = 40;
      }

      if (absPercentChange >= threshold) {
        anomalies.push({
          sensorKey,
          label: SENSOR_LABELS[sensorKey],
          timestamp: currentRow.Timestamp,
          currentValue: round2(currentValue),
          previousValue: round2(previousValue),
          percentChange: round2(percentChange),
          message:
            percentChange > 0
              ? `${SENSOR_LABELS[sensorKey]} increased sharply by ${round2(absPercentChange)}%`
              : `${SENSOR_LABELS[sensorKey]} decreased sharply by ${round2(absPercentChange)}%`,
        });

        // one anomaly per parameter is enough for summary
        break;
      }
    }
  }

  return anomalies;
}

function classRank(className: NWQSClass): number {
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

export function getRiskScore(latestRow: any, rows: any[]): number {
  if (!latestRow) return 0;

  const overallClass = getOverallNWQSClass(latestRow);
  const anomalies = detectAnomalies(rows);
  const trends = getTrendSummary(rows);
  const dominantParameters = getDominantParameters(latestRow);

  let score = 0;

  // 1) Overall class contribution
  const overallRank = classRank(overallClass);
  score += overallRank * 15; // max 75

  // 2) Dominant bad parameters
  score += Math.min(dominantParameters.length * 6, 12);

  // 3) Anomaly contribution
  score += Math.min(anomalies.length * 5, 10);

  // 4) Bad trend contribution
  const worseningCount = trends.filter((t) => {
    if (
      t.sensorKey === "NH_Sensor" ||
      t.sensorKey === "COD_Sensor" ||
      t.sensorKey === "BOD_Sensor" ||
      t.sensorKey === "Tr_Sensor"
    ) {
      return t.direction === "increasing";
    }

    if (t.sensorKey === "DO_Sensor") {
      return t.direction === "decreasing";
    }

    return false;
  }).length;

  score += Math.min(worseningCount * 3, 9);

  return Math.max(0, Math.min(100, round2(score)));
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 76) return "Critical";
  if (score >= 51) return "High";
  if (score >= 26) return "Moderate";
  return "Low";
}

export function getAIRecommendations(
  latestRow: any,
  rows: any[]
): string[] {
  if (!latestRow) return ["No recommendation available."];

  const overallClass = getOverallNWQSClass(latestRow);
  const anomalies = detectAnomalies(rows);
  const dominant = getDominantParameters(latestRow).map((d) => d.label);

  const recommendations: string[] = [];

  if (overallClass === "IV" || overallClass === "V") {
    recommendations.push(
      "Increase monitoring frequency due to poor current water quality."
    );
  }

  if (dominant.includes("Ammonia")) {
    recommendations.push(
      "Inspect potential ammonia-related pollution sources upstream."
    );
  }

  if (dominant.includes("COD") || dominant.includes("BOD")) {
    recommendations.push(
      "Check for possible organic or industrial discharge affecting water quality."
    );
  }

  if (dominant.includes("DO")) {
    recommendations.push(
      "Review dissolved oxygen conditions and assess potential ecological stress."
    );
  }

  if (anomalies.length > 0) {
    recommendations.push(
      "Verify recent abnormal changes and inspect the affected monitoring location."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Continue routine monitoring and maintain current surveillance.");
  }

  return Array.from(new Set(recommendations));
}

export function buildAINarrative(latestRow: any, rows: any[]): string {
  if (!latestRow) return "No data available for AI analysis.";

  const overallClass = getOverallNWQSClass(latestRow);
  const dominant = getDominantParameters(latestRow).map((d) => d.label);
  const anomalies = detectAnomalies(rows);
  const riskScore = getRiskScore(latestRow, rows);
  const riskLevel = getRiskLevel(riskScore);
  const trends = getTrendSummary(rows);

  const worsening = trends
    .filter((t) => {
      if (
        t.sensorKey === "NH_Sensor" ||
        t.sensorKey === "COD_Sensor" ||
        t.sensorKey === "BOD_Sensor" ||
        t.sensorKey === "Tr_Sensor"
      ) {
        return t.direction === "increasing";
      }
      if (t.sensorKey === "DO_Sensor") {
        return t.direction === "decreasing";
      }
      return false;
    })
    .map((t) => t.label);

  let text = `Current water quality is assessed as Class ${overallClass}`;

  if (dominant.length > 0) {
    text += `, mainly influenced by ${dominant.join(", ")}.`;
  } else {
    text += `.`;
  }

  text += ` The current monitoring risk level is ${riskLevel} (${riskScore}/100).`;

  if (worsening.length > 0) {
    text += ` Worsening trends are observed in ${worsening.join(", ")}.`;
  }

  if (anomalies.length > 0) {
    text += ` ${anomalies[0].message}.`;
  }

  return text;
}

export function getAIInsightSummary(
  latestRow: any,
  rows: any[]
): AIInsightSummary {
  const overallClass = latestRow ? getOverallNWQSClass(latestRow) : "N/A";
  const dominantParameters = latestRow
    ? getDominantParameters(latestRow).map((d) => d.label)
    : [];

  const trendSummary = getTrendSummary(rows);
  const anomalies = detectAnomalies(rows);
  const riskScore = getRiskScore(latestRow, rows);
  const riskLevel = getRiskLevel(riskScore);
  const recommendations = getAIRecommendations(latestRow, rows);
  const narrative = buildAINarrative(latestRow, rows);

  return {
    overallClass,
    riskScore,
    riskLevel,
    dominantParameters,
    trendSummary,
    anomalies,
    recommendations,
    narrative,
  };
}