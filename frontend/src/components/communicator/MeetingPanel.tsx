"use client";
/** Планёрка бизнеса в кабинете: руководитель говорит с несколькими своими джинами сразу.
 *  Доклады — только по просьбе («доложите…»), по цифрам системы. «Продолжить на телефоне» — QR в Поток. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  contractorMeetings, contractorMeetingCreate, contractorMeeting, contractorMeetingSay, contractorMeetingPhone,
  type AgentFullOut, type MeetingFull, type MeetingMessage, type MeetingShort,
} from "@/services/api";

const QUICK = [
  { label: "Доклад за неделю", text: "Доложите, как прошла неделя" },
  { label: "Доклад за сегодня", text: "Доложите итоги за сегодня" },
  { label: "Обсудить", text: "Обсудите: что сделать, чтобы на следующей неделе было больше клиентов?" },
];

export default function MeetingPanel({ agents, onClose }: { agents: AgentFullOut[]; onClose: () => void }) {
  const [list, setList] = useState<MeetingShort[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set(agents.map((a) => a.id)));
  const [m, setM] = useState<MeetingFull | null>(null);
  const [msgs, setMsgs] = useState<MeetingMessage[]>([]);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState("");
  const [qr, setQr] = useState<{ svg: string; minutes: number } | null>(null);
  const lastId = useRef(0);
  const quietSince = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { contractorMeetings().then((r) => setList(r.items)).catch(() => {}); }, []);

  const open = useCallback(async (id: number) => {
    setErr("");
    try {
      const full = await contractorMeeting(id);
      setM(full); setMsgs(full.messages);
      lastId.current = full.messages.length ? full.messages[full.messages.length - 1].id : 0;
    } catch (e) { setErr(e instanceof Error ? e.message : "Не удалось открыть планёрку"); }
  }, []);

  const start = async () => {
    setErr("");
    try {
      const full = await contractorMeetingCreate([...picked]);
      setM(full); setMsgs([]); lastId.current = 0;
    } catch (e) { setErr(e instanceof Error ? e.message : "Не удалось собрать планёрку"); }
  };

  // Ответы джинов приходят по очереди — опрашиваем, пока открыта планёрка (на телефоне то же самое идёт по сокету)
  useEffect(() => {
    if (!m) return;
    const t = setInterval(async () => {
      try {
        const r = await contractorMeeting(m.id, lastId.current);
        if (r.messages.length) {
          lastId.current = r.messages[r.messages.length - 1].id;
          setMsgs((prev) => [...prev, ...r.messages.filter((x) => !prev.some((p) => p.id === x.id))]);
          quietSince.current = Date.now();
        } else if (waiting && quietSince.current && Date.now() - quietSince.current > 9000) {
          setWaiting(false);
        }
        if (r.on_phone !== m.on_phone) setM((prev) => (prev ? { ...prev, on_phone: r.on_phone } : prev));
      } catch { /* noop */ }
    }, 2500);
    return () => clearInterval(t);
  }, [m, waiting]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs.length, waiting]);

  const say = async (t: string) => {
    const s = t.trim();
    if (!m || !s) return;
    setText(""); setErr("");
    try {
      const mine = await contractorMeetingSay(m.id, s);
      lastId.current = Math.max(lastId.current, mine.id);
      setMsgs((prev) => [...prev, mine]);
      setWaiting(true); quietSince.current = Date.now() + 20000;  // первому джину нужно время подумать
    } catch (e) { setErr(e instanceof Error ? e.message : "Не отправилось"); }
  };

  const phone = async () => {
    if (!m) return;
    try { const r = await contractorMeetingPhone(m.id); setQr({ svg: r.svg, minutes: r.minutes }); }
    catch (e) { setErr(e instanceof Error ? e.message : "QR не получился"); }
  };

  const color = (name: string) => m?.members.find((a) => a.name === name)?.color || "var(--accent)";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6" style={{ background: "rgba(5,8,16,0.72)" }}>
      <div className="w-full h-full sm:h-[88vh] sm:max-w-3xl flex flex-col sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-deep)", border: "1px solid var(--bg-glass-border)" }}>
        {/* шапка */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--bg-glass-border)" }}>
          <button onClick={m ? () => { setM(null); setQr(null); contractorMeetings().then((r) => setList(r.items)).catch(() => {}); } : onClose}
            className="text-sm px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)" }} aria-label="Назад">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{m ? m.title : "Планёрка с командой"}</p>
            <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
              {m ? m.members.map((a) => a.name).join(" · ") : "Разговор сразу с несколькими вашими джинами"}
            </p>
          </div>
          {m && (
            <button onClick={phone} className="px-3 py-1.5 rounded-full text-[12px] font-semibold shrink-0"
              style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>📱 На телефон</button>
          )}
        </div>

        {!m ? (
          /* выбор участников + прошлые планёрки */
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Кого позвать</p>
              <div className="flex flex-col gap-1.5">
                {agents.map((a) => {
                  const on = picked.has(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
                      style={{ background: on ? "var(--bg-glass)" : "transparent", border: "1px solid var(--bg-glass-border)" }}>
                      <input type="checkbox" checked={on} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                        style={{ background: `${a.color}22`, color: a.color }}>{a.name[0]}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate" style={{ color: "var(--text-primary)" }}>{a.name}</span>
                        <span className="block text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{a.profession}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <button disabled={picked.size === 0} onClick={start}
                className="mt-3 w-full py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--accent)", color: "var(--bg-deep)", opacity: picked.size ? 1 : 0.5 }}>
                Начать планёрку{picked.size ? ` · ${picked.size}` : ""}
              </button>
              <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Спросите всех сразу — ответят по очереди. Назовите джина по имени — ответит он один.
                Попросите «доложите» — каждый расскажет по своим цифрам из системы.
              </p>
            </div>
            {list.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Прошлые планёрки</p>
                <div className="flex flex-col gap-1">
                  {list.map((x) => (
                    <button key={x.id} onClick={() => open(x.id)} className="text-left px-3 py-2.5 rounded-xl"
                      style={{ border: "1px solid var(--bg-glass-border)" }}>
                      <span className="block text-sm truncate" style={{ color: "var(--text-primary)" }}>{x.title}</span>
                      <span className="block text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{x.last || x.members.join(" · ")}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* разговор */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {msgs.length === 0 && (
                <p className="text-[12px] text-center mt-8" style={{ color: "var(--text-muted)" }}>Команда в сборе. Начните с вопроса или попросите доклад.</p>
              )}
              {msgs.map((x) => {
                const mine = x.sender_type === "user";
                const sec = x.sender_type === "assistant";
                return (
                  <div key={x.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    {!mine && (
                      <span className="text-[11px] font-semibold mb-0.5 px-1" style={{ color: sec ? "var(--accent)" : color(x.sender_name) }}>
                        {sec ? `${x.sender_name} · итог` : x.sender_name}
                      </span>
                    )}
                    <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap"
                      style={mine ? { background: "var(--accent)", color: "var(--bg-deep)" }
                        : sec ? { background: "var(--bg-glass)", border: "1px solid var(--accent)", color: "var(--text-primary)" }
                          : { background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }}>
                      {x.text}
                    </div>
                  </div>
                );
              })}
              {waiting && <p className="text-[12px] px-1" style={{ color: "var(--text-muted)" }}>Команда отвечает по очереди…</p>}
              <div ref={endRef} />
            </div>

            {/* ввод */}
            <div className="px-4 pt-2 pb-4" style={{ borderTop: "1px solid var(--bg-glass-border)" }}>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {QUICK.map((q) => (
                  <button key={q.label} onClick={() => say(q.text)} className="px-3 py-1.5 rounded-full text-[11px]"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>{q.label}</button>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); say(text); }} className="flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Вопрос всем или по имени…"
                  className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                <button type="submit" disabled={!text.trim()} className="px-4 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--accent)", color: "var(--bg-deep)", opacity: text.trim() ? 1 : 0.5 }}>Сказать</button>
              </form>
            </div>
          </>
        )}
        {err && <p className="px-4 pb-3 text-[12px]" style={{ color: "var(--danger)" }}>{err}</p>}
      </div>

      {/* QR: продолжить в Потоке на телефоне */}
      {qr && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" style={{ background: "rgba(5,8,16,0.8)" }} onClick={() => setQr(null)}>
          <div className="rounded-2xl p-5 max-w-xs w-full text-center" style={{ background: "#ffffff" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-1" style={{ color: "#1c2230" }}>Продолжить на телефоне</p>
            <p className="text-[12px] mb-3 leading-relaxed" style={{ color: "#4a5263" }}>
              Наведите камеру телефона — планёрка откроется в Потоке со всеми участниками и историей. Можно говорить голосом.
            </p>
            <div className="mx-auto w-56 [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: qr.svg.replace(/^<\?xml[^>]*>\s*/, "") }} />
            <p className="text-[11px] mt-3" style={{ color: "#6b7385" }}>QR действует {qr.minutes} минут и только для одного входа.</p>
            <button onClick={() => setQr(null)} className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: "#1c2230", color: "#ffffff" }}>Готово</button>
          </div>
        </div>
      )}
    </div>
  );
}
