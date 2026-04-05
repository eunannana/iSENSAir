import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeNumber(value: unknown, fallback = 0) {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : fallback;

  return Number.isFinite(num) ? num : fallback;
}

function normalizeConfidence(value: unknown, fallback = 80) {
  const score = normalizeNumber(value, fallback);
  return Math.max(50, Math.min(99, Math.round(score)));
}

function compactText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function formatMetric(value: number | null, unit?: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function buildQuickInsightFallback(aiInsight: any, nwqsSummary: any) {
  const dominant =
    aiInsight?.dominantParameters?.length > 0
      ? aiInsight.dominantParameters.join(", ")
      : "multiple parameters";

  const sampleCount = Number.isFinite(Number(nwqsSummary?.sampleCount))
    ? Number(nwqsSummary.sampleCount)
    : null;
  const sampleText = sampleCount !== null ? ` from ${sampleCount} records` : "";

  return `Based on daily average readings${sampleText}, Class ${
    nwqsSummary?.overallClass || "-"
  }, mainly influenced by ${dominant}. This suggests current pollution pressure that should be checked together with the recent short-term trend.`;
}

function buildHistoricalExecutiveSummary(
  historicalSummary: any,
  nwqsSummary: any,
  historicalWindowDays = 7,
) {
  const topDrivers: DriverSummary[] = historicalSummary?.topDrivers || [];
  const overallClass = nwqsSummary?.overallClass
    ? `Class ${nwqsSummary.overallClass}`
    : "the current class";

  if (!topDrivers.length) {
    return `The ${historicalWindowDays}-day decision is waiting for enough valid records to identify the main pollution driver clearly.`;
  }

  const top = topDrivers[0];
  const second = topDrivers[1];

  return `Over the last ${historicalWindowDays} days, the river remained at ${overallClass}, mainly driven by ${top.label}${second ? ` and ${second.label}` : ""}. ${top.label} showed avg ${formatMetric(
    top.average,
    top.unit,
  )}, latest ${formatMetric(top.latest, top.unit)}, and exceedance ${
    top.exceedanceRate
  }%, indicating repeated stress rather than a one-time spike.`;
}

function buildMainContributorSummary(topDrivers: DriverSummary[]) {
  if (!topDrivers?.length) return "Not identified";

  return topDrivers
    .slice(0, 3)
    .map(
      (driver) =>
        `${driver.label} (avg ${formatMetric(
          driver.average,
          driver.unit,
        )}, exceedance ${driver.exceedanceRate}%)`,
    )
    .join("; ");
}

function buildRecommendedActionFallback(historicalSummary: any) {
  const source = String(
    historicalSummary?.primarySource?.source || "",
  ).toLowerCase();

  if (source.includes("industrial") || source.includes("chemical")) {
    return "Inspect upstream industrial or chemical discharge points, verify COD and pH abnormalities, and increase short-interval monitoring.";
  }

  if (source.includes("wastewater") || source.includes("sewage")) {
    return "Inspect domestic wastewater discharge points, verify ammonia and BOD hotspots, and increase field checks near settlements.";
  }

  if (source.includes("agricultural") || source.includes("livestock")) {
    return "Check agricultural runoff channels, livestock-related discharge, and ammonia loading around drainage pathways.";
  }

  if (source.includes("sediment") || source.includes("runoff")) {
    return "Inspect erosion-prone zones, stormwater entry points, and disturbed riverbank areas contributing to turbidity stress.";
  }

  return "Increase monitoring frequency, verify the dominant abnormal parameters in the field, and inspect possible upstream discharge sources.";
}

function buildRecommendationListFallback(historicalSummary: any) {
  const topDrivers: DriverSummary[] = historicalSummary?.topDrivers || [];

  const items = [
    "Increase monitoring frequency for the affected river section.",
    "Validate abnormal readings through field inspection.",
    "Review upstream discharge or runoff activity.",
  ];

  if (topDrivers.some((d) => d.key === "NH_Sensor")) {
    items.push(
      "Prioritise ammonia source tracing near settlements, farms, or livestock areas.",
    );
  }

  if (topDrivers.some((d) => d.key === "COD_Sensor")) {
    items.push(
      "Check for chemical or industrial discharge signatures related to COD stress.",
    );
  }

  return items.slice(0, 4);
}

function buildExpandedFallback(
  historicalSummary: any,
  aiDecision: any,
  nwqsSummary: any,
  historicalWindowDays = 7,
) {
  const topDrivers: DriverSummary[] = historicalSummary?.topDrivers || [];
  const sourceHypotheses: SourceHypothesis[] =
    historicalSummary?.sourceHypotheses || [];
  const primarySource = sourceHypotheses[0] || null;

  const top = topDrivers[0];
  const second = topDrivers[1];
  const third = topDrivers[2];

  const classLabel =
    aiDecision?.currentWaterQualityStatus ||
    (nwqsSummary?.overallClass ? `Class ${nwqsSummary.overallClass}` : "Class -");

  const overallNarrative = top
    ? `The 7-day decision indicates ${classLabel}, mainly influenced by ${top.label}${second ? ` and ${second.label}` : ""}. The strongest concern comes from repeated abnormal values, not from a single isolated spike.`
    : `The 7-day decision summarises the strongest abnormal parameters, likely pollution source, and required follow-up action.`;

  const predictionDetail = top
    ? `${top.label} is the main anomaly with avg ${formatMetric(
        top.average,
        top.unit,
      )}, latest ${formatMetric(top.latest, top.unit)}, max ${formatMetric(
        top.maximum,
        top.unit,
      )}, and exceedance ${top.exceedanceRate}%. ${
        second
          ? `${second.label} also contributed with avg ${formatMetric(
              second.average,
              second.unit,
            )} and exceedance ${second.exceedanceRate}%.`
          : ""
      }`
    : `There is not yet enough valid evidence to describe the dominant 7-day anomaly clearly.`;

  const sourceDetail = primarySource
    ? `The strongest source hypothesis is ${primarySource.source.toLowerCase()} because ${primarySource.reason}`
    : `The source pattern is still mixed and should be verified in the field.`;

  const recommendationDetail = buildRecommendedActionFallback(historicalSummary);

  const driverNarrative = topDrivers.length
    ? topDrivers
        .slice(0, 3)
        .map(
          (driver) =>
            `${driver.label}: avg ${formatMetric(
              driver.average,
              driver.unit,
            )}, latest ${formatMetric(
              driver.latest,
              driver.unit,
            )}, exceedance ${driver.exceedanceRate}%`,
        )
        .join(" | ")
    : "No dominant parameter evidence is available.";

  const anomalyNarrative = top
    ? `${top.label} shows the clearest abnormal pattern across the last ${historicalWindowDays} days. ${
        third ? `${third.label} adds supporting pollution pressure.` : ""
      }`
    : `No anomaly summary could be formed from the current 7-day records.`;

  const monthlyPatternNarrative = primarySource
    ? `The 7-day pattern is more consistent with ${primarySource.source.toLowerCase()} than with a one-time event. Field verification is still required before confirming the source.`
    : `The 7-day pattern suggests repeated stress, but the source cannot yet be isolated clearly.`;

  return {
    overallNarrative,
    predictionTitle: "7-Day Water Quality Summary",
    predictionDetail,
    sourceTitle: "Likely Pollution Source",
    sourceDetail,
    recommendationTitle: "Recommended Follow-up",
    recommendationDetail,
    driverNarrative,
    anomalyNarrative,
    monthlyPatternNarrative,
  };
}

async function generateJsonFromOpenAI(systemPrompt: string, userPrompt: string) {
  const completion = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "{}";
  return safeJsonParse(stripCodeFence(raw));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      mode = "general_decision",
      latestRow,
      rows = [],
      aiInsight,
      aiDecision,
      nwqsSummary,
      historicalSummary,
      historicalWindowDays = 7,
    } = body || {};

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Invalid rows payload." },
        { status: 400 },
      );
    }

    if (mode === "quick_insight") {
      const systemPrompt = `
You are an environmental monitoring assistant.

Write one short and useful snapshot insight.
Rules:
- Maximum 2 sentences.
- Mention the class if available.
- Mention only the most important contributors.
- The provided numeric values are daily averages, not single timestamp readings.
- If you cite numbers, clearly state they are daily averages.
- Do not be generic.
- Do not use markdown.
- Return JSON only:
{
  "insight": "..."
}
      `.trim();

      const userPrompt = `
Latest row:
${JSON.stringify(latestRow, null, 2)}

AI insight:
${JSON.stringify(aiInsight, null, 2)}

NWQS summary:
${JSON.stringify(nwqsSummary, null, 2)}
      `.trim();

      const result = await generateJsonFromOpenAI(systemPrompt, userPrompt);

      return NextResponse.json({
        insight:
          compactText(result?.insight) ||
          buildQuickInsightFallback(aiInsight, nwqsSummary),
      });
    }

    if (mode === "historical_decision_7d") {
      const systemPrompt = `
You are an environmental monitoring assistant for river water quality.

Generate a concise 7-day AI decision card.
Rules:
- Use ONLY the provided 7-day historical evidence.
- Focus on repeated abnormal parameters, not a single spike.
- Mention numeric evidence for the strongest drivers.
- executiveSummary must be 2-3 short sentences only.
- recommendedAction must be 1 sentence only.
- mainContributorSummary must be short.
- predictedSourceOfPollution must be short and direct.
- sourceRationale must be 1 sentence.
- Return valid JSON only:
{
  "title": "7-Day AI Decision Support",
  "historicalWindowLabel": "Last 7 days",
  "currentWaterQualityStatus": "Class V",
  "pollutionRiskLevel": "Critical",
  "confidenceScore": 84,
  "executiveSummary": "...",
  "recommendedAction": "...",
  "recommendations": ["...", "..."],
  "mainContributorSummary": "...",
  "predictedSourceOfPollution": "...",
  "sourceRationale": "...",
  "dominantDrivers": [],
  "likelySources": [],
  "anomalyNotes": []
}
      `.trim();

      const userPrompt = `
Latest row:
${JSON.stringify(latestRow, null, 2)}

Historical summary:
${JSON.stringify(historicalSummary, null, 2)}

NWQS summary:
${JSON.stringify(nwqsSummary, null, 2)}

Historical window days:
${historicalWindowDays}

Representative rows used:
${rows.length}
      `.trim();

      const result = await generateJsonFromOpenAI(systemPrompt, userPrompt);

      return NextResponse.json({
        title: compactText(result?.title, "7-Day AI Decision Support"),
        historicalWindowLabel: compactText(
          result?.historicalWindowLabel,
          `Last ${historicalWindowDays} days`,
        ),
        currentWaterQualityStatus: compactText(
          result?.currentWaterQualityStatus,
          nwqsSummary?.overallClass ? `Class ${nwqsSummary.overallClass}` : "Class V",
        ),
        pollutionRiskLevel: compactText(
          result?.pollutionRiskLevel,
          "Critical",
        ),
        confidenceScore: normalizeConfidence(
          result?.confidenceScore,
          historicalSummary?.confidenceScore ?? 82,
        ),
        executiveSummary: compactText(
          result?.executiveSummary,
          buildHistoricalExecutiveSummary(
            historicalSummary,
            nwqsSummary,
            historicalWindowDays,
          ),
        ),
        recommendedAction: compactText(
          result?.recommendedAction,
          buildRecommendedActionFallback(historicalSummary),
        ),
        recommendations: Array.isArray(result?.recommendations)
          ? result.recommendations
          : buildRecommendationListFallback(historicalSummary),
        mainContributorSummary: compactText(
          result?.mainContributorSummary,
          buildMainContributorSummary(historicalSummary?.topDrivers || []),
        ),
        predictedSourceOfPollution: compactText(
          result?.predictedSourceOfPollution,
          historicalSummary?.primarySource?.source || "Potential mixed-source pollution",
        ),
        sourceRationale: compactText(
          result?.sourceRationale,
          historicalSummary?.primarySource?.reason ||
            "The hypothesis is based on repeated abnormal parameter behaviour over the last 7 days.",
        ),
        dominantDrivers: Array.isArray(result?.dominantDrivers)
          ? result.dominantDrivers
          : historicalSummary?.topDrivers || [],
        likelySources: Array.isArray(result?.likelySources)
          ? result.likelySources
          : historicalSummary?.sourceHypotheses || [],
        anomalyNotes: Array.isArray(result?.anomalyNotes)
          ? result.anomalyNotes
          : historicalSummary?.anomalyNotes || [],
      });
    }

    if (mode === "expanded_historical_decision_detail") {
      const systemPrompt = `
You are an environmental monitoring assistant generating a CLEAN and SHORT popup for 7-day river analysis.

GOAL:
The popup must be practical, numeric, and easy to scan.

ONLY TALK ABOUT:
1. Which parameters are abnormal
2. What numeric evidence supports that
3. What the likely pollution source is
4. What the recommended next action is

STRICT RULES:
- Use ONLY the provided 7-day evidence
- DO NOT mention 30-day or monthly analysis
- DO NOT mention timestamp
- DO NOT mention confidence score
- DO NOT create generic explanations
- DO NOT repeat the same number in every section
- Focus only on the top 2 or 3 important parameters
- Mention real values such as avg, latest, max, exceedance rate
- Source must be hypothesis-style only: industrial or chemical discharge, domestic wastewater, agricultural runoff, livestock-related pollution, sediment runoff, or mixed-source pollution
- Recommendation must be short, operational, and practical
- overallNarrative: max 2 short sentences
- predictionDetail: max 2 short sentences
- sourceDetail: max 2 short sentences
- recommendationDetail: max 2 short sentences
- driverNarrative: short compact paragraph
- anomalyNarrative: short compact paragraph
- monthlyPatternNarrative: short compact paragraph
- Even though the field name is monthlyPatternNarrative, it MUST still describe the 7-day pattern because frontend uses that field name

Return valid JSON only:
{
  "overallNarrative": "...",
  "predictionTitle": "7-Day Water Quality Summary",
  "predictionDetail": "...",
  "sourceTitle": "Likely Pollution Source",
  "sourceDetail": "...",
  "recommendationTitle": "Recommended Follow-up",
  "recommendationDetail": "...",
  "driverNarrative": "...",
  "anomalyNarrative": "...",
  "monthlyPatternNarrative": "..."
}
      `.trim();

      const topDrivers: DriverSummary[] = historicalSummary?.topDrivers || [];
      const sourceHypotheses: SourceHypothesis[] =
        historicalSummary?.sourceHypotheses || [];

      const userPrompt = `
7-day AI decision:
${JSON.stringify(aiDecision, null, 2)}

7-day historical summary:
${JSON.stringify(
  {
    windowLabel: historicalSummary?.windowLabel,
    recordCount: historicalSummary?.recordCount,
    topDrivers: topDrivers.slice(0, 4),
    primarySource: historicalSummary?.primarySource,
    sourceHypotheses: sourceHypotheses.slice(0, 3),
    anomalyNotes: historicalSummary?.anomalyNotes?.slice?.(0, 4) || [],
  },
  null,
  2,
)}

NWQS summary:
${JSON.stringify(nwqsSummary, null, 2)}

Latest row:
${JSON.stringify(latestRow, null, 2)}

Representative hourly rows used:
${rows.length}
      `.trim();

      const result = await generateJsonFromOpenAI(systemPrompt, userPrompt);
      const fallback = buildExpandedFallback(
        historicalSummary,
        aiDecision,
        nwqsSummary,
        historicalWindowDays,
      );

      return NextResponse.json({
        overallNarrative: compactText(
          result?.overallNarrative,
          fallback.overallNarrative,
        ),
        predictionTitle: compactText(
          result?.predictionTitle,
          fallback.predictionTitle,
        ),
        predictionDetail: compactText(
          result?.predictionDetail,
          fallback.predictionDetail,
        ),
        sourceTitle: compactText(
          result?.sourceTitle,
          fallback.sourceTitle,
        ),
        sourceDetail: compactText(
          result?.sourceDetail,
          fallback.sourceDetail,
        ),
        recommendationTitle: compactText(
          result?.recommendationTitle,
          fallback.recommendationTitle,
        ),
        recommendationDetail: compactText(
          result?.recommendationDetail,
          fallback.recommendationDetail,
        ),
        driverNarrative: compactText(
          result?.driverNarrative,
          fallback.driverNarrative,
        ),
        anomalyNarrative: compactText(
          result?.anomalyNarrative,
          fallback.anomalyNarrative,
        ),
        monthlyPatternNarrative: compactText(
          result?.monthlyPatternNarrative,
          fallback.monthlyPatternNarrative,
        ),
      });
    }

    return NextResponse.json({});
  } catch (error: any) {
    console.error("OpenAI route error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to process OpenAI request.",
      },
      { status: 500 },
    );
  }
}