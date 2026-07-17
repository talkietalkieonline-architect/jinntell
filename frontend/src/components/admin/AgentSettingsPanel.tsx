"use client";
import { useState, useEffect } from "react";
import {
  adminGetAgent,
  adminUpdateAgent,
  adminTestAgentChat,
  adminGetRAGSources,
  adminAddRAGSource,
  adminDeleteRAGSource,
  adminParseSource,
  adminParseRawText,
  adminSearchRAG,
  adminGetRAGStats,
  adminGetRAGLog,
  adminDeleteAllRAGChunks,
  getCities,
  type AgentDetailOut,
  type RAGSource,
  type RAGParseLog,
  type RAGStats,
  type RAGSearchResult,
} from "@/services/api";

/* ══════════════════════════════════════════════════════════════
   AgentSettingsPanel — полные настройки агента в админке
   Табы: Основное | Правила | Скилы | Обучение | Отмена | Режимы | Персонаж | Управление
   ══════════════════════════════════════════════════════════════ */

type SettingsTab = "basic" | "rules" | "skills" | "training" | "exclusions" | "modes" | "persona" | "parser" | "control";

interface Props {
  agentId: number;
  onBack: () => void;
  onAgentUpdated: () => void;
}

const MODES = [
  { key: "walk", label: "Прогулка", icon: "🚶" },
  { key: "shopping", label: "Шоппинг", icon: "🛍️" },
  { key: "drive", label: "Дорога", icon: "🚗" },
  { key: "chat", label: "Общение", icon: "💬" },
] as const;

const PRESET_COLORS = [
  "#FFD700", "#4CAF50", "#E91E63", "#2196F3", "#FF9800",
  "#9C27B0", "#00BCD4", "#FF5722", "#607D8B", "#8BC34A",
  "#3F51B5", "#F44336", "#795548", "#CDDC39",
];

const KNOWN_MODELS = [
  "deepseek-chat", "deepseek-reasoner",
  "nvidia/nemotron-3-super-120b-a12b:free", "openai/gpt-oss-120b:free", "google/gemma-4-31b-it:free",
  "deepseek/deepseek-v4-flash:free", "qwen/qwen3-next-80b-a3b-instruct:free", "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat", "google/gemini-2.0-flash-001", "anthropic/claude-3.5-haiku", "openai/gpt-4o-mini", "openai/gpt-4o",
  "gpt-4o-mini", "gpt-4o", "gemini-2.0-flash", "llama-3.3-70b-versatile",
];

const YANDEX_VOICES = [
  { id: "ermil", name: "Эрмил", desc: "муж., спокойный" },
  { id: "zahar", name: "Захар", desc: "муж., уверенный" },
  { id: "filipp", name: "Филипп", desc: "муж., мягкий" },
  { id: "madirus", name: "Мадирус", desc: "муж., нейтральный" },
  { id: "alena", name: "Алёна", desc: "жен., тёплый" },
  { id: "jane", name: "Джейн", desc: "жен., эмоциональный" },
  { id: "oksana", name: "Оксана", desc: "жен., классический" },
  { id: "omazh", name: "Омаж", desc: "жен., выразительный" },
];

