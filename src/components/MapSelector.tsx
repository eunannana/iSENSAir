"use client";

import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { fetchSupportedLocations, fetchLatestData } from "@/lib/apiClient";
import { getAIInsightSummary } from "@/lib/aiInsights";

type Props = {
  onSelect: (area: string) => void;
};

type LocationItem = {
  name: string;
  label: string;
  lat: number;
  lng: number;
};

type MapSummaryItem = {
  overallClass: string;
  riskLevel: string;
  riskScore: number;
  isActive: boolean;
  statusLabel: string;
  lastUpdatedLabel: string;
};

function AutoFitBounds({ locations }: { locations: LocationItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length === 0) return;

    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lng], 12);
      return;
    }

    const bounds = locations.map((loc) => [loc.lat, loc.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [map, locations]);

  return null;
}

function ResetZoomButton({ locations }: { locations: LocationItem[] }) {
  const map = useMap();

  const handleResetZoom = () => {
    if (locations.length === 0) return;

    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lng], 12);
      return;
    }

    const bounds = locations.map((loc) => [loc.lat, loc.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  };

  return (
    <div className="absolute top-4 right-4 z-[400]">
      <button
        onClick={handleResetZoom}
        className="cursor-pointer rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-md transition hover:bg-gray-50 hover:shadow-lg active:scale-95"
        title="Reset map view to fit all locations"
      >
        🔄 Reset
      </button>
    </div>
  );
}

const allLocations: LocationItem[] = [
  {
    name: "semantan",
    label: "Semantan River - Bentong",
    lat: 3.509885,
    lng: 102.231571,
  },
  {
    name: "kechau",
    label: "Kechau River - Kuala Lipis",
    lat: 4.358707,
    lng: 102.105201,
  },
  {
    name: "bilut",
    label: "Bilut River - Bentong",
    lat: 3.721587,
    lng: 101.865963,
  },
  {
    name: "telum",
    label: "Telum River - Cameron Highlands",
    lat: 4.4605,
    lng: 101.3685,
  },
];

function isSameCalendarDay(timestamp: string, reference: Date = new Date()) {
  if (!timestamp) return false;

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return false;

  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth() &&
    parsed.getDate() === reference.getDate()
  );
}

function formatLastUpdated(timestamp?: string) {
  if (!timestamp) return "No recent data";

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "No recent data";

  return parsed.toLocaleString();
}

function getMarkerColor(riskLevel?: string, isActive = true): string {
  if (!isActive) return "#9ca3af";

  switch (riskLevel) {
    case "Low":
      return "#10b981";
    case "Moderate":
      return "#f59e0b";
    case "High":
      return "#f97316";
    case "Critical":
      return "#ef4444";
    default:
      return "#3b82f6";
  }
}

function createPinIcon(color: string, isActive = true, isLoading = false) {
  const shadowOpacity = isActive ? 0.4 : 0.18;
  const pinOpacity = isActive ? 1 : 0.55;
  const badge = isActive
    ? ""
    : `
      <circle cx="24" cy="10" r="5.5" fill="#ef4444" stroke="white" stroke-width="1.5" />
      <path d="M24 7.8V11.8" stroke="white" stroke-width="1.4" stroke-linecap="round" />
      <circle cx="24" cy="13.2" r="0.9" fill="white" />
    `;
  const loadingPulse = isLoading
    ? `
      <circle cx="24" cy="10" r="3.5" fill="#3b82f6" opacity="0.95" />
      <circle cx="24" cy="10" r="4.5" stroke="#3b82f6" stroke-width="1.2" fill="none" opacity="0.7">
        <animate attributeName="r" values="4.5;8.5;4.5" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.05;0.7" dur="1.2s" repeatCount="indefinite" />
      </circle>
    `
    : "";

  const svg = `
    <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="${shadowOpacity}" />
        </filter>
      </defs>
      <ellipse cx="15" cy="38" rx="9" ry="3.5" fill="#000000" opacity="${isActive ? 0.26 : 0.14}" />
      <path d="M15 41C15 41 28 27.5 28 16C28 7.71573 22.2843 2 15 2C7.71573 2 2 7.71573 2 16C2 27.5 15 41 15 41Z" fill="${color}" opacity="${pinOpacity}" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="16" r="5" fill="white" opacity="${isActive ? 1 : 0.9}"/>
      ${badge}
      ${loadingPulse}
    </svg>
  `;

  return L.divIcon({
    className: "custom-pin-icon",
    html: svg,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
  });
}

