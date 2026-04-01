import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type DriverSummary = {
  key?: string;
  label?: string;
  unit?: string;
  latest?: number | null;
  average?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  median?: number | null;
  changePct?: number | null;
  exceedanceCount?: number;
  exceedanceRate?: number;
  severityScore?: number;
  direction?: "increasing" | "decreasing" | "stable" | "fluctuating";
  likelyImpact?: string;
};

type SourceHypothesis = {
  source?: string;
  confidence?: number;
  reason?: string;
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

function normalizeConfidence(value: unknown, fallback = 75) {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? parseFloat(value)
      : fallback;

  if (Number.isNaN(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function formatMetric(value: unknown, unit = "") {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? parseFloat(value)
      : NaN;

  if (Number.isNaN(num)) return "-";
  return `${num.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function deriveRiskLevelFromClass(className?: string) {
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

function guessPollutionSourceFromHistory(historicalSummary?: any) {
  const primarySource = historicalSummary?.primarySource;
  if (primarySource?.source) return primarySource.source;

  const topDrivers: DriverSummary[] = Array.isArray(historicalSummary?.topDrivers)
    ? historicalSummary.topDrivers
    : [];

  const labels = topDrivers.map((item) => (item.label || "").toLowerCase());

  if (
    labels.includes("nh3") &&
    (labels.includes("bod") || labels.includes("cod"))
  ) {
    return "Possible domestic wastewater or sewage-related discharge";
  }

  if (labels.includes("cod") && (labels.includes("ct") || labels.includes("ph"))) {
    return "Possible industrial or chemical discharge";
  }

  if (labels.includes("tr")) {
    return "Possible sediment runoff, erosion, or land disturbance";
  }

  if (labels.includes("nh3")) {
    return "Possible agricultural runoff or livestock-related pollution";
  }

  return "Potential mixed-source pollution requiring field verification";
}

function buildQuickInsightFallback(input: {
  aiInsight?: any;
  nwqsSummary?: any;
}) {
  const { aiInsight, nwqsSummary } = input;

  const overallClass =
    aiInsight?.overallClass || nwqsSummary?.overallClass || "III";
  const overallStatus =
    aiInsight?.riskLevel || nwqsSummary?.overallStatus || "Moderate";

  const dominantReason =
    nwqsSummary?.dominantReason ||
    (Array.isArray(aiInsight?.dominantParameters) &&
    aiInsight.dominantParameters.length > 0
      ? `mainly influenced by ${aiInsight.dominantParameters.join(", ")}`
      : "influenced by multiple core parameters");

  const recommendation =
    aiInsight?.recommendations?.[0] || "Closer monitoring is recommended.";

  return {
    insight: `The latest snapshot indicates a ${overallStatus.toLowerCase()} water quality condition at Class ${overallClass}, ${dominantReason}. This pattern suggests elevated pollution stress in the monitored area and should be reviewed together with recent trend movement. ${recommendation}`,
  };
}

function buildHistoricalDecisionFallback(input: {
  latestRow?: any;
  historicalSummary?: any;
  nwqsSummary?: any;
}) {
  const { historicalSummary, nwqsSummary } = input;

  const overallClass = nwqsSummary?.overallClass || "III";
  const riskLevel =
    nwqsSummary?.overallStatus
      ? deriveRiskLevelFromClass(nwqsSummary.overallClass)
      : "Moderate";

  const topDrivers: DriverSummary[] = Array.isArray(historicalSummary?.topDrivers)
    ? historicalSummary.topDrivers
    : [];

  const mainDriversText =
    topDrivers.length > 0
      ? topDrivers
          .slice(0, 3)
          .map(
            (d) =>
              `${d.label} (avg ${formatMetric(d.average, d.unit)}, latest ${formatMetric(
                d.latest,
                d.unit
              )})`
          )
          .join("; ")
      : "No dominant parameter identified";

  const primarySource =
    historicalSummary?.primarySource?.source ||
    guessPollutionSourceFromHistory(historicalSummary);

  const sourceReason =
    historicalSummary?.primarySource?.reason ||
    "This source hypothesis is inferred from the 30-day relationship among the dominant parameters.";

  const anomalyNotes: string[] = Array.isArray(historicalSummary?.anomalyNotes)
    ? historicalSummary.anomalyNotes
    : [];

  const recommendations = [
    "Increase monitoring frequency for the affected river segment.",
    "Verify dominant parameter spikes through field inspection.",
    "Inspect upstream discharge and runoff pathways.",
  ];

  if (topDrivers.some((d) => d.key === "NH_Sensor")) {
    recommendations.push(
      "Prioritise tracing ammonia-related input from domestic, agricultural, or livestock sources."
    );
  }

  if (topDrivers.some((d) => d.key === "COD_Sensor")) {
    recommendations.push(
      "Check for possible chemical or industrial pollution sources linked to COD pressure."
    );
  }

  const recommendedAction =
    primarySource.toLowerCase().includes("industrial")
      ? "Increase monitoring frequency and inspect possible industrial or chemical discharge points upstream."
      : primarySource.toLowerCase().includes("wastewater") ||
        primarySource.toLowerCase().includes("sewage")
      ? "Increase monitoring frequency and inspect possible domestic wastewater or sewage discharge sources."
      : primarySource.toLowerCase().includes("sediment")
      ? "Inspect runoff pathways, erosion-prone zones, and recent land disturbance affecting the river."
      : primarySource.toLowerCase().includes("agricultural")
      ? "Inspect nearby agricultural or livestock runoff pathways and validate ammonia-related loading."
      : "Increase monitoring frequency and investigate the dominant parameter drivers identified during the last 30 days.";

  const executiveSummary = `Over the last 30 days, the river condition is interpreted as ${riskLevel.toLowerCase()} risk, not merely from a single latest reading but from repeated monthly behaviour across the main parameters. The strongest contributors are ${mainDriversText}. This longer pattern suggests ${primarySource.toLowerCase()}, so the current decision should be read as a historical AI assessment rather than a generic snapshot-level statement.`;

  const periodOverview =
    topDrivers.length > 0
      ? `${topDrivers[0].label} was the strongest monthly driver with average ${formatMetric(
          topDrivers[0].average,
          topDrivers[0].unit
        )}, latest ${formatMetric(
          topDrivers[0].latest,
          topDrivers[0].unit
        )}, and exceedance rate ${topDrivers[0].exceedanceRate ?? 0}%. ${
          topDrivers[1]
            ? `${topDrivers[1].label} also remained influential with ${topDrivers[1].direction || "stable"} movement and maximum ${formatMetric(
                topDrivers[1].maximum,
                topDrivers[1].unit
              )}.`
            : ""
        }`
      : "No sufficient 30-day historical pattern is available.";

  return {
    title: "30-Day AI Decision Support",
    historicalWindowLabel: historicalSummary?.windowLabel || "Last 30 days",
    currentWaterQualityStatus:
      overallClass === "V" ? "Critical" : `Class ${overallClass}`,
    pollutionRiskLevel: riskLevel,
    confidenceScore: normalizeConfidence(historicalSummary?.confidenceScore, 80),
    executiveSummary,
    periodOverview,
    recommendedAction,
    recommendations: recommendations.slice(0, 5),
    mainContributorSummary: mainDriversText,
    predictedSourceOfPollution: primarySource,
    sourceRationale: sourceReason,
    dominantDrivers: topDrivers.slice(0, 5),
    likelySources: Array.isArray(historicalSummary?.sourceHypotheses)
      ? historicalSummary.sourceHypotheses
      : [],
    anomalyNotes: anomalyNotes.slice(0, 6),
  };
}

function buildExpandedHistoricalFallback(input: {
  aiDecision?: any;
  historicalSummary?: any;
  nwqsSummary?: any;
}) {
  const { aiDecision, historicalSummary, nwqsSummary } = input;

  const overallClass = nwqsSummary?.overallClass || "III";
  const riskLevel =
    aiDecision?.pollutionRiskLevel ||
    deriveRiskLevelFromClass(overallClass);

  const confidence = normalizeConfidence(
    aiDecision?.confidenceScore ?? historicalSummary?.confidenceScore,
    80
  );

  const dominantDrivers: DriverSummary[] = Array.isArray(
    aiDecision?.dominantDrivers
  )
    ? aiDecision.dominantDrivers
    : Array.isArray(historicalSummary?.topDrivers)
    ? historicalSummary.topDrivers
    : [];

  const sourceHypotheses: SourceHypothesis[] = Array.isArray(
    aiDecision?.likelySources
  )
    ? aiDecision.likelySources
    : Array.isArray(historicalSummary?.sourceHypotheses)
    ? historicalSummary.sourceHypotheses
    : [];

  const anomalyNotes: string[] = Array.isArray(aiDecision?.anomalyNotes)
    ? aiDecision.anomalyNotes
    : Array.isArray(historicalSummary?.anomalyNotes)
    ? historicalSummary.anomalyNotes
    : [];

  const source =
    aiDecision?.predictedSourceOfPollution ||
    historicalSummary?.primarySource?.source ||
    guessPollutionSourceFromHistory(historicalSummary);

  const recommendation =
    aiDecision?.recommendedAction ||
    "Increase monitoring frequency and investigate the dominant 30-day pollution drivers.";

  const driverNarrative =
    dominantDrivers.length > 0
      ? dominantDrivers
          .slice(0, 4)
          .map((driver) => {
            return `${driver.label} influenced the 30-day assessment through ${
              driver.direction || "stable"
            } behaviour, average ${formatMetric(
              driver.average,
              driver.unit
            )}, latest ${formatMetric(driver.latest, driver.unit)}, maximum ${formatMetric(
              driver.maximum,
              driver.unit
            )}, and exceedance rate ${driver.exceedanceRate ?? 0}%. ${
              driver.likelyImpact || ""
            }`;
          })
          .join(" ")
      : "No dominant driver pattern could be summarised from the available 30-day data.";

  const sourceDetail =
    sourceHypotheses.length > 0
      ? sourceHypotheses
          .slice(0, 3)
          .map(
            (item, index) =>
              `${index + 1}. ${item.source} (${normalizeConfidence(
                item.confidence,
                70
              )}% confidence): ${item.reason}`
          )
          .join(" ")
      : `${source}. This source remains a working hypothesis based on monthly parameter behaviour rather than direct proof.`;

  const anomalyNarrative =
    anomalyNotes.length > 0
      ? anomalyNotes.join(" ")
      : "No major anomaly note was generated from the 30-day dataset.";

  const monthlyPatternNarrative =
    dominantDrivers.length > 0
      ? `Across the last 30 days, the overall pattern was driven mainly by ${dominantDrivers
          .slice(0, 3)
          .map((d) => d.label)
          .join(", ")}. The AI decision therefore reflects repeated monthly stress, not a single isolated spike.`
      : "The monthly pattern could not be described in detail because the 30-day data is limited.";

  return {
    overallNarrative:
      "This expanded AI insight explains the water quality decision using the last 30 days of historical data. The result is grounded in repeated monthly behaviour of the dominant parameters, their numeric values, exceedance frequency, and the most plausible pollution-source hypothesis.",
    predictionTitle: "30-Day AI Prediction",
    predictionDetail: `The current river condition is predicted as ${
      aiDecision?.currentWaterQualityStatus || `Class ${overallClass}`
    }. This prediction is not derived from the latest snapshot alone, but from the repeated behaviour observed throughout the last 30 days. The model treats the condition as historically supported because the dominant parameters remained under pressure across multiple readings rather than appearing as a one-time fluctuation.`,
    interpretationTitle: "Historical AI Interpretation",
    interpretationDetail: `The AI interprets this river segment as ${riskLevel.toLowerCase()} risk because the dominant parameters repeatedly showed stress across the 30-day window. Key numeric contributors include ${dominantDrivers
      .slice(0, 3)
      .map(
        (d) =>
          `${d.label} with average ${formatMetric(d.average, d.unit)}, latest ${formatMetric(
            d.latest,
            d.unit
          )}, and exceedance rate ${d.exceedanceRate ?? 0}%`
      )
      .join("; ")}. This means the present condition is consistent with a sustained deterioration pattern rather than a generic model response.`,
    sourceTitle: "Predicted Source of Pollution",
    sourceDetail,
    confidenceTitle: "AI Confidence",
    confidenceDetail: `The confidence score of ${confidence}% reflects how strongly the last 30 days support the current interpretation through recurring exceedance patterns, repeated dominance of the same parameters, and the number of valid historical records analysed. This confidence should still be treated as decision-support confidence, not absolute certainty, because field validation is still necessary before confirming pollution origin.`,
    recommendationTitle: "AI Recommendation",
    recommendationDetail: `${recommendation} Operationally, the next step should focus on validating the dominant parameters in the field, checking upstream discharge points, and confirming whether the deterioration pattern is temporary, recurring, or intensifying over time.`,
    driverNarrative,
    anomalyNarrative,
    monthlyPatternNarrative,
  };
}

function sanitizeQuickInsight(parsed: any, fallback: any) {
  return {
    insight: parsed?.insight || fallback.insight,
  };
}

function sanitizeHistoricalDecision(parsed: any, fallback: any) {
  return {
    title: parsed?.title || fallback.title,
    historicalWindowLabel:
      parsed?.historicalWindowLabel || fallback.historicalWindowLabel,
    currentWaterQualityStatus:
      parsed?.currentWaterQualityStatus || fallback.currentWaterQualityStatus,
    pollutionRiskLevel:
      parsed?.pollutionRiskLevel || fallback.pollutionRiskLevel,
    confidenceScore: normalizeConfidence(
      parsed?.confidenceScore,
      fallback.confidenceScore
    ),
    executiveSummary: parsed?.executiveSummary || fallback.executiveSummary,
    periodOverview: parsed?.periodOverview || fallback.periodOverview,
    recommendedAction: parsed?.recommendedAction || fallback.recommendedAction,
    recommendations: Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : fallback.recommendations,
    mainContributorSummary:
      parsed?.mainContributorSummary || fallback.mainContributorSummary,
    predictedSourceOfPollution:
      parsed?.predictedSourceOfPollution || fallback.predictedSourceOfPollution,
    sourceRationale: parsed?.sourceRationale || fallback.sourceRationale,
    dominantDrivers: Array.isArray(parsed?.dominantDrivers)
      ? parsed.dominantDrivers
      : fallback.dominantDrivers,
    likelySources: Array.isArray(parsed?.likelySources)
      ? parsed.likelySources
      : fallback.likelySources,
    anomalyNotes: Array.isArray(parsed?.anomalyNotes)
      ? parsed.anomalyNotes
      : fallback.anomalyNotes,
  };
}

function sanitizeExpandedHistorical(parsed: any, fallback: any) {
  return {
    overallNarrative: parsed?.overallNarrative || fallback.overallNarrative,
    predictionTitle: parsed?.predictionTitle || fallback.predictionTitle,
    predictionDetail: parsed?.predictionDetail || fallback.predictionDetail,
    interpretationTitle:
      parsed?.interpretationTitle || fallback.interpretationTitle,
    interpretationDetail:
      parsed?.interpretationDetail || fallback.interpretationDetail,
    sourceTitle: parsed?.sourceTitle || fallback.sourceTitle,
    sourceDetail: parsed?.sourceDetail || fallback.sourceDetail,
    confidenceTitle: parsed?.confidenceTitle || fallback.confidenceTitle,
    confidenceDetail: parsed?.confidenceDetail || fallback.confidenceDetail,
    recommendationTitle:
      parsed?.recommendationTitle || fallback.recommendationTitle,
    recommendationDetail:
      parsed?.recommendationDetail || fallback.recommendationDetail,
    driverNarrative: parsed?.driverNarrative || fallback.driverNarrative,
    anomalyNarrative: parsed?.anomalyNarrative || fallback.anomalyNarrative,
    monthlyPatternNarrative:
      parsed?.monthlyPatternNarrative || fallback.monthlyPatternNarrative,
  };
}

async function callOpenAI(messages: ChatMessage[], maxTokens = 1800) {
  const res = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages,
  });

  return res.choices?.[0]?.message?.content?.trim() || "{}";
}

async function callDeepSeek(messages: ChatMessage[], maxTokens = 1800) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages,
    }),
  });

  const raw = await res.text();

  if (!res.ok) {
    const detail = safeJsonParse(raw) || raw;
    throw new Error(
      typeof detail === "string"
        ? `DeepSeek API failed: ${detail}`
        : "DeepSeek API failed"
    );
  }

  const data = safeJsonParse(raw);
  return data?.choices?.[0]?.message?.content?.trim() || "{}";
}

async function runProvider(params: {
  provider: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}) {
  const { provider, systemPrompt, userPrompt, maxTokens = 1800 } = params;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  if (provider === "openai") {
    return callOpenAI(messages, maxTokens);
  }

  if (provider === "deepseek") {
    return callDeepSeek(messages, maxTokens);
  }

  throw new Error("Invalid provider");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      provider = "openai",
      mode = "historical_decision_30d",
      latestRow,
      rows,
      aiInsight,
      aiDecision,
      nwqsSummary,
      historicalSummary,
      historicalWindowDays = 30,
    } = body;

    const safeRows = Array.isArray(rows) ? rows.slice(0, 500) : [];

    if (!latestRow && safeRows.length === 0) {
      return NextResponse.json(
        { error: "Missing latestRow or rows" },
        { status: 400 }
      );
    }

    if (mode === "quick_insight") {
      const fallback = buildQuickInsightFallback({
        aiInsight,
        nwqsSummary,
      });

      const systemPrompt = `
You are an environmental AI analyst for a river water quality dashboard.

Your task is to generate a brief AI insight for the Latest Snapshot section.

Rules:
- Write one short paragraph only.
- Write 2 to 4 sentences.
- Keep it concise but still informative.
- Mention the current condition and likely main drivers when supported.
- Avoid scientific overclaim.
- Do not invent unsupported numeric values.
- Do not return bullet points.
- Return valid JSON only.
- Do not include markdown fences.
`;

      const userPayload = {
        latestRow: latestRow || null,
        recentRows: safeRows.slice(0, 60),
        nwqsSummary: nwqsSummary || null,
        aiInsight: aiInsight || null,
        outputFormat: {
          insight: "string",
        },
      };

      const userPrompt = `
Generate a brief AI insight in valid JSON with exactly this key:
- insight

Requirements:
- 2 to 4 sentences
- one paragraph only
- concise but not too short
- suitable for dashboard display
- professional and readable
- return only valid JSON

Input:
${JSON.stringify(userPayload, null, 2)}
`;

      const content = await runProvider({
        provider,
        systemPrompt,
        userPrompt,
        maxTokens: 320,
      });

      const parsed = safeJsonParse(stripCodeFence(content));
      const sanitized = sanitizeQuickInsight(parsed, fallback);

      return NextResponse.json(sanitized);
    }

    if (mode === "historical_decision_30d") {
      const fallback = buildHistoricalDecisionFallback({
        latestRow,
        historicalSummary,
        nwqsSummary,
      });

      const systemPrompt = `
You are an environmental AI analyst for river water quality monitoring.

Your task is to generate a detailed but concise AI decision summary for a dashboard panel.
This panel MUST be based on the historical pattern over the last 30 days, not only the latest snapshot.

Rules:
- Treat the result as 30-day historical decision support.
- Mention the main influencing parameters with concrete numeric values when available.
- Mention what likely drives the pollution pattern across the month.
- Predicted Source of Pollution must remain a likely hypothesis, not a confirmed fact.
- Recommendations must be practical and operational.
- Confidence Score must be an integer from 0 to 100.
- Do not invent unsupported values.
- Do not write vague generic summary if numeric evidence is available.
- Return valid JSON only.
- Do not include markdown fences.
`;

      const userPayload = {
        historicalWindowDays,
        latestRow: latestRow || null,
        historicalRows: safeRows,
        historicalSummary: historicalSummary || null,
        nwqsSummary: nwqsSummary || null,
        outputFormat: {
          title: "string",
          historicalWindowLabel: "string",
          currentWaterQualityStatus: "string",
          pollutionRiskLevel: "string",
          confidenceScore: "number",
          executiveSummary: "string",
          periodOverview: "string",
          recommendedAction: "string",
          recommendations: ["string"],
          mainContributorSummary: "string",
          predictedSourceOfPollution: "string",
          sourceRationale: "string",
          dominantDrivers: [
            {
              label: "string",
              latest: "number|null",
              average: "number|null",
              maximum: "number|null",
              exceedanceRate: "number|null",
              direction: "string",
              likelyImpact: "string",
            },
          ],
          likelySources: [
            {
              source: "string",
              confidence: "number",
              reason: "string",
            },
          ],
          anomalyNotes: ["string"],
        },
      };

      const userPrompt = `
Generate a 30-day AI Decision Support response in valid JSON with exactly these keys:
- title
- historicalWindowLabel
- currentWaterQualityStatus
- pollutionRiskLevel
- confidenceScore
- executiveSummary
- periodOverview
- recommendedAction
- recommendations
- mainContributorSummary
- predictedSourceOfPollution
- sourceRationale
- dominantDrivers
- likelySources
- anomalyNotes

Requirements:
- executiveSummary: 3 to 5 sentences
- periodOverview: 2 to 4 sentences
- mainContributorSummary: mention the strongest parameters with numbers when available
- predictedSourceOfPollution: a plausible hypothesis such as domestic wastewater, industrial discharge, runoff, agriculture, sediment, or mixed-source
- sourceRationale: explain why that source is suspected
- dominantDrivers: preserve concrete numbers where available
- anomalyNotes: concise operational notes based on monthly pattern
- return only valid JSON

Input:
${JSON.stringify(userPayload, null, 2)}
`;

      const content = await runProvider({
        provider,
        systemPrompt,
        userPrompt,
        maxTokens: 1800,
      });

      const parsed = safeJsonParse(stripCodeFence(content));
      const sanitized = sanitizeHistoricalDecision(parsed, fallback);

      return NextResponse.json(sanitized);
    }

    if (mode === "expanded_historical_decision_detail") {
      const fallback = buildExpandedHistoricalFallback({
        aiDecision,
        historicalSummary,
        nwqsSummary,
      });

      const systemPrompt = `
You are an environmental AI analyst for river water quality monitoring.

Your task is to expand a compact 30-day historical AI decision into a richer modal explanation.

Rules:
- This explanation MUST be grounded in the last 30 days of historical data.
- Explain which parameters influenced the decision and include concrete numeric values when available.
- Explain likely pollution-source hypotheses such as domestic wastewater, industrial activity, runoff, agriculture, sediment, or mixed-source pollution.
- Keep source attribution as hypothesis, not proof.
- Avoid vague generic wording when evidence is present.
- Be detailed, practical, and readable for dashboard users.
- Do not invent unsupported numbers.
- Return valid JSON only.
- Do not include markdown fences.
`;

      const userPayload = {
        historicalWindowDays,
        latestRow: latestRow || null,
        historicalRows: safeRows,
        aiDecision: aiDecision || null,
        historicalSummary: historicalSummary || null,
        nwqsSummary: nwqsSummary || null,
        outputFormat: {
          overallNarrative: "string",
          predictionTitle: "string",
          predictionDetail: "string",
          interpretationTitle: "string",
          interpretationDetail: "string",
          sourceTitle: "string",
          sourceDetail: "string",
          confidenceTitle: "string",
          confidenceDetail: "string",
          recommendationTitle: "string",
          recommendationDetail: "string",
          driverNarrative: "string",
          anomalyNarrative: "string",
          monthlyPatternNarrative: "string",
        },
      };

      const userPrompt = `
Generate an expanded 30-day AI insight in valid JSON with exactly these keys:
- overallNarrative
- predictionTitle
- predictionDetail
- interpretationTitle
- interpretationDetail
- sourceTitle
- sourceDetail
- confidenceTitle
- confidenceDetail
- recommendationTitle
- recommendationDetail
- driverNarrative
- anomalyNarrative
- monthlyPatternNarrative

Requirements:
- all explanations must refer to the last 30 days, not only the latest reading
- predictionDetail: explain what the 30-day prediction means in practice
- interpretationDetail: explain why the AI interprets the condition that way using monthly evidence
- sourceDetail: describe likely pollution-source hypotheses and include why they are suspected
- confidenceDetail: explain how to interpret the confidence
- recommendationDetail: explain what actions should follow operationally
- driverNarrative: clearly mention parameter names and numeric values where available
- anomalyNarrative: summarise notable anomalies over the month
- monthlyPatternNarrative: explain the broader one-month pollution pattern
- each major detail should be about 3 to 6 sentences
- return only valid JSON

Input:
${JSON.stringify(userPayload, null, 2)}
`;

      const content = await runProvider({
        provider,
        systemPrompt,
        userPrompt,
        maxTokens: 2200,
      });

      const parsed = safeJsonParse(stripCodeFence(content));
      const sanitized = sanitizeExpandedHistorical(parsed, fallback);

      return NextResponse.json(sanitized);
    }

    return NextResponse.json(
      { error: `Invalid mode: ${String(mode)}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}