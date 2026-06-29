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
import { contractorLogout } from "@/services/api";
import HomeRoom from "@/components/communicator/HomeRoom";

// Тяжёлые модалки — ленивая загрузка (грузятся только при открытии)
const SettingsModal = dynamic(() => import("@/components/communicator/SettingsModal"));
const MyAgentsModal = dynamic(() => import("@/components/communicator/MyAgentsModal"));
const AgentCityModal = dynamic(() => import("@/components/communicator/AgentCityModal"));
const ContactsModal = dynamic(() => import("@/components/communicator/ContactsModal"));
const BusinessDashboardModal = dynamic(() => import("@/components/communicator/BusinessDashboardModal"));

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

type AppScreen = "splash" | "login" | "communicator" | "business";

export default function Home() {
  const { isLoggedIn, isAdmin, login, logout, user } = useAuth();
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [assistantPhoto, setAssistantPhoto] = useState<string | null>(null);
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  const [view, setView] = useState<"feed" | "chat">("feed");
  const [drivingMode, setDrivingMode] = useState(false);
  const [topBarH, setTopBarH] = useState(120);
  const [bottomBarH, setBottomBarH] = useState(130);
  const [micActive, setMicActive] = useState(false);
  const loadedRef = useRef(false);

  // Чат — через хук (WebSocket + offline fallback)
  const {
    messages, isTyping, typingName, isConnected,
    sendMessage, attachMedia, room, setRoom, agentInfo,
  } = useChat(getJimRoom());

  const assistantName = user?.assistant_name || "Джим";
  const assistantRoom = getJimRoom();

  // Загрузка открытых чатов из localStorage (на смену пользователя — перечитываем его список)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(openChatsKey());
      setOpenChats(raw ? JSON.parse(raw) : []);
    } catch {
      setOpenChats([]);
    }
    loadedRef.current = true;
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

  // Как только пришла инфа об агенте — обновляем имя/цвет в ленте открытых
  useEffect(() => {
    if (agentInfo && room.startsWith("agent-")) {
      setOpenChats((prev) =>
        prev.map((c) =>
          c.room === room ? { ...c, name: agentInfo.name, color: agentInfo.color, agentId: agentInfo.id } : c
        )
      );
    }
  }, [agentInfo, room]);

  /** Переключиться на чат из ленты аватаров */
  const selectChat = useCallback((r: string) => {
    setRoom(r);
    setView("chat");
  }, [setRoom]);

  /** Закрыть (убрать из ленты) открытый чат */
  const closeChat = useCallback((r: string) => {
    setOpenChats((prev) => prev.filter((c) => c.room !== r));
    if (room === r) {
      setRoom(assistantRoom);
      setView("feed");
    }
  }, [room, setRoom, assistantRoom]);

  useEffect(() => {
    const t = localStorage.getItem("jinntell_theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
    const a = localStorage.getItem("jinntell_accent");
    if (a) document.documentElement.style.setProperty("--custom-accent", a);
  }, []);

  useEffect(() => { setAssistantPhoto(user?.assistant_photo || null); }, [user?.assistant_photo]);
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
        onSelectChat={selectChat}
        onCloseChat={closeChat}
        onFavorites={() => setAgentsOpen(true)}
        onFeed={() => setView("feed")}
        drivingMode={drivingMode}
        onToggleDriving={() => setDrivingMode((v) => !v)}
      />

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
        />
      ) : (
        <ChatArea
          messages={messages}
          isTyping={isTyping}
          typingName={typingName}
          topPad={topBarH}
          bottomPad={bottomBarH}
          autoSpeak={micActive}
          assistantPhoto={assistantPhoto}
          agentInfo={agentInfo}
        />
      )}

      {/* Нижняя панель — ввод + кнопки */}
      <BottomBar
        onSettingsClick={() => setSettingsOpen(true)}
        onContactsClick={() => setContactsOpen(true)}
        onAgentsClick={() => setAgentsOpen(true)}
        onSendMessage={(text) => { if (view === "feed") { setRoom(assistantRoom); setView("chat"); } sendMessage(text); }}
        onAttachMedia={attachMedia}
        onHeightChange={setBottomBarH}
        onMicStateChange={(active) => setMicActive(active)}
        assistantName={assistantName}
      />

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
        onStartChat={openAgentChat}
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
        onStartChat={openAgentChat}
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