export default function MapSelector({ onSelect }: Props) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [mapSummary, setMapSummary] = useState<Record<string, MapSummaryItem>>(
    {}
  );
  const [loadingByLocation, setLoadingByLocation] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSupportedLocations()
      .then((supported) => {
        const lower = supported.map((s) => s.toLowerCase());
        setLocations(allLocations.filter((loc) => lower.includes(loc.name)));
      })
      .catch((err) => {
        console.error("Failed to fetch supported locations", err);
        setLocations(allLocations);
      });
  }, []);

  useEffect(() => {
    async function loadSummaries() {
      const summary: Record<string, MapSummaryItem> = {};

      setLoadingByLocation(
        Object.fromEntries(locations.map((loc) => [loc.name, true])),
      );

      for (const loc of locations) {
        try {
          const latest = await fetchLatestData(loc.name);
          const latestTimestamp = latest?.Timestamp;
          const hasTodayData = Boolean(latestTimestamp && isSameCalendarDay(latestTimestamp));

          const ai = latest ? getAIInsightSummary(latest, [latest]) : null;

          summary[loc.name] = {
            overallClass: ai?.overallClass ?? "-",
            riskLevel: ai?.riskLevel ?? "Unknown",
            riskScore: ai?.riskScore ?? 0,
            isActive: hasTodayData,
            statusLabel: hasTodayData ? "Active" : "Inactive",
            lastUpdatedLabel: formatLastUpdated(latestTimestamp),
          };

          setLoadingByLocation((prev) => ({ ...prev, [loc.name]: false }));
        } catch (err) {
          console.error(`Map summary error for ${loc.name}:`, err);
          summary[loc.name] = {
            overallClass: "-",
            riskLevel: "Unknown",
            riskScore: 0,
            isActive: false,
            statusLabel: "Inactive",
            lastUpdatedLabel: "No recent data",
          };

          setLoadingByLocation((prev) => ({ ...prev, [loc.name]: false }));
        }
      }

      setMapSummary(summary);
    }

    if (locations.length > 0) {
      loadSummaries();
    }
  }, [locations]);

  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-[1500px] px-4 md:px-6">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-800 md:text-3xl">
            Select Monitoring Area
          </h2>
          <p className="mt-2 text-sm text-gray-500 md:text-base">
            Click on a river location to open the monitoring dashboard and view
            AI-based analysis.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="border-b bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 md:px-8">
            <h3 className="text-lg font-semibold text-gray-800 md:text-xl">
              🗺 Monitoring Map
            </h3>
            {/* <p className="mt-1 text-sm text-gray-500">
              Select one of the available river monitoring locations below.
            </p> */}
          </div>

          {/* Map */}
          <div className="relative">
            <MapContainer
              center={[4.2105, 101.9758]}
              zoom={6}
              minZoom={2}
              maxZoom={18}
              worldCopyJump={false}
              maxBounds={[
                [-90, -180],
                [90, 180],
              ]}
              maxBoundsViscosity={1.0}
              style={{ height: "520px", width: "100%" }}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                noWrap={true}
              />

              <AutoFitBounds locations={locations} />
              <ResetZoomButton locations={locations} />

            {locations.map((loc) => {
              const summary = mapSummary[loc.name];
              const isLoading = loadingByLocation[loc.name] ?? false;
              const riskLevel = summary?.riskLevel ?? "Unknown";
              const overallClass = summary?.overallClass ?? "-";
              const isActive = summary?.isActive ?? true;
              const statusLabel = summary?.statusLabel ?? "Active";

              return (
                <Marker
                  key={loc.name}
                  position={[loc.lat, loc.lng]}
                  icon={createPinIcon(getMarkerColor(riskLevel, isActive), isActive, isLoading)}
                  eventHandlers={{
                    click: () => {
                      if (isLoading) return;
                      onSelect(loc.name);
                    },
                  }}
                >
                  <Tooltip
                    direction="right"
                    offset={[16, -8]}
                    opacity={1}
                    sticky
                  >
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-snug shadow">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-800">{loc.label}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            isLoading
                              ? "bg-blue-50 text-blue-700"
                              : isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {isLoading ? "Loading" : statusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {isLoading
                          ? "Fetching latest station data..."
                          : isActive
                          ? `Class ${overallClass} · ${riskLevel}`
                          : `No data today · last update ${summary?.lastUpdatedLabel ?? "No recent data"}`}
                      </div>
                    </div>
                  </Tooltip>
                </Marker>
              );
            })}
            </MapContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 border-t bg-gray-50 px-6 py-4 text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
              Low Risk
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
              Moderate Risk
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-orange-500" />
              High Risk
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
              Critical Risk
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-gray-400" />
              Inactive / No data today
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
              Loading latest data
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}