#!/usr/bin/env python3
"""
kumamap.com APIからの熊出没情報収集スクリプト

データソース:
- kumamap.com API: https://kumamap.com/api/sightings
"""

import hashlib
import os
from datetime import datetime

import requests
from supabase import create_client, Client

# Supabase設定
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL_TANALABO")

# kumamap.com API
KUMAMAP_API_URL = "https://kumamap.com/api/sightings"


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


def fetch_kumamap_data() -> list[dict]:
    """kumamap.com APIからクマ出没情報を取得"""
    print("kumamap.com APIを取得中...")

    try:
        response = requests.get(KUMAMAP_API_URL, timeout=60)
        response.raise_for_status()
        data = response.json()

        sightings = []

        for item in data:
            # 非表示データはスキップ
            if item.get("hidden", False):
                continue

            # 位置情報を取得
            location = item.get("location", {})
            lat = location.get("lat")
            lng = location.get("lng")

            if not lat or not lng:
                continue

            # 日本語の地名情報
            jp_location = location.get("jp", {})
            prefecture = jp_location.get("prefecture", "")
            locality = jp_location.get("locality", "")

            # 日付を取得
            timestamp = item.get("timestamp", "")
            if not timestamp:
                continue

            try:
                date_obj = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                date_formatted = date_obj.strftime("%Y-%m-%d")
            except ValueError:
                continue

            # 説明文
            description = item.get("description", {})
            summary = description.get("jp", "")[:500] if description.get("jp") else ""

            # ソースタイプ
            source_type = item.get("type", "unknown")
            source_urls = item.get("sourceUrls", [])
            source = source_urls[0] if source_urls else f"kumamap_{source_type}"

            sighting = {
                "prefecture": prefecture,
                "city": "",
                "location": locality,
                "lat": lat,
                "lng": lng,
                "date": date_formatted,
                "summary": summary,
                "source": source,
            }
            sightings.append(sighting)

        print(f"  kumamap.com: {len(sightings)}件取得")
        return sightings

    except Exception as e:
        print(f"kumamap.com データ取得エラー: {e}")
        import traceback
        traceback.print_exc()
        return []


def save_to_supabase(supabase: Client, sightings: list[dict], existing_ids: set[str]) -> int:
    """Supabaseに保存"""
    new_sightings = []

    for s in sightings:
        sighting_id = generate_id(s["prefecture"], s["location"], s["date"], str(s["lat"]), str(s["lng"]))

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


def send_slack_notification(count: int):
    """Slack通知を送信"""
    if not SLACK_WEBHOOK_URL or count == 0:
        return

    message = {
        "text": f"🐻 kumamap.com更新: {count}件の新規データを追加しました",
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
        print("Slack通知送信完了")
    except Exception as e:
        print(f"Slack通知エラー: {e}")


def main():
    print("=== kumamap.com データ収集開始 ===")
    print(f"実行日時: {datetime.now().isoformat()}")

    supabase = get_supabase_client()
    if not supabase:
        return

    existing_ids = get_existing_ids(supabase)
    print(f"既存データ: {len(existing_ids)}件\n")

    # kumamap.com API
    kumamap_data = fetch_kumamap_data()
    if kumamap_data:
        saved = save_to_supabase(supabase, kumamap_data, existing_ids)
        print(f"  新規保存: {saved}件")

        # Slack通知
        if saved > 0:
            send_slack_notification(saved)

    print(f"\n=== 完了 ===")
    print(f"総件数: {len(existing_ids)}件")


if __name__ == "__main__":
    main()
