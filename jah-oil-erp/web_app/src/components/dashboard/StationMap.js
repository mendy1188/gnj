"use client";

import dynamic from "next/dynamic";

const StationMapClient = dynamic(() => import("@/components/map/StationMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg bg-white text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
      Loading station map...
    </div>
  ),
});

export default function StationMap({ salesByStation = [] }) {
  return <StationMapClient salesByStation={salesByStation} />;
}
