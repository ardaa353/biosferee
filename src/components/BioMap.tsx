import CommonName from "@/components/CommonName";
import { t as trText } from "@/lib/i18n";
import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router";
import type { BioPost } from "@/lib/types";
import { validCoordinates } from "@/lib/geography";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
const defaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
const tile =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const attribution =
  "Tiles &copy; Esri &mdash; Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), (c) OpenStreetMap contributors";
function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]?.contentRect.width && entries[0]?.contentRect.height)
        map.invalidateSize({ pan: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
function FitObservations({ posts }: { posts: BioPost[] }) {
  const map = useMap();
  const signature = posts
    .map((post) => `${post.id}:${post.lat}:${post.lng}`)
    .sort()
    .join("|");
  useEffect(() => {
    const points = signature
      ? signature
          .split("|")
          .map(
            (point) =>
              point.split(":").slice(1).map(Number) as [number, number],
          )
      : [];
    if (points.length)
      map.fitBounds(L.latLngBounds(points), {
        padding: [36, 36],
        maxZoom: 13,
        animate: false,
      });
    else map.setView([39, 35], 5, { animate: false });
  }, [signature, map]);
  return <ResizeMap />;
}
function LocationEvents({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (validCoordinates({ lat, lng }))
      map.setView([lat, lng], map.getZoom(), { animate: false });
  }, [lat, lng, map]);
  useMapEvents({
    click(event) {
      onChange(
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.lng.toFixed(6)),
      );
    },
  });
  return <ResizeMap />;
}
export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const position: [number, number] = validCoordinates({ lat, lng })
    ? [lat, lng]
    : [39, 35];
  return (
    <MapContainer
      center={position}
      zoom={6}
      scrollWheelZoom={false}
      className="z-0 h-64 w-full rounded-xl"
    >
      <TileLayer attribution={attribution} url={tile} />
      <LocationEvents lat={lat} lng={lng} onChange={onChange} />
      <Marker position={position} icon={defaultIcon} />
    </MapContainer>
  );
}
export default function BioMap({ posts }: { posts: BioPost[] }) {
  const visible = useMemo(() => posts.filter(validCoordinates), [posts]);
  return (
    <MapContainer
      center={[39, 35]}
      zoom={5}
      preferCanvas
      scrollWheelZoom={false}
      className="z-0 h-[62dvh] min-h-[360px] w-full"
    >
      <TileLayer attribution={attribution} url={tile} />
      <FitObservations posts={visible} />
      {visible.map((post) => (
        <CircleMarker
          key={post.id}
          center={[post.lat, post.lng]}
          radius={8}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: post.status === "unknown" ? "#a96d15" : "#007f24",
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <div className="min-w-44">
              <p className="font-serif text-lg font-semibold">
                {post.species ? (
                  <CommonName taxon={post} />
                ) : (
                  trText("Türü bilinmiyor")
                )}
              </p>
              <p className="mt-1 text-sm">
                {post.locality}, {post.city}
              </p>
              <p className="text-sm italic">{post.species}</p>
              <Link
                to={`/gonderi/${post.id}`}
                className="mt-2 inline-block min-h-10 py-2 font-semibold text-[#007f24] underline"
              >
                {trText("Gözlemi incele")}
              </Link>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
