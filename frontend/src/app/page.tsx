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
import ChatArea from "@/components/communicator/ChatArea";
import { contractorLogout, createRoom, inviteToRoom, dmRoom, getMyChats, connectChat, getContacts, type ContactOut } from "@/services/api";
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
  const [view, setView] = useState<"feed" | "chat">("feed");
  const [drive, setDrive] = useState(false);
  const [topBarH, setTopBarH] = useState(120);
  const [bottomBarH, setBottomBarH] = useState(130);
  const [micActive, setMicActive] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [call, setCall] = useState<{ status: "calling" | "incoming" | "active"; role: "caller" | "callee"; peerId: number; peerName: string; offer?: string } | null>(null);
  const userWsRef = useRef<WebSocket | null>(null);
  const callSignalRef = useRef<((type: string, data: { sdp?: string; candidate?: RTCIceCandidateInit }) => void) | null>(null);
  const loadedRef = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  // Чат — через хук (WebSocket + offline fallback)
  const {
    messages, isTyping, typingName, isConnected,
    sendMessage, attachMedia, room, setRoom, agentInfo, roomMembers,
  } = useChat(getJimRoom());

  const assistantName = user?.assistant_name || "Джим";
  const assistantRoom = getJimRoom();

  // Загрузка открытых чатов из localStorage (на смену пользователя — перечитываем его список)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(openChatsKey());
      setOpenChats(raw ? JSON.parse(raw) : []);
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
          const map = new Map(prev.map((c) => [c.room, c] as const));
          for (const ch of chats) {
            if (!map.has(ch.room) && !archivedRooms.has(ch.room)) {
              map.set(ch.room, { room: ch.room, agentId: 0, name: ch.name, color: ch.color, photo: ch.photo || undefined, count: ch.count || undefined, online: ch.online });
            }
          }
          return Array.from(map.values());
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
      ws = connectChat(`user-${user.id}`, (data: { type?: string; user_id?: number; online?: boolean; from?: number; from_name?: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
        const type = data?.type || "";
        if (type === "presence" && data.user_id != null) {
          const uid = data.user_id;
          setOpenChats((prev) => prev.map((c) => (dmOtherId(c.room) === uid ? { ...c, online: !!data.online } : c)));
        } else if (type === "call_offer") {
          setCall((cur) => (cur ? cur : { status: "incoming", role: "callee", peerId: data.from!, peerName: data.from_name || "Абонент", offer: data.sdp }));
        } else if (type === "call_answer" || type === "call_ice") {
          callSignalRef.current?.(type, data);
        } else if (type === "call_end" || type === "call_reject") {
          callSignalRef.current?.(type, data);
          setCall(null);
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
  const openAgentChat = useCallback((agentId: number) => {
    const uid = getUserId();
    const r = uid ? `agent-${agentId}-u${uid}` : `agent-${agentId}`;
    setOpenChats((prev) =>
      prev.some((c) => c.room === r) ? prev : [...prev, { room: r, agentId, name: "Джинн", color: "#6c7bff" }]
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

  const openDM = useCallback((c: { id: number; display_name: string; avatar_color?: string | null; avatar_url?: string | null; is_online?: boolean }) => {
    const uid = getUserId();
    if (!uid) return;
    const r = dmRoom(uid, c.id);
    setOpenChats((prev) => (prev.some((x) => x.room === r) ? prev : [...prev, { room: r, agentId: 0, name: c.display_name, color: c.avatar_color || "#6c7bff", photo: c.avatar_url || null, online: c.is_online }]));
    setRoom(r);
    setView("chat");
    setAgentsOpen(false);
  }, [setRoom]);

  /** Поиск контакта по имени/хендлу */
  const findContact = useCallback((name: string): ContactOut | undefined => {
    const n = name.trim().toLowerCase().replace(/^@/, "");
    return contacts.find((c) => c.display_name.toLowerCase() === n)
      || contacts.find((c) => c.display_name.toLowerCase().includes(n))
      || contacts.find((c) => (c.jinntell_link || "").toLowerCase() === n);
  }, [contacts]);

  /** Ввод к помощнику: перехват голосовых/текстовых команд */
  const handleSend = useCallback((text: string) => {
    const inAssistant = view === "feed" || room === assistantRoom;
    if (inAssistant) {
      const t = text.trim();
      let m: RegExpMatchArray | null;
      if ((m = t.match(/^(?:джим[,\s]+)?(?:отправ\w*\s+сообщени\w*|напиши(?:те)?|сообщени\w*)\s+(?:для\s+|к\s+)?(.+)$/i))) {
        const c = findContact(m[1]);
        if (c) { openDM(c); setCommandHint(`Диктуйте сообщение для ${c.display_name}`); }
        else setCommandHint(`Не нашёл контакт «${m[1].trim()}»`);
        return;
      }
      if ((m = t.match(/^(?:джим[,\s]+)?(?:открой(?:те)?(?:\s+чат)?(?:\s+с)?|позови(?:те)?)\s+(?:контакт\s+)?(.+)$/i))) {
        const c = findContact(m[1]);
        if (c) { openDM(c); setCommandHint(`Открыл чат с ${c.display_name}`); }
        else setCommandHint(`Не нашёл «${m[1].trim()}»`);
        return;
      }
    }
    if (view === "feed") { setRoom(assistantRoom); setView("chat"); }
    sendMessage(text);
  }, [view, room, assistantRoom, findContact, openDM, sendMessage, setRoom]);

  const sendSignal = useCallback((to: number, signal: string, extra?: Record<string, unknown>) => {
    userWsRef.current?.send(JSON.stringify({ signal, to, ...(extra || {}) }));
  }, []);
  const startCall = useCallback(() => {
    const other = dmOtherId(room);
    if (!other) return;
    const oc = openChats.find((c) => c.room === room);
    setCall({ status: "calling", role: "caller", peerId: other, peerName: oc?.name || "Абонент" });
  }, [room, openChats]);

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
  }, []);

  useEffect(() => { setAssistantPhoto(user?.assistant_photo || null); }, [user?.assistant_photo]);
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
    <div className="relative w-full h-screen overflow-hidden">
      {/* Фон */}
      <AppBackground />

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
        roomMembers={roomMembers}
        onInviteJinn={onInviteJinn}
        onCall={startCall}
      />

      {commandHint && (
        <div className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm animate-fade-in" style={{ top: topBarH + 8, zIndex: 70, background: "var(--accent)", color: "var(--bg-deep)", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {commandHint}
        </div>
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
          onOpenAssistant={() => { setRoom(assistantRoom); setView("chat"); }}
          onOpenChat={(r) => { setRoom(r); setView("chat"); }}
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
        onRecordNote={() => setRecorderOpen(true)}
        assistantName={assistantName}
      />

      {recorderOpen && (
        <VideoNoteRecorder
          onClose={() => setRecorderOpen(false)}
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
              <button onClick={() => setCall((c) => (c ? { ...c, status: "active" } : c))} className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: "#2ecc71" }}>📞</button>
            </div>
          </div>
        </div>
      )}
      {call && (call.status === "calling" || call.status === "active") && (
        <VideoCall
          role={call.role}
          peerId={call.peerId}
          peerName={call.peerName}
          offer={call.offer}
          sendSignal={sendSignal}
          signalRef={callSignalRef}
          onEnd={() => setCall(null)}
        />
      )}

      {/* Центр Управления */}
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
