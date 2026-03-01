"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import HeroHeader from "@/components/HeroHeader";
import WeconTable from "@/components/WeconTable";
import LoadingScreen from "@/components/LoadingScreen";
import { fetchSupportedLocations, setRetryCallback } from "@/lib/apiClient";

const MapSelector = dynamic(
  () => import("@/components/MapSelector"),
  { ssr: false }
);

export default function Page() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<"connecting" | "booting" | "loading">("connecting");
  const [retryAttempt, setRetryAttempt] = useState(0);

  // Check API availability on page load
  useEffect(() => {
    const handleRetry = (attempt: number, totalRetries: number, isBootingError: boolean) => {
      setRetryAttempt(attempt);
      if (isBootingError) {
        setLoadingStage("booting");
      }
    };

    setRetryCallback(handleRetry);

    async function checkAPI() {
      setInitialLoading(true);
      setLoadingStage("connecting");

      try {
        // Try to fetch supported locations to verify API is ready
        const locations = await fetchSupportedLocations();
        if (locations && locations.length > 0) {
          setLoadingStage("loading");
          // Small delay to show "loading" stage
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (error) {
        console.error("Failed to check API availability:", error);
      } finally {
        setInitialLoading(false);
        setRetryCallback(null); // Clean up callback
      }
    }

    checkAPI();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Loading Screen - shown while checking API availability */}
      <LoadingScreen 
        isVisible={initialLoading} 
        stage={loadingStage}
        message={
          loadingStage === "booting"
            ? `Waking up API (Attempt ${retryAttempt})`
            : undefined
        }
      />

      {/* Only show content when API is ready */}
      {!initialLoading && (
        <>
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
        </>
      )}
    </main>
  );
}