"""Генерация видео Wan (Alibaba DashScope, async image-to-video). Один ключ DASHSCOPE.
Проверено 2026-08-27: wan2.2-i2v-flash, ~21с. См. list_master_tracker (видео-ветка)."""
import asyncio
import os
import uuid
from typing import Optional

import httpx

from app.services.settings_store import get_setting

_HOST = "https://dashscope-intl.aliyuncs.com"
_VIDEO_DIR = "/app/storage/video"


async def rehost(video_url: str) -> Optional[str]:
    """Скачать сгенерированный ролик (OSS-URL временный) и отдавать с нашего storage — чтобы не протухал."""
    if not video_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.get(video_url)
        if r.status_code != 200:
            print(f"[wan] rehost download {r.status_code}")
            return None
        os.makedirs(_VIDEO_DIR, exist_ok=True)
        fname = f"{uuid.uuid4().hex}.mp4"
        with open(os.path.join(_VIDEO_DIR, fname), "wb") as f:
            f.write(r.content)
        return f"/api/storage/video/{fname}"
    except Exception as e:
        print(f"[wan] rehost err {e}")
        return None


async def enabled() -> bool:
    v = ((await get_setting("VIDEO_GEN_ENABLED")) or "off").strip().lower()
    return v in ("on", "1", "true", "yes")


async def generate_i2v(image_url: str, prompt: str = "", model: str = "wan2.2-i2v-flash",
                       resolution: str = "480P", max_wait: int = 180) -> Optional[str]:
    """Фото→видео. Блокирующий poll до max_wait сек. Возвращает URL ролика или None.
    image_url должен быть ПУБЛИЧНО доступен (серверы Wan сами его тянут)."""
    key = await get_setting("DASHSCOPE_API_KEY")
    if not key or not image_url:
        return None
    body = {"model": model,
            "input": {"prompt": prompt or "Живое лёгкое движение, дружелюбная мини-презентация", "img_url": image_url},
            "parameters": {"resolution": resolution}}
    try:
        async with httpx.AsyncClient(timeout=40) as c:
            r = await c.post(f"{_HOST}/api/v1/services/aigc/video-generation/video-synthesis",
                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                      "X-DashScope-Async": "enable"}, json=body)
        if r.status_code != 200:
            print(f"[wan] submit err {r.status_code} {r.text[:200]}")
            return None
        tid = r.json().get("output", {}).get("task_id")
        if not tid:
            return None
        waited = 0
        while waited < max_wait:
            await asyncio.sleep(6)
            waited += 6
            async with httpx.AsyncClient(timeout=40) as c:
                t = await c.get(f"{_HOST}/api/v1/tasks/{tid}", headers={"Authorization": f"Bearer {key}"})
            out = t.json().get("output", {})
            st = out.get("task_status")
            if st == "SUCCEEDED":
                return out.get("video_url") or (out.get("results") or {}).get("video_url")
            if st in ("FAILED", "UNKNOWN"):
                print(f"[wan] task {st}: {str(out)[:200]}")
                return None
        print("[wan] timeout")
        return None
    except Exception as e:
        print(f"[wan] err {e}")
        return None
