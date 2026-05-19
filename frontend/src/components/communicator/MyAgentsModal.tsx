"use client";
import { useState, useEffect, useCallback } from "react";
import { getMyAgents, type AgentFullOut } from "@/services/api";

interface Agent {
  id: string;
  name: string;
  profession: string;
  brand: string;
  color: string;
  group: string;
}

const DEMO_AGENTS: Agent[] = [
  { id: "d1", name: "Тим", profession: "Консультант", brand: "Adidas", color: "#4CAF50", group: "Консультанты" },
  { id: "d2", name: "Алиса", profession: "Продавец", brand: "Zara", color: "#E91E63", group: "Консультанты" },
  { id: "d3", name: "Макс", profession: "Юрист ПДД", brand: "JinnTell", color: "#FF9800", group: "Другие" },
  { id: "d4", name: "Психолог", profession: "Психолог", brand: "JinnTell", color: "#9C27B0", group: "Рекомендованные" },
  { id: "d5", name: "Новости", profession: "Информатор", brand: "JinnTell", color: "#2196F3", group: "Рекомендованные" },
  { id: "d6", name: "Лена", profession: "Стилист", brand: "H&M", color: "#F44336", group: "Популярные" },
];

const GROUPS = ["Личные", "Консультанты", "Рекомендованные", "Популярные", "Другие"];

export default function MyAgentsModal({
  isOpen,
  onClose,
  onOpenCity,
  onStartChat,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenCity: () => void;
  onStartChat?: (agentId: number) => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [personalAgents, setPersonalAgents] = useState<AgentFullOut[]>([]);

  /** Загрузка личных агентов (привязанных к пользователю) */
  const loadPersonal = useCallback(async () => {
    try {
      const agents = await getMyAgents();
      // Личные — тип citizen, привязанные к пользователю
      setPersonalAgents(agents.filter((a) => a.agent_type === "citizen"));
    } catch {
      // offline
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadPersonal();
  }, [isOpen, loadPersonal]);

  if (!isOpen) return null;

  const menu = selectedAgent
    ? DEMO_AGENTS.find((a) => a.id === selectedAgent)
    : null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl p-6"
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          backdropFilter: "blur(30px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Мои агенты
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>

        {/* Меню агента */}
        {menu ? (
          <div>
            <button
              onClick={() => setSelectedAgent(null)}
              className="text-sm mb-4"
              style={{ color: "var(--accent)" }}
            >
              ‹ Назад
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: `${menu.color}22`, border: `1.5px solid ${menu.color}55`, color: menu.color }}
              >
                {menu.name[0]}
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{menu.name}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{menu.profession} • {menu.brand}</div>
              </div>
            </div>
            {["Начать чат", "Смотреть презентацию", "Оценить агента", "Пожаловаться", "Убрать из Моих агентов"].map((action) => (
              <button
                key={action}
                className="w-full text-left px-4 py-3 rounded-xl text-sm mb-1 transition-all"
                style={{ color: action === "Убрать из Моих агентов" ? "var(--danger)" : action === "Начать чат" ? "var(--accent)" : "var(--text-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => {
                  if (action === "Начать чат" && menu) {
                    const numId = parseInt(menu.id, 10);
                    if (!isNaN(numId)) onStartChat?.(numId);
                  }
                  setSelectedAgent(null);
                  onClose();
                }}
              >
                {action}
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Группы агентов */}
            {GROUPS.map((group) => {
              const agents = DEMO_AGENTS.filter((a) => a.group === group);

              {/* === Личные агенты (API + подписка) === */}
              if (group === "Личные") {
                return (
                  <div key={group} className="mb-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--text-muted)" }}>
                      {group}
                    </p>
                    {personalAgents.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {personalAgents.map((agent) => (
                          <div
                            key={agent.id}
                            className="flex flex-col items-center cursor-pointer transition-all hover:scale-105"
                            onClick={() => setSelectedAgent(String(agent.id))}
                            style={{ width: "60px" }}
                          >
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold mb-1"
                              style={{ background: `${agent.color}22`, border: `1.5px solid ${agent.color}44`, color: agent.color }}
                            >
                              {agent.name[0]}
                            </div>
                            <span className="text-[10px] text-center leading-tight" style={{ color: "var(--text-secondary)" }}>
                              {agent.name}
                            </span>
                            <span className="text-[9px]" style={{ color: "var(--accent)" }}>
                              Личный
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                        <p className="text-[12px] mb-1" style={{ color: "var(--text-secondary)" }}>
                          Создайте своего AI-агента
                        </p>
                        <p className="text-[11px] leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>
                          Личный агент с вашим характером, голосом и внешностью — доступно по подписке.
                        </p>
                        <button className="px-4 py-2 rounded-xl text-[12px] font-medium transition-all hover:scale-[1.02]"
                          style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                          Подписаться
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              if (agents.length === 0) return null;
              return (
                <div key={group} className="mb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--text-muted)" }}>
                    {group}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex flex-col items-center cursor-pointer transition-all hover:scale-105"
                        onClick={() => setSelectedAgent(agent.id)}
                        style={{ width: "60px" }}
                      >
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold mb-1"
                          style={{ background: `${agent.color}22`, border: `1.5px solid ${agent.color}44`, color: agent.color }}
                        >
                          {agent.name[0]}
                        </div>
                        <span className="text-[10px] text-center leading-tight" style={{ color: "var(--text-secondary)" }}>
                          {agent.name}
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                          {agent.brand}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Кнопка Город Агентов */}
            <button
              onClick={() => { onClose(); onOpenCity(); }}
              className="w-full py-3 rounded-xl text-sm font-semibold mt-2 transition-all hover:scale-[1.02]"
              style={{ background: "var(--accent)", color: "var(--bg-deep)" }}
            >
              Город Агентов
            </button>
          </>
        )}
      </div>
    </div>
  );
}
