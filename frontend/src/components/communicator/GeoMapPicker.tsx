"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, Marker as LMarker, Circle as LCircle, LeafletMouseEvent, LatLng } from "leaflet";

export default function GeoMapPicker({
  lat, lng, radius, onChange,
}: {
  lat: number; lng: number; radius: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<LMarker | null>(null);
  const circleRef = useRef<LCircle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const start: [number, number] = [lat || 59.9386, lng || 30.3141];
      const map = L.map(containerRef.current).setView(start, 15);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap",
      }).addTo(map);
      const icon = L.divIcon({ className: "", html: "<div style=\"font-size:26px;line-height:26px\">📍</div>", iconSize: [26, 26], iconAnchor: [13, 24] });
      const marker = L.marker(start, { draggable: true, icon }).addTo(map);
      markerRef.current = marker;
      const circle = L.circle(start, { radius: radius || 200, color: "#d4a843", fillColor: "#d4a843", fillOpacity: 0.12, weight: 1.5 }).addTo(map);
      circleRef.current = circle;
      const apply = (ll: LatLng) => { marker.setLatLng(ll); circle.setLatLng(ll); onChangeRef.current(ll.lat, ll.lng); };
      map.on("click", (e: LeafletMouseEvent) => apply(e.latlng));
      marker.on("dragend", () => apply(marker.getLatLng()));
      setTimeout(() => map.invalidateSize(), 120);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (circleRef.current) circleRef.current.setRadius(radius || 200); }, [radius]);

  useEffect(() => {
    if (markerRef.current && circleRef.current && mapRef.current && lat && lng) {
      const ll: [number, number] = [lat, lng];
      markerRef.current.setLatLng(ll);
      circleRef.current.setLatLng(ll);
      mapRef.current.setView(ll);
    }
  }, [lat, lng]);

  return <div ref={containerRef} style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", border: "1px solid var(--bg-glass-border)" }} />;
}
