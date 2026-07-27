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
    base = {"provider": provider, "answer": "", "results": []}
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
                })
                r.raise_for_status()
                d = r.json()
            results = [{"title": x.get("title", ""), "url": x.get("url", ""),
                        "snippet": (x.get("content", "") or "")[:300]} for x in d.get("results", [])]
            return {**base, "ok": True, "reason": "", "answer": d.get("answer", "") or "", "results": results}
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
        return {**base, "ok": False, "reason": "unknown_provider"}
    except Exception as e:
        return {**base, "ok": False, "reason": f"error:{type(e).__name__}"}
