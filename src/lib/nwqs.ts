export type NWQSClass = "I" | "II" | "III" | "IV" | "V" | "N/A";

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

export type NWQSResult = {
  sensorKey: SensorKey;
  label: string;
  value: number | null;
  unit: string;
  className: NWQSClass;
  status: string;
  colorClass: string;
  description: string;
};

const SENSOR_META: Record<
  SensorKey,
  { label: string; unit: string }
> = {
  Tr_Sensor: { label: "Turbidity", unit: "mg/L" }, // temporary approximation to TSS
  BOD_Sensor: { label: "BOD", unit: "mg/L" },
  DO_Sensor: { label: "DO", unit: "mg/L" },
  COD_Sensor: { label: "COD", unit: "mg/L" },
  NH_Sensor: { label: "Ammoniacal Nitrogen", unit: "mg/L" },
  TDS_Sensor: { label: "TDS", unit: "mg/L" },
  CT_Sensor: { label: "Conductivity", unit: "µS/cm" },
  ORP_Sensor: { label: "ORP", unit: "mV" },
  pH_Sensor: { label: "pH", unit: "" },
};

/**
 * Parse safe numeric value
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Color class for Tailwind UI
 */
export function getClassColor(className: NWQSClass): string {
  switch (className) {
    case "I":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "II":
      return "bg-green-100 text-green-700 border-green-200";
    case "III":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "IV":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "V":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

export function getClassStatus(className: NWQSClass): string {
  switch (className) {
    case "I":
      return "Excellent";
    case "II":
      return "Good";
    case "III":
      return "Moderate";
    case "IV":
      return "Polluted";
    case "V":
      return "Highly Polluted";
    default:
      return "Not Classified";
  }
}

export function getClassDescription(className: NWQSClass): string {
  switch (className) {
    case "I":
      return "Conservation / very clean water";
    case "II":
      return "Conventional treatment may be sufficient";
    case "III":
      return "Extensive treatment may be required";
    case "IV":
      return "Suitable mainly for irrigation";
    case "V":
      return "Severely polluted";
    default:
      return "No direct NWQS mapping";
  }
}

/* =========================
   PARAMETER CLASSIFICATION
   ========================= */

/**
 * NH3-N / Ammoniacal Nitrogen
 * <0.1 I | 0.1-0.3 II | 0.3-0.9 III | 0.9-2.7 IV | >2.7 V
 */
export function classifyNH3(value: number | null): NWQSClass {
  if (value === null) return "N/A";
  if (value < 0.1) return "I";
  if (value < 0.3) return "II";
  if (value < 0.9) return "III";
  if (value < 2.7) return "IV";
  return "V";
}

/**
 * BOD
 * <1 I | 1-3 II | 3-6 III | 6-12 IV | >12 V
 */
export function classifyBOD(value: number | null): NWQSClass {
  if (value === null) return "N/A";
  if (value < 1) return "I";
  if (value < 3) return "II";
  if (value < 6) return "III";
  if (value < 12) return "IV";
  return "V";
}

/**
 * COD
 * <10 I | 10-25 II | 25-50 III | 50-100 IV | >100 V
 */
export function classifyCOD(value: number | null): NWQSClass {
  if (value === null) return "N/A";
  if (value < 10) return "I";
  if (value < 25) return "II";
  if (value < 50) return "III";
  if (value < 100) return "IV";
  return "V";
}

/**
 * DO
 * >7 I | 5-7 II | 3-5 III | 1-3 IV | <1 V
 */
export function classifyDO(value: number | null): NWQSClass {
  if (value === null) return "N/A";
  if (value > 7) return "I";
  if (value >= 5) return "II";
  if (value >= 3) return "III";
  if (value >= 1) return "IV";
  return "V";
}

/**
 * pH
 * >7 I | 6-7 II | 5-6 III | <5 IV/V in simplified handling
 *
 * NOTE:
 * The table image for pH is not perfectly symmetric/clear.
 * This is a simplified practical mapping for dashboard use.
 */
export function classifyPH(value: number | null): NWQSClass {
  if (value === null) return "N/A";

  if (value >= 7 && value <= 8.5) return "I";
  if ((value >= 6 && value < 7) || (value > 8.5 && value <= 9)) return "II";
  if ((value >= 5 && value < 6) || (value > 9 && value <= 9.5)) return "III";
  if ((value >= 4 && value < 5) || (value > 9.5 && value <= 10)) return "IV";
  return "V";
}

/**
 * Temporary approximation:
 * Using Turbidity as proxy for Suspended Solid / TSS
 * <25 I | 25-50 II | 50-150 III | 150-300 IV | >300 V
 *
 * IMPORTANT:
 * This is only a practical fallback.
 * If you later have actual TSS data, replace this logic.
 */
export function classifyTurbidityApprox(value: number | null): NWQSClass {
  if (value === null) return "N/A";
  if (value < 25) return "I";
  if (value < 50) return "II";
  if (value < 150) return "III";
  if (value < 300) return "IV";
  return "V";
}

export function classifySensor(
  sensorKey: SensorKey,
  rawValue: unknown
): NWQSClass {
  const value = toNumber(rawValue);

  switch (sensorKey) {
    case "NH_Sensor":
      return classifyNH3(value);
    case "BOD_Sensor":
      return classifyBOD(value);
    case "COD_Sensor":
      return classifyCOD(value);
    case "DO_Sensor":
      return classifyDO(value);
    case "pH_Sensor":
      return classifyPH(value);
    case "Tr_Sensor":
      return classifyTurbidityApprox(value);
    default:
      return "N/A";
  }
}

export function getNWQSResult(
  sensorKey: SensorKey,
  rawValue: unknown
): NWQSResult {
  const meta = SENSOR_META[sensorKey];
  const value = toNumber(rawValue);
  const className = classifySensor(sensorKey, rawValue);

  return {
    sensorKey,
    label: meta.label,
    value,
    unit: meta.unit,
    className,
    status: getClassStatus(className),
    colorClass: getClassColor(className),
    description: getClassDescription(className),
  };
}

/**
 * Get all classified parameters from a row
 */
export function getRowNWQSResults(row: Partial<Record<SensorKey, unknown>>) {
  const keys: SensorKey[] = [
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

  return keys.map((key) => getNWQSResult(key, row[key]));
}

/**
 * Overall class:
 * practical conservative approach = worst class among available classified parameters
 */
export function getOverallNWQSClass(
  row: Partial<Record<SensorKey, unknown>>
): NWQSClass {
  const ranked: Record<NWQSClass, number> = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
    "V": 5,
    "N/A": 0,
  };

  const results = getRowNWQSResults(row).filter((r) => r.className !== "N/A");

  if (results.length === 0) return "N/A";

  let worst: NWQSClass = "I";

  for (const result of results) {
    if (ranked[result.className] > ranked[worst]) {
      worst = result.className;
    }
  }

  return worst;
}

/**
 * Dominant parameters = parameters with the worst class
 */
export function getDominantParameters(
  row: Partial<Record<SensorKey, unknown>>
): NWQSResult[] {
  const ranked: Record<NWQSClass, number> = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
    "V": 5,
    "N/A": 0,
  };

  const results = getRowNWQSResults(row).filter((r) => r.className !== "N/A");

  if (results.length === 0) return [];

  const maxRank = Math.max(...results.map((r) => ranked[r.className]));

  return results.filter((r) => ranked[r.className] === maxRank);
}

/**
 * Recommended use based on overall class
 * simplified from NWQS water classes and uses
 */
export function getUseRecommendation(className: NWQSClass): string {
  switch (className) {
    case "I":
      return "Suitable for conservation, sensitive aquatic species, and water supply with minimal treatment.";
    case "II":
      return "Suitable for conventional water treatment, aquatic life, and recreational use.";
    case "III":
      return "Requires extensive treatment before water supply use; suitable for tolerant aquatic species.";
    case "IV":
      return "Suitable mainly for irrigation.";
    case "V":
      return "Not suitable for the main beneficial uses under NWQS.";
    default:
      return "No recommendation available.";
  }
}