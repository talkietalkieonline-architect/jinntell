"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  getToken,
  getChatHistory,
  connectChat,
  type MessageOut,
} from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type { ChatMessage } from "@/components/communicator/ChatArea";

/* ═══════════════════════════════════════════════
   useChat — реалтайм чат через WebSocket
   с fallback на локальные демо-ответы Помощника
   ═══════════════════════════════════════════════ */

const DEFAULT_ASSISTANT_NAME = "Джим";

/** Ответы помощника для offline-режима */
const ASSISTANT_REPLIES = [
  "Отличный вопрос! Давайте разберёмся вместе.",
  "Я всегда рад помочь. Что именно вас интересует?",
  "Хороший выбор! Могу подсказать ещё несколько вариантов.",
  "Записал. Напомню когда потребуется!",
  "Сейчас посмотрю в Городе Агентов, есть ли подходящий специалист.",
  "Между прочим, сегодня в Эфире много интересного — обратите внимание на бегущую строку.",
  "Я рядом, если что — обращайтесь в любой момент.",
  "Могу найти агента-консультанта по этой теме. Хотите?",
  "Это интересно! Расскажите подробнее.",
  "Принято! Работаю над этим.",
];

/** Приветствия помощника для возвращающихся пользователей */
const RETURNING_GREETINGS = [
  (name: string, aName: string) => `С возвращением, ${name}! ${aName} на связи. Чем могу помочь сегодня?`,
  (name: string, aName: string) => `Привет, ${name}! Это ${aName}, рад вас снова видеть. Что нового?`,
  (name: string, aName: string) => `Здравствуйте, ${name}! ${aName} на месте — спрашивайте что угодно.`,
  (name: string, aName: string) => `${name}, ${aName} рад вас слышать! Найти агента или просто поговорим?`,
  (name: string, aName: string) => `О, ${name}! ${aName} здесь. Сегодня в Городе Агентов много интересного!`,
];

function getNewUserWelcome(assistantName: string): string {
  return `Добро пожаловать в JinnTell! Я ${assistantName} — ваш личный AI-помощник. Могу рассказать о сервисе, найти нужного агента или просто поболтать. Говорите голосом или пишите — как вам удобно!`;
}

/** Создаём приветствие в зависимости от того, новый ли пользователь */
function buildWelcome(hasHistory: boolean, assistantName: string = DEFAULT_ASSISTANT_NAME): ChatMessage {
  let text = getNewUserWelcome(assistantName);

  if (hasHistory) {
    let name = "";
    try {
      const session = JSON.parse(localStorage.getItem("jinntell_session") || "{}");
      name = session.displayName || "";
    } catch { /* ignore */ }
    const lastIdx = parseInt(localStorage.getItem("jinntell_greet_idx") || "-1", 10);
    let idx = Math.floor(Math.random() * RETURNING_GREETINGS.length);
    if (idx === lastIdx && RETURNING_GREETINGS.length > 1) {
      idx = (idx + 1) % RETURNING_GREETINGS.length;
    }
    localStorage.setItem("jinntell_greet_idx", String(idx));
    text = RETURNING_GREETINGS[idx](name || "друг", assistantName);
  }

  return {
    id: "welcome-1",
    sender: "assistant",
    name: assistantName,
    text,
    color: "var(--accent)",
    timestamp: new Date(),
  };
}

/** Конвертация сообщения API → ChatMessage */
function apiMsgToChat(msg: MessageOut): ChatMessage {
  // Поддержка legacy sender_type: "butler", "mel" → "assistant"
  const senderType = (msg.sender_type === "butler" || msg.sender_type === "mel") ? "assistant" : msg.sender_type;
  return {
    id: String(msg.id),
    sender: senderType as "user" | "assistant" | "agent",
    name: msg.sender_name,
    text: msg.text,
    color: msg.sender_type === "user" ? "" : "var(--accent)",
    timestamp: new Date(msg.created_at),
  };
}

/** Информация об агенте в комнате agent-{id} */
export interface AgentRoomInfo {
  id: number;
  name: string;
  profession: string;
  brand: string;
  color: string;
  greeting?: string;
}

interface UseChatResult {
  messages: ChatMessage[];
  isTyping: boolean;
  typingName: string;
  isConnected: boolean;
  sendMessage: (text: string) => void;
  attachMedia: (file: File) => void;
  room: string;
  setRoom: (room: string) => void;
  agentInfo: AgentRoomInfo | null;
}

