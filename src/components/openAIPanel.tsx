"use client";

import { useState } from "react";

type Props = {
  rows: any[];
  latestRow: any;
  aiInsight: {
    overallClass: string;
    riskScore: number;
    riskLevel: string;
    dominantParameters: string[];
    trendSummary: any[];
    anomalies: any[];
    recommendations: string[];
    narrative: string;
  };
  nwqsSummary: {
    overallClass: string;
    overallStatus: string;
    dominantParameters: string[];
    useRecommendation: string;
    lastUpdated?: string;
  };
};

type AIDecisionResponse = {
  currentWaterQualityStatus: string;
  pollutionRiskLevel: string;
  predictedSourceOfPollution: string;
  confidenceScore: number;
  recommendedAction: string;
  executiveSummary: string;
};

function getRiskBadgeClass(riskLevel?: string) {
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

export default function OpenAIPanel({
  rows,
  latestRow,
  aiInsight,
  nwqsSummary,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIDecisionResponse | null>(null);
  const [error, setError] = useState<string>("");

  async function handleAnalyze() {
    if (!rows || rows.length === 0) {
      setError("No data available for analysis.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          latestRow,
          rows: rows.slice(0, 100),
          aiInsight,
          nwqsSummary,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "AI request failed.");
      }

      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Unknown error occurred.");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!result) return;

    const content = `
AI Decision Panel

Current Water Quality Status:
${result.currentWaterQualityStatus}

Pollution Risk Level:
${result.pollutionRiskLevel}

Predicted Source of Pollution:
${result.predictedSourceOfPollution}

Confidence Score:
${result.confidenceScore}%

Recommended Action:
${result.recommendedAction}

Executive Summary:
${result.executiveSummary}
    `.trim();

    navigator.clipboard.writeText(content);
  }

  function exportInsight() {
    if (!result) return;

    const content = `
AI Decision Panel

Current Water Quality Status:
${result.currentWaterQualityStatus}

Pollution Risk Level:
${result.pollutionRiskLevel}

Predicted Source of Pollution:
${result.predictedSourceOfPollution}

Confidence Score:
${result.confidenceScore}%

Recommended Action:
${result.recommendedAction}

Executive Summary:
${result.executiveSummary}
    `.trim();

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AI_Decision_Panel.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="w-full max-w-5xl mx-auto bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500" />
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            AI Decision Panel
          </h2>
          <p className="text-sm text-gray-500">
            LLM-based interpretation for water quality monitoring and decision support
          </p>
        </div>
      </div>

      {/* Top AI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="rounded-xl border bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-1">AI Water Quality Class</p>
          <p className="text-lg font-semibold text-gray-900">
            Class {aiInsight.overallClass}
          </p>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-1">AI Risk Alert</p>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getRiskBadgeClass(
              aiInsight.riskLevel
            )}`}
          >
            {aiInsight.riskLevel}
          </span>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-1">
            Likely Pollution Contributor
          </p>
          <p className="text-sm font-medium text-gray-800">
            {aiInsight.dominantParameters?.length > 0
              ? aiInsight.dominantParameters.join(", ")
              : "Not identified"}
          </p>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-1">Confidence Percentage</p>
          <p className="text-lg font-semibold text-gray-900">
            {result?.confidenceScore ?? Math.min(95, Math.max(60, aiInsight.riskScore))}%
          </p>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-1">Last Updated Time</p>
          <p className="text-sm font-medium text-gray-800">
            {nwqsSummary.lastUpdated || latestRow?.Timestamp || "-"}
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60"
        >
          {loading ? "Generating AI Decision..." : "Generate AI Decision"}
        </button>

        {result && (
          <>
            <button
              onClick={copyToClipboard}
              className="text-sm text-blue-600 hover:underline"
            >
              Copy
            </button>
            <button
              onClick={exportInsight}
              className="text-sm text-green-600 hover:underline"
            >
              Export
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* AI Decision Panel Output */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-3">
              AI Decision Panel
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">
                  Current Water Quality Status
                </p>
                <p className="text-sm font-medium text-gray-800">
                  {result.currentWaterQualityStatus}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">
                  Pollution Risk Level
                </p>
                <p className="text-sm font-medium text-gray-800">
                  {result.pollutionRiskLevel}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">
                  Predicted Source of Pollution
                </p>
                <p className="text-sm font-medium text-gray-800">
                  {result.predictedSourceOfPollution}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Confidence Score</p>
                <p className="text-sm font-medium text-gray-800">
                  {result.confidenceScore}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 mt-4">
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Recommended Action</p>
                <p className="text-sm font-medium text-gray-800">
                  {result.recommendedAction}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Executive Summary</p>
                <p className="text-sm leading-relaxed text-gray-700">
                  {result.executiveSummary}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}