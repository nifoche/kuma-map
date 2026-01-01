#!/usr/bin/env python3
"""
熊出没ニュース収集スクリプト

1. Google News RSSから「熊 出没」ニュースを取得
2. Claude APIで位置情報を抽出
3. 国土地理院APIで座標に変換
4. Supabaseに保存
5. 新規データがあればSlack通知
"""

import json
import os
import re
import hashlib
from datetime import datetime
from supabase import create_client, Client

import requests
from anthropic import Anthropic

# API設定
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL_TANALABO")

# Supabase設定
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Google News RSS URL
NEWS_RSS_URL = "https://news.google.com/rss/search?q=熊+出没&hl=ja&gl=JP&ceid=JP:ja"


def get_supabase_client() -> Client | None:
    """Supabaseクライアントを取得"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Supabase設定が見つかりません")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_news() -> list[dict]:
    """Google News RSSからニュースを取得"""
    import xml.etree.ElementTree as ET

    try:
        response = requests.get(NEWS_RSS_URL, timeout=30)
        response.raise_for_status()

        root = ET.fromstring(response.content)
        items = []

        for item in root.findall(".//item")[:10]:  # 最新10件
            title = item.find("title").text if item.find("title") is not None else ""
            link = item.find("link").text if item.find("link") is not None else ""
            pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""

            # 熊関連のニュースかフィルタリング
            if "熊" in title or "クマ" in title:
                items.append({
                    "title": title,
                    "link": link,
                    "pub_date": pub_date
                })

        return items
    except Exception as e:
        print(f"ニュース取得エラー: {e}")
        return []


def extract_location_with_claude(news_items: list[dict]) -> list[dict]:
    """Claude APIで位置情報を抽出"""
    if not ANTHROPIC_API_KEY:
        print("ANTHROPIC_API_KEY が設定されていません")
        return []

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    results = []

    for item in news_items:
        try:
            prompt = f"""以下のニュースタイトルから熊の出没情報を抽出してください。

タイトル: {item['title']}

以下のJSON形式で出力してください（日本語で）：
{{
  "prefecture": "都道府県名（例：秋田県）",
  "city": "市区町村名（例：秋田市）",
  "location": "詳細な地名（例：雄和地区）。不明な場合は空文字",
  "summary": "出没情報の要約（50文字以内）",
  "is_bear_sighting": true または false（熊出没に関する情報かどうか）
}}

