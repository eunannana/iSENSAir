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

function guessPollutionSource(aiInsight?: any) {
  const dominant = aiInsight?.dominantParameters || [];
  const anomalyText = (aiInsight?.anomalies || [])
    .map((a: any) => `${a.label} ${a.message}`)
    .join(" ")
    .toLowerCase();

  if (
    dominant.includes("Ammonia") &&
    (dominant.includes("COD") || dominant.includes("BOD"))
  ) {
    return "Possible domestic wastewater or organic discharge";
  }

  if (dominant.includes("Turbidity")) {
    return "Possible sediment runoff or land disturbance";
  }

  if (dominant.includes("Conductivity") || anomalyText.includes("ph")) {
    return "Possible chemical or industrial discharge";
  }

  if (dominant.includes("DO")) {
    return "Possible oxygen depletion caused by organic contamination";
  }

  return "Potential mixed-source pollution requires further investigation";
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

function buildDecisionSummaryFallback(input: {
  aiInsight?: any;
  latestRow?: any;
  nwqsSummary?: any;
}) {
  const { aiInsight, nwqsSummary } = input;

  const overallClass =
    aiInsight?.overallClass || nwqsSummary?.overallClass || "III";
  const riskLevel =
    aiInsight?.riskLevel || nwqsSummary?.overallStatus || "Moderate";

  const dominantParameters =
    Array.isArray(aiInsight?.dominantParameters) &&
    aiInsight.dominantParameters.length > 0
      ? aiInsight.dominantParameters.join(", ")
      : "multiple parameters";

  const recommendation =
    aiInsight?.recommendations?.[0] || "Continue routine monitoring.";

  const source = guessPollutionSource(aiInsight);

  return {
    currentWaterQualityStatus:
      riskLevel === "Critical" ? "Critical" : `Class ${overallClass}`,
    pollutionRiskLevel: riskLevel,
    predictedSourceOfPollution: source,
    confidenceScore: normalizeConfidence(aiInsight?.riskScore, 78),
    recommendedAction: recommendation,
    executiveSummary: `Water quality is assessed as ${riskLevel.toLowerCase()}, with dominant influence from ${dominantParameters}. Current conditions suggest that closer monitoring and response planning may be required.`,
  };
}

function buildExpandedDetailFallback(input: {
  aiDecision?: any;
  aiInsight?: any;
}) {
  const { aiDecision, aiInsight } = input;

  const confidence = normalizeConfidence(
    aiDecision?.confidenceScore ?? aiInsight?.riskScore,
    78
  );

  const overallClass = aiInsight?.overallClass || "III";
  const riskLevel =
    aiDecision?.pollutionRiskLevel || aiInsight?.riskLevel || "Moderate";
  const source =
    aiDecision?.predictedSourceOfPollution || guessPollutionSource(aiInsight);
  const recommendation =
    aiDecision?.recommendedAction ||
    aiInsight?.recommendations?.[0] ||
    "Continue routine monitoring.";

  const dominantParameters =
    Array.isArray(aiInsight?.dominantParameters) &&
    aiInsight.dominantParameters.length > 0
      ? aiInsight.dominantParameters.join(", ")
      : "multiple water quality parameters";

  const anomalyText =
    Array.isArray(aiInsight?.anomalies) && aiInsight.anomalies.length > 0
      ? aiInsight.anomalies
          .slice(0, 3)
          .map((item: any) => `${item.label}: ${item.message}`)
          .join("; ")
      : "no major abrupt anomaly was detected";

  return {
    overallNarrative:
      "This expanded AI insight explains the current decision in more detail so the user can understand the predicted condition, the reasoning behind the interpretation, the likely pollution source, the meaning of the confidence score, and the operational recommendation that should follow.",
    predictionTitle: "AI Prediction",
    predictionDetail: `The current river condition is predicted as ${
      aiDecision?.currentWaterQualityStatus || `Class ${overallClass}`
    }. This indicates that the latest sensor pattern is consistent with a degraded water quality state. The classification is influenced by the combined behaviour of several parameters rather than a single isolated reading, which means the overall condition should be interpreted as a system-level warning signal for the monitored area.`,
    interpretationTitle: "AI Interpretation",
    interpretationDetail: `The AI interprets the current condition as ${riskLevel.toLowerCase()} because the recent readings show strong influence from ${dominantParameters}. Recent anomaly and trend observations further support this interpretation, including ${anomalyText}. This suggests that pollutant pressure is not only present, but may already be affecting river stability and short-term environmental safety.`,
    sourceTitle: "Predicted Source of Pollution",
    sourceDetail: `${source}. This source is treated as a likely hypothesis derived from the relationship among the dominant parameters, anomaly signals, and recent trend direction. It should be used to guide field verification, inspection of upstream and downstream conditions, and assessment of nearby discharge activities, rather than as final proof of pollution origin.`,
    confidenceTitle: "AI Confidence",
    confidenceDetail: `The confidence score of ${confidence}% indicates that the AI assessment is supported by a relatively consistent pattern across the latest readings, historical trend behaviour, and current risk indicators. This score should be interpreted as decision-support confidence, not as absolute certainty. Field validation, operational checks, and contextual knowledge are still important before making regulatory or emergency actions.`,
    recommendationTitle: "AI Recommendation",
    recommendationDetail: `${recommendation} This recommendation is prioritised because the current pattern suggests a meaningful risk to river condition. Operationally, the response should focus on increasing monitoring frequency, checking suspected discharge points, comparing measurements across nearby locations, and documenting whether the deterioration is temporary, recurring, or intensifying over time.`,
  };
}

function sanitizeQuickInsight(parsed: any, fallback: any) {
  return {
    insight: parsed?.insight || fallback.insight,
  };
}

function sanitizeDecisionSummary(parsed: any, fallback: any) {
  return {
    currentWaterQualityStatus:
      parsed?.currentWaterQualityStatus || fallback.currentWaterQualityStatus,
    pollutionRiskLevel:
      parsed?.pollutionRiskLevel || fallback.pollutionRiskLevel,
    predictedSourceOfPollution:
      parsed?.predictedSourceOfPollution || fallback.predictedSourceOfPollution,
    confidenceScore: normalizeConfidence(
      parsed?.confidenceScore,
      fallback.confidenceScore
    ),
    recommendedAction:
      parsed?.recommendedAction || fallback.recommendedAction,
    executiveSummary: parsed?.executiveSummary || fallback.executiveSummary,
  };
}

function sanitizeExpandedDetail(parsed: any, fallback: any) {
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
  };
}