export default function AgentSettingsPanel({ agentId, onBack, onAgentUpdated }: Props) {
  const [agent, setAgent] = useState<AgentDetailOut | null>(null);
  const [tab, setTab] = useState<SettingsTab>("basic");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Form fields (mirror of agent fields for editing)
  const [form, setForm] = useState<Record<string, unknown>>({});

  // Мини-чат с агентом (для core-агентов)
  const [chatMessages, setChatMessages] = useState<{role: "user"|"assistant"; text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [cities, setCities] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { getCities().then((c) => setCities(c)).catch(() => {}); }, []);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const result = await adminTestAgentChat(agentId, userMsg);
      setChatMessages(prev => [...prev, { role: "assistant", text: result.reply }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: "assistant", text: "Ошибка: " + (e instanceof Error ? e.message : "нет ответа") }]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadAgent = async () => {
    setLoading(true);
    try {
      const data = await adminGetAgent(agentId);
      setAgent(data);
      setForm(data as unknown as Record<string, unknown>);
      setCustomModel(!KNOWN_MODELS.includes(((data as unknown as Record<string, unknown>).llm_model as string) || ""));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    setSaveMsg("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, rating, rating_count, is_active, created_at, owner_id, contractor_id, jinntell_link, ...updateData } = form;
      const updated = await adminUpdateAgent(agent.id, updateData);
      setAgent(updated);
      setForm(updated as unknown as Record<string, unknown>);
      setSaveMsg("Сохранено!");
      onAgentUpdated();
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const f = (key: string) => (form[key] as string) || "";
  const fBool = (key: string) => form[key] as boolean ?? false;
  const setF = (key: string, val: unknown) => setForm({ ...form, [key]: val });

  if (loading) {
    return <div className="text-gray-500 py-12 text-center">Загрузка агента...</div>;
  }

  if (!agent) {
    return <div className="text-red-400 py-12 text-center">Агент не найден</div>;
  }

  const isSpecialist = f("agent_type") === "specialist";
  const isCore = f("agent_type") === "core" || f("visibility") === "core";

  const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "basic", label: "Основное", icon: "📋" },
    { id: "rules", label: "Правила", icon: "📜" },
    { id: "skills", label: "Скилы", icon: "🎯" },
    { id: "training", label: "Обучение", icon: "📚" },
    { id: "exclusions", label: "Запреты", icon: "🚫" },
    { id: "persona", label: "Персонаж", icon: "🎭" },
    ...(isSpecialist ? [{ id: "parser" as const, label: "Парсер", icon: "🔍" }] : []),
    { id: "control", label: "Управление", icon: "⚙️" },
  ];

  return (
    <div>
      {/* Header */}
      <button onClick={onBack} className="text-sm text-amber-400 mb-4 hover:underline">
        ← Назад к списку
      </button>

      <div className="flex items-start gap-5 mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
          style={{ background: `${agent.color}22`, border: `2.5px solid ${agent.color}55`, color: agent.color }}
        >
          {agent.name[0]}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{agent.name}</h2>
          <p className="text-gray-400 text-sm">{agent.profession} • {agent.brand} • ID:{agent.id}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              agent.agent_type === "core" ? "bg-red-900/50 text-red-300" :
              agent.agent_type === "system" ? "bg-purple-900/50 text-purple-300" :
              agent.agent_type === "business" ? "bg-blue-900/50 text-blue-300" :
              "bg-green-900/50 text-green-300"
            }`}>{agent.agent_type === "core" ? "Core" : agent.agent_type}</span>
            {agent.is_active
              ? <span className="text-green-400 text-xs">Активен</span>
              : <span className="text-red-400 text-xs">Остановлен</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 flex-wrap border-b border-gray-800 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              tab === t.id ? "bg-amber-500 text-black" : "bg-gray-800/50 text-gray-400 hover:text-white"
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Основное ═══ */}
      {tab === "basic" && (
        <div className="grid grid-cols-2 gap-6 max-w-3xl">
          <div className="flex flex-col gap-4">
            <Field label="Имя" value={f("name")} onChange={(v) => setF("name", v)} />
            <Field label="Профессия" value={f("profession")} onChange={(v) => setF("profession", v)} />
            {!isCore && <Field label="Бренд" value={f("brand")} onChange={(v) => setF("brand", v)} />}
            {!isCore && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Тип</label>
              <div className="flex gap-2 flex-wrap">
                {["system", "business", "citizen", "specialist"].map((t) => (
                  <button key={t}
                    onClick={() => setF("agent_type", t)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      f("agent_type") === t ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400"
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            )}
            {!isCore && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Охват</label>
              <div className="flex gap-2">
                {[{ id: "federal", label: "Федеральный" }, { id: "city", label: "Городской" }].map((o) => (
                  <button key={o.id} onClick={() => setF("scope", o.id)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${(f("scope") || "federal") === o.id ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400"}`}>{o.label}</button>
                ))}
              </div>
              {f("scope") === "city" && (
                <select value={f("city")} onChange={(e) => setF("city", e.target.value)}
                  className="mt-2 w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700">
                  <option value="">— выберите город —</option>
                  {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={!!f("is_paid")} onChange={(e) => setF("is_paid", e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-gray-300">Платный джинн <span className="text-gray-500">(за общение платит пользователь)</span></span>
              </label>
              <div className="mt-3">
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Сообщение, когда недоступен (баланс/отъезд)</label>
                <input value={f("unavailable_message")} onChange={(e) => setF("unavailable_message", e.target.value)} placeholder="Извините, сейчас я не на связи — загляните позже" className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700" />
              </div>
            </div>
            )}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Цвет</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button key={c} onClick={() => setF("color", c)}
                    className="w-7 h-7 rounded-full transition-all hover:scale-110"
                    style={{ background: c, border: f("color") === c ? "3px solid white" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">AI Модель</label>
              <select value={customModel ? "__custom__" : f("llm_model")} onChange={(e) => { const v = e.target.value; if (v === "__custom__") { setCustomModel(true); } else { setCustomModel(false); setF("llm_model", v); } }}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                <optgroup label="DeepSeek (прямой API)">
                  <option value="deepseek-chat">DeepSeek V3 Chat</option>
                  <option value="deepseek-reasoner">DeepSeek R1 Reasoner</option>
                </optgroup>
                <optgroup label="OpenRouter (бесплатные)">
                  <option value="nvidia/nemotron-3-super-120b-a12b:free">Nemotron 3 Super 120B</option>
                  <option value="openai/gpt-oss-120b:free">GPT-OSS 120B</option>
                  <option value="google/gemma-4-31b-it:free">Gemma 4 31B</option>
                  <option value="deepseek/deepseek-v4-flash:free">DeepSeek V4 Flash</option>
                  <option value="qwen/qwen3-next-80b-a3b-instruct:free">Qwen3 Next 80B</option>
                  <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B</option>
                </optgroup>
                <optgroup label="OpenRouter (платные)">
                  <option value="deepseek/deepseek-chat">DeepSeek V3 ($0.27/M)</option>
                  <option value="google/gemini-2.0-flash-001">Gemini Flash ($0.10/M)</option>
                  <option value="anthropic/claude-3.5-haiku">Claude Haiku ($0.80/M)</option>
                  <option value="openai/gpt-4o-mini">GPT-4o Mini ($0.15/M)</option>
                  <option value="openai/gpt-4o">GPT-4o ($2.50/M)</option>
                </optgroup>
                <optgroup label="Прямые API (нужен ключ)">
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                  <option value="gpt-4o">OpenAI GPT-4o</option>
                  <option value="gemini-2.0-flash">Google Gemini Flash</option>
                  <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
                </optgroup>
                <option value="__custom__">✏️ Своя модель…</option>
              </select>
              {customModel && (
                <input value={f("llm_model")} onChange={(e) => setF("llm_model", e.target.value)}
                  placeholder="vendor/model:free или deepseek-chat"
                  className="w-full mt-2 px-3 py-2 bg-gray-950 border border-amber-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
              )}
              {customModel && <p className="text-[11px] text-gray-500 mt-1">Свободный ввод. OpenRouter — формат vendor/model[:free]; прямой DeepSeek — deepseek-chat.</p>}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <FieldArea label="Описание" value={f("description")} onChange={(v) => setF("description", v)} rows={3} />
            <FieldArea label="Приветствие" value={f("greeting")} onChange={(v) => setF("greeting", v)} rows={3}
              placeholder="Первое сообщение агента при открытии чата" />
            {!isCore && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">JinnTell</label>
              <p className="text-sm text-gray-400 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                /a/{agent.jinntell_link || "—"}
              </p>
            </div>
            )}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Информация</label>
              <div className="text-xs text-gray-500 space-y-1">
                <p>Владелец: {agent.owner_id ? `User #${agent.owner_id}` : "Нет (системный)"}</p>
                <p>Контрагент: {(form as Record<string, unknown>).contractor_id ? `#${(form as Record<string, unknown>).contractor_id}` : "Нет"}</p>
                <p>Создан: {agent.created_at ? new Date(agent.created_at).toLocaleString("ru") : "—"}</p>
              </div>
            </div>
          </div>

          {/* Мини-чат с агентом (его модель + промпт + RAG) */}
          {agent && (
            <div className="col-span-2 mt-6 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Диалог с {agent.name}</span>
                <span className="text-xs text-gray-500 ml-auto">Прямое общение с моделью</span>
              </div>
              <div className="h-64 overflow-y-auto p-4 flex flex-col gap-3" style={{ WebkitOverflowScrolling: "touch" }}>
                {chatMessages.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-8">Напишите сообщение для общения с агентом...</p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                      msg.role === "user"
                        ? "bg-gray-800 text-gray-200"
                        : "bg-amber-900/30 border border-amber-800/50 text-amber-100"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-end">
                    <div className="px-3 py-2 rounded-xl text-sm bg-amber-900/20 text-amber-300 animate-pulse">
                      Думаю...
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                  placeholder="Введите сообщение..."
                  className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50"
                >
                  {chatLoading ? "..." : "Отправить"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Правила ═══ */}
      {tab === "rules" && (
        <div className="max-w-3xl">
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-3 mb-4 text-xs text-blue-300">
            Правила — базовые инструкции поведения агента. Контрагент видит, но НЕ может редактировать.
          </div>
          <FieldArea
            label="Системный промпт (Правила)"
            value={f("system_prompt")}
            onChange={(v) => setF("system_prompt", v)}
            rows={16}
            placeholder="Ты — консультант магазина обуви. Отвечай вежливо и кратко. Не обсуждай конкурентов..."
            mono
          />
        </div>
      )}

      {/* ═══ TAB: Скилы ═══ */}
      {tab === "skills" && (
        <div className="max-w-3xl">
          <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-3 mb-4 text-xs text-purple-300">
            Скилы — навыки продаж, скрипты, воронки, реакции на возражения. Редактируют: админ + контрагент.
          </div>
          <FieldArea
            label="Навыки и скрипты"
            value={f("skills_text")}
            onChange={(v) => setF("skills_text", v)}
            rows={16}
            placeholder="При возражении 'дорого' — предложить рассрочку. При вопросе о гарантии — рассказать о 2-летней гарантии..."
            mono
          />
        </div>
      )}

      {/* ═══ TAB: Обучение ═══ */}
      {tab === "training" && (
        <div className="max-w-3xl">
          <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3 mb-4 text-xs text-green-300">
            Обучение — основная информация: товары, услуги, FAQ, цены, акции. Редактируют: админ + контрагент.
          </div>
          <FieldArea
            label="База знаний (текст)"
            value={f("knowledge_text")}
            onChange={(v) => setF("knowledge_text", v)}
            rows={16}
            placeholder="Ассортимент: Nike Air Max — 12990₽, Adidas Ultraboost — 14990₽... Акция: скидка 20% до 30 мая..."
            mono
          />
          <div className="mt-4 flex gap-3">
            <button disabled className="px-4 py-2 bg-gray-800 text-gray-500 rounded-lg text-sm cursor-not-allowed border border-gray-700">
              📁 Загрузить файлы (скоро)
            </button>
            <button disabled className="px-4 py-2 bg-gray-800 text-gray-500 rounded-lg text-sm cursor-not-allowed border border-gray-700">
              🔗 Подключить 1С (скоро)
            </button>
            <button disabled className="px-4 py-2 bg-gray-800 text-gray-500 rounded-lg text-sm cursor-not-allowed border border-gray-700">
              ☁️ Подключить облако (скоро)
            </button>
          </div>
        </div>
      )}

      {/* ═══ TAB: Отмена ═══ */}
      {tab === "exclusions" && (
        <div className="max-w-3xl">
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mb-4 text-xs text-red-300">
            Запреты — что агент НЕ должен делать: стоп-слова, запрещённые темы, конкуренты. Редактируют: админ + контрагент.
          </div>
          <FieldArea
            label="Исключения и запреты"
            value={f("exclusions_text")}
            onChange={(v) => setF("exclusions_text", v)}
            rows={12}
            placeholder="Не использовать слова: 'блин', 'типа', 'короче'. Не обсуждать: политику, конкурентов (Nike, Puma). Не давать скидки без согласования..."
            mono
          />
        </div>
      )}

      {/* ═══ TAB: Режимы ═══ */}
      {tab === "modes" && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-cyan-900/20 border border-cyan-800/50 rounded-lg p-3 text-xs text-cyan-300">
            Режимы работы — поведение агента в разных ситуациях. Включите нужные и настройте правила + контекст.
          </div>
          {MODES.map((mode) => {
            const enabled = fBool(`mode_${mode.key}_enabled`);
            return (
              <div key={mode.key} className={`bg-gray-900 rounded-xl p-5 border ${enabled ? "border-amber-700/50" : "border-gray-800"}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{mode.icon}</span>
                    <span className="font-medium">{mode.label}</span>
                  </div>
                  <button
                    onClick={() => setF(`mode_${mode.key}_enabled`, !enabled)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      enabled ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {enabled ? "ВКЛ" : "ВЫКЛ"}
                  </button>
                </div>
                {enabled && (
                  <div className="space-y-3">
                    <FieldArea
                      label="Правила режима"
                      value={f(`mode_${mode.key}_rules`)}
                      onChange={(v) => setF(`mode_${mode.key}_rules`, v)}
                      rows={4}
                      placeholder="Как вести себя в этом режиме..."
                    />
                    <FieldArea
                      label="Контекст режима"
                      value={f(`mode_${mode.key}_context`)}
                      onChange={(v) => setF(`mode_${mode.key}_context`, v)}
                      rows={4}
                      placeholder="Дополнительная информация для этого режима..."
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB: Персонаж ═══ */}
      {tab === "persona" && (
        <div className="max-w-3xl space-y-6">
          {/* Манеры */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-sm font-medium mb-3">Манеры общения</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Стиль</label>
                <div className="flex gap-1 flex-wrap">
                  {[{v:"friendly",l:"Дружелюбный"},{v:"formal",l:"Формальный"},{v:"playful",l:"Игривый"},{v:"strict",l:"Строгий"}].map(s => (
                    <button key={s.v} onClick={() => setF("manner_style", s.v)}
                      className={`px-2 py-1 rounded text-xs transition-all ${f("manner_style")===s.v ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400"}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Темперамент</label>
                <div className="flex gap-1 flex-wrap">
                  {[{v:"calm",l:"Спокойный"},{v:"balanced",l:"Сбалансир."},{v:"energetic",l:"Энергичный"},{v:"reserved",l:"Сдержанный"}].map(s => (
                    <button key={s.v} onClick={() => setF("manner_temperament", s.v)}
                      className={`px-2 py-1 rounded text-xs transition-all ${f("manner_temperament")===s.v ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400"}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-6 mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={fBool("manner_humor")} onChange={(e) => setF("manner_humor", e.target.checked)}
                  className="accent-amber-500" /> Юмор
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={fBool("manner_emoji_use")} onChange={(e) => setF("manner_emoji_use", e.target.checked)}
                  className="accent-amber-500" /> Эмодзи
              </label>
            </div>
          </div>

          {/* Голос (TTS) */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <label className="flex items-center gap-2 text-sm font-medium mb-3 cursor-pointer">
              <input type="checkbox" checked={fBool("tts_enabled")} onChange={(e) => setF("tts_enabled", e.target.checked)} className="accent-amber-500" /> Голос (TTS) включён
            </label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Провайдер</label>
                <select value={f("tts_provider") || "browser"} onChange={(e) => setF("tts_provider", e.target.value)} className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                  <option value="browser">Браузерный (Web Speech)</option>
                  <option value="yandex">Yandex SpeechKit</option>
                  <option value="self">Self-hosted (своё железо)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Голос</label>
                <select value={f("tts_voice_id") || ""} onChange={(e) => setF("tts_voice_id", e.target.value)} className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                  <option value="">— выбрать —</option>
                  {YANDEX_VOICES.map((vv) => (<option key={vv.id} value={vv.id}>{vv.name} — {vv.desc}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Эмоция</label>
                <select value={f("tts_emotion") || "neutral"} onChange={(e) => setF("tts_emotion", e.target.value)} className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                  <option value="neutral">Нейтральная</option>
                  <option value="good">Добрая</option>
                  <option value="evil">Строгая</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Скорость: {((form.tts_speed as number) || 1.0).toFixed(1)}</label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={(form.tts_speed as number) || 1.0} onChange={(e) => setF("tts_speed", parseFloat(e.target.value))} className="w-full accent-amber-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Тон: {((form.tts_pitch as number) || 1.0).toFixed(1)}</label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={(form.tts_pitch as number) || 1.0} onChange={(e) => setF("tts_pitch", parseFloat(e.target.value))} className="w-full accent-amber-500" />
              </div>
            </div>
            <p className="text-[11px] text-gray-600 mt-2">Местоположение (endpoint своего сервера/железа) задаётся глобально в конфиге сервера.</p>
          </div>

          {/* Видео (talking avatar) */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <label className="flex items-center gap-2 text-sm font-medium mb-3 cursor-pointer">
              <input type="checkbox" checked={fBool("video_enabled")} onChange={(e) => setF("video_enabled", e.target.checked)} className="accent-amber-500" /> Видео-аватар включён
            </label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Провайдер</label>
                <select value={f("video_provider")} onChange={(e) => setF("video_provider", e.target.value)} className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                  <option value="">Выключено</option>
                  <option value="self">Self-hosted SadTalker</option>
                </select>
              </div>
              <Field label="Модель" value={f("video_model")} onChange={(v) => setF("video_model", v)} placeholder="sadtalker" />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Режим</label>
                <select value={f("video_mode") || "bubble"} onChange={(e) => setF("video_mode", e.target.value)} className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                  <option value="bubble">Кружочек</option>
                  <option value="fullscreen">Полный экран</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 mt-2">Каркас на перспективу — генерация подключится со своим железом.</p>
          </div>

          {/* Внешность + Одежда */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-sm font-medium mb-3">Внешность и одежда (будущее — аватар)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Лицо" value={f("appearance_face")} onChange={(v) => setF("appearance_face", v)} placeholder="oval" />
              <Field label="Волосы" value={f("appearance_hair")} onChange={(v) => setF("appearance_hair", v)} placeholder="short-dark" />
              <Field label="Кожа" value={f("appearance_skin")} onChange={(v) => setF("appearance_skin", v)} placeholder="medium" />
              <Field label="Телосложение" value={f("appearance_body")} onChange={(v) => setF("appearance_body", v)} placeholder="athletic" />
              <Field label="Стиль одежды" value={f("outfit_style")} onChange={(v) => setF("outfit_style", v)} placeholder="casual" />
              <Field label="Верх" value={f("outfit_top")} onChange={(v) => setF("outfit_top", v)} placeholder="Белая футболка" />
              <Field label="Низ" value={f("outfit_bottom")} onChange={(v) => setF("outfit_bottom", v)} placeholder="Джинсы" />
              <Field label="Обувь" value={f("outfit_shoes")} onChange={(v) => setF("outfit_shoes", v)} placeholder="Кроссовки" />
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: Парсер (RAG) ═══ */}
      {tab === "parser" && isSpecialist && (
        <RAGPanel agentId={agentId} />
      )}

      {/* ═══ TAB: Управление ═══ */}
      {tab === "control" && (
        <div className="max-w-xl space-y-4">
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-sm font-medium mb-4">Действия администратора</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  if (!confirm("Остановить агента? Пользователи не смогут с ним общаться.")) return;
                  try {
                    await adminUpdateAgent(agentId, { is_active: false } as Record<string, unknown>);
                    loadAgent();
                    onAgentUpdated();
                  } catch {}
                }}
                disabled={!agent.is_active}
                className="w-full px-4 py-3 bg-orange-900/30 border border-orange-800 text-orange-300 rounded-lg text-sm font-medium hover:bg-orange-900/50 disabled:opacity-30 disabled:cursor-not-allowed text-left"
              >
                ⏸️ Остановить агента
                <span className="block text-xs text-orange-400/60 mt-0.5">Агент станет недоступен для пользователей</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    await adminUpdateAgent(agentId, { is_active: true } as Record<string, unknown>);
                    loadAgent();
                    onAgentUpdated();
                  } catch {}
                }}
                disabled={agent.is_active}
                className="w-full px-4 py-3 bg-green-900/30 border border-green-800 text-green-300 rounded-lg text-sm font-medium hover:bg-green-900/50 disabled:opacity-30 disabled:cursor-not-allowed text-left"
              >
                ▶️ Запустить агента
                <span className="block text-xs text-green-400/60 mt-0.5">Вернуть агента в строй</span>
              </button>

              <button
                onClick={() => { handleSave(); }}
                className="w-full px-4 py-3 bg-blue-900/30 border border-blue-800 text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-900/50 text-left"
              >
                🔄 Обновить агента
                <span className="block text-xs text-blue-400/60 mt-0.5">Пересохранить контекст и настройки</span>
              </button>

              <button disabled
                className="w-full px-4 py-3 bg-indigo-900/30 border border-indigo-800 text-indigo-300 rounded-lg text-sm font-medium cursor-not-allowed opacity-60 text-left"
              >
                🔍 Проверить контекст (скоро)
                <span className="block text-xs text-indigo-400/60 mt-0.5">Агент-Контролёр проанализирует содержимое</span>
              </button>

              <div className="border-t border-gray-800 pt-3 mt-2">
                <button
                  onClick={async () => {
                    if (!confirm("УДАЛИТЬ АГЕНТА НАВСЕГДА? Это нельзя отменить!")) return;
                    try {
                      const { adminDeleteAgent } = await import("@/services/api");
                      await adminDeleteAgent(agentId, true);
                      onBack();
                      onAgentUpdated();
                    } catch {}
                  }}
                  className="w-full px-4 py-3 bg-red-900/30 border border-red-800 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/50 text-left"
                >
                  🗑️ Удалить навсегда
                  <span className="block text-xs text-red-400/60 mt-0.5">Безвозвратное удаление агента и всех данных</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save button (bottom bar) */}
      {tab !== "control" && (
        <div className="sticky bottom-0 bg-gray-950 border-t border-gray-800 mt-6 -mx-6 px-6 py-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? "Сохраняю..." : "Сохранить все изменения"}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg === "Сохранено!" ? "text-green-400" : "text-red-400"}`}>
              {saveMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══ RAG Panel (Parser tab) ═══ */

function RAGPanel({ agentId }: { agentId: number }) {
  const [sources, setSources] = useState<RAGSource[]>([]);
  const [logs, setLogs] = useState<RAGParseLog[]>([]);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<RAGSearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // New source form
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newLayer, setNewLayer] = useState("law");
  const [addingSource, setAddingSource] = useState(false);

  // Raw text form
  const [rawText, setRawText] = useState("");
  const [rawTitle, setRawTitle] = useState("");
  const [indexingText, setIndexingText] = useState(false);

  useEffect(() => { loadAll(); }, [agentId]); // eslint-disable-line

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, st, l] = await Promise.all([
        adminGetRAGSources(agentId),
        adminGetRAGStats(agentId),
        adminGetRAGLog(agentId),
      ]);
      setSources(s);
      setStats(st);
      setLogs(l);
    } catch {} finally { setLoading(false); }
  };

  const handleAddSource = async () => {
    if (!newUrl.trim()) return;
    setAddingSource(true);
    try {
      await adminAddRAGSource({
        agent_id: agentId, url: newUrl.trim(), title: newTitle.trim(), source_type: newType, layer: newLayer,
      });
      setNewUrl(""); setNewTitle("");
      loadAll();
    } catch (e) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setAddingSource(false); }
  };

  const handleParse = async (sourceId: number) => {
    setParsing(sourceId);
    try {
      const result = await adminParseSource(sourceId);
      alert(`Успешно! ${result.chunks_parsed} chunks проиндексировано`);
      loadAll();
    } catch (e) { alert(e instanceof Error ? e.message : "Parse error"); }
    finally { setParsing(null); }
  };

  const handleDeleteSource = async (sourceId: number) => {
    if (!confirm("Удалить источник и все его chunks?")) return;
    try { await adminDeleteRAGSource(sourceId); loadAll(); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await adminSearchRAG({ agent_id: agentId, query: searchQuery.trim(), top_k: 5 });
      setSearchResults(results);
    } catch (e) { alert(e instanceof Error ? e.message : "Search error"); }
    finally { setSearching(false); }
  };

  const handleIndexRawText = async () => {
    if (!rawText.trim() || rawText.trim().length < 10) { alert("Минимум 10 символов"); return; }
    setIndexingText(true);
    try {
      const result = await adminParseRawText({
        agent_id: agentId, text: rawText.trim(), title: rawTitle.trim() || "Ручной ввод",
      });
      alert(`Проиндексировано ${result.chunks_parsed} chunks`);
      setRawText(""); setRawTitle("");
      loadAll();
    } catch (e) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setIndexingText(false); }
  };

  const handleDeleteAll = async () => {
    if (!confirm("УДАЛИТЬ ВСЕ ЗНАНИЯ агента? Это нельзя отменить!")) return;
    try { await adminDeleteAllRAGChunks(agentId); loadAll(); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); }
  };

  if (loading) return <div className="text-gray-500 py-8 text-center">Загрузка RAG...</div>;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Статистика */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
          <div className="text-xl font-bold text-amber-400">{stats?.total_chunks_qdrant || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Chunks (Qdrant)</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
          <div className="text-xl font-bold text-blue-400">{stats?.total_chunks_db || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Chunks (БД)</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
          <div className="text-xl font-bold text-green-400">{stats?.sources_count || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Источников</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
          <div className="text-xl font-bold text-purple-400">{stats?.vector_dimensions || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Dimensions</div>
        </div>
      </div>

      {/* Добавить источник */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <p className="text-sm font-medium mb-3">Добавить источник (URL)</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://consultant.ru/..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none" />
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Название (ПДД, ТК РФ...)"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none" />
        </div>
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Тип</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white">
              <option value="custom">Произвольный</option>
              <option value="consultant">Consultant.ru</option>
              <option value="garant">Garant.ru</option>
              <option value="pravo">Pravo.gov.ru</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Слой</label>
            <select value={newLayer} onChange={(e) => setNewLayer(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white">
              <option value="law">Текст закона</option>
              <option value="changes">Изменения</option>
              <option value="explanations">Разъяснения</option>
            </select>
          </div>
          <button onClick={handleAddSource} disabled={addingSource || !newUrl.trim()}
            className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50">
            {addingSource ? "Добавляю..." : "Добавить"}
          </button>
        </div>
      </div>

      {/* Список источников */}
      {sources.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-sm font-medium mb-3">Источники ({sources.length})</p>
          <div className="flex flex-col gap-2">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{s.title || s.url}</p>
                  <p className="text-xs text-gray-500 truncate">{s.url}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{s.source_type}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{s.layer}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-amber-400">{s.chunks_count} chunks</span>
                    {s.last_parsed_at && (
                      <span className="text-[10px] text-gray-500">
                        Парсинг: {new Date(s.last_parsed_at).toLocaleString("ru")}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleParse(s.id)} disabled={parsing === s.id}
                  className="px-3 py-1.5 bg-blue-900/50 text-blue-300 border border-blue-800 rounded-lg text-xs hover:bg-blue-900 disabled:opacity-50">
                  {parsing === s.id ? "Парсинг..." : "Парсить"}
                </button>
                <button onClick={() => handleDeleteSource(s.id)}
                  className="px-3 py-1.5 bg-red-900/50 text-red-300 border border-red-800 rounded-lg text-xs hover:bg-red-900">
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Индексация сырого текста */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <p className="text-sm font-medium mb-3">Индексация текста напрямую</p>
        <input value={rawTitle} onChange={(e) => setRawTitle(e.target.value)} placeholder="Название (необязательно)"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none mb-2" />
        <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={8}
          placeholder="Вставьте текст закона / правил / FAQ..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none resize-none font-mono" />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">{rawText.length} симв.</span>
          <button onClick={handleIndexRawText} disabled={indexingText || rawText.length < 10}
            className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50">
            {indexingText ? "Индексация..." : "Индексировать"}
          </button>
        </div>
      </div>

      {/* Тестовый поиск */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <p className="text-sm font-medium mb-3">Тест поиска (RAG)</p>
        <div className="flex gap-2 mb-3">
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введите вопрос для поиска..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
          <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 bg-indigo-700 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50">
            {searching ? "Ищу..." : "Найти"}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {searchResults.map((r, i) => (
              <div key={i} className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-amber-400">score: {r.score.toFixed(3)}</span>
                  {r.article_number && <span className="text-xs text-blue-400">ст. {r.article_number}</span>}
                  <span className="text-xs text-gray-500">{r.layer}</span>
                </div>
                <p className="text-xs text-gray-300 line-clamp-3">{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Лог */}
      {logs.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-sm font-medium mb-3">Лог парсинга (последние)</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${
                  l.action === "error" ? "bg-red-900/50 text-red-300" :
                  l.action === "parsed" ? "bg-green-900/50 text-green-300" :
                  "bg-gray-700 text-gray-400"
                }`}>{l.action}</span>
                <span className="text-gray-400">+{l.chunks_added}</span>
                {l.error_message && <span className="text-red-400 truncate flex-1">{l.error_message}</span>}
                <span className="text-gray-600 ml-auto">{l.parsed_at ? new Date(l.parsed_at).toLocaleString("ru") : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Опасная зона */}
      <div className="border-t border-gray-800 pt-4">
        <button onClick={handleDeleteAll}
          className="px-4 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded-lg text-sm hover:bg-red-900/50">
          🗑️ Удалить все chunks
        </button>
      </div>
    </div>
  );
}

/* ═══ Helper components ═══ */

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500 placeholder-gray-600" />
    </div>
  );
}

function FieldArea({ label, value, onChange, rows = 4, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className={`w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500 resize-none placeholder-gray-600 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
