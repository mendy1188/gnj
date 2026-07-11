"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { AppIcon } from "@/components/ui/AppIcon";

import "leaflet/dist/leaflet.css";

const stationLocations = [
  { name: "Banjul Station", lat: 13.4549, lng: -16.579, type: "coastal" },
  { name: "Serekunda Station", lat: 13.4382, lng: -16.6786, type: "coastal" },
  { name: "Bakau Station", lat: 13.4781, lng: -16.6819, type: "coastal" },
  { name: "Brikama Station", lat: 13.2714, lng: -16.6494, type: "inland" },
];

const gambiaCenter = { lat: 13.4432, lng: -15.3101 };

function getSalesForStation(salesByStation, stationName) {
  return (
    salesByStation.find((station) => station.station === stationName) || {
      fuel: 0,
      shop: 0,
      cement: 0,
    }
  );
}

function createStationIcon(color) {
  return L.divIcon({
    html: `
      <div style="background-color:${color};width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:12px solid ${color};transform:translateY(-2px);"></div>
      </div>
    `,
    iconSize: [32, 32],
    className: "custom-marker",
  });
}

export default function StationMapClient({ salesByStation = [] }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <MapContainer
        center={[gambiaCenter.lat, gambiaCenter.lng]}
        zoom={9}
        scrollWheelZoom={false}
        className="h-96 w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {stationLocations.map((station) => {
          const sales = getSalesForStation(salesByStation, station.name);
          const totalSales = sales.fuel + sales.shop + sales.cement;
          const color = station.type === "coastal" ? "#dc2626" : "#2563eb";

          return (
            <Marker
              key={station.name}
              position={[station.lat, station.lng]}
              icon={createStationIcon(color)}
            >
              <Popup maxWidth={280}>
                <div className="min-w-[200px] p-2 text-sm text-slate-700">
                  <p className="font-bold text-slate-900">{station.name}</p>
                  <p className="text-xs text-slate-500">
                    {station.type === "coastal" ? "Coastal" : "Inland"} Location
                  </p>
                  <hr className="my-2 border-slate-200" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sales Breakdown
                  </p>
                  <p className="flex items-center gap-2">
                    <AppIcon name="fuel" className="h-4 w-4 text-sky-600" />
                    <span>Fuel: D{sales.fuel.toLocaleString()}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <AppIcon name="cart" className="h-4 w-4 text-sky-600" />
                    <span>Shop: D{sales.shop.toLocaleString()}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <AppIcon name="cement" className="h-4 w-4 text-sky-600" />
                    <span>Cement: D{sales.cement.toLocaleString()}</span>
                  </p>
                  <hr className="my-2 border-slate-200" />
                  <p className="font-semibold text-slate-900">
                    Total Sales: D{totalSales.toLocaleString()}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
