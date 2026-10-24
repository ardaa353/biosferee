import { useMemo } from "react";
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

function ChangeView({ center }: { center: [number, number] }) { 
  const map = useMap(); 
  map.setView(center, map.getZoom()); 
  return null; 
}

export function LocationPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  function ClickHandler() { 
    useMapEvents({ 
      click(e) { 
        onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))); 
      } 
    }); 
    return null; 
  }

  return (
    <MapContainer center={[lat, lng]} zoom={6} scrollWheelZoom className="z-0 h-64 w-full rounded-xl">
      <TileLayer attribution='Esri, DeLorme, NAVTEQ &copy; OpenStreetMap katkıcıları' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
      <ChangeView center={[lat, lng]} />
      <ClickHandler />
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
              <p className="font-serif text-lg font-semibold">{post.commonName ?? "Türü bilinmiyor"}</p>
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
