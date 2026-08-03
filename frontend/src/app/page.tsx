"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/hooks/useChat";
import SplashScreen from "@/components/auth/SplashScreen";
import LoginScreen from "@/components/auth/LoginScreen";
import dynamic from "next/dynamic";
import AppBackground from "@/components/communicator/AppBackground";
import NavBar, { type OpenChat } from "@/components/communicator/NavBar";
import BottomBar from "@/components/communicator/BottomBar";
import ChatArea, { type ChatMessage } from "@/components/communicator/ChatArea";
import ActionsModal from "@/components/communicator/ActionsModal";
import { contractorLogout, createRoom, inviteToRoom, dmRoom, getMyChats, connectChat, getContacts, clearHistory, dmSend, addFavoriteAgent, removeFavoriteAgent, getFavoriteAgents, getAgents, discoverAgents, classifyIntent, webSearch, assistantAct, forwardMessage, getChannelPosts, markChannelRead, mediaUrl, getActionSettings, geoCheck, updateMe, ttsBlobUrl, type ContactOut, type ChannelPost, type GeoDelivery } from "@/services/api";
import FlowScreen from "@/components/communicator/FlowScreen";
import HomeRoom from "@/components/communicator/HomeRoom";
import ChatJournal from "@/components/communicator/ChatJournal";

// Тяжёлые модалки — ленивая загрузка (грузятся только при открытии)
const SettingsModal = dynamic(() => import("@/components/communicator/SettingsModal"));
const MyAgentsModal = dynamic(() => import("@/components/communicator/MyAgentsModal"));
const AgentCityModal = dynamic(() => import("@/components/communicator/AgentCityModal"));
const ContactsModal = dynamic(() => import("@/components/communicator/ContactsModal"));
const BusinessDashboardModal = dynamic(() => import("@/components/communicator/BusinessDashboardModal"));
const VideoNoteRecorder = dynamic(() => import("@/components/communicator/VideoNoteRecorder"), { ssr: false });
const VideoCall = dynamic(() => import("@/components/communicator/VideoCall"), { ssr: false });

/** Персональная комната чата с помощником (по userId из сессии) — НЕ общая на всех */
function getUserId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(localStorage.getItem("jinntell_session") || "{}");
    return s.userId ?? null;
  } catch {
    return null;
  }
}

function getJimRoom(): string {
  if (typeof window === "undefined") return "general";
  try {
    const s = JSON.parse(localStorage.getItem("jinntell_session") || "{}");
    return s.userId ? `jim-${s.userId}` : "general";
  } catch {
    return "general";
  }
}

/** Ключ хранения открытых чатов — персональный (на каждого пользователя свой) */
function openChatsKey(): string {
  const uid = getUserId();
  return uid ? `jinntell_open_chats_${uid}` : "jinntell_open_chats";
}

/** Убрать дубли открытых чатов по комнате + исключить помощника */
function dedupeOpen(list: OpenChat[], assistantRoom: string): OpenChat[] {
  const seen = new Set<string>();
  return (list || []).filter((c) => c && c.room && c.room !== assistantRoom && !seen.has(c.room) && (seen.add(c.room), true));
}

/** Ключ хранения закрытых (архивных) чатов — персональный */
function archivedKey(): string {
  const uid = getUserId();
  return uid ? `jinntell_archived_chats_${uid}` : "jinntell_archived_chats";
}

type AppScreen = "splash" | "login" | "communicator" | "business";

