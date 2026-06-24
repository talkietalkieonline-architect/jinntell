"use client";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/hooks/useChat";
import SplashScreen from "@/components/auth/SplashScreen";
import LoginScreen from "@/components/auth/LoginScreen";
import Particles from "@/components/communicator/Particles";
import TopBar from "@/components/communicator/TopBar";
import BottomBar from "@/components/communicator/BottomBar";
import ChatArea from "@/components/communicator/ChatArea";
import SideTab from "@/components/communicator/SideTab";
import LeftPanel from "@/components/communicator/LeftPanel";
import RightPanel from "@/components/communicator/RightPanel";
import SettingsModal from "@/components/communicator/SettingsModal";
import MyAgentsModal from "@/components/communicator/MyAgentsModal";
import AgentCityModal from "@/components/communicator/AgentCityModal";
import ContactsModal from "@/components/communicator/ContactsModal";
import BusinessDashboardModal from "@/components/communicator/BusinessDashboardModal";
import { contractorLogout } from "@/services/api";
import HomeRoom from "@/components/communicator/HomeRoom";

type AppScreen = "splash" | "login" | "communicator" | "business";

export default function Home() {
  const { isLoggedIn, isAdmin, login, logout, user } = useAuth();
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [animOn, setAnimOn] = useState(true);
  const [activeMode, setActiveMode] = useState("Общение");
  const [activeRoom, setActiveRoom] = useState("Главная");
  const [topBarH, setTopBarH] = useState(80);
  const [bottomBarH, setBottomBarH] = useState(130);
  const [micActive, setMicActive] = useState(false);

  // Чат — через хук (WebSocket + offline fallback)
  const {
    messages, isTyping, typingName, isConnected,
    sendMessage, attachMedia, room, setRoom, agentInfo,
  } = useChat("general");

  /** Открыть личный чат с агентом */
  const openAgentChat = useCallback((agentId: number) => {
    setRoom(`agent-${agentId}`);
    setAgentsOpen(false);
    setCityOpen(false);
  }, [setRoom]);

  /** Вернуться в общую комнату */
  const backToGeneral = useCallback(() => {
    setRoom("general");
  }, [setRoom]);

  const closeLeft = useCallback(() => setLeftOpen(false), []);
  const closeRight = useCallback(() => setRightOpen(false), []);

  useEffect(() => {
    const read = () => setAnimOn(localStorage.getItem("jinntell_anim_off") !== "1");
    read();
    window.addEventListener("jinntell_anim_change", read);
    return () => window.removeEventListener("jinntell_anim_change", read);
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
      {/* Фоновые частицы */}
      {animOn && <Particles />}

      {/* Верхняя панель */}
      <TopBar
        onHeightChange={setTopBarH}
        agentInfo={agentInfo}
        onBackToGeneral={backToGeneral}
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

      {/* Боковые язычки — всегда видны, сдвигаются с панелью */}
      <SideTab side="left" panelOpen={leftOpen} onClick={() => setLeftOpen(!leftOpen)} />
      <SideTab side="right" panelOpen={rightOpen} onClick={() => setRightOpen(!rightOpen)} />

      {/* Левая панель — Режимы + Комнаты */}
      <LeftPanel
        isOpen={leftOpen}
        onClose={closeLeft}
        activeMode={activeMode}
        activeRoom={activeRoom}
        onModeChange={setActiveMode}
        onRoomChange={setActiveRoom}
      />

      {/* Правая панель — Помощник + Участники */}
      <RightPanel isOpen={rightOpen} onClose={closeRight} />

      {/* Центральная область — Главная (лента) или чат */}
      {!agentInfo && activeMode === "Общение" && activeRoom === "Главная" ? (
        <HomeRoom
          topPad={topBarH}
          bottomPad={bottomBarH}
          assistantName={user?.assistant_name || "Джим"}
          onOpenAssistant={() => setActiveRoom("Чат помощника")}
        />
      ) : (
        <ChatArea
          messages={messages}
          isTyping={isTyping}
          typingName={typingName}
          topPad={topBarH}
          bottomPad={bottomBarH}
          autoSpeak={micActive}
          agentInfo={agentInfo}
        />
      )}

      {/* Нижняя панель — ввод + кнопки */}
      <BottomBar
        onSettingsClick={() => setSettingsOpen(true)}
        onContactsClick={() => setContactsOpen(true)}
        onAgentsClick={() => setAgentsOpen(true)}
        onSendMessage={(text) => { if (activeRoom === "Главная") setActiveRoom("Чат помощника"); sendMessage(text); }}
        onAttachMedia={attachMedia}
        onHeightChange={setBottomBarH}
        onMicStateChange={(active) => setMicActive(active)}
        assistantName={user?.assistant_name || "Джим"}
      />

      {/* Центр Управления */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={() => {
          logout();
          setScreen("login");
        }}
      />

      {/* Мои Джинны */}
      <MyAgentsModal
        isOpen={agentsOpen}
        onClose={() => setAgentsOpen(false)}
        onOpenCity={() => {
          setAgentsOpen(false);
          setCityOpen(true);
        }}
        onStartChat={openAgentChat}
      />

      {/* Город Джиннов */}
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

      {/* Мои контакты */}
      <ContactsModal
        isOpen={contactsOpen}
        onClose={() => setContactsOpen(false)}
      />

      {/* ЛК Бизнеса (настройка привязанных агентов) */}
      <BusinessDashboardModal
        isOpen={businessOpen}
        onClose={() => setBusinessOpen(false)}
      />


    </div>
  );
}
