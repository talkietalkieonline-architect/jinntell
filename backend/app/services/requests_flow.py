"""#4 Поток обращений: авто-триаж/авто-ответ Архитектором и Супер-помощником БЕЗ живого админа,
доставка ответа юзеру. НО если нужен Строитель (дописать код/включить инструмент) — авто НЕ решает,
ждёт админа/владельца. См. design_assistant_escalation_architect, vision_architect_rag_ai_first."""

INTERNAL_AGENT = {"super_assistant": 48, "architect": 47, "admin": 2, "content": 3, "marketing": 37, "hardware": 4, "other": 47}
AUTO_TARGETS = {"super_assistant", "architect"}          # кому доверяем авто-обработку
NEEDS_BUILDER_CATS = {"нужен код", "нет инструмента"}     # требует Строителя → обязателен человек
_CATS = ["нет инструмента", "нет знаний", "вне зоны", "нужен код", "how-to", "прочее"]


async def _agent_reply(db, agent_id: int, prompt: str, max_tokens: int = 500) -> str:
    from app.models.agent import Agent
    from app.services.llm import get_llm_reply
    a = await db.get(Agent, agent_id)
    model = (a.llm_model if a and a.llm_model else "deepseek-chat")
    sysp = (a.system_prompt if a and a.system_prompt else "Ты — внутренний джинн команды JinnTell.")
    try:
        return (await get_llm_reply(user_message=prompt, system_prompt=sysp, model=model, max_tokens=max_tokens)) or ""
    except Exception as e:
        print(f"[requests_flow] agent_reply err: {e}")
        return ""


async def deliver(db, r) -> bool:
    """Доставить ответ юзеру: событие в ленту от помощника + пинг. Статус → delivered."""
    if not r.user_id or not (r.response_to_user or "").strip():
        return False
    try:
        from app.models.feed import FeedEvent
        db.add(FeedEvent(user_id=r.user_id, kind="info",
                         title=f"🧞 Ответ: {(r.task_text or 'твой вопрос')[:60]}", body=r.response_to_user))
    except Exception as e:
        print(f"[requests_flow] feed err: {e}")
    r.status = "delivered"
    try:
        from app.websocket.manager import manager
        await manager.broadcast(f"user-{r.user_id}", {"type": "feed_ping"})
    except Exception:
        pass
    return True


async def auto_process(db, r) -> None:
    """Авто-обработка обращения (в той же db-сессии, БЕЗ commit — коммитит вызывающий).
    Триаж → если нужен Строитель, оставить админу; иначе авто-ответ + доставка."""
    try:
        from app.services.settings_store import get_setting
        flag = ((await get_setting("REQUESTS_AUTORESOLVE")) or "on").strip().lower()
        if flag in ("off", "0", "false", "no"):
            return
        if r.target not in AUTO_TARGETS:
            return
        aid = INTERNAL_AGENT.get(r.target, 47)
        tri = await _agent_reply(db, aid, (
            f"Обращение от помощника пользователя.\nЗАДАЧА ЮЗЕРА: {r.task_text}\nПОЧЕМУ НЕ СМОГ: {r.reason}\n\n"
            "Ответь СТРОГО так:\nКАТЕГОРИЯ: <нет инструмента|нет знаний|вне зоны|нужен код|how-to|прочее>\n"
            "СУТЬ: <1 фраза что нужно>"), 300)
        low = tri.lower()
        cat = next((c for c in _CATS if c in low), "прочее")
        r.triage_category = cat
        r.triage_analysis = tri
        if cat in NEEDS_BUILDER_CATS:
            # требует дописать код/включить инструмент → только человек (админ/владелец)
            r.status = "triaged"
            r.resolution_type = "code"
            note = "🔧 Требует Строителя (код/инструмент) — нужен админ/владелец."
            r.admin_notes = ((r.admin_notes or "") + ("\n" if r.admin_notes else "") + note)
            return
        # авто-ответ по существу
        ans = await _agent_reply(db, aid, (
            f"Пользователь попросил: {r.task_text}\nПомощнику не хватило: {r.reason}\n\n"
            "Дай ПОЛЕЗНЫЙ ответ пользователю по существу (как решить / как сделать), дружелюбно и коротко, "
            "по-русски. Не упоминай внутреннюю кухню и слово «обращение»."), 700)
        if not ans.strip():
            return  # не смогли — оставим админу (status new)
        r.response_to_user = ans
        r.resolution_type = "knowledge" if cat == "нет знаний" else "explain"
        r.auto_resolved = True
        r.status = "answered"
        await deliver(db, r)
    except Exception as e:
        print(f"[requests_flow] auto_process err: {e}")
