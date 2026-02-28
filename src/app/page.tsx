"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import HeroHeader from "@/components/HeroHeader";
import WeconTable from "@/components/WeconTable";

const MapSelector = dynamic(
  () => import("@/components/MapSelector"),
  { ssr: false }
);

export default function Page() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header tetap ada */}
      <HeroHeader />

      {/* Map Selection */}
      {!selectedArea && (
        <section className="py-10">
          <div className="max-w-6xl mx-auto px-4">
            <MapSelector onSelect={setSelectedArea} />
          </div>
        </section>
      )}

      {/* Dashboard Section */}
      {selectedArea && (
        <section className="py-8">
          <div className="max-w-6xl mx-auto px-4 space-y-6">
            
            {/* Back + Area Info */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSelectedArea(null)}
                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
              >
                ← Back to Map
              </button>

              <div className="text-sm text-gray-600">
                Monitoring Area:{" "}
                <span className="font-semibold capitalize text-gray-800">
                  {selectedArea}
                </span>
              </div>
            </div>

            {/* Main Monitoring Table */}
            <WeconTable initialArea={selectedArea} />
          </div>
        </section>
      )}
    </main>
  );
}