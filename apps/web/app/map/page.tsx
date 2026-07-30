"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedEvent, Region } from "@/types/event";
import { loadEvents } from "@/lib/events-client";
import { getCurrentPosition, type GeoPosition } from "@/lib/geo";
import EventDetailSheet from "@/components/event/EventDetailSheet";
import Chip from "@/components/ui/Chip";

const REGIONS: (Region | "全部")[] = ["全部", "北部", "中部", "南部", "東部", "離島", "未知"];

export default function MapPage() {
  const [events, setEvents] = useState<NormalizedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | "全部">("全部");
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<NormalizedEvent | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    loadEvents()
      .then((data) => setEvents(data.events))
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  const filtered = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    return events.filter(
      (e) => new Date(e.end) >= now && (region === "全部" || e.region === region) && e.lat != null && e.lon != null
    );
  }, [events, region]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapContainerRef.current || mapRef.current) return;
      const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([23.7, 121.0], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      filtered.forEach((e) => {
        if (e.lat == null || e.lon == null) return;
        const marker = L.circleMarker([e.lat, e.lon], {
          radius: 7, color: "#d97706", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 1.5,
        });
        marker.bindPopup(
          `<div style="font-size:13px;max-width:200px">
             <b>${e.title}</b><br/>${e.venue || e.address}<br/>
             <a href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}" target="_blank" rel="noopener" style="color:#d97706">導航前往 →</a>
           </div>`
        );
        marker.on("click", () => setSelected(e));
        marker.addTo(layer);
      });

      if (filtered.length > 0) {
        const bounds = L.latLngBounds(filtered.map((e) => [e.lat as number, e.lon as number]));
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      }
    })();
  }, [filtered]);

  async function locateMe() {
    setLocating(true);
    try {
      const pos: GeoPosition = await getCurrentPosition();
      const L = (await import("leaflet")).default;
      mapRef.current?.setView([pos.lat, pos.lon], 13);
      L.circleMarker([pos.lat, pos.lon], { radius: 6, color: "#0284c7", fillColor: "#0ea5e9", fillOpacity: 1 })
        .addTo(layerRef.current!);
    } catch {
      alert("無法取得定位權限");
    } finally {
      setLocating(false);
    }
  }

  return (
    <main className="pb-4">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div className="px-4 pt-6 pb-3 max-w-lg mx-auto">
        <h1 className="text-xl font-black tracking-tight mb-3 text-neutral-900">地圖探索</h1>
        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3">讀取活動資料失敗：{error}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {REGIONS.map((r) => (
            <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r}</Chip>
          ))}
          <button
            onClick={locateMe}
            disabled={locating}
            className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-xs text-sky-700 disabled:opacity-50 active:scale-95 transition-transform"
          >
            📍 {locating ? "定位中…" : "我的位置"}
          </button>
        </div>
      </div>
      <div ref={mapContainerRef} className="w-full h-[60vh] bg-neutral-100" />
      {events === null && <p className="text-center text-sm text-neutral-400 py-4">載入活動資料中…</p>}
      {events && filtered.length === 0 && (
        <p className="text-center text-sm text-neutral-400 py-4">這個範圍內目前沒有活動</p>
      )}
      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
