import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router";
import type { BioPost } from "@/lib/types";

// Varsayılan Leaflet ikon hatasını önlemek için standart ikon ayarı
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function LocationEvents({ lat, lng, onChange }: {lat: number; lng: number; onChange: (lat: number, lng: number) => void}) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(entries => { if (entries[0]?.contentRect.width && entries[0]?.contentRect.height) map.invalidateSize({pan: false}); });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  useMapEvents({ click(e) { onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))); } });
  return null;
}

export function LocationPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  return (
    <MapContainer center={[lat, lng]} zoom={6} scrollWheelZoom className="z-0 h-64 w-full rounded-xl">
      <TileLayer attribution='Esri, DeLorme, NAVTEQ &copy; OpenStreetMap katkıcıları' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
      <LocationEvents lat={lat} lng={lng} onChange={onChange} />
      <Marker position={[lat, lng]} icon={defaultIcon} />
    </MapContainer>
  );
}

export default function BioMap({ posts }: { posts: BioPost[] }) {
  const center = useMemo<[number, number]>(() => posts.length ? [posts[0].lat, posts[0].lng] : [39.0, 35.0], [posts]);
  
  return (
    <MapContainer center={center} zoom={posts.length ? 6 : 5} scrollWheelZoom className="z-0 h-[62vh] min-h-[420px] w-full">
      <TileLayer attribution='Esri, DeLorme, NAVTEQ &copy; OpenStreetMap katkıcıları' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
      {posts.map((post) => (
        <Marker key={post.id} position={[post.lat, post.lng]} icon={defaultIcon}>
          <Popup>
            <div className="min-w-44">
              <p className="font-serif text-lg font-semibold">{post.commonName || post.species || "Türü bilinmiyor"}</p>
              <p className="mt-1 text-xs">{post.locality}, {post.city}</p>
              <p className="text-xs italic">{post.species}</p>
              <Link to={`/gonderi/${post.id}`} className="mt-2 inline-block font-semibold text-[#007f24] underline">Gönderiye git</Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
