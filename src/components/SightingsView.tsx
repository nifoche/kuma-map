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

// 過去6ヶ月の日付を計算
function getSixMonthsAgo(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date;
}

export default function SightingsView({ sightings }: SightingsViewProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>('all');
  const [showAllPeriod, setShowAllPeriod] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [detectedPrefecture, setDetectedPrefecture] = useState<string | null>(null);

  const sixMonthsAgo = useMemo(() => getSixMonthsAgo(), []);

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedPrefecture('all');
  };

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
          if (sightings.some(s => s.prefecture === pref)) {
            if (region) setSelectedRegion(region);
            setSelectedPrefecture(pref);
          } else if (region) {
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

  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const region of Object.keys(REGIONS)) {
      counts[region] = sightings.filter(s =>
        REGIONS[region].includes(s.prefecture)
      ).length;
    }
    return counts;
  }, [sightings]);

  const prefectureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sightings.forEach((s) => {
      counts[s.prefecture] = (counts[s.prefecture] || 0) + 1;
    });
    return counts;
  }, [sightings]);

  const prefectures = useMemo(() => {
    let prefs = Object.entries(prefectureCounts);

    if (selectedRegion !== 'all') {
      const regionPrefs = REGIONS[selectedRegion] || [];
      prefs = prefs.filter(([name]) => regionPrefs.includes(name));
    }

    return prefs
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [prefectureCounts, selectedRegion]);

  const filteredSightings = useMemo(() => {
    let filtered = sightings;

    // 期間フィルター（デフォルト: 過去6ヶ月）
    if (!showAllPeriod) {
      filtered = filtered.filter(s => new Date(s.date) >= sixMonthsAgo);
    }

    if (selectedRegion !== 'all') {
      const regionPrefs = REGIONS[selectedRegion] || [];
      filtered = filtered.filter(s => regionPrefs.includes(s.prefecture));
    }

    if (selectedPrefecture !== 'all') {
      filtered = filtered.filter(s => s.prefecture === selectedPrefecture);
    }

    return filtered;
  }, [sightings, selectedRegion, selectedPrefecture, showAllPeriod, sixMonthsAgo]);

  const recentSightings = filteredSightings.slice(0, 10);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* 左サイド: 統計 + エリア選択 */}
      <div className="w-64 flex-shrink-0 space-y-4 overflow-y-auto">
        {/* 統計 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">統計情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">総出没件数</span>
              <span className="text-xl font-bold">{sightings.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">表示中</span>
              <span className="text-xl font-bold">{filteredSightings.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">都道府県数</span>
              <span className="text-xl font-bold">{Object.keys(prefectureCounts).length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">最終更新</span>
              <span className="text-sm font-medium">
                {sightings.length > 0
                  ? new Date(sightings[0].date).toLocaleDateString('ja-JP')
                  : '-'}
              </span>
            </div>
            <div className="pt-2 border-t">
              <Button
                variant={showAllPeriod ? 'default' : 'outline'}
                size="sm"
                className="w-full text-xs h-7"
                onClick={() => setShowAllPeriod(!showAllPeriod)}
              >
                {showAllPeriod ? '全期間表示中' : '過去6ヶ月表示中'}
              </Button>
              {!showAllPeriod && (
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  クリックで全期間表示
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* エリア選択 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              エリア選択
              {detectedPrefecture && (
                <Badge variant="outline" className="text-xs font-normal">
                  <MapPin className="w-3 h-3 mr-1" />
                  {detectedPrefecture}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <Button
                variant={selectedRegion === 'all' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => handleRegionChange('all')}
              >
                全国
              </Button>
              {Object.keys(REGIONS).map((region) => (
                <Button
                  key={region}
                  variant={selectedRegion === region ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleRegionChange(region)}
                  disabled={regionCounts[region] === 0}
                >
                  {region}
                </Button>
              ))}
            </div>

            <Select value={selectedPrefecture} onValueChange={setSelectedPrefecture}>
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder="都道府県を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {selectedRegion === 'all' ? 'すべて' : `${selectedRegion}全体`}
                </SelectItem>
                {prefectures.map((pref) => (
                  <SelectItem key={pref} value={pref}>
                    {pref} ({prefectureCounts[pref]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={detectLocation}
              disabled={isLocating}
              className="w-full h-8 text-xs"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  取得中...
                </>
              ) : (
                <>
                  <MapPin className="w-3 h-3 mr-1" />
                  現在地を取得
                </>
              )}
            </Button>

            {locationError && (
              <p className="text-xs text-destructive">{locationError}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 中央: 地図 */}
      <div className="flex-1 min-w-0">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              出没マップ
              {(selectedRegion !== 'all' || selectedPrefecture !== 'all') && (
                <Badge variant="secondary" className="text-xs">
                  {selectedPrefecture !== 'all'
                    ? selectedPrefecture
                    : selectedRegion}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-60px)]">
            <BearMapWrapper sightings={filteredSightings} selectedRegion={selectedRegion} />
          </CardContent>
        </Card>
      </div>

      {/* 右サイド: 出没情報 */}
      <div className="w-80 flex-shrink-0">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedPrefecture !== 'all'
                ? `${selectedPrefecture}の出没情報`
                : selectedRegion !== 'all'
                  ? `${selectedRegion}の出没情報`
                  : '最近の出没情報'}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto h-[calc(100%-60px)]">
            <div className="space-y-3">
              {recentSightings.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">
                  出没情報はありません
                </p>
              ) : (
                recentSightings.map((sighting) => (
                  <div
                    key={sighting.id}
                    className="border-b pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">{sighting.prefecture}</Badge>
                      <time className="text-xs text-muted-foreground">
                        {new Date(sighting.date).toLocaleDateString('ja-JP')}
                      </time>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {sighting.city} {sighting.location}
                    </p>
                    <p className="text-sm">{sighting.summary}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
