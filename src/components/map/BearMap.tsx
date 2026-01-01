'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
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

// エリアごとの中心座標とズームレベル
const REGION_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  'all': { center: [36.5, 138.0], zoom: 5 },
  '北海道': { center: [43.5, 143.0], zoom: 7 },
  '東北': { center: [39.5, 140.5], zoom: 7 },
  '関東': { center: [36.0, 139.5], zoom: 8 },
  '中部': { center: [36.0, 137.5], zoom: 7 },
  '関西': { center: [34.8, 135.5], zoom: 8 },
  '中国': { center: [34.8, 133.0], zoom: 8 },
  '四国': { center: [33.8, 133.5], zoom: 8 },
  '九州・沖縄': { center: [32.5, 131.0], zoom: 7 },
};

// 地図の表示範囲を変更するコンポーネント
function MapController({ region }: { region: string }) {
  const map = useMap();

  useEffect(() => {
    const view = REGION_VIEWS[region] || REGION_VIEWS['all'];
    map.flyTo(view.center, view.zoom, { duration: 0.8 });
  }, [map, region]);

  return null;
}

interface BearMapProps {
  sightings: BearSighting[];
  selectedRegion?: string;
}

export default function BearMap({ sightings, selectedRegion = 'all' }: BearMapProps) {
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

  // 初期表示位置
  const initialView = REGION_VIEWS[selectedRegion] || REGION_VIEWS['all'];

  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      style={{ height: '100%', width: '100%', minHeight: '400px' }}
      className="rounded-lg z-0"
    >
      <MapController region={selectedRegion} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
      >
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
      </MarkerClusterGroup>
    </MapContainer>
  );
}
