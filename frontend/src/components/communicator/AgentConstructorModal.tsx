"use client";
import { useState } from "react";
import { adminCreateAgent, type AgentCreate } from "@/services/api";

/* ══════════════════════════════════════════════════════════════
   Конструктор Агента — создание нового AI-агента
   MVP: имя, профессия, описание, цвет, промпт, приветствие
   ══════════════════════════════════════════════════════════════ */

const PRESET_COLORS = [
  "#FFD700", "#4CAF50", "#E91E63", "#2196F3", "#FF9800",
  "#9C27B0", "#00BCD4", "#FF5722", "#607D8B", "#8BC34A",
  "#3F51B5", "#F44336", "#795548", "#CDDC39",
];

const LLM_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini (быстрый)" },
  { id: "gpt-4o", label: "GPT-4o (умный)" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function AgentConstructorModal({ isOpen, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Данные агента
  const [name, setName] = useState("");
  const [profession, setProfession] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#FFD700");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [greeting, setGreeting] = useState("");

  if (!isOpen) return null;

  const totalSteps = 3;

  const canNext = () => {
    if (step === 1) return name.trim().length > 0 && profession.trim().length > 0;
    if (step === 2) return true; // описание необязательно
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const data: AgentCreate = {
      name: name.trim(),
      profession: profession.trim(),
      brand: brand.trim() || undefined,
      description: description.trim() || undefined,
      color,
      agent_type: "business",
      system_prompt: systemPrompt.trim() || undefined,
      llm_model: llmModel,
      greeting: greeting.trim() || undefined,
    };

    try {
      await adminCreateAgent(data);
      // Успех — сброс формы
      setStep(1);
      setName("");
      setProfession("");
      setBrand("");
      setDescription("");
      setColor("#FFD700");
      setSystemPrompt("");
      setLlmModel("gpt-4o-mini");
      setGreeting("");
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка создания агента");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep(1);
    setError("");
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 110 }}
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
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Конструктор Агента
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Шаг {step} из {totalSteps}
            </p>
          </div>
          <button
            onClick={() => { reset(); onClose(); }}
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

        {/* Прогресс */}
        <div className="px-6 pb-3">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className="h-1 rounded-full flex-1 transition-all"
                style={{
                  background: i < step ? "var(--accent)" : "var(--bg-glass-border)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {error && (
            <div
              className="rounded-xl px-4 py-2.5 mb-4 text-sm"
              style={{ background: "rgba(231,76,60,0.1)", color: "var(--danger)", border: "1px solid rgba(231,76,60,0.2)" }}
            >
              {error}
            </div>
          )}

          {/* Шаг 1: Основное */}
          {step === 1 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Кто ваш агент?
              </p>

              {/* Превью аватара */}
              <div className="flex justify-center">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold transition-all"
                  style={{
                    background: `${color}22`,
                    border: `2.5px solid ${color}55`,
                    color,
                  }}
                >
                  {name ? name[0].toUpperCase() : "?"}
                </div>
              </div>

              {/* Имя */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Имя агента *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Алёна"
                  maxLength={100}
                  className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                    color: "var(--text-primary)",
                    caretColor: "var(--accent)",
                  }}
                />
              </div>

              {/* Профессия */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Профессия / Роль *
                </label>
                <input
                  type="text"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="Например: Консультант, Стилист, Менеджер..."
                  maxLength={100}
                  className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                    color: "var(--text-primary)",
                    caretColor: "var(--accent)",
                  }}
                />
              </div>

              {/* Бренд */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Компания / Бренд
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Например: Adidas, Zara..."
                  maxLength={100}
                  className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                    color: "var(--text-primary)",
                    caretColor: "var(--accent)",
                  }}
                />
              </div>

              {/* Цвет */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Цвет аватара
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="w-8 h-8 rounded-full transition-all hover:scale-110"
                      style={{
                        background: c,
                        border: color === c ? "3px solid var(--text-primary)" : "2px solid transparent",
                        boxShadow: color === c ? `0 0 12px ${c}66` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Шаг 2: Описание + Приветствие */}
          {step === 2 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Расскажите об агенте
              </p>

              {/* Описание */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Описание (видно пользователям)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Чем этот агент может помочь пользователю?"
                  maxLength={2000}
                  rows={3}
                  className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                    color: "var(--text-primary)",
                    caretColor: "var(--accent)",
                  }}
                />
                <span className="text-[10px] mt-0.5 block text-right" style={{ color: "var(--text-muted)" }}>
                  {description.length}/2000
                </span>
              </div>

              {/* Приветственное сообщение */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Приветствие (первое сообщение от агента)
                </label>
                <textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  placeholder="Привет! Я Алёна, ваш персональный консультант. Чем могу помочь?"
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                    color: "var(--text-primary)",
                    caretColor: "var(--accent)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Шаг 3: AI — промпт + модель */}
          {step === 3 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Настройка AI
              </p>

              {/* Модель */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  AI Модель
                </label>
                <div className="flex gap-2">
                  {LLM_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setLlmModel(m.id)}
                      className="flex-1 px-3 py-2.5 rounded-xl text-[12px] transition-all text-center"
                      style={{
                        background: llmModel === m.id ? "var(--accent)" : "var(--bg-glass)",
                        color: llmModel === m.id ? "var(--bg-deep)" : "var(--text-secondary)",
                        border: llmModel === m.id ? "1px solid var(--accent)" : "1px solid var(--bg-glass-border)",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Системный промпт */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Системный промпт (инструкция для AI)
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={`Ты — ${name || "агент"}, ${profession || "консультант"}.\nТвоя задача — помогать клиентам с...\nОтвечай кратко и по делу.`}
                  maxLength={5000}
                  rows={5}
                  className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none font-mono"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                    color: "var(--text-primary)",
                    caretColor: "var(--accent)",
                  }}
                />
                <span className="text-[10px] mt-0.5 block text-right" style={{ color: "var(--text-muted)" }}>
                  {systemPrompt.length}/5000 &bull; Если пусто — AI сгенерирует промпт из описания
                </span>
              </div>

              {/* Превью карточки */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Превью
                </label>
                <div
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--bg-glass-border)",
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: `${color}22`,
                      border: `1.5px solid ${color}44`,
                      color,
                    }}
                  >
                    {name ? name[0].toUpperCase() : "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block" style={{ color: "var(--text-primary)" }}>
                      {name || "Имя агента"}
                    </span>
                    <span className="text-[11px] block truncate" style={{ color: "var(--text-muted)" }}>
                      {profession || "Профессия"} {brand ? `• ${brand}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Навигация */}
        <div className="px-6 pb-5 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--bg-glass-border)",
                color: "var(--text-secondary)",
              }}
            >
              Назад
            </button>
          )}
          {step < totalSteps ? (
            <button
              onClick={() => canNext() && setStep(step + 1)}
              disabled={!canNext()}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: canNext() ? "var(--accent)" : "var(--bg-glass-border)",
                color: canNext() ? "var(--bg-deep)" : "var(--text-muted)",
                cursor: canNext() ? "pointer" : "default",
              }}
            >
              Далее
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !canNext()}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: saving ? "var(--bg-glass-border)" : "var(--accent)",
                color: saving ? "var(--text-muted)" : "var(--bg-deep)",
              }}
            >
              {saving ? "Создаю..." : "Создать агента"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
