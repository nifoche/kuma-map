#!/usr/bin/env python3
"""
2025年の熊出没ニュースを月別に収集するスクリプト
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
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# 月別検索用のキーワード
MONTHS_2025 = [
    ("2025年1月", "2025-01"),
    ("2025年2月", "2025-02"),
    ("2025年3月", "2025-03"),
    ("2025年4月", "2025-04"),
    ("2025年5月", "2025-05"),
    ("2025年6月", "2025-06"),
    ("2025年7月", "2025-07"),
    ("2025年8月", "2025-08"),
    ("2025年9月", "2025-09"),
    ("2025年10月", "2025-10"),
    ("2025年11月", "2025-11"),
    ("2025年12月", "2025-12"),
]


def get_supabase_client() -> Client | None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Supabase設定が見つかりません")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def search_news_by_month(month_str: str) -> list[dict]:
    """Google News RSSで月別検索"""
    import xml.etree.ElementTree as ET
    import urllib.parse

    query = urllib.parse.quote(f"熊 出没 {month_str}")
    url = f"https://news.google.com/rss/search?q={query}&hl=ja&gl=JP&ceid=JP:ja"

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        root = ET.fromstring(response.content)
        items = []

        for item in root.findall(".//item")[:15]:  # 月あたり15件
            title = item.find("title").text if item.find("title") is not None else ""
            link = item.find("link").text if item.find("link") is not None else ""

            if "熊" in title or "クマ" in title:
                items.append({
                    "title": title,
                    "link": link,
                })

        return items
    except Exception as e:
        print(f"ニュース取得エラー ({month_str}): {e}")
        return []


def extract_location_with_claude(news_items: list[dict], month_prefix: str) -> list[dict]:
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
  "date": "YYYY-MM-DD形式の日付。タイトルから推測。不明なら空文字",
  "is_bear_sighting": true または false（熊出没に関する情報かどうか）
}}

熊の出没情報でない場合は is_bear_sighting を false にしてください。
JSONのみを出力し、他の文章は含めないでください。"""

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}]
            )

            content = response.content[0].text.strip()
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                data = json.loads(json_match.group())
                prefecture = data.get("prefecture", "")
                # 複数県や不正な値をスキップ
                if not data.get("is_bear_sighting", False):
                    continue
                if not prefecture or "、" in prefecture or "・" in prefecture or len(prefecture) > 5:
                    continue
                if not prefecture.endswith(("県", "府", "都", "道")):
                    continue

                data["source"] = item["link"]
                # 日付を正規化（YYYY-MM-DD形式に）
                date_str = data.get("date", "")
                if not date_str or len(date_str) < 10:
                    # 日付がないか不完全な場合は月の15日を使用
                    data["date"] = f"{month_prefix}-15"
                elif not date_str.startswith("2025"):
                    # 2025年以外の日付は月の15日に置き換え
                    data["date"] = f"{month_prefix}-15"
                results.append(data)
                print(f"  抽出: {data['prefecture']} {data['city']} ({data['date']})")
        except Exception as e:
            print(f"  Claude API エラー: {e}")
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
            coords = results[0]["geometry"]["coordinates"]
            return (coords[1], coords[0])
    except Exception as e:
        pass

    if location:
        return geocode_location(prefecture, city, "")

    return None


def get_existing_ids(supabase: Client) -> set[str]:
    """既存のIDを取得"""
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
    content = f"{prefecture}{city}{date}"
    return hashlib.md5(content.encode()).hexdigest()[:12]


def main():
    print("=== 2025年 熊出没ニュース収集開始 ===")
    print(f"実行日時: {datetime.now().isoformat()}\n")

    supabase = get_supabase_client()
    if not supabase:
        return

    existing_ids = get_existing_ids(supabase)
    print(f"既存データ: {len(existing_ids)}件\n")

    all_new_sightings = []

    for month_str, month_prefix in MONTHS_2025:
        print(f"--- {month_str} ---")

        # ニュース取得
        news_items = search_news_by_month(month_str)
        print(f"  ニュース: {len(news_items)}件")

        if not news_items:
            continue

        # 位置情報抽出
        extracted = extract_location_with_claude(news_items, month_prefix)

        # ジオコーディング＆保存
        for item in extracted:
            sighting_id = generate_id(item["prefecture"], item["city"], item["date"])

            if sighting_id in existing_ids:
                continue

            coords = geocode_location(item["prefecture"], item["city"], item.get("location", ""))
            if not coords:
                continue

            new_sighting = {
                "id": sighting_id,
                "date": item["date"],
                "prefecture": item["prefecture"],
                "city": item["city"],
                "location": item.get("location", ""),
                "lat": coords[0],
                "lng": coords[1],
                "source": item.get("source", ""),
                "summary": item.get("summary", ""),
            }

            all_new_sightings.append(new_sighting)
            existing_ids.add(sighting_id)

        print()

    # 一括保存
    if all_new_sightings:
        print(f"=== Supabaseに保存中: {len(all_new_sightings)}件 ===")
        saved = save_to_supabase(supabase, all_new_sightings)
        print(f"保存完了: {saved}件")
    else:
        print("新規データはありませんでした")

    print(f"\n=== 完了 ===")
    print(f"総件数: {len(existing_ids)}")


if __name__ == "__main__":
    main()
