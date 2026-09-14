"""Генерация изображений (Qwen-Image, Alibaba DashScope, async text2image). Один ключ DASHSCOPE.
Проверено 2026-08-29: qwen-image, фотореал, полный рост. Тумблер IMAGE_GEN_ENABLED (админ)."""
import asyncio
from typing import List

import httpx

from app.services.settings_store import get_setting

_HOST = "https://dashscope-intl.aliyuncs.com"


async def enabled() -> bool:
    v = ((await get_setting("IMAGE_GEN_ENABLED")) or "off").strip().lower()
    return v in ("on", "1", "true", "yes")


async def generate(prompt: str, n: int = 4, size: str = "1024*1024",
                   model: str = "qwen-image", max_wait: int = 120) -> List[str]:
    """Текст→изображение. Возвращает список ВРЕМЕННЫХ OSS-URL (перехост — на стороне вызывающего)."""
    key = await get_setting("DASHSCOPE_API_KEY")
    if not key or not (prompt or "").strip():
        return []
    full = prompt.strip() + ", без текста, без логотипов, без водяных знаков, no text, no watermark, no logo"
    body = {"model": model, "input": {"prompt": full[:1200]},
            "parameters": {"size": size, "n": max(1, min(4, int(n or 1)))}}
    try:
        async with httpx.AsyncClient(timeout=40) as c:
            r = await c.post(f"{_HOST}/api/v1/services/aigc/text2image/image-synthesis",
                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                      "X-DashScope-Async": "enable"}, json=body)
        if r.status_code != 200:
            print(f"[img] submit {r.status_code} {r.text[:200]}")
            return []
        tid = r.json().get("output", {}).get("task_id")
        if not tid:
            return []
        waited = 0
        while waited < max_wait:
            await asyncio.sleep(4)
            waited += 4
            async with httpx.AsyncClient(timeout=40) as c:
                t = await c.get(f"{_HOST}/api/v1/tasks/{tid}", headers={"Authorization": f"Bearer {key}"})
            out = t.json().get("output", {})
            st = out.get("task_status")
            if st == "SUCCEEDED":
                return [x.get("url") for x in (out.get("results") or []) if x.get("url")]
            if st in ("FAILED", "UNKNOWN"):
                print(f"[img] {st}: {str(out)[:200]}")
                return []
        print("[img] timeout")
        return []
    except Exception as e:
        print(f"[img] err {e}")
        return []
