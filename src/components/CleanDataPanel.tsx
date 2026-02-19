"use client";
import { useMemo, useState } from "react";
import dayjs from "dayjs";

type Props = {
    rows: Record<string, unknown>[];
    schema: Record<string, string>;
    initialPageSize?: number; // default 200
};

const TIME_CANDS = ["time", "timestamp", "datetime", "date", "created_at", "ts"];
// tambahkan 'Predicted_Class' di daftar kandidat
const CLASS_CANDS = [
    "WATER_CLASS",
    "water_class",
    "class",
    "class_label",
    "Predicted_Class",
    "predicted_class",
];

function guessKey(keys: string[], cands: string[]) {
    const lowerKeys = keys.map((k) => k.toLowerCase());
    const lowerCands = cands.map((c) => c.toLowerCase());
    const i = lowerKeys.findIndex((k) => lowerCands.includes(k));
    return i >= 0 ? keys[i] : "";
}
function niceHeader(key: string) {
    if (!key) return key;
    return key.replace(/_/g, " ").replace(/\b(\w)/g, (m) => m.toUpperCase());
}

export default function CleanDataPanel({
    rows,
    schema,
    initialPageSize = 200,
}: Props) {
    const [open, setOpen] = useState(false);

    // ===== table columns =====
    const allKeys = useMemo(
        () => Object.keys(schema).filter((k) => !/^unnamed:\s*\d+/i.test(k)),
        [schema]
    );
    const timeKey = useMemo(() => guessKey(allKeys, TIME_CANDS), [allKeys]);
    const classKey = useMemo(() => guessKey(allKeys, CLASS_CANDS), [allKeys]);

    // ===== pagination state =====
    const PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000];
    const [pageSize, setPageSize] = useState<number>(
        PAGE_SIZE_OPTIONS.includes(initialPageSize) ? initialPageSize : 200
    );
    const [page, setPage] = useState(0); // 0-indexed
    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(rows.length / pageSize)),
        [rows.length, pageSize]
    );
    const start = page * pageSize;
    const end = Math.min(start + pageSize, rows.length);
    if (page >= totalPages && totalPages > 0) {
        setTimeout(() => setPage(totalPages - 1), 0);
    }

    const view = useMemo(() => rows.slice(start, end), [rows, start, end]);

    // ===== class counts (rapi & terurut) =====
    const { classCounts, classTotal } = useMemo(() => {
        const out = new Map<string, number>();
        if (classKey) {
            for (const r of rows) {
                const raw = r?.[classKey];
                const label = raw == null || raw === "" ? "Unknown" : String(raw).toUpperCase();
                out.set(label, (out.get(label) || 0) + 1);
            }
        }

        // ranking untuk urutan tampilan (IIA & IIB berdekatan)
        const rank: Record<string, number> = {
            I: 0,
            IIA: 1,
            IIB: 1.1,
            II: 2,
            III: 3,
            IV: 4,
            V: 5,
            UNKNOWN: 9,
        };

        const toArr = [...out.entries()].map(([name, count]) => ({ name, count }));
        toArr.sort((a, b) => {
            const ra = rank[a.name.toUpperCase()] ?? 99;
            const rb = rank[b.name.toUpperCase()] ?? 99;
            if (ra !== rb) return ra - rb;
            return b.count - a.count;
        });

        const total = toArr.reduce((s, x) => s + x.count, 0);
        return { classCounts: toArr, classTotal: total };
    }, [rows, classKey]);

    // ===== formatter =====
    function fmt(key: string, v: unknown) {
        if (v == null || v === "") return "None";
        const typ = schema[key];
        if (typ === "datetime") {
            const d = dayjs(v as string);
            return d.isValid() ? d.format("YYYY-MM-DD HH:mm:ss") : String(v);
        }
        if (typ === "number") {
            const num = Number(v);
            if (!Number.isFinite(num)) return String(v);
            return Math.abs(num) >= 1000 ? num.toLocaleString() : num.toFixed(3);
        }
        return String(v);
    }

    // ===== handlers =====
    const goFirst = () => setPage(0);
    const goPrev = () => setPage((p) => Math.max(0, p - 1));
    const goNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));
    const goLast = () => setPage(totalPages - 1);

    return (
        <section className="mt-10 rounded-2xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <h2 className="text-lg md:text-xl font-semibold text-gray-800">
                    Classification Table
                </h2>

                <div className="flex items-center gap-3">
                    <label className="hidden sm:flex items-center gap-2 text-sm text-gray-700">
                        Rows per page
                        <select
                            className="rounded-lg border bg-white px-2 py-1"
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                        >
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                            <option value={rows.length}>All</option>
                        </select>
                    </label>

                    <button
                        onClick={() => setOpen((v) => !v)}
                        className="text-sm rounded-lg border px-3 py-1.5 bg-white hover:bg-gray-50"
                        aria-expanded={open}
                    >
                        {open ? "Hide table ▲" : "Click to show table ▼"}
                    </button>
                </div>
            </div>

            {open && (
                <div className="px-4 md:px-6 pb-6 space-y-6">
                    {/* Table */}
                    <div className="overflow-auto border rounded-lg">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr>
                                    {allKeys.map((k) => (
                                        <th
                                            key={k}
                                            className="px-3 py-2 border-b bg-gray-50 text-left whitespace-nowrap"
                                        >
                                            {k === timeKey ? "Time" : niceHeader(k)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {view.map((r, i) => (
                                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                                        {allKeys.map((k) => (
                                            <td key={k} className="px-3 py-2 border-b whitespace-nowrap">
                                                {fmt(k, r[k])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3 text-sm text-gray-700">
                        <span>
                            Showing <span className="font-medium">{rows.length ? start + 1 : 0}</span> –{" "}
                            <span className="font-medium">{end}</span> of{" "}
                            <span className="font-medium">{rows.length.toLocaleString()}</span> rows
                        </span>

                        <div className="flex items-center gap-2">
                            <button onClick={goFirst} disabled={page === 0} className="px-2 py-1 rounded border bg-white disabled:opacity-50" aria-label="First page">⏮</button>
                            <button onClick={goPrev} disabled={page === 0} className="px-3 py-1 rounded border bg-white disabled:opacity-50">Prev</button>
                            <span className="px-2">Page <span className="font-medium">{page + 1}</span> / {totalPages}</span>
                            <button onClick={goNext} disabled={page >= totalPages - 1} className="px-3 py-1 rounded border bg-white disabled:opacity-50">Next</button>
                            <button onClick={goLast} disabled={page >= totalPages - 1} className="px-2 py-1 rounded border bg-white disabled:opacity-50" aria-label="Last page">⏭</button>
                        </div>
                    </div>

                    {/* Count per class */}
                    {classKey && (
                        <div>
                            <h3 className="font-semibold mb-2">Count per Class:</h3>
                            <div className="overflow-hidden rounded-lg border max-w-xs">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="px-3 py-2 border-b text-left">{niceHeader(classKey)}</th>
                                            <th className="px-3 py-2 border-b text-right">count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {classCounts.map((c) => (
                                            <tr key={c.name} className="odd:bg-white even:bg-gray-50">
                                                <td className="px-3 py-2 border-b">{c.name}</td>
                                                <td className="px-3 py-2 border-b text-right">{c.count.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-50 font-semibold">
                                            <td className="px-3 py-2 border-t">Total</td>
                                            <td className="px-3 py-2 border-t text-right">{classTotal.toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Summary text */}
                    <div className="prose prose-sm max-w-none">
                        <h3>Water Classes and Uses (Summary)</h3>
                        <ul>
                            <li><strong>Class I</strong>: Conservation of environment, minimal treatment (Fishery I).</li>
                            <li><strong>Class IIA/IIB</strong>: Conventional treatment or recreational with body contact (Fishery II).</li>
                            <li><strong>Class III</strong>: Extensive treatment, common tolerant species (Fishery III).</li>
                            <li><strong>Class IV</strong>: Irrigation/livestock drinking water.</li>
                            <li><strong>Class V</strong>: Worst quality.</li>
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
