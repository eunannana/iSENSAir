"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import HeroHeader from "@/components/HeroHeader";
import WeconTable from "@/components/WeconTable";
import LoadingScreen from "@/components/LoadingScreen";
import { fetchSupportedLocations, setRetryCallback } from "@/lib/apiClient";

const MapSelector = dynamic(() => import("@/components/MapSelector"), {
  ssr: false,
});

export default function Page() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    "connecting" | "booting" | "loading"
  >("connecting");
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    const handleRetry = (
      attempt: number,
      _totalRetries: number,
      isBootingError: boolean
    ) => {
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
        const locations = await fetchSupportedLocations();

        if (locations && locations.length > 0) {
          setLoadingStage("loading");
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (error) {
        console.error("Failed to check API availability:", error);
      } finally {
        setInitialLoading(false);
        setRetryCallback(null);
      }
    }

    checkAPI();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <LoadingScreen
        isVisible={initialLoading}
        stage={loadingStage}
        message={
          loadingStage === "booting"
            ? `Waking up API (Attempt ${retryAttempt})`
            : undefined
        }
      />

      {!initialLoading && (
        <>
          {!selectedArea ? (
            <HeroHeader>
                  <MapSelector onSelect={setSelectedArea} />
            </HeroHeader>
          ) : (
            <section className="py-8">
              <div className="mx-auto max-w-6xl px-4 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setSelectedArea(null)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
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

                <WeconTable initialArea={selectedArea} />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}