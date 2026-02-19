"use client";
import { useRef, useState } from "react";

const MAX_BYTES = 200 * 1024 * 1024; // 200MB

export default function FileDropzone({
    onUploaded,
}: { onUploaded: (payload: any) => void }) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isOver, setIsOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    function openPicker() {
        inputRef.current?.click();
    }

    async function handleFiles(files: FileList | null) {
        const file = files?.[0];
        if (!file) return;

        // Validasi
        if (file.size > MAX_BYTES) {
            setMsg("Ukuran file > 200MB");
            return;
        }
        const isCsv =
            file.type.includes("csv") ||
            file.name.toLowerCase().endsWith(".csv");
        if (!isCsv) {
            setMsg("Hanya mendukung file CSV");
            return;
        }

        setMsg(null);
        setLoading(true);

        const fd = new FormData();
        fd.append("file", file);
        fd.append("datasetId", `${Date.now()}`);

        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
            setMsg("Gagal upload/ML service");
            setLoading(false);
            return;
        }
        const payload = await res.json();
        onUploaded(payload);
        setLoading(false);
    }

    return (
        <div className="space-y-2">
            <div
                onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
                onDragLeave={() => setIsOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsOver(false); handleFiles(e.dataTransfer.files); }}
                className={[
                    "rounded-xl border px-4 md:px-6 py-6 md:py-8 bg-white/70",
                    "flex items-center justify-between gap-4",
                    "transition-colors",
                    isOver ? "border-blue-500 bg-blue-50" : "border-gray-200"
                ].join(" ")}
            >
                <div className="flex items-start gap-3">
                    {/* ikon awan upload (SVG sederhana) */}
                    <svg className="h-7 w-7 mt-1 text-gray-400" viewBox="0 0 24 24" fill="none">
                        <path d="M7 17H17C19.2091 17 21 15.2091 21 13C21 10.9681 19.5314 9.27974 17.5885 9.0354C17.2032 6.7428 15.2229 5 12.9 5C10.7994 5 9.00522 6.35769 8.43544 8.31113C6.46098 8.58547 5 10.2878 5 12.3C5 14.567 6.933 16.5 9.2 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M12 12v6m0 0l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>

                    <div>
                        <div className="text-gray-700 font-medium">
                            Drag and drop file here
                        </div>
                        <div className="text-xs text-gray-500">
                            Limit 200MB per file • CSV
                        </div>
                    </div>
                </div>

                <button
                    onClick={openPicker}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
                    disabled={loading}
                >
                    {loading ? "Uploading…" : "Browse files"}
                </button>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {msg && <p className="text-sm text-red-600">{msg}</p>}
        </div>
    );
}
