"""Веб-поиск для помощника. Провайдер и ключ берутся из админки (settings_store).
Провайдеры: off | tavily | brave. Прокси (OUTBOUND_PROXY) поддерживается для РФ."""
import httpx

from app.services.settings_store import get_setting


async def _client() -> httpx.AsyncClient:
    proxy = await get_setting("OUTBOUND_PROXY")
    if proxy:
        return httpx.AsyncClient(timeout=20.0, proxy=proxy)
    return httpx.AsyncClient(timeout=20.0)


async def search(query: str, max_results: int = 5) -> dict:
    """{"ok": bool, "reason": str, "provider": str, "answer": str, "results": [{title,url,snippet}]}"""
    provider = (await get_setting("WEB_SEARCH_PROVIDER") or "off").strip().lower()
    base = {"provider": provider, "answer": "", "results": [], "images": []}
    if provider in ("", "off"):
        return {**base, "ok": False, "reason": "off"}
    try:
        if provider == "tavily":
            key = await get_setting("TAVILY_API_KEY")
            if not key:
                return {**base, "ok": False, "reason": "no_key"}
            async with await _client() as c:
                r = await c.post("https://api.tavily.com/search", json={
                    "api_key": key, "query": query, "max_results": max_results, "include_answer": True,
                    "include_images": True,
                })
                r.raise_for_status()
                d = r.json()
            results = [{"title": x.get("title", ""), "url": x.get("url", ""),
                        "snippet": (x.get("content", "") or "")[:300]} for x in d.get("results", [])]
            images = [(im.get("url") if isinstance(im, dict) else im) for im in (d.get("images") or [])]
            images = [u for u in images if u]
            return {**base, "ok": True, "reason": "", "answer": d.get("answer", "") or "", "results": results, "images": images}
        if provider == "brave":
            key = await get_setting("BRAVE_API_KEY")
            if not key:
                return {**base, "ok": False, "reason": "no_key"}
            async with await _client() as c:
                r = await c.get("https://api.search.brave.com/res/v1/web/search",
                                params={"q": query, "count": max_results},
                                headers={"X-Subscription-Token": key, "Accept": "application/json"})
                r.raise_for_status()
                d = r.json()
            web = (d.get("web") or {}).get("results", [])
            results = [{"title": x.get("title", ""), "url": x.get("url", ""),
                        "snippet": (x.get("description", "") or "")[:300]} for x in web]
            return {**base, "ok": True, "reason": "", "answer": "", "results": results}
        if provider == "yandex":
            key = await get_setting("YANDEX_SEARCH_SA_KEY_JSON")
            if not key:
                return {**base, "ok": False, "reason": "no_key"}
            folder = (await get_setting("YANDEX_FOLDER_ID")) or "b1gbs4tviutikrahehhj"
            import asyncio as _aio
            import base64 as _b64
            import xml.etree.ElementTree as _ET
            from app.services.yandex_billing import _get_iam_token
            iam = await _get_iam_token(key)
            body = {"query": {"searchType": "SEARCH_TYPE_RU", "queryText": query}, "folderId": folder}
            # Яндекс — из РФ напрямую, БЕЗ прокси
            async with httpx.AsyncClient(timeout=30.0) as c:
                r = await c.post("https://searchapi.api.cloud.yandex.net/v2/web/searchAsync",
                                 json=body, headers={"Authorization": f"Bearer {iam}"})
                r.raise_for_status()
                opid = r.json()["id"]
                raw = None
                for _ in range(20):
                    await _aio.sleep(1.5)
                    o = await c.get(f"https://operation.api.cloud.yandex.net/operations/{opid}",
                                    headers={"Authorization": f"Bearer {iam}"})
                    d = o.json()
                    if d.get("done"):
                        raw = (d.get("response") or {}).get("rawData")
                        break
            if not raw:
                return {**base, "ok": False, "reason": "timeout"}
            xml = _b64.b64decode(raw).decode("utf-8", "ignore")
            root = _ET.fromstring(xml)
            results = []
            for doc in root.iter("doc"):
                url = (doc.findtext("url") or "").strip()
                if not url:
                    continue
                t_el = doc.find("title")
                title = "".join(t_el.itertext()).strip() if t_el is not None else ""
                snippet = ""
                p_el = doc.find("passages")
                if p_el is not None:
                    snippet = " ".join("".join(p.itertext()) for p in p_el.findall("passage")).strip()
                if not snippet:
                    h_el = doc.find("headline")
                    if h_el is not None:
                        snippet = "".join(h_el.itertext()).strip()
                results.append({"title": title, "url": url, "snippet": snippet[:300]})
                if len(results) >= max_results:
                    break
            return {**base, "ok": True, "reason": "", "answer": "", "results": results}
        return {**base, "ok": False, "reason": "unknown_provider"}
    except Exception as e:
        return {**base, "ok": False, "reason": f"error:{type(e).__name__}"}


async def video_search(query: str, max_results: int = 5) -> dict:
    """Поиск ВИДЕО по запросу. Провайдер VIDEO_SEARCH_PROVIDER: off|youtube|telegram|instagram.
    Заглушки включаются добавлением ключа в админке (готово «поставил ключ — заработало»).
    Возвращает {ok, reason, provider, videos:[{title,url,thumbnail}]}."""
    provider = (await get_setting("VIDEO_SEARCH_PROVIDER") or "off").strip().lower()
    base = {"provider": provider, "videos": []}
    if provider in ("", "off"):
        return {**base, "ok": False, "reason": "off"}
    if provider == "youtube":
        key = await get_setting("YOUTUBE_API_KEY")
        if not key:
            return {**base, "ok": False, "reason": "no_key"}
        try:
            async with await _client() as c:
                r = await c.get("https://www.googleapis.com/youtube/v3/search", params={
                    "part": "snippet", "type": "video", "q": query,
                    "maxResults": max_results, "key": key,
                })
                if r.status_code != 200:
                    return {**base, "ok": False, "reason": f"http_{r.status_code}"}
                d = r.json()
            vids = []
            for it in d.get("items", []):
                vid = (it.get("id") or {}).get("videoId")
                sn = it.get("snippet") or {}
                if vid:
                    vids.append({"title": sn.get("title", ""),
                                 "url": f"https://www.youtube.com/watch?v={vid}",
                                 "thumbnail": ((sn.get("thumbnails") or {}).get("high") or {}).get("url", "")})
            return {**base, "ok": True, "reason": "", "videos": vids}
        except Exception as e:
            return {**base, "ok": False, "reason": f"err:{str(e)[:80]}"}
    if provider in ("telegram", "instagram"):
        # Каркас: у Telegram/Instagram нет простого публичного video-search API —
        # включим при наличии кастомной интеграции/ключа (TELEGRAM_SEARCH_*/INSTAGRAM_SEARCH_*).
        return {**base, "ok": False, "reason": "not_configured"}
    return {**base, "ok": False, "reason": "unknown_provider"}