export function useChat(initialRoom: string = "general"): UseChatResult {
  const { user } = useAuth();
  const assistantName = user?.assistant_name || DEFAULT_ASSISTANT_NAME;

  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildWelcome(false, assistantName)]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingName, setTypingName] = useState(assistantName);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState(initialRoom);
  const [agentInfo, setAgentInfo] = useState<AgentRoomInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const msgCounter = useRef(100);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const connectWSRef = useRef<(() => void) | undefined>(undefined);

  // Подключаемся к WebSocket при монтировании
  const connectWS = useCallback(() => {
    const token = getToken();
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = connectChat(room, (data) => {
      if (data.type === "message") {
        // Поддержка legacy sender_type
        const senderType = (data.sender_type === "butler" || data.sender_type === "mel") ? "assistant" : data.sender_type;
        const chatMsg: ChatMessage = {
          id: String(data.id),
          sender: senderType as "user" | "assistant" | "agent",
          name: data.sender_name,
          text: data.text,
          color: data.sender_type === "user" ? "" : (data.agent_color || "var(--accent)"),
          timestamp: new Date(data.created_at),
        };
        setMessages((prev) => [...prev, chatMsg]);
        setIsTyping(false);
      } else if (data.type === "typing") {
        setTypingName(data.sender_name || assistantName);
        setIsTyping(true);
      } else if (data.type === "typing_stop") {
        setIsTyping(false);
      } else if (data.type === "user_joined" && data.agent_info) {
        const info = data.agent_info as AgentRoomInfo;
        setAgentInfo(info);
        if (info.greeting) {
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            return [{
              id: "agent-greeting",
              sender: "agent" as const,
              name: info.name,
              text: info.greeting!,
              color: info.color || "var(--accent)",
              timestamp: new Date(),
            }];
          });
        }
      }
    });

    if (!ws) return;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("[ws] Подключён к комнате:", room);
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("[ws] Отключён");
      reconnectTimer.current = setTimeout(() => {
        connectWSRef.current?.();
      }, 3000);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    wsRef.current = ws;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, assistantName]);

  useEffect(() => { connectWSRef.current = connectWS; }, [connectWS]);

  // Загрузить историю из API
  const loadHistory = useCallback(async () => {
    const isAgentRoom = room.startsWith("agent-");
    try {
      const history = await getChatHistory(room);
      const chatMessages = history.map(apiMsgToChat);
      if (isAgentRoom) {
        setMessages(chatMessages);
      } else {
        const welcome = buildWelcome(history.length > 0, assistantName);
        setMessages(history.length > 0 ? [welcome, ...chatMessages] : [welcome]);
      }
    } catch {
      if (isAgentRoom) {
        setMessages([]);
      }
    }
  }, [room, assistantName]);

  // Инициализация при смене комнаты
  useEffect(() => {
    if (!room.startsWith("agent-")) {
      setAgentInfo(null);
    }
    setIsTyping(false);
    loadHistory();
    connectWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [room, loadHistory, connectWS]);

  // === Offline: ответ помощника ===
  const offlineAssistantReply = useCallback(() => {
    setIsTyping(true);
    const delay = 800 + Math.random() * 1500;
    setTimeout(() => {
      const reply = ASSISTANT_REPLIES[Math.floor(Math.random() * ASSISTANT_REPLIES.length)];
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: String(msgCounter.current++),
          sender: "assistant" as const,
          name: assistantName,
          text: reply,
          color: "var(--accent)",
          timestamp: new Date(),
        },
      ]);
    }, delay);
  }, [assistantName]);

  // Offline: ответ агента
  const offlineAgentReply = useCallback(() => {
    const info = agentInfo;
    if (!info) { offlineAssistantReply(); return; }
    setIsTyping(true);
    setTypingName(info.name);
    const delay = 800 + Math.random() * 1500;
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: String(msgCounter.current++),
          sender: "agent" as const,
          name: info.name,
          text: `Я ${info.name}, ${info.profession.toLowerCase()}. Сейчас я в офлайн-режиме, но скоро подключусь к AI и смогу помочь!`,
          color: info.color || "var(--accent)",
          timestamp: new Date(),
        },
      ]);
    }, delay);
  }, [agentInfo, offlineAssistantReply]);

  // Отправить сообщение
  const sendMessage = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id: String(msgCounter.current++),
        sender: "user",
        name: "",
        text,
        color: "",
        timestamp: new Date(),
      };

      if (isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ text }));
      } else {
        setMessages((prev) => [...prev, userMsg]);
        if (room.startsWith("agent-")) {
          offlineAgentReply();
        } else {
          offlineAssistantReply();
        }
      }
    },
    [isConnected, offlineAssistantReply, offlineAgentReply, room]
  );

  // Прикрепить медиа
  const attachMedia = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      const mediaMsg: ChatMessage = {
        id: String(msgCounter.current++),
        sender: "user",
        name: "",
        text: "",
        color: "",
        timestamp: new Date(),
        mediaUrl: url,
        mediaType: isVideo ? "video" : "image",
      };
      setMessages((prev) => [...prev, mediaMsg]);

      if (!isConnected) {
        if (room.startsWith("agent-")) {
          offlineAgentReply();
        } else {
          offlineAssistantReply();
        }
      }
    },
    [isConnected, offlineAssistantReply, offlineAgentReply, room]
  );

  return {
    messages,
    isTyping,
    typingName,
    isConnected,
    sendMessage,
    attachMedia,
    room,
    setRoom,
    agentInfo,
  };
}
