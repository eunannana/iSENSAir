"use client";
import { useMemo, useState } from "react";

// ===== preset prompts =====
const CATEGORIES: { key: string; label: string; icon?: string; prompts: string[] }[] = [
    {
        key: "trend",
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
        key: "anomaly",
        label: "Anomaly and Threshold Detection",
        icon: "⚠",
        prompts: [
            "List all parameters that exceeded threshold limits in the last 7 days.",
            "Which parameter had the highest deviation from normal range?",
            "What is the likely cause of recent pH fluctuations?",
        ],
    },
    {
        key: "predict",
        label: "Prediction and Early Warning",
        icon: "🧠",
        prompts: [
            "Predict possible pollution risk in the next 3 days based on current data.",
            "What is the risk level of water quality deterioration this week?",
        ],
    },
    {
        key: "source",
        label: "Source Attribution",
        icon: "🏭",
        prompts: [
            "Based on recent data patterns, what is the probable pollution source?",
            "Are the parameter spikes consistent with industrial activity from oil palm mill or nursery?",
        ],
    },
    {
        key: "summary",
        label: "Performance and Quality Summary",
        icon: "📈",
        prompts: [
            "Provide a summary of water quality condition for this week.",
            "Is the water quality within acceptable environmental standards?",
            "Which parameter most influences overall water quality today?",
        ],
    },
];

// ===== helpers =====
function guessTimeKey(schema: Record<string, string>) {
    const keys = Object.keys(schema);
    const cands = ["time", "timestamp", "datetime", "date", "created_at", "ts"];
    const byName = keys.find((k) => cands.includes(k.toLowerCase()));
    return byName || "";
}

function numericCols(schema: Record<string, string>) {
    return Object.entries(schema)
        .filter(([k, t]) => t === "number" && !/^unnamed:\s*\d+/i.test(k))
        .map(([k]) => k);
}

function basicStats(values: number[]) {
    const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const n = clean.length;
    if (!n) return { count: 0, mean: null, median: null, min: null, max: null, stdev: null };
    const sum = clean.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const median = n % 2 ? clean[(n - 1) / 2] : (clean[n / 2 - 1] + clean[n / 2]) / 2;
    const min = clean[0], max = clean[n - 1];
    const varc = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1 || 1);
    const stdev = Math.sqrt(varc);
    return { count: n, mean, median, min, max, stdev };
}

function makeSummary(rows: Record<string, unknown>[], schema: Record<string, string>) {
    const timeKey = guessTimeKey(schema);
    const nums = numericCols(schema);

    // Ambil maksimal 200 titik terbaru untuk konteks pola
    const recent = (timeKey
        ? [...rows]
            .filter((r) => r?.[timeKey] != null)
            .sort((a, b) => new Date(a[timeKey] as string | number | Date).valueOf() - new Date(b[timeKey] as string | number | Date).valueOf())
        : [...rows]
    )
        .slice(-800) // ambil 800 baris terakhir
        .filter(Boolean);

    const step = Math.max(1, Math.floor(recent.length / 200)); // downsample ke ±200
    const recentSeries = recent.filter((_, i) => i % step === 0).map((r) => {
        const obj: any = {};
        if (timeKey) obj[timeKey] = r[timeKey];
        for (const k of nums) obj[k] = typeof r[k] === "number" ? r[k] : Number(r[k]);
        return obj;
    });

    // Stats per parameter (di seluruh data agar stabil)
    const stats: Record<string, any> = {};
    for (const k of nums) {
        const vals = rows.map((r) => Number(r?.[k])).filter((v) => Number.isFinite(v));
        stats[k] = basicStats(vals);
    }

    return {
        timeKey,
        columns: nums,
        count_rows: rows.length,
        stats,
        recentSeries,
        note: "recentSeries is downsampled to ~200 points for token efficiency.",
    };
}

export default function DeepseekPanel({
    rows,
    schema,
}: {
    rows: Record<string, unknown>[];
    schema: Record<string, string>;
}) {
    const [catIdx, setCatIdx] = useState(0);
    const [promptIdx, setPromptIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [answer, setAnswer] = useState<string>("");

    const category = CATEGORIES[catIdx];
    const prompt = category.prompts[promptIdx] || category.prompts[0];

    const payload = useMemo(() => makeSummary(rows, schema), [rows, schema]);

    async function handleAsk() {
        setLoading(true);
        setAnswer("");
        try {
            const res = await fetch("/api/openai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category: `${category.icon || ""} ${category.label}`,
                    prompt,
                    payload,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "DeepSeek failed");
            setAnswer(data.text || "");
        } catch (e: any) {
            setAnswer(`Error: ${e?.message || e}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-fuchsia-400 to-purple-400" />
                <h2 className="text-2xl font-semibold text-gray-800">
                    Get Insight with OpenAI Integration
                </h2>
            </div>

            <p className="mt-2 text-sm text-gray-600">
                Choose a question from the dropdowns below, then click <span className="font-medium">Get Insight</span> to analyze your data.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-gray-700">
                    Choose a Category
                    <div className="mt-1">
                        <select
                            className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
                            value={catIdx}
                            onChange={(e) => {
                                const i = Number(e.target.value);
                                setCatIdx(i);
                                setPromptIdx(0);
                            }}
                        >
                            {CATEGORIES.map((c, i) => (
                                <option key={c.key} value={i}>
                                    {(c.icon || "•") + " " + c.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>

                <label className="text-sm text-gray-700">
                    Choose a Prompt
                    <div className="mt-1">
                        <select
                            className="w-full rounded-lg bg-gray-100 px-4 py-3 text-gray-800"
                            value={promptIdx}
                            onChange={(e) => setPromptIdx(Number(e.target.value))}
                        >
                            {category.prompts.map((p, i) => (
                                <option key={i} value={i}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>
            </div>

            <div className="mt-4">
                <button
                    onClick={handleAsk}
                    disabled={loading}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                    {loading ? "Analyzing…" : "Get Insight"}
                </button>
            </div>

            {answer && (
                <div className="mt-6 rounded-lg border bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {answer}
                </div>
            )}
        </section>
    );
}
