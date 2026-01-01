'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BearSighting } from '@/types';

// カスタムアイコン（熊マーカー）
const bearIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface BearMapProps {
  sightings: BearSighting[];
}

export default function BearMap({ sightings }: BearMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-[600px] bg-muted flex items-center justify-center rounded-lg">
        <p className="text-muted-foreground">地図を読み込み中...</p>
      </div>
    );
  }

  // 日本の中心付近
  const center: [number, number] = [36.5, 138.0];

  return (
    <MapContainer
      center={center}
      zoom={5}
      style={{ height: '600px', width: '100%' }}
      className="rounded-lg z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {sightings.map((sighting) => (
        <Marker
          key={sighting.id}
          position={[sighting.lat, sighting.lng]}
          icon={bearIcon}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold text-base mb-1">
                {sighting.prefecture} {sighting.city}
              </p>
              <p className="text-gray-600 mb-2">{sighting.location}</p>
              <p className="mb-2">{sighting.summary}</p>
              <p className="text-xs text-gray-500">
                {new Date(sighting.date).toLocaleDateString('ja-JP')}
              </p>
              {sighting.source && sighting.source !== 'https://example.com/news/1' && (
                <a
                  href={sighting.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  ニュースソース
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
