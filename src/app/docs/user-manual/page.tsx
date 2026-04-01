"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const UserManualFlipbook = dynamic(
  () => import("@/components/UserManualFlipbook"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 shadow-sm">
        Preparing interactive flipbook...
      </div>
    ),
  }
);

const PDF_PATH = "/docs/iSENS-Air-MANUAL-BOOK.pdf";

export default function UserManualPage() {
  const [viewMode, setViewMode] = useState<"flipbook" | "pdf">("pdf");

  return (
    <main className="min-h-screen bg-white">
      <section className="border-b border-gray-200 bg-gradient-to-b from-blue-50 to-white">
        <div className="container mx-auto px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-4xl text-center">
            <span className="mb-4 inline-flex rounded-full border border-blue-200 bg-white px-4 py-1 text-sm font-medium text-blue-600 shadow-sm">
              Documentation
            </span>

            <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
              iSENS-AIR User Manual
            </h1>

            <p className="mx-auto mb-6 max-w-2xl text-base leading-relaxed text-gray-600 md:text-lg">
              Access the official user manual in an interactive flipbook view or
              open the standard PDF version for reading and download.
            </p>

            <div className="mb-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={PDF_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-blue-700"
              >
                📖 Open PDF in New Tab
              </a>

              <a
                href={PDF_PATH}
                download
                className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                📥 Download Manual
              </a>
            </div>

            <p className="text-sm text-gray-500">
              Version 1.0 • Official documentation for the iSENS-AIR dashboard
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10 md:px-6 md:py-14">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Manual Viewer</h2>
            <p className="text-sm text-gray-500">
              Choose how you want to view the manual.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode("flipbook")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "flipbook"
                  ? "bg-blue-600 text-white shadow"
                  : "text-gray-700 hover:bg-white"
              }`}
            >
              Flipbook View
            </button>

            <button
              type="button"
              onClick={() => setViewMode("pdf")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "pdf"
                  ? "bg-blue-600 text-white shadow"
                  : "text-gray-700 hover:bg-white"
              }`}
            >
              PDF Preview
            </button>
          </div>
        </div>

        {viewMode === "flipbook" ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-lg md:p-6">
            <UserManualFlipbook totalPages={14} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
            <iframe
              src={PDF_PATH}
              title="iSENS-AIR User Manual PDF"
              className="h-[850px] w-full"
            />
          </div>
        )}
      </section>
    </main>
  );
}