export default function Home() {
  const { isLoggedIn, isAdmin, login, logout, user } = useAuth();
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [inviteContext, setInviteContext] = useState<{ type: "agent"; agentId: number } | { type: "room"; roomId: number } | null>(null);
  const [agentsInitialTab, setAgentsInitialTab] = useState<"jinns" | "people">("jinns");
  const [contacts, setContacts] = useState<ContactOut[]>([]);
  const [commandHint, setCommandHint] = useState("");
  const [assistantPhoto, setAssistantPhoto] = useState<string | null>(null);
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  const [archivedChats, setArchivedChats] = useState<OpenChat[]>([]);
  const [view, setView] = useState<"feed" | "chat" | "flow">("feed");
  const flowReturnRef = useRef<{ view: "feed" | "chat" | "flow"; room: string }>({ view: "feed", room: "" });
  const assistantBusyRef = useRef(false);
  const [drive, setDrive] = useState(false);
  const [topBarH, setTopBarH] = useState(120);
  const [bottomBarH, setBottomBarH] = useState(130);
  const [micActive, setMicActive] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recorderAuto, setRecorderAuto] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [channelPosts, setChannelPosts] = useState<ChannelPost[]>([]);
  const [mutedRooms, setMutedRooms] = useState<string[]>([]);
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [call, setCall] = useState<{ status: "calling" | "incoming" | "active"; role: "caller" | "callee"; peerId: number; peerName: string; offer?: string } | null>(null);
  const userWsRef = useRef<WebSocket | null>(null);
  const [chatHidden, setChatHidden] = useState(false);
  const screenTaps = useRef<number[]>([]);
  const callSignalRef = useRef<((type: string, data: { sdp?: string; candidate?: RTCIceCandidateInit }) => void) | null>(null);
  const loadedRef = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  // Чат — через хук (WebSocket + offline fallback)
  const {
    messages, isTyping, typingName, isConnected,
    sendMessage, attachMedia, pushAssistant, pushUser, room, setRoom, agentInfo, roomMembers,
  } = useChat(getJimRoom());

  const roomRef = useRef(room);
  const viewRef = useRef(view);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { viewRef.current = view; }, [view]);
  const openChatsRef = useRef(openChats);
  useEffect(() => { openChatsRef.current = openChats; }, [openChats]);
  useEffect(() => {
    const m = room.match(/^agent-(\d+)/);
    if (!m) { setChannelPosts([]); return; }
    const aid = Number(m[1]);
    getChannelPosts(aid).then((p) => { setChannelPosts(p); if (p.length) markChannelRead(aid).catch(() => {}); }).catch(() => setChannelPosts([]));
  }, [room]);
  const callRef = useRef(call);
  useEffect(() => { callRef.current = call; }, [call]);
  const callStartRef = useRef(0);
  useEffect(() => { setChatSearchOpen(false); }, [room]);

  const assistantName = user?.assistant_name || "Джим";
  const assistantRoom = getJimRoom();
  const onbKey = () => { const uid = getUserId(); return uid ? `jinntell_onboarded_${uid}` : "jinntell_onboarded"; };
  const [onboarding, setOnboarding] = useState<null | "name">(null);
  useEffect(() => {
    if (!user) return;
    try { if (localStorage.getItem(onbKey())) return; } catch { return; }
    if (!user.display_name && !user.first_name) {
      setOnboarding("name");
      setTimeout(() => pushAssistant(`Привет! Я ваш помощник${assistantName ? ` ${assistantName}` : ""}. Как к вам обращаться?`), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Загрузка открытых чатов из localStorage (на смену пользователя — перечитываем его список)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(openChatsKey());
      setOpenChats(raw ? dedupeOpen(JSON.parse(raw), assistantRoom) : []);
      const ar = localStorage.getItem(archivedKey());
      setArchivedChats(ar ? JSON.parse(ar) : []);
    } catch {
      setOpenChats([]);
      setArchivedChats([]);
    }
    loadedRef.current = true;
  }, [user?.id]);

  // Подмешиваем серверные чаты (входящие DM, мои комнаты), чтобы они появлялись в ленте у собеседника
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const sync = () => {
      getContacts().then((cs) => { if (alive) setContacts(cs); }).catch(() => {});
      getMyChats().then((chats) => {
        if (!alive) return;
        let archivedRooms = new Set<string>();
        try {
          const ar = localStorage.getItem(archivedKey());
          if (ar) archivedRooms = new Set((JSON.parse(ar) as OpenChat[]).map((c) => c.room));
        } catch { /* noop */ }
        setOpenChats((prev) => {
          const have = new Set(prev.map((c) => c.room));
          const additions = chats
            .filter((ch) => !have.has(ch.room) && !archivedRooms.has(ch.room))
            .map((ch) => ({ room: ch.room, agentId: 0, name: ch.name, color: ch.color, photo: ch.photo || undefined, online: ch.online }));
          const updated = prev.map((c) => {
            const srv = chats.find((x) => x.room === c.room);
            return srv ? { ...c, online: srv.online, name: srv.name, photo: srv.photo || c.photo } : c;
          });
          return dedupeOpen(additions.length ? [...additions, ...updated] : updated, assistantRoom);
        });
      }).catch(() => {});
    };
    syncRef.current = sync;
    sync();
    const iv = setInterval(sync, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [user?.id]);

  // Персональный канал уведомлений — реалтайм обновление чат-листа при входящем DM/комнате
  useEffect(() => {
    if (!user?.id) return;
    let ws: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      ws = connectChat(`user-${user.id}`, (data: { type?: string; user_id?: number; online?: boolean; from?: number; from_name?: string; sdp?: string; candidate?: RTCIceCandidateInit; room?: string }) => {
        const type = data?.type || "";
        if (type === "presence" && data.user_id != null) {
          const uid = data.user_id;
          setOpenChats((prev) => prev.map((c) => (dmOtherId(c.room) === uid ? { ...c, online: !!data.online } : c)));
        } else if (type === "call_ring") {
          setCall((cur) => (cur ? cur : { status: "incoming", role: "callee", peerId: data.from!, peerName: data.from_name || "Абонент" }));
        } else if (type === "call_accept") {
          callStartRef.current = Date.now();
          setCall((cur) => (cur && cur.role === "caller" ? { ...cur, status: "active" } : cur));
        } else if (type === "call_offer" || type === "call_answer" || type === "call_ice") {
          callSignalRef.current?.(type, data);
        } else if (type === "call_end" || type === "call_reject") {
          callSignalRef.current?.(type, data);
          finishCall();
        } else if (type === "feed_ping") {
          window.dispatchEvent(new Event("jinntell_feed_ping"));
        } else if (type === "chat_ping" && data.room) {
          const pinged = data.room;
          if (isMuted(pinged)) return;
          setOpenChats((prev) => {
            const idx = prev.findIndex((c) => c.room === pinged);
            if (idx < 0) { syncRef.current?.(); return prev; }
            const isViewing = pinged === roomRef.current && viewRef.current === "chat";
            const c = { ...prev[idx], count: isViewing ? 0 : (prev[idx].count || 0) + 1 };
            return [c, ...prev.filter((x) => x.room !== pinged)];
          });
        } else {
          syncRef.current?.();
        }
      });
      userWsRef.current = ws;
      if (ws) ws.onclose = () => { userWsRef.current = null; if (!closed) setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; if (ws) { ws.onclose = null; ws.close(); } };
  }, [user?.id]);

  // Сохранение открытых чатов
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(openChatsKey(), JSON.stringify(openChats));
    } catch {
      /* noop */
    }
  }, [openChats]);

  // Сохранение закрытых (архивных) чатов
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(archivedKey(), JSON.stringify(archivedChats));
    } catch {
      /* noop */
    }
  }, [archivedChats]);

  /** Открыть личный чат с агентом (добавить в ленту открытых + переключиться) */
  const openAgentChat = useCallback((agentId: number, meta?: { name?: string; color?: string }) => {
    const uid = getUserId();
    const r = uid ? `agent-${agentId}-u${uid}` : `agent-${agentId}`;
    setOpenChats((prev) =>
      prev.some((c) => c.room === r) ? prev : [...prev, { room: r, agentId, name: meta?.name || "Джинн", color: meta?.color || "#6c7bff" }]
    );
    setRoom(r);
    setView("chat");
    setAgentsOpen(false);
    setCityOpen(false);
  }, [setRoom]);

  /** Кнопка «позвать джинна»: из 1:1 чата создаём комнату, из комнаты — приглашаем */
  const onInviteJinn = useCallback(() => {
    if (room.startsWith("room-")) {
      setInviteContext({ type: "room", roomId: parseInt(room.slice(5), 10) });
    } else if (agentInfo) {
      setInviteContext({ type: "agent", agentId: agentInfo.id });
    } else {
      return;
    }
    setAgentsInitialTab("jinns");
    setAgentsOpen(true);
  }, [room, agentInfo]);

  /** Выбор джинна в модалке: либо обычное открытие, либо приглашение в комнату */
  const handlePickAgent = useCallback((agentId: number) => {
    if (!inviteContext) { openAgentChat(agentId); return; }
    const ic = inviteContext;
    setInviteContext(null);
    setAgentsOpen(false);
    setCityOpen(false);
    const p = ic.type === "agent" ? createRoom([ic.agentId, agentId]) : inviteToRoom(ic.roomId, agentId);
    p.then((rd) => {
      const first = rd.members[0];
      const entry = { room: rd.room, agentId: first?.id ?? 0, name: rd.members.map((m) => m.name).join(" + "), color: first?.color || "#6c7bff", photo: first?.photo_url ?? null, count: rd.members.length };
      setOpenChats((prev) => (prev.some((c) => c.room === rd.room) ? prev.map((c) => (c.room === rd.room ? entry : c)) : [...prev, entry]));
      setRoom(rd.room);
      setView("chat");
    }).catch(() => {});
  }, [inviteContext, openAgentChat, setRoom]);

  /** Открыть личный диалог с контактом (человек↔человек) */
  const dmOtherId = (r: string): number | null => {
    const m = r.match(/^dm-(\d+)-(\d+)$/);
    if (!m) return null;
    const me = getUserId();
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    return me === a ? b : me === b ? a : null;
  };

  const openDM = useCallback((c: { id: number; display_name: string; avatar_color?: string | null; avatar_url?: string | null; is_online?: boolean; avatar_frame?: string | null }) => {
    const uid = getUserId();
    if (!uid) return;
    const r = dmRoom(uid, c.id);
    setOpenChats((prev) => (prev.some((x) => x.room === r) ? prev : [...prev, { room: r, agentId: 0, name: c.display_name, color: c.avatar_color || "#6c7bff", photo: c.avatar_url || null, online: c.is_online, frame: c.avatar_frame || null }]));
    setRoom(r);
    setView("chat");
    setAgentsOpen(false);
  }, [setRoom]);

  /** Поиск контакта по имени/хендлу */
  const findContact = useCallback((name: string): ContactOut | undefined => {
    const n = name.trim().toLowerCase().replace(/^@/, "").replace(/[.,!?]+$/, "");
    if (!n) return undefined;
    const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2)); // грубо отбрасываем окончание (склонения)
    return contacts.find((c) => c.display_name.toLowerCase() === n)
      || contacts.find((c) => (c.jinntell_link || "").toLowerCase() === n)
      || contacts.find((c) => c.display_name.toLowerCase().includes(n))
      || contacts.find((c) => { const d = c.display_name.toLowerCase(); return d.startsWith(stem(n)) || n.startsWith(stem(d)); });
  }, [contacts]);

  const closeChatRef = useRef<(r: string) => void>(() => {});

  /** Ввод к помощнику: перехват голосовых/текстовых команд */
  const summonJinn = useCallback(async (name: string): Promise<boolean> => {
    try {
      const q = name.toLowerCase().trim();
      const relevant = (ag: { name: string; profession?: string }) => {
        const hay = (ag.name + " " + (ag.profession || "")).toLowerCase();
        return q.split(/\s+/).some((w) => w.length >= 3 && hay.includes(w))
          || hay.split(/\s+/).some((w) => w.length >= 3 && q.includes(w));
      };
      const res = await getAgents({ search: name });
      let a = res.agents.find((x) => x.name.toLowerCase() === q)
        || res.agents.find(relevant);
      if (!a) { const d = await discoverAgents(name, 3); a = d.find(relevant); }
      if (a) { openAgentChat(a.id, { name: a.name, color: a.color }); setCommandHint(`Позвал джинна: ${a.name}`); return true; }
    } catch { /* noop */ }
    return false;
  }, [openAgentChat]);

  const runDirectives = useCallback(async (directives: { action: string; name?: string; to?: string; text?: string }[]) => {
    const uid = getUserId();
    for (const d of directives) {
      const nm = (d.name || d.to || "").trim();
      if (d.action === "open_chat") {
        const c = nm ? findContact(nm) : undefined;
        if (c) openDM(c); else await summonJinn(nm);
      } else if (d.action === "close_chat") {
        const oc = openChatsRef.current.find((cc) => { const n = (cc.name || "").toLowerCase(); const w = nm.toLowerCase(); return n === w || n.includes(w) || w.includes(n); });
        if (oc) closeChatRef.current(oc.room);
        else if (uid) { const c = findContact(nm); if (c) closeChatRef.current(dmRoom(uid, c.id)); }
      } else if (d.action === "call") {
        const c = nm ? findContact(nm) : undefined; if (c) openDM(c);
      } else if (d.action === "send_message") {
        const c = nm ? findContact(nm) : undefined; if (c && d.text) dmSend(c.id, d.text);
      }
    }
  }, [findContact, openDM, summonJinn]);

  const classifyAndAct = useCallback(async (t: string) => {
    let intent;
    try { intent = await classifyIntent(t); } catch { intent = { action: "chat", target: "", text: "", query: "" }; }
    const a = intent.action;
    const target = (intent.target || "").trim();
    const uid = getUserId();
    if (a === "chat") { sendMessage(t); return; }
    if (a === "clarify") { pushAssistant(intent.text || "Уточни, что именно сделать?"); return; }
    if (a === "web_search") { const _q = intent.query || t; setCommandHint(`🔎 Ищу «${_q}»…`); webSearch(_q).then((r) => { let _m = r.text || "Ничего не нашлось."; if (r.sources && r.sources.length) _m += "\n\n" + r.sources.map((sr) => `• ${sr.title} — ${sr.url}`).join("\n"); pushAssistant(_m); }).catch(() => pushAssistant("Поиск не удался.")); return; }
    if (a === "send_media") { pushAssistant("Прикрепи фото через 📎 и скажи, кому переслать."); return; }
    if (a === "open_chat" || a === "summon_jinn") {
      const c = target ? findContact(target) : undefined;
      if (c) { openDM(c); setCommandHint(`Открыл чат с ${c.display_name}`); return; }
      setCommandHint(`Ищу «${target}»…`);
      const ok = await summonJinn(target); if (!ok) pushAssistant(`Не нашёл «${target}».`); return;
    }
    if (a === "close_chat") {
      if (target) { const _oc = openChatsRef.current.find((cc) => { const nm = (cc.name || "").toLowerCase(); const w = target.toLowerCase(); return nm === w || nm.includes(w) || w.includes(nm); }); if (_oc) { closeChatRef.current(_oc.room); setCommandHint(`Закрыл: ${_oc.name}`); return; } const c = findContact(target); if (c && uid) { closeChatRef.current(dmRoom(uid, c.id)); setCommandHint(`Закрыл чат с ${c.display_name}`); return; } pushAssistant(`Не нашёл чат «${target}».`); return; }
      if (room !== assistantRoom) { closeChatRef.current(room); setCommandHint("Закрыл чат"); return; }
      pushAssistant("Какой чат закрыть?"); return;
    }
    if (a === "send_message") {
      const c = target ? findContact(target) : undefined;
      if (c) { if (intent.text) { dmSend(c.id, intent.text).then(() => setCommandHint(`Отправил ${c.display_name}`)).catch(() => setCommandHint("Не удалось отправить")); } else { openDM(c); setCommandHint(`Диктуйте сообщение для ${c.display_name}`); } return; }
      pushAssistant(`Не нашёл контакт «${target}».`); return;
    }
    if (a === "call") {
      const c = target ? findContact(target) : undefined;
      if (c) { openDM(c); pushAssistant(`Открыл чат с ${c.display_name} — нажми 📹, чтобы позвонить.`); return; }
      pushAssistant("Кому позвонить?"); return;
    }
    if (a === "clear_history") { clearHistory(room).catch(() => {}); setCommandHint("Очистил историю"); return; }
    if (a === "favorite") {
      setCommandHint(`Ищу «${target}»…`);
      try { const res = await getAgents({ search: target }); const ag = res.agents[0]; if (ag) { addFavoriteAgent(ag.id).catch(() => {}); setFavIds((sset) => new Set(sset).add(ag.id)); setCommandHint(`В избранном: ${ag.name}`); return; } } catch { /* noop */ }
      pushAssistant(`Не нашёл джинна «${target}».`); return;
    }
    sendMessage(t);
  }, [findContact, openDM, summonJinn, sendMessage, pushAssistant, room, assistantRoom]);

  const handleSend = useCallback((text: string) => {
    if (onboarding === "name") {
      const nm = text.trim().replace(/^(меня зовут|зовут меня|это|я)\s+/i, "").replace(/[.,!?]+$/, "").trim();
      try { localStorage.setItem(onbKey(), "1"); } catch { /* noop */ }
      setOnboarding(null);
      if (!nm || /^(пропустить|позже|потом|не важно|skip)$/i.test(nm)) { pushAssistant("Хорошо! Имя всегда можно задать в настройках. Чем помочь?"); return; }
      updateMe({ display_name: nm }).catch(() => {});
      pushAssistant(`Приятно познакомиться, ${nm}! Чем могу помочь?`);
      return;
    }
    const inAssistant = view === "feed" || room === assistantRoom;
    if (inAssistant) {
      let t = text.trim();
      const esc = (assistantName || "Джим").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      t = t.replace(new RegExp("^" + esc + "[,\\s]+", "i"), "").trim(); // убрать обращение по имени помощника
      // Экран «Поток» (hands-free)
      if (/^(?:вкл\w*\s+|включи\s+|открой\s+|запусти\s+)?(?:поток|без рук|hands.?free)\.?$/i.test(t)) { flowReturnRef.current = { view, room }; setRoom(assistantRoom); setView("flow"); setCommandHint(""); return; }
      // Помощник на инструментах (tool-calling): модель сама выбирает действия и компонует их
      if (assistantBusyRef.current) return; // не накладываем второй запрос поверх (гасит петлю/наложение)
      if (view === "feed") { setRoom(assistantRoom); setView("chat"); }
      assistantBusyRef.current = true;
      pushUser(t);
      setCommandHint("💭 думаю…");
      assistantAct(t).then((r) => {
        setCommandHint("");
        if (r.reply || r.media_url) pushAssistant(r.reply || "", r.media_url ? { url: r.media_url, type: r.media_type || "image" } : undefined);
        if (r.directives && r.directives.length) runDirectives(r.directives);
      }).catch(() => { setCommandHint(""); sendMessage(t); }).finally(() => { assistantBusyRef.current = false; });
      return;
    }
    sendMessage(text);
  }, [view, room, assistantRoom, assistantName, findContact, openDM, sendMessage, setRoom, summonJinn, classifyAndAct, onboarding, pushAssistant]);

  const sendSignal = useCallback((to: number, signal: string, extra?: Record<string, unknown>) => {
    const payload = JSON.stringify({ signal, to, ...(extra || {}) });
    const ws = userWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(payload); return; }
    let tries = 0;
    const iv = setInterval(() => {
      const w = userWsRef.current;
      if (w && w.readyState === WebSocket.OPEN) { w.send(payload); clearInterval(iv); }
      else if (++tries > 12) clearInterval(iv);
    }, 300);
  }, []);
  const startCall = useCallback(() => {
    const other = dmOtherId(room);
    if (!other) return;
    const oc = openChats.find((c) => c.room === room);
    sendSignal(other, "ring");
    callStartRef.current = 0;
    setCall({ status: "calling", role: "caller", peerId: other, peerName: oc?.name || "Абонент" });
  }, [room, openChats, sendSignal]);

  const finishCall = useCallback(() => {
    const c = callRef.current;
    if (c && c.role === "caller") {
      const secs = callStartRef.current ? Math.round((Date.now() - callStartRef.current) / 1000) : 0;
      const label = secs > 0 ? `📞 Видеозвонок · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "📞 Вызов не отвечен";
      sendMessage(label);
    }
    callStartRef.current = 0;
    setCall(null);
  }, [sendMessage]);

  const handleScreenTap = useCallback((e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("button, input, textarea, a, video, select, [data-no-peek]")) return;
    const now = Date.now();
    screenTaps.current = screenTaps.current.filter((t) => now - t < 550);
    screenTaps.current.push(now);
    if (screenTaps.current.length >= 3) { screenTaps.current = []; setChatHidden((v) => !v); }
  }, []);

  // Как только пришла инфа об агенте — обновляем имя/цвет в ленте открытых
  useEffect(() => {
    if (agentInfo && room.startsWith("agent-")) {
      setOpenChats((prev) => {
        const entry = { room, agentId: agentInfo.id, name: agentInfo.name, color: agentInfo.color, photo: agentInfo.photo_url ?? null };
        return prev.some((c) => c.room === room)
          ? prev.map((c) => (c.room === room ? { ...c, ...entry } : c))
          : [...prev, entry];
      });
    }
  }, [agentInfo, room]);

  /** Переключиться на чат из ленты аватаров */
  const selectChat = useCallback((r: string) => {
    setRoom(r);
    setView("chat");
    setOpenChats((prev) => prev.map((c) => (c.room === r ? { ...c, count: 0 } : c)));
  }, [setRoom]);

  /** Закрыть чат — в архив (история сохраняется), а не удалить */
  const closeChat = useCallback((r: string) => {
    setOpenChats((prev) => {
      const closed = prev.find((c) => c.room === r);
      if (closed) setArchivedChats((a) => [closed, ...a.filter((c) => c.room !== r)]);
      return prev.filter((c) => c.room !== r);
    });
    if (room === r) {
      setRoom(assistantRoom);
      setView("feed");
    }
  }, [room, setRoom, assistantRoom]);
  useEffect(() => { closeChatRef.current = closeChat; }, [closeChat]);

  /** Переоткрыть закрытый чат (история подтянется по комнате) */
  const reopenChat = useCallback((r: string) => {
    setArchivedChats((prev) => {
      const found = prev.find((c) => c.room === r);
      if (found) setOpenChats((o) => (o.some((c) => c.room === r) ? o : [...o, found]));
      return prev.filter((c) => c.room !== r);
    });
    setRoom(r);
    setView("chat");
  }, [setRoom]);

  const muteKey = () => `jinntell_muted_${user?.id || 0}`;
  const isMuted = (r: string) => { try { return (JSON.parse(localStorage.getItem(muteKey()) || "[]") as string[]).includes(r); } catch { return false; } };
  const toggleMute = (r: string) => {
    let list: string[] = [];
    try { list = JSON.parse(localStorage.getItem(muteKey()) || "[]"); } catch { list = []; }
    const has = list.includes(r);
    const next = has ? list.filter((x) => x !== r) : [...list, r];
    localStorage.setItem(muteKey(), JSON.stringify(next));
    setMutedRooms(next);
    return !has;
  };
  useEffect(() => {
    try { setMutedRooms(JSON.parse(localStorage.getItem(muteKey()) || "[]")); } catch { setMutedRooms([]); }
    getFavoriteAgents().then((f) => setFavIds(new Set(f.map((a) => a.id)))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const activeAgentId = (() => { const m = room.match(/^agent-(\d+)/); return m ? Number(m[1]) : 0; })();
  const activeIsFav = activeAgentId ? favIds.has(activeAgentId) : false;
  const handleChatAction = useCallback((action: string) => {
    const r = room;
    const am = r.match(/^agent-(\d+)/);
    const agentId = am ? Number(am[1]) : 0;
    switch (action) {
      case "settings":
      case "wallpaper": setSettingsOpen(true); break;
      case "clear": clearHistory(r).catch(() => {}); break;
      case "mute": setCommandHint(toggleMute(r) ? "Чат приглушён 🔕" : "Уведомления включены"); break;
      case "close": closeChat(r); break;
      case "invite": onInviteJinn(); break;
      case "call": startCall(); break;
      case "share": navigator.clipboard?.writeText(`${location.origin}/?agent=${agentId}`).catch(() => {}); setCommandHint("Ссылка скопирована 🔗"); break;
      case "fav":
        if (agentId) {
          if (favIds.has(agentId)) { removeFavoriteAgent(agentId).catch(() => {}); setFavIds((s) => { const n = new Set(s); n.delete(agentId); return n; }); setCommandHint("Убрано из избранного"); }
          else { addFavoriteAgent(agentId).catch(() => {}); setFavIds((s) => new Set(s).add(agentId)); setCommandHint("Добавлено в избранное ⭐"); }
        }
        break;
      case "report": setCommandHint("Жалоба отправлена, спасибо"); break;
      case "search": setChatSearchOpen(true); break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, closeChat, onInviteJinn, startCall, favIds]);

  useEffect(() => {
    const read = () => setDrive(localStorage.getItem("jinntell_drive") === "1");
    read();
    window.addEventListener("jinntell_drive_change", read);
    return () => window.removeEventListener("jinntell_drive_change", read);
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("jinntell_theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
    const a = localStorage.getItem("jinntell_accent");
    if (a) document.documentElement.style.setProperty("--custom-accent", a);
    const ts = localStorage.getItem("jinntell_text_scale");
    if (ts) document.documentElement.style.fontSize = (parseFloat(ts) * 16) + "px";
  }, []);

  useEffect(() => { setAssistantPhoto(user?.assistant_photo || null); }, [user?.assistant_photo]);
  useEffect(() => { if (user?.assistant_voice) { try { localStorage.setItem("jinntell_assistant_voice", user.assistant_voice); } catch { /* noop */ } } }, [user?.assistant_voice]);
  // Вход сразу на Поток (голос-первый). Только для вернувшихся (есть имя) — новичок остаётся в ленте на онбординг имени
  const landedRef = useRef(false);
  useEffect(() => {
    if (screen !== "communicator" || !user || landedRef.current) return;
    landedRef.current = true;
    if (user.display_name || user.first_name) { setRoom(assistantRoom); setView("flow"); }
  }, [screen, user, assistantRoom, setRoom]);
  useEffect(() => { if (user?.custom_bg_url) { try { localStorage.setItem("jinntell_custom_bg", user.custom_bg_url); } catch { /* noop */ } } }, [user?.custom_bg_url]);

  // Геотриггер: опрос позиции при открытом приложении (если пользователь разрешил геолокацию)
  const [geoKnock, setGeoKnock] = useState<GeoDelivery | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(async (p) => {
        if (stop) return;
        try {
          const r = await geoCheck(p.coords.latitude, p.coords.longitude);
          const d = (r.deliveries || []).find((x) => !x.quiet) || null;
          if (d) {
            setGeoKnock(d);
            // Зазывала «зазывает» голосом (best-effort; браузер может блокировать автозвук)
            try {
              const call = `${d.title || ""}. ${d.message || ""}`.trim();
              if (call) { const u = await ttsBlobUrl(call, d.voice || "zahar", "good"); if (u) { const a = new Audio(u); a.play().catch(() => {}); } }
            } catch { /* noop */ }
          }
        } catch { /* noop */ }
      }, () => {}, { maximumAge: 60000, timeout: 10000 });
    };
    getActionSettings().then((s) => {
      if (stop || !s.allow_location) return;
      tick();
      timer = setInterval(tick, 90000);
    }).catch(() => {});
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!commandHint) return;
    const t = setTimeout(() => setCommandHint(""), 3500);
    return () => clearTimeout(t);
  }, [commandHint]);
  useEffect(() => {
    const onPhoto = (e: Event) => setAssistantPhoto((e as CustomEvent).detail ?? null);
    window.addEventListener("jinntell_assistant_photo", onPhoto);
    return () => window.removeEventListener("jinntell_assistant_photo", onPhoto);
  }, []);

  // Подхват JinnTell Link: если в localStorage есть jinntell_open_agent — открываем чат
  useEffect(() => {
    if (screen === "communicator") {
      const pendingAgent = localStorage.getItem("jinntell_open_agent");
      if (pendingAgent) {
        localStorage.removeItem("jinntell_open_agent");
        const agentId = parseInt(pendingAgent, 10);
        if (!isNaN(agentId)) {
          openAgentChat(agentId);
        }
      }
    }
  }, [screen, openAgentChat]);

  // Заставка — после неё проверяем сессию через AuthContext
  if (screen === "splash") {
    return <SplashScreen onFinish={() => {
      setScreen(isLoggedIn ? "communicator" : "login");
    }} />;
  }

  // Экран входа
  if (screen === "login") {
    return <LoginScreen
      onLogin={(userData) => {
        login(userData || {});
        setScreen("communicator");
      }}
      onBusinessLogin={() => setScreen("business")}
    />;
  }

  if (screen === "business") {
    return <BusinessDashboardModal isOpen onClose={() => { contractorLogout(); setScreen("login"); }} />;
  }

  // Коммуникатор
  return (
    <div className="relative w-full h-screen overflow-hidden" onPointerUp={handleScreenTap}>
      {/* Фон */}
      <AppBackground />

      <div style={{ visibility: chatHidden ? "hidden" : "visible", pointerEvents: chatHidden ? "none" : "auto" }}>

      {/* Верхняя панель + лента открытых чатов */}
      <NavBar
        onHeightChange={setTopBarH}
        assistantName={assistantName}
        assistantPhoto={assistantPhoto}
        assistantRoom={assistantRoom}
        openChats={openChats}
        activeRoom={room}
        view={view}
        activeAgent={agentInfo}
        onSelectChat={selectChat}
        onCloseChat={closeChat}
        onFavorites={() => { setAgentsInitialTab("jinns"); setAgentsOpen(true); }}
        onFeed={() => { setRoom(assistantRoom); setView("feed"); }}
        onSettings={() => setSettingsOpen(true)}
        onChatAction={handleChatAction}
        mutedRooms={mutedRooms}
        activeIsFav={activeIsFav}
        roomMembers={roomMembers}
        onInviteJinn={onInviteJinn}
        onCall={startCall}
      />

      {commandHint && (
        <div className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm animate-fade-in" style={{ top: topBarH + 8, zIndex: 70, background: "var(--accent)", color: "var(--bg-deep)", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {commandHint}
        </div>
      )}

      {geoKnock && (
        <div
          onClick={() => { openAgentChat(geoKnock.agent_id, { name: geoKnock.agent_name, color: geoKnock.color }); setGeoKnock(null); }}
          className="fixed left-1/2 -translate-x-1/2 p-3 rounded-2xl text-sm animate-fade-in cursor-pointer flex flex-col gap-2"
          style={{ bottom: 96, zIndex: 80, background: "var(--panel-bg)", border: "1px solid var(--accent)", boxShadow: "0 6px 24px rgba(0,0,0,0.35)", maxWidth: "min(90%, 320px)" }}
        >
          {geoKnock.media_url && (
            <img src={geoKnock.media_url.startsWith("data:") || geoKnock.media_url.startsWith("blob:") ? geoKnock.media_url : mediaUrl(geoKnock.media_url)} alt="" className="rounded-xl w-full" style={{ maxHeight: 140, objectFit: "cover" }} />
          )}
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 18 }}>🔔</span>
            <span style={{ color: "var(--text-primary)" }}><b>{geoKnock.agent_name}</b> рядом: {geoKnock.title || geoKnock.message}</span>
            <button onClick={(e) => { e.stopPropagation(); setGeoKnock(null); }} className="ml-auto text-[12px]" style={{ color: "var(--text-muted)" }}>✕</button>
          </div>
        </div>
      )}

      {view !== "flow" && (
        <button
          onClick={() => { flowReturnRef.current = { view, room }; setRoom(assistantRoom); setView("flow"); }}
          title="Голосовой режим «Поток»"
          className="fixed flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold transition-all hover:opacity-90 animate-fade-in"
          style={{ top: 38, right: 10, zIndex: 75, background: "var(--bg-glass)", border: "1px solid var(--accent)", color: "var(--accent)", backdropFilter: "blur(8px)" }}
        >
          🌀 Поток
        </button>
      )}

      {view === "flow" && (
        <FlowScreen
          onExit={() => { const r = flowReturnRef.current; setRoom(r.room || assistantRoom); setView(r.view === "flow" ? "feed" : r.view); }}
          onSend={(t) => handleSend(t)}
          lastReply={(() => { for (let i = messages.length - 1; i >= 0; i--) { const mm = messages[i]; if (mm.sender !== "user") return mm.text || ""; } return ""; })()}
          lastMedia={(() => { for (let i = messages.length - 1; i >= 0; i--) { const mm = messages[i]; if (mm.sender !== "user") { return mm.mediaUrl ? { url: mm.mediaUrl, type: mm.mediaType || "image" } : null; } } return null; })()}
          assistantName={assistantName}
          assistantPhoto={assistantPhoto}
          voiceId={user?.assistant_voice}
        />
      )}

      {/* Индикатор подключения к серверу */}
      {isConnected && (
        <div
          className="fixed top-1 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] animate-fade-in"
          style={{ zIndex: 60, background: "rgba(76,175,80,0.15)", color: "#4CAF50" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          online
        </div>
      )}

      {/* Центральная область — Лента (события) или активный чат */}
      {view === "feed" ? (
        <HomeRoom
          topPad={topBarH}
          bottomPad={bottomBarH}
          assistantName={assistantName}
          assistantPhoto={assistantPhoto}
          userId={user?.id}
          openChats={openChats}
          favIds={favIds}
          onOpenAssistant={() => { setRoom(assistantRoom); setView("chat"); }}
          onOpenFlow={() => { flowReturnRef.current = { view, room }; setRoom(assistantRoom); setView("flow"); }}
          onOpenAgent={openAgentChat}
          onOpenContact={openDM}
          onOpenChat={(r) => { setRoom(r); setView("chat"); }}
          onOpenActions={() => setActionsOpen(true)}
        />
      ) : (
        <ChatArea
          messages={messages}
          isTyping={isTyping}
          typingName={typingName}
          topPad={topBarH}
          bottomPad={bottomBarH}
          autoSpeak={micActive || drive}
          assistantPhoto={assistantPhoto}
          agentPhoto={agentInfo?.photo_url || null}
          agentInfo={agentInfo}
          topAlign={room === assistantRoom}
          privateChat={room === assistantRoom || /^agent-/.test(room)}
          searchOpen={chatSearchOpen}
          onCloseSearch={() => setChatSearchOpen(false)}
          onForward={(m) => setForwardMsg(m)}
          channelPosts={channelPosts}
          headerSlot={room === assistantRoom ? (
            <ChatJournal openChats={openChats} archivedChats={archivedChats} onSelect={selectChat} onReopen={reopenChat} />
          ) : null}
        />
      )}

      {/* Нижняя панель — ввод + кнопки */}
      <BottomBar
        onSettingsClick={() => setSettingsOpen(true)}
        onContactsClick={() => { setAgentsInitialTab("people"); setAgentsOpen(true); }}
        onAgentsClick={() => setAgentsOpen(true)}
        onSendMessage={handleSend}
        onAttachMedia={attachMedia}
        onHeightChange={setBottomBarH}
        onMicStateChange={(active) => setMicActive(active)}
        onRecordNote={(auto?: boolean) => { setRecorderAuto(!!auto); setRecorderOpen(true); }}
        assistantName={assistantName}
      />
      </div>

      {chatHidden && (
        <div className="fixed bottom-6 left-0 right-0 text-center text-[11px] animate-fade-in" style={{ zIndex: 40, color: "var(--text-muted)" }}>
          Три касания по экрану — вернуть чат
        </div>
      )}

      {forwardMsg && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 150, background: "rgba(0,0,0,0.6)" }} onClick={() => setForwardMsg(null)}>
          <div className="relative w-full max-w-sm rounded-2xl p-4 max-h-[70vh] overflow-y-auto" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Переслать</div>
            <div className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>{forwardMsg.mediaUrl ? "медиа" : "сообщение"}{forwardMsg.text ? `: «${forwardMsg.text.slice(0, 40)}»` : ""}</div>
            {(() => {
              const uid = getUserId();
              const targets: { room: string; name: string; color: string; photo?: string | null }[] = [];
              openChats.forEach((c) => { if (c.room !== room) targets.push({ room: c.room, name: c.name, color: c.color, photo: c.photo }); });
              contacts.forEach((c) => { const r = uid ? dmRoom(uid, c.id) : ""; if (r && r !== room && !targets.some((x) => x.room === r)) targets.push({ room: r, name: c.display_name, color: c.avatar_color || "#6c7bff", photo: c.avatar_url }); });
              if (!targets.length) return <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Нет доступных чатов — откройте диалог или добавьте контакт.</div>;
              return targets.map((t) => (
                <button key={t.room} onClick={() => { forwardMessage(t.room, { text: forwardMsg.text || undefined, media_url: forwardMsg.mediaUrl, media_type: forwardMsg.mediaType }).then(() => { setForwardMsg(null); setCommandHint(`Переслано: ${t.name}`); }).catch(() => setCommandHint("Не удалось переслать")); }}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-all hover:opacity-90 mb-1.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden shrink-0" style={{ background: t.photo ? "transparent" : `${t.color}22`, border: `1.5px solid ${t.color}55`, color: t.color }}>
                    {t.photo ? <img src={t.photo.startsWith("data:") ? t.photo : mediaUrl(t.photo)} alt="" className="w-full h-full object-cover" /> : t.name[0]}
                  </div>
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {recorderOpen && (
        <VideoNoteRecorder
          autoStart={recorderAuto}
          onClose={() => { setRecorderOpen(false); setRecorderAuto(false); }}
          onDone={(f) => attachMedia(f, true)}
        />
      )}

      {call?.status === "incoming" && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 130, background: "rgba(0,0,0,0.85)" }}>
          <div className="flex flex-col items-center gap-5 text-white">
            <div className="text-xl font-semibold">{call.peerName}</div>
            <div className="text-sm opacity-80">Входящий видеозвонок…</div>
            <div className="flex gap-8">
              <button onClick={() => { sendSignal(call.peerId, "reject"); setCall(null); }} className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: "#e74c3c", color: "#fff" }}>✕</button>
              <button onClick={() => { if (call) sendSignal(call.peerId, "accept"); setCall((c) => (c ? { ...c, status: "active" } : c)); }} className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: "#2ecc71" }}>📞</button>
            </div>
          </div>
        </div>
      )}
      {call?.status === "active" && (
        <VideoCall
          role={call.role}
          peerId={call.peerId}
          peerName={call.peerName}
          sendSignal={sendSignal}
          signalRef={callSignalRef}
          onEnd={finishCall}
        />
      )}
      {call?.status === "calling" && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 130, background: "rgba(0,0,0,0.85)" }}>
          <div className="flex flex-col items-center gap-5 text-white">
            <div className="text-xl font-semibold">{call.peerName}</div>
            <div className="text-sm opacity-80">Звоним…</div>
            <button onClick={() => { sendSignal(call.peerId, "end"); finishCall(); }} className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: "#e74c3c", color: "#fff" }} title="Отменить">✕</button>
          </div>
        </div>
      )}

      {/* Центр Управления */}
      {actionsOpen && <ActionsModal onClose={() => setActionsOpen(false)} assistantName={assistantName} />}

      {settingsOpen && (
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={() => {
          logout();
          setScreen("login");
        }}
      />
      )}

      {/* Мои Джинны (избранное) */}
      {agentsOpen && (
      <MyAgentsModal
        isOpen={agentsOpen}
        onClose={() => setAgentsOpen(false)}
        onOpenCity={() => {
          setAgentsOpen(false);
          setCityOpen(true);
        }}
        onStartChat={handlePickAgent}
        onStartDM={openDM}
        initialTab={agentsInitialTab}
      />
      )}

      {/* Город Джиннов */}
      {cityOpen && (
      <AgentCityModal
        isOpen={cityOpen}
        onClose={() => setCityOpen(false)}
        onOpenBusiness={() => {
          setCityOpen(false);
          setBusinessOpen(true);
        }}
        onStartChat={handlePickAgent}
        isAdmin={isAdmin}
        onOpenAdmin={() => {
          setCityOpen(false);
          window.location.href = "/admin";
        }}
      />
      )}

      {/* Мои контакты */}
      {contactsOpen && (
      <ContactsModal
        isOpen={contactsOpen}
        onClose={() => setContactsOpen(false)}
      />
      )}

      {/* ЛК Бизнеса (настройка привязанных агентов) */}
      {businessOpen && (
      <BusinessDashboardModal
        isOpen={businessOpen}
        onClose={() => setBusinessOpen(false)}
      />
      )}
    </div>
  );
}
