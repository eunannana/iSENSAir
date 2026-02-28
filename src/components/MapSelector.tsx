"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  onSelect: (area: string) => void;
};

/* ================= FIX DEFAULT ICON ================= */
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ================= LOCATIONS ================= */
const locations = [
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

export default function MapSelector({ onSelect }: Props) {
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
          center={[3.55, 102.35]}
          zoom={9}
          style={{ height: "520px", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {locations.map((loc) => (
            <Marker
              key={loc.name}
              position={[loc.lat, loc.lng]}
              eventHandlers={{
                click: () => onSelect(loc.name),
              }}
            >
              <Tooltip
                permanent
                direction="right"
                offset={[15, 0]}
              >
                <span className="bg-white px-3 py-1 rounded-lg shadow text-sm font-medium">
                  {loc.label}
                </span>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}