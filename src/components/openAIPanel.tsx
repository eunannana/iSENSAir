"use client";

import { useState, useEffect } from "react";

/* ================= TYPES ================= */
type Props = {
  rows: any[];
};

/* ================= CATEGORIES ================= */
const CATEGORIES = [
  {
    label: "Trend and Behavior Insights",
    icon: "📊",
    prompts: [
      "Summarize the recent 7-day trend for all parameters.",
      "Which parameters show an increasing trend over the past month?",
      "Highlight any abnormal changes or spikes in the last 24 hours.",
      "Compare today’s readings with the monthly average.",
    ],
  },
  {
    label: "Anomaly and Threshold Detection",
    icon: "⚠️",
    prompts: [
      "List parameters exceeding threshold limits in the last 7 days.",
      "Which parameter had the highest deviation from normal range?",
      "What is the likely cause of recent pH fluctuations?",
    ],
  },
  {
    label: "Prediction and Early Warning",
    icon: "🧠",
    prompts: [
      "Predict pollution risk in the next 3 days.",
      "What is the risk level of deterioration this week?",
    ],
  },
  {
    label: "Performance Summary",
    icon: "📈",
    prompts: [
      "Provide a weekly water quality summary.",
      "Is water quality within acceptable standards?",
      "Which parameter influences overall quality today?",
    ],
  },
];

/* ================= COMPONENT ================= */
export default function OpenAIPanel({ rows }: Props) {
  const [catIdx, setCatIdx] = useState(0);
  const [promptIdx, setPromptIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string>("");
  const [displayed, setDisplayed] = useState<string>("");

  const category = CATEGORIES[catIdx];
  const prompt = category.prompts[promptIdx];

  /* ================= TYPING EFFECT ================= */
  useEffect(() => {
    if (!answer) return;

    setDisplayed("");
    let i = 0;

    const interval = setInterval(() => {
      if (i >= answer.length) {
        clearInterval(interval);
        return;
      }
      setDisplayed((prev) => prev + answer[i]);
      i++;
    }, 8);

    return () => clearInterval(interval);
  }, [answer]);

  /* ================= API CALL ================= */
  async function handleAsk() {
    if (!rows || rows.length === 0) {
      setAnswer("No data available for analysis.");
      return;
    }

    setLoading(true);
    setAnswer("");
    setDisplayed("");

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.label,
          prompt,
          rows,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "AI request failed.");
      }

      const safeText =
        typeof data?.text === "string"
          ? data.text
          : "No response received from AI.";

      setAnswer(safeText);
    } catch (err: any) {
      setAnswer(`Error: ${err?.message || "Unknown error occurred."}`);
    } finally {
      setLoading(false);
    }
  }

  /* ================= COPY ================= */
  function copyToClipboard() {
    if (!answer) return;
    navigator.clipboard.writeText(answer);
  }

  /* ================= EXPORT ================= */
  function exportInsight() {
    if (!answer) return;

    const blob = new Blob([answer], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AI_Insight_Report.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ================= UI ================= */
  return (
    <section className="w-full max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 p-6 flex flex-col max-h-[85vh]">

      {/* HEADER */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500" />
        <h2 className="text-lg font-semibold text-gray-800">
          AI Insight Analysis
        </h2>
      </div>

      {/* SELECTORS */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-gray-600">Category</label>
          <select
            value={catIdx}
            onChange={(e) => {
              setCatIdx(Number(e.target.value));
              setPromptIdx(0);
            }}
            className="w-full mt-1 rounded-lg bg-gray-100 px-4 py-2 text-sm"
          >
            {CATEGORIES.map((c, i) => (
              <option key={i} value={i}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-600">Prompt</label>
          <select
            value={promptIdx}
            onChange={(e) => setPromptIdx(Number(e.target.value))}
            className="w-full mt-1 rounded-lg bg-gray-100 px-4 py-2 text-sm"
          >
            {category.prompts.map((p, i) => (
              <option key={i} value={i}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* BUTTON */}
      <div className="mt-4">
        <button
          onClick={handleAsk}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60"
        >
          {loading ? "Analyzing..." : "Get Insight"}
        </button>
      </div>

      {/* ANSWER */}
      {answer && (
        <div className="mt-6 flex flex-col flex-1 overflow-hidden">

          <div className="flex justify-end gap-4 text-xs mb-2">
            <button
              onClick={copyToClipboard}
              className="text-blue-600 hover:underline"
            >
              Copy
            </button>
            <button
              onClick={exportInsight}
              className="text-green-600 hover:underline"
            >
              Export
            </button>
          </div>

          <div className="overflow-y-auto bg-gray-50 border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[45vh]">
            {displayed}
            {loading && (
              <span className="inline-block w-1 h-4 bg-gray-500 ml-1 animate-pulse"></span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}