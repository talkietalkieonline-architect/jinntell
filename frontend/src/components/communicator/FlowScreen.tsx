"use client";
import { useEffect, useRef, useState } from "react";
import { ttsBlobUrl, mediaUrl, getDay, sttLang, sttRecognize, type DayEntry } from "@/services/api";
import AppBackground from "@/components/communicator/AppBackground";
import MyDayModal from "@/components/communicator/MyDayModal";

// Похоже ли услышанное на ЭХО собственной озвучки помощника (доля слов услышанного, встречающихся в его реплике)
function echoOverlap(heard: string, spoken: string): number {
  const hw = heard.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!hw.length) return 1;
  const sw = new Set(spoken.toLowerCase().split(/\s+/).filter(Boolean));
  let hit = 0;
  for (const w of hw) if (sw.has(w)) hit++;
  return hit / hw.length;
}

// Короткая тишина (WAV) — «разблокировать» плеер касанием на iPhone: дальше iOS разрешает ему играть ответы без жеста.
function silentWavUrl(): string {
  const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const _FLOW_SPEEDS = [1, 1.5, 2];
function _flowSpeed(): number { try { return parseFloat(localStorage.getItem("jinntell_play_speed") || "1") || 1; } catch { return 1; } }
function _setFlowSpeed(v: number) { try { localStorage.setItem("jinntell_play_speed", String(v)); } catch { /* noop */ } }

/** Реплика для озвучки в Потоке (из сообщений текущей комнаты). */
export interface FlowUtterance { id: string; text: string; sender: "agent" | "assistant"; agentId?: number | null; name?: string }
/** Участник круглого стола (джинн в комнате). */
export interface FlowParticipant { id: number; name: string; color?: string; photo_url?: string | null }

export default function FlowScreen({ onExit, onSend, mediaList, assistantName, assistantPhoto, voiceId, agentId, agentGreeting, homeAssistantName, homeAssistantPhoto, onAddressAssistant, showMiniAssistant = true, utterances, voiceMap, homeVoice, participants, sessionKey }: {
  onExit: () => void;
  onSend: (text: string) => void;
  utterances: FlowUtterance[];          // реплики текущей комнаты — озвучиваются ОЧЕРЕДЬЮ, каждая своим голосом
  voiceMap?: Record<number, string>;     // голос каждого джинна-участника
  homeVoice?: string;                    // голос личного помощника (итоги, вопросы «отпустить?»)
  participants?: FlowParticipant[];      // ≥2 — круглый стол: плитки участников
  sessionKey?: string;                   // смена комнаты (помощник ↔ джинн ↔ круглый стол)
  mediaList?: { url: string; type: string }[];
  assistantName: string;
  assistantPhoto?: string | null;
  voiceId?: string;
  agentId?: number | null;  // разговор с джинном: голос (распознавание/озвучка) идёт в счёт его плательщику
  agentGreeting?: string;   // приветствие джинна, когда он появляется в Потоке
  // Джин в Потоке: личный помощник «сворачивается» в левый верхний угол и ждёт —
  // к нему обращаются касанием кружка или голосом по имени («Дженни, …») → Поток возвращается к помощнику.
  homeAssistantName?: string;
  homeAssistantPhoto?: string | null;
  onAddressAssistant?: (rest: string) => void;
  showMiniAssistant?: boolean;  // гостю в этом углу показывается воронка «могу стать помощником» — тогда кружок не рисуем
}) {
  const homeNameRef = useRef("");
  homeNameRef.current = (homeAssistantName || "").toLowerCase().trim();
  const onAddressRef = useRef(onAddressAssistant);
  onAddressRef.current = onAddressAssistant;
  const pendingQuestionRef = useRef(false);
  // Куда отправить фразу: назвали личного помощника (а сейчас говорим с джином) → ему, иначе — текущему собеседнику
  const dispatchPhrase = (phrase: string) => {
    const p = phrase.trim();
    if (!p) return;
    const home = homeNameRef.current;
    const low = p.toLowerCase();
    if (onAddressRef.current && home && low.includes(home)) {
      const rest = p.slice(low.indexOf(home) + home.length).replace(/^[\s,.!?:;-]+/, "").trim();
      pendingQuestionRef.current = !!rest;
      onAddressRef.current(rest);
      return;
    }
    onSendRef.current(p);
  };
  const agentIdRef = useRef<number | null>(agentId ?? null);
  agentIdRef.current = agentId ?? null;
  const [now, setNow] = useState<Date | null>(null);
  const [speed, setSpeed] = useState(1);
  useEffect(() => { setSpeed(_flowSpeed()); }, []);
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
  const spokenRef = useRef<string>("");
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  // «Мой день» — карточка ближайшего события внизу Потока + попап
  const [dayNext, setDayNext] = useState<DayEntry | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await getDay();
        if (!alive) return;
        const d = new Date();
        const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const active = r.entries.filter((e) => e.status === "planned" || e.status === "moved");
        const cmp = (a: DayEntry, b: DayEntry) => ((a.time || "") < (b.time || "") ? -1 : 1);
        const upcoming = active.filter((e) => e.time && e.time >= hm).sort(cmp);
        const timed = active.filter((e) => e.time).sort(cmp);
        setDayNext(upcoming[0] || timed[0] || active[0] || null);
      } catch { /* noop */ }
    };
    load();
    const h = () => load();
    window.addEventListener("jinntell_day_ping", h);
    return () => { alive = false; window.removeEventListener("jinntell_day_ping", h); };
  }, []);
  const assistantNameRef = useRef(assistantName);
  assistantNameRef.current = assistantName;
  // Анти-эхо: пока помощник озвучивает — НЕ слушаем (иначе микрофон слышит TTS и зацикливается)
  const speakingRef = useRef(false);
  const stopUntilRef = useRef(0);  // до этого времени НЕ озвучивать (после «стоп»/тапа) — чтобы не «дозаговаривать»
  const finalRef = useRef("");
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const micPausedRef = useRef(false);  // жёсткая пауза микрофона на время озвучки (анти-эхо)

  // ── Серверное распознавание (iPhone/iPad и браузеры без встроенного): запись → /api/stt (Яндекс) ──
  // iOS даёт микрофон и звук только по касанию → первое касание кнопки «разблокирует» оба, дальше без рук:
  // запись сама останавливается на паузе в речи, после ответа джина снова слушаем.
  const [serverStt, setServerStt] = useState(false);
  const serverSttRef = useRef(false);
  const armedRef = useRef(false);
  const [needTap, setNeedTap] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const vadRef = useRef<{ ctx: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);
  const discardRef = useRef(false);
  const silentRef = useRef(false);
  // один плеер на весь Поток: на iOS разблокированный касанием элемент может играть ответы и дальше
  const getPlayer = () => { if (!audioRef.current) audioRef.current = new Audio(); return audioRef.current; };

  // схлопнуть подряд идущие дубли слов («привет привет привет» → «привет»)
  const dedupeWords = (s: string) => s.split(/\s+/).filter((w, i, a) => i === 0 || w.toLowerCase() !== a[i - 1].toLowerCase()).join(" ");
  // голос: проп → синхронизированный из БД localStorage → женский дефолт (не мужской ermil при пустом пропе/гонке входа)
  const resolveVoice = () => voiceId || (typeof window !== "undefined" ? (localStorage.getItem("jinntell_assistant_voice") || "") : "") || "alena";
  // на время озвучки полностью глушим распознавание, потом возвращаем
  const pauseMic = () => {
    micPausedRef.current = true;
    if (serverSttRef.current) {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") { discardRef.current = true; try { r.stop(); } catch { /* noop */ } }
      return;
    }
    try { recRef.current?.stop(); } catch { /* noop */ }
  };
  const resumeMic = () => {
    micPausedRef.current = false;
    if (serverSttRef.current) {
      if (armedRef.current) void startServerRec(); else setStatus("idle");
      return;
    }
    try { recRef.current?.start(); } catch { /* noop */ }
  };

  const stopVad = () => {
    const v = vadRef.current;
    if (v) { clearInterval(v.timer); v.ctx.close().catch(() => { /* noop */ }); vadRef.current = null; }
  };
  const startServerRec = async () => {
    if (!armedRef.current || recorderRef.current || speakingRef.current) return;
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      }
      const stream = streamRef.current;
      const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
      let mime = "";
      for (const t of types) { if (MediaRecorder.isTypeSupported?.(t)) { mime = t; break; } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      discardRef.current = false; silentRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        recorderRef.current = null; stopVad();
        if (discardRef.current) return;
        if (silentRef.current) { setStatus("idle"); setCaption(""); return; }  // никто не говорил — ждём касания
        const blob = new Blob(chunks, { type: (rec.mimeType || mime || "audio/mp4").split(";")[0] });
        if (blob.size < 1500) { resumeMic(); return; }
        setCaption("Распознаю…");
        try {
          const text = dedupeWords((await sttRecognize(blob, agentIdRef.current)).trim());
          if (text && !speakingRef.current) { setCaption(text); dispatchPhrase(text); }
          else { setCaption(""); resumeMic(); }
        } catch { setStatus("idle"); setCaption("Не расслышал — нажмите и скажите ещё раз"); }
      };
      rec.start(250);
      recorderRef.current = rec;
      setStatus("listening"); setCaption("");
      // Детектор речи: стоп после ~1,2 с тишины, если человек уже говорил; без речи — через 10 с; максимум 30 с.
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      try { await ctx.resume(); } catch { /* noop */ }
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      const t0 = Date.now();
      let spoke = false, lastVoice = t0, floor = 0, floorN = 0;
      const timer = setInterval(() => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
        const rms = Math.sqrt(sum / data.length), now = Date.now();
        if (now - t0 < 400) { floor += rms; floorN++; return; }  // первые 0,4 с — уровень фонового шума
        const thr = Math.max(0.035, (floorN ? floor / floorN : 0) * 2.5);
        if (rms > thr) { spoke = true; lastVoice = now; }
        const stop = (spoke && now - lastVoice > 1200) || (!spoke && now - t0 > 10000) || now - t0 > 30000;
        if (stop && rec.state !== "inactive") { if (!spoke) silentRef.current = true; try { rec.stop(); } catch { /* noop */ } }
      }, 100);
      vadRef.current = { ctx, timer };
    } catch {
      recorderRef.current = null; stopVad();
      setStatus("idle"); setCaption("Нет доступа к микрофону — разрешите его в настройках браузера");
    }
  };
  // Касание кнопки микрофона: разблокировать звук (iOS) + начать слушать; повторное касание во время записи — «я закончил».
  const onMicTap = () => {
    if (!armedRef.current) {
      armedRef.current = true; setNeedTap(false);
      try {
        const a = getPlayer(); a.onended = null; a.onerror = null;
        a.src = silentWavUrl();
        a.play().then(() => a.pause()).catch(() => { /* noop */ });
      } catch { /* noop */ }
    }
    const r = recorderRef.current;
    if (r && r.state !== "inactive") { try { r.stop(); } catch { /* noop */ } return; }
    if (speakingRef.current) interrupt();
    else void startServerRec();
  };

  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Непрерывное распознавание речи → отправка помощнику (с дебаунсом и анти-эхо)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    // iPhone/iPad: встроенное распознавание Safari ненадёжно (нужны Siri+Диктовка, обрывается, нет во встроенных
    // браузерах) → серверное распознавание. Там, где встроенного нет вовсе, — тоже серверное.
    if (!SR || isIOSDevice()) {
      serverSttRef.current = true; setServerStt(true); setNeedTap(true); setStatus("idle");
      return () => {
        const r = recorderRef.current;
        if (r && r.state !== "inactive") { discardRef.current = true; try { r.stop(); } catch { /* noop */ } }
        stopVad();
        streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
      };
    }
    const rec = new (SR as unknown as { new (): SpeechRecognition })();
    rec.lang = sttLang(); rec.continuous = true; rec.interimResults = true;
    recRef.current = rec;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      if (micPausedRef.current) return;  // микрофон заглушён на время озвучки — игнорируем эхо
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
        const hasStop = /(стоп|стой|хватит|замолч|тихо|отмена)/.test(low);
        const home = homeNameRef.current;
        if (onAddressRef.current && home && newFinal && newFinal.toLowerCase().includes(home)) {
          stopSpeech();
          speakingRef.current = false; finalRef.current = "";
          dispatchPhrase(newFinal);
          return;
        }
        if (hasName || hasStop) {
          stopSpeech();  // стоп озвучки (вся очередь)
          stopUntilRef.current = Date.now() + 3500;  // не «дозаговаривать» сразу после стопа
          speakingRef.current = false;
          setStatus("listening");
          finalRef.current = "";
          // команда после имени; чистое «стоп» — просто прервать (без отправки)
          let cmd = newFinal.trim();
          if (name && cmd.toLowerCase().includes(name)) cmd = cmd.slice(cmd.toLowerCase().indexOf(name) + name.length).replace(/^[\s,.!?:;-]+/, "").trim();
          if (hasStop) cmd = cmd.replace(/\b(стоп|хватит|подожди|замолчи|отмена|тихо)\b/gi, "").trim();
          setCaption(cmd);
          if (cmd) { finalRef.current = cmd; if (sendTimerRef.current) clearTimeout(sendTimerRef.current); sendTimerRef.current = setTimeout(() => { const p = finalRef.current.trim(); finalRef.current = ""; if (p) { setCaption(""); dispatchPhrase(p); } }, 900); }
        }
        return;
      }

      // ── Обычный режим (помощник молчит) ──
      if (newFinal) finalRef.current = (finalRef.current ? finalRef.current + " " : "") + newFinal;
      setCaption((finalRef.current + " " + interim).trim());
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(() => {
        const phrase = dedupeWords(finalRef.current.trim());
        finalRef.current = "";
        // не отправляем, если это эхо только что озвученного ответа (микрофон услышал сам TTS)
        if (phrase && !speakingRef.current && echoOverlap(phrase.toLowerCase(), (spokenRef.current || "")) <= 0.5) { setCaption(""); dispatchPhrase(phrase); }
      }, 900);
    };
    rec.onend = () => { if (micPausedRef.current) return; try { rec.start(); } catch { /* уже запущено */ } };
    try { rec.start(); } catch { /* noop */ }
    return () => {
      try { rec.onend = null; rec.stop(); } catch { /* noop */ }
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    };
  }, []);

  // ── ОЧЕРЕДЬ ОЗВУЧКИ ──
  // Реплики звучат ПО ОДНОЙ, каждая голосом говорящего (круглый стол: несколько джиннов + итог помощника).
  // Новая реплика не обрывает текущую; «стоп»/тап очищает всю очередь. История новой комнаты не зачитывается.
  type QItem = { key: string; text: string; voice: string; agentId: number | null; speaker: number | "assistant"; name?: string };
  const queueRef = useRef<QItem[]>([]);
  const playingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const recentRef = useRef<string[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<number | "assistant" | null>(null);
  const isRoundtable = (participants?.length || 0) >= 2;

  const voiceOf = (u: FlowUtterance): string => {
    if (u.sender === "agent") return (u.agentId && voiceMap?.[u.agentId]) || resolveVoice();
    return homeVoice || resolveVoice();
  };
  const playNext = () => {
    const it = queueRef.current.shift();
    if (!it) {
      playingRef.current = false;
      setActiveSpeaker(null);
      finalRef.current = "";
      setStatus("listening");
      setTimeout(() => { if (!playingRef.current) { speakingRef.current = false; finalRef.current = ""; resumeMic(); } }, 600);
      return;
    }
    playingRef.current = true;
    speakingRef.current = true;
    pauseMic();
    finalRef.current = "";
    setStatus("speaking");
    setActiveSpeaker(it.speaker);
    setCaption(isRoundtable && it.name ? `${it.name}: ${it.text}` : it.text);
    recentRef.current = [...recentRef.current, it.text].slice(-4);
    spokenRef.current = recentRef.current.join(" ");  // анти-эхо: сверяем услышанное с недавно сказанным
    (async () => {
      try {
        const url = await ttsBlobUrl(it.text, it.voice, "neutral", it.agentId);
        if (!playingRef.current) return;  // остановили, пока синтезировалось
        if (url) {
          const a = getPlayer(); a.src = url; a.playbackRate = _flowSpeed();
          a.onended = () => playNext();
          a.onerror = () => playNext();
          await a.play();
        } else playNext();
      } catch { playNext(); }
    })();
  };
  const enqueue = (it: QItem) => {
    queueRef.current.push(it);
    if (!playingRef.current) playNext();
  };
  const stopSpeech = () => {
    queueRef.current = [];
    playingRef.current = false;
    setActiveSpeaker(null);
    try { audioRef.current?.pause(); } catch { /* noop */ }
  };

  // Смена комнаты (помощник ↔ джинн ↔ круглый стол): всё, что уже есть в новой комнате, — история, не озвучиваем;
  // первые 3 с после смены «запоминаем» догружающуюся историю. Текущая реплика (напр. «подключаю…») доигрывает.
  const sessionRef = useRef<string | undefined>(undefined);
  const switchedAtRef = useRef(0);
  useEffect(() => {
    const list = utterances || [];
    if (sessionRef.current === undefined || sessionRef.current !== sessionKey) {
      const switched = sessionRef.current !== undefined;
      sessionRef.current = sessionKey;
      list.forEach((u) => seenRef.current.add(u.id));
      if (switched) { switchedAtRef.current = Date.now(); finalRef.current = ""; }
      return;
    }
    for (const u of list) {
      if (seenRef.current.has(u.id)) continue;
      seenRef.current.add(u.id);
      if (Date.now() - switchedAtRef.current < 3000) continue;  // догружается история новой комнаты
      if (Date.now() < stopUntilRef.current) continue;           // после «стоп»/тапа — не заговариваем
      const text = (u.text || "").trim();
      if (!text) continue;
      const aid = u.sender === "agent" ? (u.agentId ?? agentId ?? null) : null;
      enqueue({ key: u.id, text, voice: voiceOf(u), agentId: aid, speaker: u.sender === "agent" ? (aid ?? 0) : "assistant", name: u.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utterances, sessionKey]);

  // Джинн появился в Потоке один на один — здоровается сам (в круглом столе участников объявляет ведущий-помощник)
  const prevAgentRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const cur = agentId ?? null;
    const prev = prevAgentRef.current;
    prevAgentRef.current = cur;
    if (prev === undefined || prev === cur || !cur || isRoundtable) return;
    switchedAtRef.current = Date.now();
    enqueue({ key: `greet-${cur}-${Date.now()}`, text: (agentGreeting || "").trim() || `Здравствуйте! Я ${assistantName}. Чем могу помочь?`,
              voice: resolveVoice(), agentId: null, speaker: cur, name: assistantName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const interrupt = () => {
    stopSpeech();
    stopUntilRef.current = Date.now() + 3500;  // тап = стоп: не заговаривать сразу снова
    speakingRef.current = false;
    finalRef.current = "";
    setStatus("listening");
    setCaption("");
    resumeMic();  // микрофон был заглушён на озвучке — вернуть прослушивание
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
    enqueue({ key: `line-${Date.now()}`, text, voice: homeVoice || resolveVoice(), agentId: null, speaker: "assistant", name: homeAssistantName });
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
      <div onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } interrupt(); }} className="relative w-full h-full flex flex-col items-center justify-center" style={{ zIndex: 1, justifyContent: "flex-start", alignItems: "center", paddingTop: "4vh" }}>
        <button onClick={(e) => { e.stopPropagation(); onExit(); }} className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
        <button onClick={(e) => { e.stopPropagation(); const nx = _FLOW_SPEEDS[(_FLOW_SPEEDS.indexOf(speed) + 1) % _FLOW_SPEEDS.length]; setSpeed(nx); _setFlowSpeed(nx); if (audioRef.current) audioRef.current.playbackRate = nx; }} className="absolute top-5 h-9 px-3 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0" style={{ right: 68, minWidth: 44, background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }} title="Скорость озвучки">{speed}×</button>
        {onAddressAssistant && showMiniAssistant && (
          <button
            onClick={(e) => { e.stopPropagation(); pendingQuestionRef.current = false; onAddressAssistant(""); }}
            className="absolute top-4 left-4 flex flex-col items-center gap-1 animate-fade-in"
            title={`Позвать ${homeAssistantName || "помощника"} — коснитесь или назовите по имени`}
            aria-label={`Вернуться к помощнику ${homeAssistantName || ""}`}
          >
            <span className="flow-mini-assistant overflow-hidden flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: "var(--bg-glass)", border: activeSpeaker === "assistant" ? "2px solid #d9a534" : "1px solid var(--bg-glass-border)", boxShadow: activeSpeaker === "assistant" ? "0 0 0 6px rgba(217,165,52,0.25), 0 6px 22px rgba(0,0,0,0.45)" : "0 6px 22px rgba(0,0,0,0.45)", transition: "box-shadow .25s, border-color .25s" }}>
              {homeAssistantPhoto
                ? <img src={homeAssistantPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 22, color: "var(--text-primary)" }}>✦</span>}
            </span>
            <span className="text-[10.5px] max-w-[80px] truncate" style={{ color: "var(--text-muted)" }}>{homeAssistantName}</span>
          </button>
        )}
        <div className="font-light mb-1" style={{ color: "var(--text-primary)", letterSpacing: 3, fontSize: "clamp(34px, 7.5vw, 50px)" }}>{hh}:{mm}</div>
        <div className="text-[12px] mb-8 uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>{assistantName} · поток</div>


        {/* Круглый стол: участники — закруглённые квадраты (под будущее живое видео), говорящий подсвечен */}
        {isRoundtable && (
          <div className="flex items-end justify-center gap-3 px-4" style={{ minHeight: 200 }}>
            {(participants || []).slice(0, 3).map((pt) => {
              const on = activeSpeaker === pt.id;
              const size = (participants || []).length >= 3 ? 104 : 132;
              return (
                <div key={pt.id} className="relative overflow-hidden flex items-end justify-center"
                  style={{ width: size, height: Math.round(size * 1.18), borderRadius: 22, flex: "0 0 auto",
                    background: pt.photo_url ? "#222" : `radial-gradient(120% 110% at 50% 22%, ${(pt.color || "#6c7bff")}aa, ${(pt.color || "#6c7bff")})`,
                    border: on ? "2px solid #d9a534" : "1px solid var(--bg-glass-border)",
                    boxShadow: on ? "0 0 0 6px rgba(217,165,52,0.22), 0 14px 40px rgba(0,0,0,0.45)" : "0 10px 30px rgba(0,0,0,0.35)",
                    transform: on ? "scale(1.06)" : "scale(1)", transition: "transform .3s, box-shadow .3s, border-color .3s" }}>
                  {pt.photo_url
                    ? <img src={pt.photo_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ position: "absolute", top: "34%", left: 0, right: 0, textAlign: "center", fontSize: 30, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{(pt.name || "?").replace(/[«»"]/g, "").trim()[0]}</span>}
                  <span style={{ position: "absolute", top: 7, left: 7, fontSize: 9, color: "#fff", background: on ? "rgba(217,165,52,0.85)" : "rgba(0,0,0,0.35)", padding: "2px 7px", borderRadius: 999 }}>{on ? "● говорит" : "LIVE"}</span>
                  <span style={{ position: "relative", zIndex: 1, width: "100%", padding: "18px 6px 7px", textAlign: "center", fontSize: 10.5, lineHeight: 1.2, color: "#fff", fontWeight: 600, background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pt.name}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Центр: аватар помощника (фото в покое) → вибрирующая волна во время речи. Долгое нажатие = «потри лампу» */}
        {!isRoundtable && <div
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
        </div>}

        <div className="text-sm mt-12 min-h-[44px] text-center px-8 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 520 }}>
          {status === "speaking"
            ? (caption || (serverStt ? "тапни, чтобы перебить" : `перебей: скажи «${assistantName}», «стоп» или просто говори · или тапни`))
            : (caption || (serverStt && status === "idle" ? "Нажмите на микрофон и говорите" : "Слушаю…"))}
        </div>

        {/* Кнопка микрофона — для серверного распознавания (iPhone и др.): первое касание включает голос */}
        {serverStt && status !== "speaking" && (
          <button
            onClick={(e) => { e.stopPropagation(); onMicTap(); }}
            className="mt-6 flex items-center justify-center rounded-full transition-transform active:scale-95"
            style={{
              width: 76, height: 76, fontSize: 30,
              background: status === "listening" ? "rgba(224,85,85,0.9)" : "var(--bg-glass)",
              border: "1px solid var(--bg-glass-border)",
              boxShadow: status === "listening" ? "0 0 0 10px rgba(224,85,85,0.18)" : "0 8px 30px rgba(0,0,0,0.35)",
              color: "var(--text-primary)",
            }}
            aria-label={status === "listening" ? "Закончить фразу" : "Говорить"}
            title={status === "listening" ? "Нажмите, когда закончите" : "Нажмите и говорите"}
          >
            🎙
          </button>
        )}
        {serverStt && needTap && (
          <div className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>одно касание — и дальше можно говорить без рук</div>
        )}
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

      {/* Карточка «Мой день» — ближайшее событие (визуальное подтверждение) */}
      {dayNext && (
        <div onClick={(e) => { e.stopPropagation(); setDayOpen(true); }} className="absolute left-0 right-0 flex justify-center animate-fade-in" style={{ bottom: 18, zIndex: 4, pointerEvents: "auto" }}>
          <div className="flex items-center gap-3" style={{ width: "min(88%,420px)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 16, padding: "10px 14px", backdropFilter: "blur(10px)", cursor: "pointer", boxShadow: "0 8px 30px -12px rgba(0,0,0,0.6)" }}>
            <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: dayNext.important ? "#E0902A" : "var(--text-primary)", minWidth: 46 }}>{dayNext.time || "—"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dayNext.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{dayNext.note || "ближайшее в твоём дне · тап — открыть"}</div>
            </div>
            <div style={{ fontSize: 18 }}>🗓</div>
          </div>
        </div>
      )}

      {dayOpen && <MyDayModal onClose={() => setDayOpen(false)} />}
    </div>
  );
}
