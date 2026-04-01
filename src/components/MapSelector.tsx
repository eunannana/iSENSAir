"use client";

import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
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
};

const allLocations: LocationItem[] = [
  {
    name: "semantan",
    label: "Semantan River",
    lat: 3.509885,
    lng: 102.231571,
  },
  {
    name: "kechau",
    label: "Kechau River",
    lat: 4.358707,
    lng: 102.105201,
  },
  {
    name: "bilut",
    label: "Bilut River",
    lat: 3.721587,
    lng: 101.865963,
  },
];

function getMarkerColor(riskLevel?: string): string {
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

function createPinIcon(color: string) {
  const svg = `
    <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 41C15 41 28 27.5 28 16C28 7.71573 22.2843 2 15 2C7.71573 2 2 7.71573 2 16C2 27.5 15 41 15 41Z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="16" r="5" fill="white"/>
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

      for (const loc of locations) {
        try {
          const latest = await fetchLatestData(loc.name);

          if (latest) {
            const ai = getAIInsightSummary(latest, [latest]);

            summary[loc.name] = {
              overallClass: ai.overallClass,
              riskLevel: ai.riskLevel,
              riskScore: ai.riskScore,
            };
          }
        } catch (err) {
          console.error(`Map summary error for ${loc.name}:`, err);
        }
      }

      setMapSummary(summary);
    }

    if (locations.length > 0) {
      loadSummaries();
    }
  }, [locations]);

  return (
    <div className="max-w-6xl mx-auto px-4 mt-12">
      <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-200 bg-white">
        {/* Header */}
        <div className="px-8 py-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <h2 className="text-xl font-semibold text-gray-800">
            🗺 Select Monitoring Area
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Click on a river location to open the monitoring dashboard.
          </p>
        </div>

        {/* Map */}
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

          {locations.map((loc) => {
            const summary = mapSummary[loc.name];
            const riskLevel = summary?.riskLevel ?? "Unknown";
            const overallClass = summary?.overallClass ?? "-";

            return (
              <Marker
                key={loc.name}
                position={[loc.lat, loc.lng]}
                icon={createPinIcon(getMarkerColor(riskLevel))}
                eventHandlers={{
                  click: () => onSelect(loc.name),
                }}
              >
                <Tooltip
                  permanent
                  direction="right"
                  offset={[16, -8]}
                  opacity={1}
                >
                  <div className="bg-white px-3 py-2 rounded-lg shadow text-sm leading-snug border border-gray-200">
                    <div className="font-medium text-gray-800">{loc.label}</div>
                    <div className="text-xs text-gray-500">
                      Class {overallClass} · {riskLevel}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Legend */}
        <div className="px-6 py-4 border-t bg-gray-50 flex flex-wrap gap-4 text-sm text-gray-600">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            Low
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
            Moderate
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
            High
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Critical
          </span>
        </div>
      </div>
    </div>
  );
}