"use client";
import { useState, useMemo } from "react";
import { useAgents } from "@/hooks/useAgents";

/* ══════════════════════════════════════════════════════════════
   Город Агентов — каталог из API с fallback на хардкод
   ══════════════════════════════════════════════════════════════ */

const PROFESSIONS = [
  "Все",
  "Консультант",
  "Продавец",
  "Психолог",
  "Тренер",
  "Аналитик",
  "Ассистент",
  "Собеседник",
  "Информатор",
  "Юрист",
  "Стилист",
  "Лектор",
];

const TYPES = [
  { id: "all", label: "Все" },
  { id: "citizen", label: "Жители" },
  { id: "business", label: "Бизнес" },
  { id: "system", label: "Системные" },
];



export default function AgentCityModal({
  isOpen,
  onClose,
  onOpenBusiness,
  onStartChat,
  isAdmin,
  onOpenAdmin,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenBusiness?: () => void;
  onStartChat?: (agentId: number) => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProfession, setSelectedProfession] = useState("Все");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set([1, 2, 6, 7]));

  // Данные из API (useAgents хук с fallback на хардкод)
  const { agents, total, businessCount, citizenCount } = useAgents();

  // Локальная фильтрация (поиск + профессия + тип)
  const filtered = useMemo(() => {
    return agents.filter((a) => {
      const matchSearch =
        !searchQuery ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.profession.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.brand.toLowerCase().includes(searchQuery.toLowerCase());
      const matchProfession =
        selectedProfession === "Все" || a.profession === selectedProfession;
      const matchType =
        selectedType === "all" || a.agent_type === selectedType;
      return matchSearch && matchProfession && matchType;
    });
  }, [agents, searchQuery, selectedProfession, selectedType]);

  const counts = { total, business: businessCount, citizen: citizenCount, system: total - businessCount - citizenCount };

  if (!isOpen) return null;

  const agentDetails = selectedAgent
    ? agents.find((a) => a.id === selectedAgent)
    : null;

  const isFav = (id: number) => favorites.has(id);

  const toggleAdd = (id: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          backdropFilter: "blur(30px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Город Агентов
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Всего {counts.total} &bull; Бизнес {counts.business} &bull; Жители {counts.citizen}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && onOpenAdmin && (
                <button
                  onClick={() => { onClose(); onOpenAdmin(); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-105"
                  style={{
                    background: "rgba(245,158,11,0.15)",
                    color: "#F59E0B",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}
                >
                  Админ
                </button>
              )}
              {onOpenBusiness && (
                <button
                  onClick={() => { onClose(); onOpenBusiness(); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-105"
                  style={{
                    background: "var(--accent)",
                    color: "var(--bg-deep)",
                  }}
                >
                  Для бизнеса
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--bg-glass-border)",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Поиск */}
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--bg-glass-border)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени, профессии, бренду..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--text-primary)", caretColor: "var(--accent)" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Фильтры по типу */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: selectedType === t.id ? "var(--accent)" : "var(--bg-glass)",
                  color: selectedType === t.id ? "var(--bg-deep)" : "var(--text-secondary)",
                  border:
                    selectedType === t.id
                      ? "1px solid var(--accent)"
                      : "1px solid var(--bg-glass-border)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Фильтры по профессии — горизонтальный скролл */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
            {PROFESSIONS.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedProfession(p)}
                className="px-2.5 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all shrink-0"
                style={{
                  background: selectedProfession === p ? "var(--bg-glass-hover)" : "transparent",
                  color: selectedProfession === p ? "var(--accent)" : "var(--text-muted)",
                  border:
                    selectedProfession === p
                      ? "1px solid var(--accent)"
                      : "1px solid transparent",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Контент — скроллируемый */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Экран деталей агента */}
          {agentDetails ? (
            <div className="animate-fade-in">
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-sm mb-4 flex items-center gap-1"
                style={{ color: "var(--accent)" }}
              >
                ‹ Назад к списку
              </button>

              {/* Карточка агента */}
              <div className="flex items-start gap-4 mb-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                  style={{
                    background: `${agentDetails.color}22`,
                    border: `2px solid ${agentDetails.color}55`,
                    color: agentDetails.color,
                  }}
                >
                  {agentDetails.name[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      {agentDetails.name}
                    </h3>
                    {isFav(agentDetails.id) && (
                      <span
                        className="text-[9px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "var(--success)",
                          color: "#fff",
                        }}
                      >
                        у тебя
                      </span>
                    )}
                  </div>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {agentDetails.profession} &bull; {agentDetails.brand}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span style={{ color: "#FFD700", fontSize: "12px" }}>★</span>
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      {agentDetails.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Описание */}
              <p
                className="text-sm leading-relaxed mb-5 px-1"
                style={{ color: "var(--text-secondary)" }}
              >
                {agentDetails.description}
              </p>

              {/* Действия */}
              <div className="flex flex-col gap-1">
                {[
                  "Смотреть презентацию",
                  isFav(agentDetails.id) ? "Уже у тебя в избранном" : "Добавить в Мои агенты",
                  "Начать чат",
                  "Оценить агента",
                  "Пожаловаться",
                ].map((action) => {
                  const isDisabled = action === "Уже у тебя в избранном";
                  const isDanger = action === "Пожаловаться";
                  const isAdd = action === "Добавить в Мои агенты";

                  return (
                    <button
                      key={action}
                      disabled={isDisabled}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                      style={{
                        color: isDanger
                          ? "var(--danger)"
                          : isDisabled
                            ? "var(--text-muted)"
                            : isAdd
                              ? "var(--accent)"
                              : "var(--text-primary)",
                        cursor: isDisabled ? "default" : "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!isDisabled) e.currentTarget.style.background = "var(--bg-glass-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      onClick={() => {
                        if (isAdd) {
                          toggleAdd(agentDetails.id);
                        }
                        if (action === "Начать чат") {
                          setSelectedAgent(null);
                          onStartChat?.(agentDetails.id);
                        }
                      }}
                    >
                      {action}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Список агентов */}
              {filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Агенты не найдены
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedProfession("Все");
                      setSelectedType("all");
                    }}
                    className="text-sm mt-2"
                    style={{ color: "var(--accent)" }}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filtered.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent.id)}

                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                      style={{ background: "transparent" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-glass-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {/* Аватар */}
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: `${agent.color}22`,
                          border: `1.5px solid ${agent.color}44`,
                          color: agent.color,
                        }}
                      >
                        {agent.name[0]}
                      </div>

                      {/* Инфо */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {agent.name}
                          </span>
                          {isFav(agent.id) && (
                            <span
                              className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0"
                              style={{
                                background: "var(--success)",
                                color: "#fff",
                              }}
                            >
                              у тебя
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {agent.profession} &bull; {agent.brand}
                        </p>
                      </div>

                      {/* Рейтинг */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span style={{ color: "#FFD700", fontSize: "11px" }}>★</span>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                          {agent.rating.toFixed(1)}
                        </span>
                      </div>

                      {/* Стрелка */}
                      <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
