#!/usr/bin/env python3
"""
公式データソースからの熊出没情報収集スクリプト

データソース:
- 秋田県オープンデータ（CKAN）: ツキノワグマ出没情報
"""

import csv
import hashlib
import io
import os
from datetime import datetime

import requests
from supabase import create_client, Client

# Supabase設定
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL_TANALABO")

# 秋田県オープンデータ CSV URL
AKITA_CSV_URL = "https://ckan.pref.akita.lg.jp/dataset/f801a10f-f076-47e4-b5a6-0bb5569639e0/resource/326bfe79-3f64-401b-9862-b37a477c7211/download/050008_kumadas.csv"


def get_supabase_client() -> Client | None:
    """Supabaseクライアントを取得"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Supabase設定が見つかりません")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def generate_id(*args: str) -> str:
    """重複チェック用のユニークID生成"""
    content = "".join(str(arg) for arg in args)
    return hashlib.md5(content.encode()).hexdigest()[:12]


def get_existing_ids(supabase: Client) -> set[str]:
    """既存のIDをSupabaseから取得"""
    try:
        response = supabase.table("bear_sightings").select("id").execute()
        return {row["id"] for row in response.data}
    except Exception as e:
        print(f"既存ID取得エラー: {e}")
        return set()


def fetch_akita_data() -> list[dict]:
    """秋田県オープンデータからクマ出没情報を取得"""
    print("秋田県オープンデータを取得中...")

    try:
        response = requests.get(AKITA_CSV_URL, timeout=60)
        response.raise_for_status()

        # Shift-JISでデコード（日本の公的データによくある）
        try:
            content = response.content.decode('shift_jis')
        except UnicodeDecodeError:
            content = response.content.decode('utf-8')

        reader = csv.DictReader(io.StringIO(content))
        sightings = []

        for row in reader:
            # クマのデータのみ抽出
            animal = row.get('獣種', row.get('animal_type', ''))
            if 'クマ' not in animal and '熊' not in animal and 'ツキノワグマ' not in animal:
                continue

            # 日付を取得
            date_str = row.get('発見日', row.get('date', ''))
            if not date_str:
                continue

            # 日付フォーマットを正規化
            try:
                if '/' in date_str:
                    date_obj = datetime.strptime(date_str, '%Y/%m/%d')
                elif '-' in date_str:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                else:
                    continue
                date_formatted = date_obj.strftime('%Y-%m-%d')
            except ValueError:
                continue

            # 2024年以降のデータのみ
            if date_obj.year < 2024:
                continue

            # 座標を取得
            lat = row.get('緯度', row.get('latitude', ''))
            lng = row.get('経度', row.get('longitude', ''))

            if not lat or not lng:
                continue

            try:
                lat = float(lat)
                lng = float(lng)
            except ValueError:
                continue

            # 市区町村を取得
            city = row.get('市町村', row.get('municipality', ''))
            location = row.get('地区', row.get('location', ''))
            summary = row.get('状況', row.get('situation', ''))[:100] if row.get('状況', row.get('situation', '')) else 'クマ目撃情報'

            sighting = {
                'prefecture': '秋田県',
                'city': city,
                'location': location,
                'lat': lat,
                'lng': lng,
                'date': date_formatted,
                'summary': summary,
                'source': 'akita_opendata',
            }
            sightings.append(sighting)

        print(f"  秋田県: {len(sightings)}件取得")
        return sightings

    except Exception as e:
        print(f"秋田県データ取得エラー: {e}")
        return []


def save_to_supabase(supabase: Client, sightings: list[dict], existing_ids: set[str]) -> int:
    """Supabaseに保存"""
    new_sightings = []

    for s in sightings:
        sighting_id = generate_id(s['prefecture'], s['city'], s['date'], str(s['lat']), str(s['lng']))

        if sighting_id in existing_ids:
            continue

        new_sightings.append({
            "id": sighting_id,
            "date": s["date"],
            "prefecture": s["prefecture"],
            "city": s["city"],
            "location": s.get("location", ""),
            "lat": s["lat"],
            "lng": s["lng"],
            "source": s.get("source", ""),
            "summary": s.get("summary", ""),
        })
        existing_ids.add(sighting_id)

    if not new_sightings:
        return 0

    try:
        # 100件ずつバッチ挿入
        batch_size = 100
        total_saved = 0

        for i in range(0, len(new_sightings), batch_size):
            batch = new_sightings[i:i + batch_size]
            response = supabase.table("bear_sightings").insert(batch).execute()
            total_saved += len(response.data)

        return total_saved
    except Exception as e:
        print(f"Supabase保存エラー: {e}")
        return 0


def send_slack_notification(count: int, source: str):
    """Slack通知を送信"""
    if not SLACK_WEBHOOK_URL or count == 0:
        return

    message = {
        "text": f"🐻 公式データ更新: {source}から{count}件の新規データを追加しました",
        "attachments": [{
            "color": "#36a64f",
            "fields": [{
                "title": "確認",
                "value": "<https://kuma-map.netlify.app|熊出没マップで確認>",
                "short": False
            }]
        }]
    }

    try:
        requests.post(SLACK_WEBHOOK_URL, json=message, timeout=10)
        print(f"Slack通知送信完了")
    except Exception as e:
        print(f"Slack通知エラー: {e}")


def main():
    print("=== 公式データソース収集開始 ===")
    print(f"実行日時: {datetime.now().isoformat()}")

    supabase = get_supabase_client()
    if not supabase:
        return

    existing_ids = get_existing_ids(supabase)
    print(f"既存データ: {len(existing_ids)}件\n")

    total_new = 0

    # 秋田県オープンデータ
    akita_data = fetch_akita_data()
    if akita_data:
        saved = save_to_supabase(supabase, akita_data, existing_ids)
        print(f"  新規保存: {saved}件")
        total_new += saved

    # Slack通知
    if total_new > 0:
        send_slack_notification(total_new, "秋田県オープンデータ")

    print(f"\n=== 完了 ===")
    print(f"新規追加: {total_new}件")
    print(f"総件数: {len(existing_ids)}件")


if __name__ == "__main__":
    main()