熊の出没情報でない場合は is_bear_sighting を false にしてください。
JSONのみを出力し、他の文章は含めないでください。"""

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}]
            )

            # JSON抽出
            content = response.content[0].text.strip()
            # JSONブロックを抽出
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                data = json.loads(json_match.group())
                if data.get("is_bear_sighting", False) and data.get("prefecture"):
                    data["source"] = item["link"]
                    data["pub_date"] = item["pub_date"]
                    results.append(data)
                    print(f"抽出成功: {data['prefecture']} {data['city']}")
        except Exception as e:
            print(f"Claude API エラー: {e}")
            continue

    return results


def geocode_location(prefecture: str, city: str, location: str = "") -> tuple[float, float] | None:
    """国土地理院APIでジオコーディング"""
    query = f"{prefecture}{city}{location}"

    try:
        url = "https://msearch.gsi.go.jp/address-search/AddressSearch"
        params = {"q": query}
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        results = response.json()
        if results and len(results) > 0:
            # 最初の結果を使用
            coords = results[0]["geometry"]["coordinates"]
            return (coords[1], coords[0])  # lat, lng
    except Exception as e:
        print(f"ジオコーディングエラー ({query}): {e}")

    # フォールバック: 市区町村のみで再試行
    if location:
        return geocode_location(prefecture, city, "")

    return None


def get_existing_ids(supabase: Client) -> set[str]:
    """既存のIDをSupabaseから取得"""
    try:
        response = supabase.table("bear_sightings").select("id").execute()
        return {row["id"] for row in response.data}
    except Exception as e:
        print(f"既存ID取得エラー: {e}")
        return set()


def save_to_supabase(supabase: Client, sightings: list[dict]) -> int:
    """Supabaseに保存"""
    if not sightings:
        return 0

    # カラム名をスネークケースに変換
    rows = []
    for s in sightings:
        rows.append({
            "id": s["id"],
            "date": s["date"],
            "prefecture": s["prefecture"],
            "city": s["city"],
            "location": s.get("location", ""),
            "lat": s["lat"],
            "lng": s["lng"],
            "source": s.get("source", ""),
            "summary": s.get("summary", ""),
        })

    try:
        response = supabase.table("bear_sightings").insert(rows).execute()
        return len(response.data)
    except Exception as e:
        print(f"Supabase保存エラー: {e}")
        return 0


def generate_id(prefecture: str, city: str, date: str) -> str:
    """重複チェック用のID生成"""
    content = f"{prefecture}{city}{date}"
    return hashlib.md5(content.encode()).hexdigest()[:12]


def send_slack_notification(new_sightings: list[dict]):
    """Slack通知を送信"""
    if not SLACK_WEBHOOK_URL or not new_sightings:
        return

    count = len(new_sightings)
    locations = "\n".join([
        f"• {s['prefecture']} {s['city']}: {s['summary']}"
        for s in new_sightings[:5]  # 最大5件
    ])

    message = {
        "text": f"🐻 熊出没情報: {count}件の新しい情報を追加しました",
        "attachments": [{
            "color": "#FF6B6B",
            "fields": [
                {
                    "title": "新規出没情報",
                    "value": locations,
                    "short": False
                },
                {
                    "title": "確認",
                    "value": "<https://kuma-map.netlify.app|熊出没マップで確認>",
                    "short": False
                }
            ]
        }]
    }

    try:
        response = requests.post(SLACK_WEBHOOK_URL, json=message, timeout=10)
        response.raise_for_status()
        print(f"Slack通知送信完了: {count}件")
    except Exception as e:
        print(f"Slack通知エラー: {e}")


def main():
    print("=== 熊出没ニュース収集開始 ===")
    print(f"実行日時: {datetime.now().isoformat()}")

    # Supabaseクライアント初期化
    supabase = get_supabase_client()
    if not supabase:
        print("Supabase接続に失敗しました")
        return

    # 1. ニュース取得
    print("\n1. ニュース取得中...")
    news_items = fetch_news()
    print(f"   取得件数: {len(news_items)}")

    if not news_items:
        print("ニュースが見つかりませんでした")
        return

    # 2. 位置情報抽出
    print("\n2. Claude APIで位置情報抽出中...")
    extracted = extract_location_with_claude(news_items)
    print(f"   抽出件数: {len(extracted)}")

    if not extracted:
        print("抽出可能な情報がありませんでした")
        return

    # 3. 既存データ取得
    print("\n3. 既存データ確認中...")
    existing_ids = get_existing_ids(supabase)
    print(f"   既存件数: {len(existing_ids)}")

    # 4. ジオコーディング＆新規データ追加
    print("\n4. ジオコーディング＆データ追加中...")
    new_sightings = []
    today = datetime.now().strftime("%Y-%m-%d")

    for item in extracted:
        # ID生成
        sighting_id = generate_id(item["prefecture"], item["city"], today)

        if sighting_id in existing_ids:
            print(f"   スキップ（重複）: {item['prefecture']} {item['city']}")
            continue

        # ジオコーディング
        coords = geocode_location(item["prefecture"], item["city"], item.get("location", ""))
        if not coords:
            print(f"   スキップ（座標取得失敗）: {item['prefecture']} {item['city']}")
            continue

        # 新規データ作成
        new_sighting = {
            "id": sighting_id,
            "date": today,
            "prefecture": item["prefecture"],
            "city": item["city"],
            "location": item.get("location", ""),
            "lat": coords[0],
            "lng": coords[1],
            "source": item.get("source", ""),
            "summary": item.get("summary", ""),
        }

        new_sightings.append(new_sighting)
        existing_ids.add(sighting_id)
        print(f"   追加: {item['prefecture']} {item['city']}")

    # 5. Supabaseに保存
    if new_sightings:
        print(f"\n5. Supabaseに保存中... ({len(new_sightings)}件)")
        saved = save_to_supabase(supabase, new_sightings)
        print(f"   保存完了: {saved}件")

        # 6. Slack通知
        print("\n6. Slack通知送信中...")
        send_slack_notification(new_sightings)
    else:
        print("\n新規データはありませんでした")

    print("\n=== 完了 ===")
    print(f"総件数: {len(existing_ids)}")


if __name__ == "__main__":
    main()
