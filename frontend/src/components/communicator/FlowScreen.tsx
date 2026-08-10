"use client";
import { useEffect, useRef, useState } from "react";
import { ttsBlobUrl, mediaUrl } from "@/services/api";
import AppBackground from "@/components/communicator/AppBackground";

// Похоже ли услышанное на ЭХО собственной озвучки помощника (доля слов услышанного, встречающихся в его реплике)
function echoOverlap(heard: string, spoken: string): number {
  const hw = heard.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!hw.length) return 1;
  const sw = new Set(spoken.toLowerCase().split(/\s+/).filter(Boolean));
  let hit = 0;
  for (const w of hw) if (sw.has(w)) hit++;
  return hit / hw.length;
}

export default function FlowScreen({ onExit, onSend, lastReply, mediaList, assistantName, assistantPhoto, voiceId }: {
  onExit: () => void;
  onSend: (text: string) => void;
  lastReply: string;
  mediaList?: { url: string; type: string }[];
  assistantName: string;
  assistantPhoto?: string | null;
  voiceId?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [status, setStatus] = useState<"idle" | "listening" | "speaking">("listening");
  const [caption, setCaption] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);  // индекс медиа в полноэкранном просмотре
  const [mediaHidden, setMediaHidden] = useState(true);       // старт скрытым: не показываем медиа, что было до открытия Потока
  const [mediaFade, setMediaFade] = useState(false);          // плавное растворение
  const [mediaMenu, setMediaMenu] = useState<{ url: string; type: string } | null>(null);  // долгое нажатие
  const mediaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaSigRef = useRef<string>("");
  const mediaMountRef = useRef(false);
  const mediaLpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaLpFiredRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenRef = useRef<string>(lastReply || "");
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const assistantNameRef = useRef(assistantName);
  assistantNameRef.current = assistantName;
  // Анти-эхо: пока помощник озвучивает — НЕ слушаем (иначе микрофон слышит TTS и зацикливается)
  const speakingRef = useRef(false);
  const finalRef = useRef("");
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Непрерывное распознавание речи → отправка помощнику (с дебаунсом и анти-эхо)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setStatus("idle"); return; }
    const rec = new (SR as unknown as { new (): SpeechRecognition })();
    rec.lang = "ru-RU"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "", newFinal = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const seg = r[0].transcript.trim(); if (seg) newFinal += (newFinal ? " " : "") + seg; }
        else interim += r[0].transcript;
      }

      // ── BARGE-IN: помощник ГОВОРИТ — перебить можно ТОЛЬКО по имени или «стоп» ──
      // (триггер «продолжил речь» УБРАН: из-за эха микрофон слышал собственный TTS и помощник продолжал сам с собой)
      if (speakingRef.current) {
        const heard = (newFinal + " " + interim).trim();
        if (!heard) return;
        const low = heard.toLowerCase();
        const name = (assistantNameRef.current || "").toLowerCase().trim();
        const hasName = !!name && low.includes(name);
        const hasStop = /(^|\s)(стоп|хватит|подожди|замолчи|отмена|тихо)(\s|$)/.test(low);
        if (hasName || hasStop) {
          try { audioRef.current?.pause(); } catch { /* noop */ }  // стоп озвучки
          speakingRef.current = false;
          setStatus("listening");
          finalRef.current = "";
          // команда после имени; чистое «стоп» — просто прервать (без отправки)
          let cmd = newFinal.trim();
          if (name && cmd.toLowerCase().includes(name)) cmd = cmd.slice(cmd.toLowerCase().indexOf(name) + name.length).replace(/^[\s,.!?:;-]+/, "").trim();
          if (hasStop) cmd = cmd.replace(/\b(стоп|хватит|подожди|замолчи|отмена|тихо)\b/gi, "").trim();
          setCaption(cmd);
          if (cmd) { finalRef.current = cmd; if (sendTimerRef.current) clearTimeout(sendTimerRef.current); sendTimerRef.current = setTimeout(() => { const p = finalRef.current.trim(); finalRef.current = ""; if (p) { setCaption(""); onSendRef.current(p); } }, 900); }
        }
        return;
      }

      // ── Обычный режим (помощник молчит) ──
      if (newFinal) finalRef.current = (finalRef.current ? finalRef.current + " " : "") + newFinal;
      setCaption((finalRef.current + " " + interim).trim());
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(() => {
        const phrase = finalRef.current.trim();
        finalRef.current = "";
        // не отправляем, если это эхо только что озвученного ответа (микрофон услышал сам TTS)
        if (phrase && !speakingRef.current && echoOverlap(phrase.toLowerCase(), (spokenRef.current || "")) <= 0.5) { setCaption(""); onSendRef.current(phrase); }
      }, 900);
    };
    rec.onend = () => { try { rec.start(); } catch { /* уже запущено */ } };
    try { rec.start(); } catch { /* noop */ }
    return () => {
      try { rec.onend = null; rec.stop(); } catch { /* noop */ }
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    };
  }, []);

  // Озвучка новых ответов — с остановкой предыдущего аудио (без наложения) и флагом анти-эха
  useEffect(() => {
    const text = (lastReply || "").trim();
    if (!text || text === spokenRef.current) return;
    spokenRef.current = text;
    setCaption(text);
    setStatus("speaking");
    try { audioRef.current?.pause(); } catch { /* noop */ }  // стоп предыдущего — без наложения
    speakingRef.current = true;
    finalRef.current = "";  // сбросить накопленное (могло быть эхо)
    let cancelled = false;
    (async () => {
      try {
        const url = await ttsBlobUrl(text, voiceId || "ermil");
        if (cancelled) { speakingRef.current = false; return; }
        if (url) {
          const a = new Audio(url); audioRef.current = a;
          const done = () => { finalRef.current = ""; setStatus("listening"); setTimeout(() => { speakingRef.current = false; }, 1200); };
          a.onended = done;
          a.onerror = done;
          await a.play();
        } else { setStatus("listening"); speakingRef.current = false; }
      } catch { setStatus("listening"); speakingRef.current = false; }
    })();
    return () => { cancelled = true; };
  }, [lastReply, voiceId]);

  const interrupt = () => {
    try { audioRef.current?.pause(); } catch { /* noop */ }
    speakingRef.current = false;
    finalRef.current = "";
    setStatus("listening");
    setCaption("");
  };

  // 🧞 Пасхалка «потри лампу»: долгое нажатие на волну → помощник «выходит из лампы» с пожеланием
  const [genie, setGenie] = useState(false);
  const lpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFiredRef = useRef(false);
  const WISHES = [
    "Ты потёр лампу — и желания уже сбываются, просто не сразу. Сегодня будет хороший день.",
    "Три желания? Начни с одного: сделай сегодня один маленький шаг к большому.",
    "Секрет джиннов: удача любит тех, кто уже в пути. А ты в пути.",
    "Загадай желание. А я пока напомню: ты сильнее, чем думаешь.",
    "Пыль веков осела — впереди чистый лист. Пиши смело.",
    "Джинн кивает: сегодня стоит написать тому, о ком давно думаешь.",
    "Маленькая магия дня: улыбнись первым. Работает безотказно.",
    "Глубокий вдох — и ты справишься со всем, что задумал на сегодня.",
  ];
  const speakLine = (text: string) => {
    setCaption(text);
    setStatus("speaking");
    try { audioRef.current?.pause(); } catch { /* noop */ }
    speakingRef.current = true;
    finalRef.current = "";
    (async () => {
      try {
        const url = await ttsBlobUrl(text, voiceId || "ermil");
        if (url) {
          const a = new Audio(url); audioRef.current = a;
          const done = () => { finalRef.current = ""; setStatus("listening"); setTimeout(() => { speakingRef.current = false; }, 1200); };
          a.onended = done; a.onerror = done;
          await a.play();
        } else { setStatus("listening"); speakingRef.current = false; }
      } catch { setStatus("listening"); speakingRef.current = false; }
    })();
  };
  const rubLamp = () => {
    lpFiredRef.current = true;
    setGenie(true);
    setTimeout(() => setGenie(false), 2400);
    try { if (navigator.vibrate) navigator.vibrate(30); } catch { /* noop */ }
    speakLine(WISHES[Math.floor(Math.random() * WISHES.length)]);
  };
  const startLongPress = () => {
    lpFiredRef.current = false;
    if (lpTimerRef.current) clearTimeout(lpTimerRef.current);
    lpTimerRef.current = setTimeout(rubLamp, 700);
  };
  const cancelLongPress = () => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
  };
  useEffect(() => () => { if (lpTimerRef.current) clearTimeout(lpTimerRef.current); }, []);

  // Медиа в Потоке — эфемерное: показать при новом, само раствориться через 10с (или замениться следующим)
  const mediaSig = (mediaList && mediaList.length) ? (mediaList[mediaList.length - 1].url + ":" + mediaList.length) : "";
  useEffect(() => {
    // Первый прогон (открытие Потока): запоминаем стартовое состояние и НЕ показываем — картинка из истории не должна висеть
    if (!mediaMountRef.current) { mediaMountRef.current = true; mediaSigRef.current = mediaSig; return; }
    if (!mediaSig) return;
    if (mediaSig === mediaSigRef.current) return;  // не новое — не перезапускаем
    mediaSigRef.current = mediaSig;
    setMediaHidden(false); setMediaFade(false);
    if (mediaTimerRef.current) clearTimeout(mediaTimerRef.current);
    mediaTimerRef.current = setTimeout(() => {
      setMediaFade(true);
      mediaTimerRef.current = setTimeout(() => setMediaHidden(true), 700);
    }, 10000);
    return () => { if (mediaTimerRef.current) clearTimeout(mediaTimerRef.current); };
  }, [mediaSig]);
  const dismissMedia = () => { if (mediaTimerRef.current) clearTimeout(mediaTimerRef.current); setMediaFade(true); setTimeout(() => setMediaHidden(true), 300); };

  // Долгое нажатие на картинку → меню (сохранить/копировать)
  const startMediaLp = (m: { url: string; type: string }) => {
    mediaLpFiredRef.current = false;
    if (mediaLpTimerRef.current) clearTimeout(mediaLpTimerRef.current);
    mediaLpTimerRef.current = setTimeout(() => { mediaLpFiredRef.current = true; setMediaMenu(m); try { if (navigator.vibrate) navigator.vibrate(20); } catch { /* noop */ } }, 550);
  };
  const cancelMediaLp = () => { if (mediaLpTimerRef.current) { clearTimeout(mediaLpTimerRef.current); mediaLpTimerRef.current = null; } };
  const resolveSrc = (u: string) => (u.startsWith("blob:") || u.startsWith("data:") ? u : mediaUrl(u));
  const saveMedia = async (m: { url: string; type: string }) => {
    try {
      const src = resolveSrc(m.url);
      const a = document.createElement("a");
      a.href = src; a.download = src.split("/").pop() || (m.type === "video" ? "video.mp4" : "image.jpg");
      a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove();
    } catch { /* noop */ }
    setMediaMenu(null);
  };
  const copyMedia = async (m: { url: string; type: string }) => {
    const src = resolveSrc(m.url);
    try {
      if (m.type !== "video" && navigator.clipboard && "write" in navigator.clipboard) {
        const blob = await (await fetch(src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      } else {
        await navigator.clipboard.writeText(src);
      }
    } catch { try { await navigator.clipboard.writeText(src); } catch { /* noop */ } }
    setMediaMenu(null);
  };

  const hh = now ? now.getHours().toString().padStart(2, "0") : "--";
  const mm = now ? now.getMinutes().toString().padStart(2, "0") : "--";

  return (
    <div className="fixed inset-0 animate-fade-in" style={{ zIndex: 90, background: "var(--bg-deep, #0a0e18)" }}>
      {/* Непрозрачный фон из системы фонов чата */}
      <AppBackground override={(typeof window !== "undefined" && localStorage.getItem("jinntell_flow_bg")) || undefined} />
      {/* Лёгкий скрим для читаемости текста поверх фона */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(8,10,16,0.30)" }} />

      {/* Контент поверх фона (z-1). Пустое место ловит тап-прерывание */}
      <div onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } interrupt(); }} className="relative w-full h-full flex flex-col items-center justify-center" style={{ zIndex: 1 }}>
        <button onClick={(e) => { e.stopPropagation(); onExit(); }} className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
        <div className="text-6xl font-light mb-1" style={{ color: "var(--text-primary)", letterSpacing: 3 }}>{hh}:{mm}</div>
        <div className="text-[12px] mb-12 uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>{assistantName} · поток</div>

        {/* Центр: аватар помощника (фото в покое) → вибрирующая волна во время речи. Долгое нажатие = «потри лампу» */}
        <div
          className="flex items-center justify-center cursor-pointer relative"
          style={{ width: 200, height: 200 }}
          title="Нажми, чтобы прервать"
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
        >
          {genie && (
            <div className="genie-smoke" aria-hidden>
              <span className="genie-puff genie-puff-1" />
              <span className="genie-puff genie-puff-2" />
              <span className="genie-puff genie-puff-3" />
              <span className="genie-emoji">🧞</span>
            </div>
          )}
          {status === "speaking" ? (
            <div className="flow-wave">
              {Array.from({ length: 9 }).map((_, i) => <span key={i} className="flow-wave-bar" style={{ animationDelay: `${i * 0.09}s` }} />)}
            </div>
          ) : assistantPhoto ? (
            <img
              src={assistantPhoto}
              alt={assistantName}
              className="rounded-full object-cover animate-fade-in"
              style={{ width: 172, height: 172, boxShadow: "0 0 0 2px var(--bg-glass-border), 0 10px 48px rgba(0,0,0,0.45)" }}
            />
          ) : (
            <div className="flow-orb" />
          )}
        </div>

        <div className="text-sm mt-12 min-h-[44px] text-center px-8 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 520 }}>
          {status === "speaking" ? (caption || `перебей: скажи «${assistantName}», «стоп» или просто говори · или тапни`) : (caption || "Слушаю…")}
        </div>
      </div>

      {/* Медиа «из дымки» снизу — меньше нижней половины, по краям виден фон. Одно медиа = крупно; несколько = ряд миниатюр (тап → полноэкран) */}
      {mediaList && mediaList.length > 0 && !mediaHidden && (
        <div onClick={(e) => e.stopPropagation()} className="absolute left-0 right-0 bottom-0 animate-fade-in" style={{ zIndex: 2, pointerEvents: "auto", opacity: mediaFade ? 0 : 1, transition: "opacity 0.7s ease" }}>
          <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 240, background: "linear-gradient(to top, rgba(8,10,16,0.75), transparent)" }} />
          <button onClick={dismissMedia} title="Убрать из Потока" className="absolute right-3 flex items-center justify-center w-8 h-8 rounded-full text-white text-sm" style={{ top: -6, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)", zIndex: 3 }}>✕</button>
          {mediaList.length === 1 ? (
            <div className="relative flex justify-center px-4" style={{ paddingBottom: 26 }}>
              {(() => {
                const m = mediaList[0];
                const src = m.url.startsWith("blob:") || m.url.startsWith("data:") ? m.url : mediaUrl(m.url);
                return (
                  <div className="rounded-2xl overflow-hidden" style={{ maxWidth: "78%", maxHeight: "44vh", boxShadow: "0 12px 48px rgba(0,0,0,0.5)", border: "1px solid var(--bg-glass-border)" }}>
                    {m.type === "video"
                      ? <video src={src} controls playsInline style={{ maxWidth: "100%", maxHeight: "44vh", display: "block" }} />
                      : <img src={src} alt="" onClick={() => { if (mediaLpFiredRef.current) { mediaLpFiredRef.current = false; return; } setViewer(0); }} onPointerDown={() => startMediaLp(m)} onPointerUp={cancelMediaLp} onPointerLeave={cancelMediaLp} className="cursor-zoom-in select-none" style={{ maxWidth: "100%", maxHeight: "44vh", display: "block", objectFit: "contain" }} />}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="relative flex gap-2 overflow-x-auto no-scrollbar justify-center px-4" style={{ paddingBottom: 26 }}>
              {mediaList.map((m, i) => {
                const src = m.url.startsWith("blob:") || m.url.startsWith("data:") ? m.url : mediaUrl(m.url);
                return (
                  <button key={i} onClick={() => { if (mediaLpFiredRef.current) { mediaLpFiredRef.current = false; return; } setViewer(i); }} onPointerDown={() => startMediaLp(m)} onPointerUp={cancelMediaLp} onPointerLeave={cancelMediaLp} className="rounded-xl overflow-hidden shrink-0 transition-transform hover:scale-[1.03] select-none" style={{ width: 126, height: 126, border: "1px solid var(--bg-glass-border)", boxShadow: "0 10px 36px rgba(0,0,0,0.5)" }}>
                    {m.type === "video"
                      ? <video src={src} muted playsInline className="w-full h-full" style={{ objectFit: "cover" }} />
                      : <img src={src} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Полноэкранный просмотр со слайдером */}
      {viewer !== null && mediaList && mediaList[viewer] && (
        <div className="fixed inset-0 flex items-center justify-center animate-fade-in" style={{ zIndex: 130, background: "rgba(0,0,0,0.92)" }} onClick={() => setViewer(null)}>
          <button onClick={(e) => { e.stopPropagation(); setViewer(null); }} className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg" style={{ background: "rgba(255,255,255,0.15)" }}>✕</button>
          {mediaList.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setViewer((v) => (v === null ? v : (v - 1 + mediaList.length) % mediaList.length)); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white text-2xl" style={{ background: "rgba(255,255,255,0.15)" }}>‹</button>
          )}
          {mediaList.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setViewer((v) => (v === null ? v : (v + 1) % mediaList.length)); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white text-2xl" style={{ background: "rgba(255,255,255,0.15)" }}>›</button>
          )}
          {(() => {
            const m = mediaList[viewer];
            const src = m.url.startsWith("blob:") || m.url.startsWith("data:") ? m.url : mediaUrl(m.url);
            return m.type === "video"
              ? <div onClick={(e) => e.stopPropagation()}><video src={src} controls autoPlay playsInline style={{ maxWidth: "94vw", maxHeight: "88vh" }} /></div>
              : <img src={src} alt="" onClick={() => setViewer(null)} style={{ maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain", cursor: "zoom-out" }} />;
          })()}
          {mediaList.length > 1 && <div className="absolute bottom-5 left-0 right-0 text-center text-white/70 text-xs">{viewer + 1} / {mediaList.length}</div>}
        </div>
      )}

      {/* Меню долгого нажатия по медиа */}
      {mediaMenu && (
        <div className="fixed inset-0 flex items-end justify-center animate-fade-in" style={{ zIndex: 140, background: "rgba(0,0,0,0.5)" }} onClick={() => setMediaMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-t-2xl p-3 mb-0" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
            <button onClick={() => saveMedia(mediaMenu)} className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-center gap-3" style={{ color: "var(--text-primary)" }}>💾 Сохранить</button>
            <button onClick={() => copyMedia(mediaMenu)} className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-center gap-3" style={{ color: "var(--text-primary)" }}>📋 Копировать</button>
            <button onClick={() => setMediaMenu(null)} className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-center gap-3" style={{ color: "var(--text-muted)" }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
