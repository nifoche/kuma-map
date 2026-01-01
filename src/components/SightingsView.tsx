'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Loader2 } from 'lucide-react';
import BearMapWrapper from '@/components/map/BearMapWrapper';
import type { BearSighting } from '@/types';

interface SightingsViewProps {
  sightings: BearSighting[];
}

// エリア定義
const REGIONS: Record<string, string[]> = {
  '北海道': ['北海道'],
  '東北': ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
  '関東': ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
  '中部': ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'],
  '関西': ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  '中国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
  '四国': ['徳島県', '香川県', '愛媛県', '高知県'],
  '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
};

// 都道府県からエリアを取得
function getRegionFromPrefecture(prefecture: string): string | null {
  for (const [region, prefs] of Object.entries(REGIONS)) {
    if (prefs.includes(prefecture)) {
      return region;
    }
  }
  return null;
}

// 座標から都道府県を取得（国土地理院の逆ジオコーディング）
async function getPrefectureFromCoords(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`
    );
    const data = await response.json();

    if (data.results && data.results.mupicode) {
      // mupicode: 都道府県コード(2桁) + 市区町村コード(3桁)
      const prefCode = data.results.mupicode.substring(0, 2);
      const prefectures: Record<string, string> = {
        '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県',
        '05': '秋田県', '06': '山形県', '07': '福島県', '08': '茨城県',
        '09': '栃木県', '10': '群馬県', '11': '埼玉県', '12': '千葉県',
        '13': '東京都', '14': '神奈川県', '15': '新潟県', '16': '富山県',
        '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県',
        '21': '岐阜県', '22': '静岡県', '23': '愛知県', '24': '三重県',
        '25': '滋賀県', '26': '京都府', '27': '大阪府', '28': '兵庫県',
        '29': '奈良県', '30': '和歌山県', '31': '鳥取県', '32': '島根県',
        '33': '岡山県', '34': '広島県', '35': '山口県', '36': '徳島県',
        '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県',
        '41': '佐賀県', '42': '長崎県', '43': '熊本県', '44': '大分県',
        '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県',
      };
      return prefectures[prefCode] || null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function SightingsView({ sightings }: SightingsViewProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>('all');
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [detectedPrefecture, setDetectedPrefecture] = useState<string | null>(null);

  // エリア変更時に都道府県をリセット
  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedPrefecture('all');
  };

  // 現在地から都道府県を検出
  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationError('位置情報に対応していません');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const pref = await getPrefectureFromCoords(latitude, longitude);

        if (pref) {
          setDetectedPrefecture(pref);
          const region = getRegionFromPrefecture(pref);
          // データに存在する都道府県なら自動選択
          if (sightings.some(s => s.prefecture === pref)) {
            if (region) setSelectedRegion(region);
            setSelectedPrefecture(pref);
          } else if (region) {
            // 都道府県にデータがなくてもエリアは設定
            setSelectedRegion(region);
          }
        } else {
          setLocationError('都道府県を特定できませんでした');
        }
        setIsLocating(false);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('位置情報が許可されていません');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('位置情報を取得できませんでした');
            break;
          case error.TIMEOUT:
            setLocationError('位置情報の取得がタイムアウトしました');
            break;
          default:
            setLocationError('位置情報の取得に失敗しました');
        }
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [sightings]);

  // 初回ロード時に現在地を取得
  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  // エリア別件数を取得
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const region of Object.keys(REGIONS)) {
      counts[region] = sightings.filter(s =>
        REGIONS[region].includes(s.prefecture)
      ).length;
    }
    return counts;
  }, [sightings]);

  // 都道府県リストを取得（件数付き）
  const prefectureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sightings.forEach((s) => {
      counts[s.prefecture] = (counts[s.prefecture] || 0) + 1;
    });
    return counts;
  }, [sightings]);

  // 選択エリア内の都道府県リスト
  const prefectures = useMemo(() => {
    let prefs = Object.entries(prefectureCounts);

    // エリアでフィルタリング
    if (selectedRegion !== 'all') {
      const regionPrefs = REGIONS[selectedRegion] || [];
      prefs = prefs.filter(([name]) => regionPrefs.includes(name));
    }

    return prefs
      .sort((a, b) => b[1] - a[1]) // 件数順
      .map(([name]) => name);
  }, [prefectureCounts, selectedRegion]);

  // フィルター適用
  const filteredSightings = useMemo(() => {
    let filtered = sightings;

    // エリアフィルター
    if (selectedRegion !== 'all') {
      const regionPrefs = REGIONS[selectedRegion] || [];
      filtered = filtered.filter(s => regionPrefs.includes(s.prefecture));
    }

    // 都道府県フィルター
    if (selectedPrefecture !== 'all') {
      filtered = filtered.filter(s => s.prefecture === selectedPrefecture);
    }

    return filtered;
  }, [sightings, selectedRegion, selectedPrefecture]);

  // 最新5件
  const recentSightings = filteredSightings.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総出没件数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sightings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              表示中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filteredSightings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              都道府県数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{prefectures.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最終更新
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">
              {sightings.length > 0
                ? new Date(sightings[0].date).toLocaleDateString('ja-JP')
                : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span>🔍</span>
            エリア・都道府県で絞り込み
            {detectedPrefecture && (
              <Badge variant="outline" className="ml-2 font-normal">
                <MapPin className="w-3 h-3 mr-1" />
                現在地: {detectedPrefecture}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* エリア選択（クリック式） */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedRegion === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleRegionChange('all')}
            >
              全国 ({sightings.length})
            </Button>
            {Object.keys(REGIONS).map((region) => (
              <Button
                key={region}
                variant={selectedRegion === region ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRegionChange(region)}
                disabled={regionCounts[region] === 0}
              >
                {region} ({regionCounts[region]})
              </Button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            {/* 都道府県選択 */}
            <Select value={selectedPrefecture} onValueChange={setSelectedPrefecture}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="都道府県を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {selectedRegion === 'all' ? 'すべて' : `${selectedRegion}全体`}
                  {' '}({selectedRegion === 'all' ? sightings.length : regionCounts[selectedRegion]}件)
                </SelectItem>
                {prefectures.map((pref) => (
                  <SelectItem key={pref} value={pref}>
                    {pref} ({prefectureCounts[pref]}件)
                    {pref === detectedPrefecture && ' - 現在地'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 現在地ボタン */}
            <Button
              variant="outline"
              size="sm"
              onClick={detectLocation}
              disabled={isLocating}
              className="w-full md:w-auto"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  取得中...
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 mr-2" />
                  現在地を取得
                </>
              )}
            </Button>
          </div>
          {locationError && (
            <p className="text-sm text-destructive mt-2">{locationError}</p>
          )}
          {detectedPrefecture && !sightings.some(s => s.prefecture === detectedPrefecture) && (
            <p className="text-sm text-muted-foreground mt-2">
              {detectedPrefecture}の出没データはありません
            </p>
          )}
        </CardContent>
      </Card>

      {/* 地図 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🗺️</span>
            出没マップ
            {(selectedRegion !== 'all' || selectedPrefecture !== 'all') && (
              <Badge variant="secondary" className="ml-2">
                {selectedPrefecture !== 'all'
                  ? selectedPrefecture
                  : selectedRegion}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BearMapWrapper sightings={filteredSightings} />
        </CardContent>
      </Card>

      {/* 最近の出没情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📋</span>
            {selectedPrefecture !== 'all'
              ? `${selectedPrefecture}の出没情報`
              : selectedRegion !== 'all'
                ? `${selectedRegion}の出没情報`
                : '最近の出没情報'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentSightings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                出没情報はありません
              </p>
            ) : (
              recentSightings.map((sighting) => (
                <div
                  key={sighting.id}
                  className="border-b pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">{sighting.prefecture}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {sighting.city} {sighting.location}
                        </span>
                      </div>
                      <p className="text-sm">{sighting.summary}</p>
                    </div>
                    <time className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(sighting.date).toLocaleDateString('ja-JP')}
                    </time>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