async function callOpenAI(messages: ChatMessage[], maxTokens = 1400) {
  const res = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages,
  });

  return res.choices?.[0]?.message?.content?.trim() || "{}";
}

async function callDeepSeek(messages: ChatMessage[], maxTokens = 1400) {
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
  const { provider, systemPrompt, userPrompt, maxTokens = 1400 } = params;

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
      mode = "decision_summary",
      latestRow,
      rows,
      aiInsight,
      aiDecision,
      nwqsSummary,
    } = body;

    const safeRows = Array.isArray(rows) ? rows.slice(0, 150) : [];

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
        maxTokens: 300,
      });

      const parsed = safeJsonParse(stripCodeFence(content));
      const sanitized = sanitizeQuickInsight(parsed, fallback);

      return NextResponse.json(sanitized);
    }

    if (mode === "decision_summary") {
      const fallback = buildDecisionSummaryFallback({
        latestRow,
        aiInsight,
        nwqsSummary,
      });

      const systemPrompt = `
You are an environmental AI analyst for river water quality monitoring.

Your task is to generate a concise decision summary for a dashboard panel.

Rules:
- Focus on operational interpretation, not scientific overclaim.
- Be concise, specific, and decision-oriented.
- Do not invent unsupported numeric values.
- Predicted Source of Pollution must be a likely hypothesis, not a confirmed fact.
- Confidence Score must be an integer from 0 to 100.
- Recommended Action must be practical and short.
- Return valid JSON only.
- Do not include markdown fences.
`;

      const userPayload = {
        latestRow: latestRow || null,
        recentRows: safeRows,
        nwqsSummary: nwqsSummary || null,
        aiInsight: aiInsight || null,
        outputFormat: {
          currentWaterQualityStatus: "string",
          pollutionRiskLevel: "string",
          predictedSourceOfPollution: "string",
          confidenceScore: "number",
          recommendedAction: "string",
          executiveSummary: "string",
        },
      };

      const userPrompt = `
Generate an AI Decision Panel in valid JSON with exactly these keys:
- currentWaterQualityStatus
- pollutionRiskLevel
- predictedSourceOfPollution
- confidenceScore
- recommendedAction
- executiveSummary

Requirements:
- currentWaterQualityStatus: short phrase such as "Good", "Moderate", "Critical", or "Class IV"
- pollutionRiskLevel: one of Low, Moderate, High, Critical when possible
- executiveSummary: 2 to 4 sentences, concise but informative

Input:
${JSON.stringify(userPayload, null, 2)}
`;

      const content = await runProvider({
        provider,
        systemPrompt,
        userPrompt,
        maxTokens: 1400,
      });

      const parsed = safeJsonParse(stripCodeFence(content));
      const sanitized = sanitizeDecisionSummary(parsed, fallback);

      return NextResponse.json(sanitized);
    }

    if (mode === "expanded_decision_detail") {
      const fallback = buildExpandedDetailFallback({
        aiDecision,
        aiInsight,
      });

      const systemPrompt = `
You are an environmental AI analyst for river water quality monitoring.

Your task is to expand a compact dashboard decision into a more detailed explanation for a modal popup.

Rules:
- Expand each decision component with meaningful detail.
- Do not simply repeat the same short sentence from the summary panel.
- Explain the reasoning, implication, and practical meaning of each section.
- Do not invent unsupported numeric values.
- Keep Predicted Source of Pollution as a hypothesis, not a confirmed fact.
- The tone should be professional, clear, and operationally useful.
- Return valid JSON only.
- Do not include markdown fences.
`;

      const userPayload = {
        latestRow: latestRow || null,
        recentRows: safeRows,
        nwqsSummary: nwqsSummary || null,
        aiInsight: aiInsight || null,
        aiDecision: aiDecision || null,
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
        },
      };

      const userPrompt = `
Generate a detailed expanded AI insight in valid JSON with exactly these keys:
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

Requirements:
- clearly more detailed than the compact dashboard cards
- predictionDetail: explain what the prediction means in practice
- interpretationDetail: explain why the AI interprets the condition that way
- sourceDetail: explain the likely pollution-source hypothesis and its limits
- confidenceDetail: explain how the confidence should be interpreted
- recommendationDetail: explain what practical next actions should follow
- each detail should usually be around 2 to 5 sentences
- return only valid JSON

Input:
${JSON.stringify(userPayload, null, 2)}
`;

      const content = await runProvider({
        provider,
        systemPrompt,
        userPrompt,
        maxTokens: 1400,
      });

      const parsed = safeJsonParse(stripCodeFence(content));
      const sanitized = sanitizeExpandedDetail(parsed, fallback);

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