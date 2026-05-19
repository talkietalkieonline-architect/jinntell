"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  getToken,
  getChatHistory,
  connectChat,
  type MessageOut,
} from "@/services/api";
import type { ChatMessage } from "@/components/communicator/ChatArea";

/* ═══════════════════════════════════════════════
   useChat — реалтайм чат через WebSocket
   с fallback на локальные демо-ответы Мэла
   ═══════════════════════════════════════════════ */

/** Ответы Мэла для offline-режима */
const MEL_REPLIES = [
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

/** Приветствия Мэла для возвращающихся пользователей (не повторяться) */
const RETURNING_GREETINGS = [
  (name: string) => `С возвращением, ${name}! Чем могу помочь сегодня?`,
  (name: string) => `Привет, ${name}! Рад вас снова видеть. Что нового?`,
  (name: string) => `Здравствуйте, ${name}! Я на месте — спрашивайте что угодно.`,
  (name: string) => `${name}, рад вас слышать! Найти агента или просто поговорим?`,
  (name: string) => `О, ${name}! Хорошо, что зашли. Сегодня в Городе Агентов много интересного!`,
];

const NEW_USER_WELCOME = "Добро пожаловать в JinnTell! Я ваш Мэл — ваш личный AI-помощник. Могу рассказать о сервисе, найти нужного агента или просто поболтать. Говорите голосом или пишите — как вам удобно!";

/** Создаём приветствие в зависимости от того, новый ли пользователь */
function buildWelcome(hasHistory: boolean): ChatMessage {
  let text = NEW_USER_WELCOME;

  if (hasHistory) {
    // Возвращающийся пользователь — получаем имя из сессии
    let name = "";
    try {
      const session = JSON.parse(localStorage.getItem("jinntell_session") || "{}");
      name = session.displayName || "";
    } catch { /* ignore */ }
    // Выбираем случайное приветствие, но не то же, что в прошлый раз
    const lastIdx = parseInt(localStorage.getItem("jinntell_greet_idx") || "-1", 10);
    let idx = Math.floor(Math.random() * RETURNING_GREETINGS.length);
    if (idx === lastIdx && RETURNING_GREETINGS.length > 1) {
      idx = (idx + 1) % RETURNING_GREETINGS.length;
    }
    localStorage.setItem("jinntell_greet_idx", String(idx));
    text = RETURNING_GREETINGS[idx](name || "друг");
  }

  return {
    id: "welcome-1",
    sender: "mel",
    name: "Мэл",
    text,
    color: "var(--accent)",
    timestamp: new Date(),
  };
}

/** Конвертация сообщения API → ChatMessage */
function apiMsgToChat(msg: MessageOut): ChatMessage {
  return {
    id: String(msg.id),
    sender: (msg.sender_type === "butler" ? "mel" : msg.sender_type) as "user" | "mel" | "agent",
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildWelcome(false)]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingName, setTypingName] = useState("Мэл");
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

    // Закрываем старый ws
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = connectChat(room, (data) => {
      // Обрабатываем разные типы сообщений
      if (data.type === "message") {
        const chatMsg: ChatMessage = {
          id: String(data.id),
          sender: (data.sender_type === "butler" ? "mel" : data.sender_type) as "user" | "mel" | "agent",
          name: data.sender_name,
          text: data.text,
          color: data.sender_type === "user" ? "" : (data.agent_color || "var(--accent)"),
          timestamp: new Date(data.created_at),
        };
        setMessages((prev) => [...prev, chatMsg]);
        setIsTyping(false);
      } else if (data.type === "typing") {
        setTypingName(data.sender_name || "Мэл");
        setIsTyping(true);
      } else if (data.type === "typing_stop") {
        setIsTyping(false);
      } else if (data.type === "user_joined" && data.agent_info) {
        // Комната агента — получаем инфо
        const info = data.agent_info as AgentRoomInfo;
        setAgentInfo(info);
        // Приветствие агента — если есть greeting и нет истории
        if (info.greeting) {
          setMessages((prev) => {
            // Не добавляем если уже есть сообщения (история загрузилась)
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
  }, [room]);

  useEffect(() => { connectWSRef.current = connectWS; }, [connectWS]);

  // Загрузить историю из API
  const loadHistory = useCallback(async () => {
    const isAgentRoom = room.startsWith("agent-");
    try {
      const history = await getChatHistory(room);
      const chatMessages = history.map(apiMsgToChat);
      if (isAgentRoom) {
        // Для комнаты агента: нет welcome Мэла, показываем только историю
        setMessages(chatMessages);
      } else {
        const welcome = buildWelcome(history.length > 0);
        setMessages(history.length > 0 ? [welcome, ...chatMessages] : [welcome]);
      }
    } catch {
      if (isAgentRoom) {
        setMessages([]);
      }
      // API недоступен — оставляем welcome message
    }
  }, [room]);

  // Инициализация при смене комнаты
  useEffect(() => {
    // Сбрасываем agentInfo при смене комнаты
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

  // === Offline: ответ Мэла ===
  const offlineMelReply = useCallback(() => {
    setIsTyping(true);
    const delay = 800 + Math.random() * 1500;
    setTimeout(() => {
      const reply = MEL_REPLIES[Math.floor(Math.random() * MEL_REPLIES.length)];
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: String(msgCounter.current++),
          sender: "mel" as const,
          name: "Мэл",
          text: reply,
          color: "var(--accent)",
          timestamp: new Date(),
        },
      ]);
    }, delay);
  }, []);

  // Offline: ответ агента (когда сервер недоступен)
  const offlineAgentReply = useCallback(() => {
    const info = agentInfo;
    if (!info) { offlineMelReply(); return; }
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
  }, [agentInfo, offlineMelReply]);

  // Отправить сообщение
  const sendMessage = useCallback(
    (text: string) => {
      // Локальное сообщение пользователя (показываем сразу)
      const userMsg: ChatMessage = {
        id: String(msgCounter.current++),
        sender: "user",
        name: "",
        text,
        color: "",
        timestamp: new Date(),
      };

      if (isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
        // Онлайн — отправляем через WebSocket
        // Не добавляем локально — придёт broadcast от сервера
        wsRef.current.send(JSON.stringify({ text }));
      } else {
        // Offline — локально
        setMessages((prev) => [...prev, userMsg]);
        // Если в комнате агента — ответ агента, иначе Мэл
        if (room.startsWith("agent-")) {
          offlineAgentReply();
        } else {
          offlineMelReply();
        }
      }
    },
    [isConnected, offlineMelReply, offlineAgentReply, room]
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
          offlineMelReply();
        }
      }
      // TODO: загрузка файла на сервер через API
    },
    [isConnected, offlineMelReply, offlineAgentReply, room]
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
