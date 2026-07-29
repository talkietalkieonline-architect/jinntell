"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  getToken,
  getChatHistory,
  uploadChatMedia,
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
  "Могу найти джинна-консультанта по этой теме. Хотите?",
  "Это интересно! Расскажите подробнее.",
  "Принято! Работаю над этим.",
];

/** Приветствия помощника для возвращающихся пользователей */
const RETURNING_GREETINGS = [
  (name: string, aName: string) => `С возвращением, ${name}! ${aName} на связи. Чем могу помочь сегодня?`,
  (name: string, aName: string) => `Привет, ${name}! Это ${aName}, рад вас снова видеть. Что нового?`,
  (name: string, aName: string) => `Здравствуйте, ${name}! ${aName} на месте — спрашивайте что угодно.`,
  (name: string, aName: string) => `${name}, ${aName} рад вас слышать! Найти джинна или просто поговорим?`,
  (name: string, aName: string) => `О, ${name}! ${aName} здесь. Сегодня в Городе Агентов много интересного!`,
];

function getNewUserWelcome(assistantName: string): string {
  return `Добро пожаловать в JinnTell! Я ${assistantName} — ваш личный AI-помощник. Могу рассказать о сервисе, найти нужного джинна или просто поболтать. Говорите голосом или пишите — как вам удобно!`;
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
function apiMsgToChat(msg: MessageOut, myId?: number | null): ChatMessage {
  // Поддержка legacy sender_type: "butler", "mel" → "assistant"
  let senderType: string = (msg.sender_type === "butler" || msg.sender_type === "mel") ? "assistant" : msg.sender_type;
  const otherUser = senderType === "user" && msg.sender_user_id != null && myId != null && msg.sender_user_id !== myId;
  if (otherUser) senderType = "agent"; // чужой человек в личном диалоге — слева
  return {
    id: String(msg.id),
    sender: senderType as "user" | "assistant" | "agent",
    name: msg.sender_name,
    text: msg.text,
    color: msg.sender_type === "user" ? (otherUser ? "var(--accent)" : "") : "var(--accent)",
    timestamp: new Date(msg.created_at),
    context: msg.context,
    mediaUrl: msg.media_url || undefined,
    mediaType: (msg.media_type as ChatMessage["mediaType"]) || undefined,
  };
}

/** Информация об агенте в комнате agent-{id} */
export interface AgentRoomInfo {
  id: number;
  name: string;
  profession: string;
  brand: string;
  color: string;
  photo_url?: string;
  greeting?: string;
  tts_voice_id?: string;
  tts_emotion?: string;
}

interface UseChatResult {
  messages: ChatMessage[];
  isTyping: boolean;
  typingName: string;
  isConnected: boolean;
  sendMessage: (text: string) => void;
  attachMedia: (file: File, asNote?: boolean) => void;
  pushAssistant: (text: string) => void;
  pushUser: (text: string) => void;
  room: string;
  setRoom: (room: string) => void;
  agentInfo: AgentRoomInfo | null;
  roomMembers: AgentRoomInfo[];
}

export function useChat(initialRoom: string = "general"): UseChatResult {
  const { user } = useAuth();
  const assistantName = user?.assistant_name || DEFAULT_ASSISTANT_NAME;
  const myId = user?.id ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>(() => [buildWelcome(false, assistantName)]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingName, setTypingName] = useState(assistantName);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState(initialRoom);
  const [agentInfo, setAgentInfo] = useState<AgentRoomInfo | null>(null);
  const [roomMembers, setRoomMembers] = useState<AgentRoomInfo[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const msgCounter = useRef(100);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const connectWSRef = useRef<(() => void) | undefined>(undefined);
  const assistantNameRef = useRef(assistantName);
  useEffect(() => { assistantNameRef.current = assistantName; }, [assistantName]);
  const myIdRef = useRef<number | null>(myId);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  const loadHistoryRef = useRef<() => void>(() => {});

  // Подключаемся к WebSocket при монтировании
  const connectWS = useCallback(() => {
    const token = getToken();
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = connectChat(room, (data) => {
      if (data.type === "message") {
        // Поддержка legacy sender_type
        let _st: string = (data.sender_type === "butler" || data.sender_type === "mel") ? "assistant" : data.sender_type;
        const _other = _st === "user" && data.sender_user_id != null && myIdRef.current != null && data.sender_user_id !== myIdRef.current;
        if (_other) _st = "agent"; // чужой человек в личном диалоге — рисуем слева
        const chatMsg: ChatMessage = {
          id: String(data.id),
          sender: _st as "user" | "assistant" | "agent",
          name: data.sender_name,
          text: data.text,
          color: data.sender_type === "user" ? (_other ? "var(--accent)" : "") : (data.agent_color || "var(--accent)"),
          timestamp: new Date(data.created_at),
          mediaUrl: data.media_url || undefined,
          mediaType: data.media_type || undefined,
        };
        setMessages((prev) => [...prev, chatMsg]);
        setIsTyping(false);
      } else if (data.type === "typing") {
        setTypingName(data.sender_name || assistantNameRef.current);
        setIsTyping(true);
      } else if (data.type === "typing_stop") {
        setIsTyping(false);
      } else if (data.type === "delete") {
        setMessages((prev) => prev.filter((m) => m.id !== String(data.id)));
      } else if (data.type === "clear") {
        setMessages([]);
        setTimeout(() => loadHistoryRef.current?.(), 150);
      } else if (data.type === "user_joined") {
        if (data.room_members) setRoomMembers(data.room_members as AgentRoomInfo[]);
        if (data.agent_info) {
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
      const chatMessages = history.map((mm) => apiMsgToChat(mm, myIdRef.current));
      if (isAgentRoom) {
        setMessages(chatMessages);
      } else {
        const welcome = buildWelcome(history.length > 0, assistantNameRef.current);
        setMessages(history.length > 0 ? [welcome, ...chatMessages] : [welcome]);
      }
    } catch {
      if (isAgentRoom) {
        setMessages([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  useEffect(() => { loadHistoryRef.current = loadHistory; }, [loadHistory]);

  const pushAssistant = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, sender: "assistant", name: assistantNameRef.current || "Джим", text, color: "var(--accent)", timestamp: new Date() }]);
  }, []);
  const pushUser = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, sender: "user", name: "", text, color: "var(--accent)", timestamp: new Date() }]);
  }, []);

  // Инициализация при смене комнаты
  useEffect(() => {
    if (!room.startsWith("agent-")) {
      setAgentInfo(null);
    }
    if (!room.startsWith("room-")) {
      setRoomMembers([]);
    }
    setIsTyping(false);
    loadHistory();
    connectWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

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
    (file: File, asNote = false) => {
      uploadChatMedia(file)
        .then(({ url, type }) => {
          const mt = asNote ? "note" : type;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ text: "", media_url: url, media_type: mt }));
          }
        })
        .catch(() => {});
    },
    []
  );

  return {
    messages,
    isTyping,
    typingName,
    isConnected,
    sendMessage,
    attachMedia,
    pushAssistant,
    pushUser,
    room,
    setRoom,
    agentInfo,
    roomMembers,
  };
}
