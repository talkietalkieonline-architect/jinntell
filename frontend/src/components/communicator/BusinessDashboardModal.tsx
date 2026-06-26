"use client";
import { useState, useEffect, useCallback } from "react";
import {
  contractorLogin,
  contractorGetAgents,
  contractorUpdateAgent,
  contractorLogout,
  getContractorToken,
  setContractorToken,
  getMyBusinesses,
  getBusinessToken,
  contractorGetAgentStats,
  contractorGetDialogs,
  contractorGetDialog,
  contractorUploadPhoto,
  contractorDeletePhoto,
  contractorGetWardrobe,
  contractorAddWardrobe,
  contractorActivateWardrobe,
  contractorDeleteWardrobe,
  contractorGetStorage,
  mediaUrl,
  type AgentFullOut,
  type AgentPersonaUpdate,
  type ContractorAgentStats,
  type ContractorDialogItem,
  type ContractorDialogMessage,
  type WardrobeItem,
  type StorageUsage,
} from "@/services/api";

/* ══════════════════════════════════════════════════════════════
   ЛК Бизнеса — настройка привязанных агентов
   Полный UI: Описание, AI, Манеры, Знания, Голос, Внешность, Одежда
   ══════════════════════════════════════════════════════════════ */

// ── Справочники пресетов ──
const VOICE_PRESETS = [
  { id: "male-deep", label: "Мужской низкий", icon: "🗣" },
  { id: "male-medium", label: "Мужской средний", icon: "🗣" },
  { id: "female-warm", label: "Женский тёплый", icon: "👩" },
  { id: "female-bright", label: "Женский яркий", icon: "👩" },
  { id: "neutral", label: "Нейтральный", icon: "🤖" },
];

const MANNER_STYLES = [
  { id: "friendly", label: "Дружелюбный" },
  { id: "formal", label: "Формальный" },
  { id: "playful", label: "Игривый" },
  { id: "strict", label: "Строгий" },
];

const TEMPERAMENTS = [
  { id: "calm", label: "Спокойный" },
  { id: "balanced", label: "Сбалансированный" },
  { id: "energetic", label: "Энергичный" },
  { id: "reserved", label: "Сдержанный" },
];

type EditSection = "main" | "rules" | "skills" | "exclusions" | "modes" | "manners" | "knowledge" | "voice" | "appearance" | "outfit";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function BusinessDashboardModal({ isOpen, onClose }: Props) {
  // Auth state
  const [isAuthed, setIsAuthed] = useState(false);
  const [loginVal, setLoginVal] = useState("");
  const [passwordVal, setPasswordVal] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const [myAgents, setMyAgents] = useState<AgentFullOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentFullOut | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeSection, setActiveSection] = useState<EditSection>("main");

  // ── Редактируемые поля (все секции) ──
  const [editDesc, setEditDesc] = useState("");
  const [editGreeting, setEditGreeting] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editModel, setEditModel] = useState("gpt-4o-mini");
  // Скилы
  const [skillsText, setSkillsText] = useState("");
  // Отмена
  const [exclusionsText, setExclusionsText] = useState("");
  // Режимы
  const [modesState, setModesState] = useState<Record<string, {enabled: boolean; rules: string; context: string}>>({
    walk: {enabled: false, rules: "", context: ""},
    shopping: {enabled: false, rules: "", context: ""},
    drive: {enabled: false, rules: "", context: ""},
    chat: {enabled: false, rules: "", context: ""},
    work: {enabled: false, rules: "", context: ""},
  });
  // Манеры
  const [mannerStyle, setMannerStyle] = useState("friendly");
  const [mannerTemperament, setMannerTemperament] = useState("balanced");
  const [mannerHumor, setMannerHumor] = useState(true);
  const [mannerEmoji, setMannerEmoji] = useState(true);
  // Знания
  const [knowledgeText, setKnowledgeText] = useState("");
  // Голос
  const [voiceId, setVoiceId] = useState("");
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(1.0);
  // Внешность
  const [appFace, setAppFace] = useState("");
  const [appHair, setAppHair] = useState("");
  const [appSkin, setAppSkin] = useState("");
  const [appBody, setAppBody] = useState("");
  // Одежда
  const [outfitStyle, setOutfitStyle] = useState("");
  const [outfitTop, setOutfitTop] = useState("");
  const [outfitBottom, setOutfitBottom] = useState("");
  const [outfitShoes, setOutfitShoes] = useState("");
  const [outfitAccessory, setOutfitAccessory] = useState("");

  const [saving, setSaving] = useState(false);
  const [editMaxTokens, setEditMaxTokens] = useState(1000);
  const [detailView, setDetailView] = useState<"home" | "stats" | "dialogs">("home");
  const [stats, setStats] = useState<ContractorAgentStats | null>(null);
  const [dialogs, setDialogs] = useState<ContractorDialogItem[]>([]);
  const [openDialogUser, setOpenDialogUser] = useState<ContractorDialogItem | null>(null);
  const [dialogMessages, setDialogMessages] = useState<ContractorDialogMessage[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingOutfit, setUploadingOutfit] = useState(false);

  const loadAnalytics = useCallback(async (agentId: number) => {
    try {
      const [st, dl] = await Promise.all([contractorGetAgentStats(agentId), contractorGetDialogs(agentId)]);
      setStats(st); setDialogs(dl);
    } catch { setStats(null); setDialogs([]); }
    try { setStorage(await contractorGetStorage()); } catch { setStorage(null); }
  }, []);

  const openDialog = useCallback(async (agentId: number, d: ContractorDialogItem) => {
    setOpenDialogUser(d);
    try { setDialogMessages(await contractorGetDialog(agentId, d.user_id)); }
    catch { setDialogMessages([]); }
  }, []);

  const handlePhotoUpload = async (file: File) => {
    if (!selectedAgent) return;
    setUploadingPhoto(true);
    try {
      const r = await contractorUploadPhoto(selectedAgent.id, file);
      setPhotoUrl(r.photo_url);
      contractorGetStorage().then(setStorage).catch(() => {});
    } catch (e) { alert(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setUploadingPhoto(false); }
  };
  const handlePhotoDelete = async () => {
    if (!selectedAgent) return;
    try { await contractorDeletePhoto(selectedAgent.id); setPhotoUrl(null); } catch {}
  };
  const handleWardrobeUpload = async (file: File) => {
    if (!selectedAgent) return;
    setUploadingOutfit(true);
    try {
      const item = await contractorAddWardrobe(selectedAgent.id, file);
      setWardrobe((w) => [item, ...w]);
      contractorGetStorage().then(setStorage).catch(() => {});
    } catch (e) { alert(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setUploadingOutfit(false); }
  };
  const handleWardrobeActivate = async (itemId: number) => {
    if (!selectedAgent) return;
    try { await contractorActivateWardrobe(selectedAgent.id, itemId); setWardrobe((w) => w.map((x) => ({ ...x, is_active: x.id === itemId }))); } catch {}
  };
  const handleWardrobeDelete = async (itemId: number) => {
    if (!selectedAgent) return;
    try { await contractorDeleteWardrobe(selectedAgent.id, itemId); setWardrobe((w) => w.filter((x) => x.id !== itemId)); contractorGetStorage().then(setStorage).catch(() => {}); } catch {}
  };

  useEffect(() => {
    if (selectedAgent && !editMode) {
      setDetailView("home"); setOpenDialogUser(null);
      loadAnalytics(selectedAgent.id);
    }
  }, [selectedAgent, editMode, loadAnalytics]);

  // Проверка сессии / авто-вход по привязанному бизнесу (без второго пароля)
  useEffect(() => {
    if (!isOpen) return;
    const token = getContractorToken();
    if (token) {
      setIsAuthed(true);
      const session = localStorage.getItem("jinntell_contractor_session");
      if (session) {
        try { setCompanyName(JSON.parse(session).companyName || ""); } catch {}
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getMyBusinesses();
        if (!cancelled && list.length > 0) {
          const t = await getBusinessToken(list[0].id);
          setContractorToken(t.access_token);
          localStorage.setItem("jinntell_contractor_session", JSON.stringify({ contractorId: t.contractor_id, companyName: t.company_name }));
          setCompanyName(t.company_name);
          setIsAuthed(true);
          return;
        }
      } catch { /* нет привязки — покажем форму входа */ }
      if (!cancelled) setIsAuthed(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const loadMyAgents = useCallback(async () => {
    setLoading(true);
    try {
      const agents = await contractorGetAgents();
      setMyAgents(agents);
    } catch {
      // API недоступен или токен протух
      setMyAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && isAuthed) loadMyAgents();
  }, [isOpen, isAuthed, loadMyAgents]);

  const handleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const resp = await contractorLogin(loginVal, passwordVal);
      setCompanyName(resp.company_name);
      setIsAuthed(true);
      setLoginVal(""); setPasswordVal("");
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : "Ошибка входа");
    } finally { setAuthLoading(false); }
  };

  const handleLogout = () => {
    contractorLogout();
    setIsAuthed(false);
    setMyAgents([]);
    setSelectedAgent(null);
    setEditMode(false);
    setCompanyName("");
  };

  /** Инициализация всех полей из агента */
  const openEdit = (agent: AgentFullOut) => {
    setEditDesc(agent.description || "");
    setEditGreeting(agent.greeting || "");
    setEditPrompt(agent.system_prompt || "");
    setEditModel(agent.llm_model || "gpt-4o-mini");
    setEditMaxTokens(agent.llm_max_tokens || 1000);
    setPhotoUrl(agent.photo_url || null);
    contractorGetWardrobe(agent.id).then(setWardrobe).catch(() => setWardrobe([]));
    setSkillsText(agent.skills_text || "");
    setExclusionsText(agent.exclusions_text || "");
    setModesState({
      walk: {enabled: agent.mode_walk_enabled ?? false, rules: agent.mode_walk_rules || "", context: agent.mode_walk_context || ""},
      shopping: {enabled: agent.mode_shopping_enabled ?? false, rules: agent.mode_shopping_rules || "", context: agent.mode_shopping_context || ""},
      drive: {enabled: agent.mode_drive_enabled ?? false, rules: agent.mode_drive_rules || "", context: agent.mode_drive_context || ""},
      chat: {enabled: agent.mode_chat_enabled ?? false, rules: agent.mode_chat_rules || "", context: agent.mode_chat_context || ""},
      work: {enabled: agent.mode_work_enabled ?? false, rules: agent.mode_work_rules || "", context: agent.mode_work_context || ""},
    });
    // Манеры
    setMannerStyle(agent.manner_style || "friendly");
    setMannerTemperament(agent.manner_temperament || "balanced");
    setMannerHumor(agent.manner_humor ?? true);
    setMannerEmoji(agent.manner_emoji_use ?? true);
    // Знания
    setKnowledgeText(agent.knowledge_text || "");
    // Голос
    setVoiceId(agent.voice_id || "");
    setVoiceSpeed(agent.voice_speed ?? 1.0);
    setVoicePitch(agent.voice_pitch ?? 1.0);
    // Внешность
    setAppFace(agent.appearance_face || "");
    setAppHair(agent.appearance_hair || "");
    setAppSkin(agent.appearance_skin || "");
    setAppBody(agent.appearance_body || "");
    // Одежда
    setOutfitStyle(agent.outfit_style || "");
    setOutfitTop(agent.outfit_top || "");
    setOutfitBottom(agent.outfit_bottom || "");
    setOutfitShoes(agent.outfit_shoes || "");
    setOutfitAccessory(agent.outfit_accessory || "");

    setActiveSection("main");
    setEditMode(true);
  };

  /** Сохранение всех секций разом */
  const handleSave = async () => {
    if (!selectedAgent) return;
    setSaving(true);
    try {
      const data: AgentPersonaUpdate = {
        description: editDesc,
        greeting: editGreeting,
        // system_prompt: read-only for contractor
        llm_model: editModel,
        llm_max_tokens: editMaxTokens,
        skills_text: skillsText || undefined,
        exclusions_text: exclusionsText || undefined,
        mode_walk_enabled: modesState.walk.enabled,
        mode_walk_rules: modesState.walk.rules || undefined,
        mode_walk_context: modesState.walk.context || undefined,
        mode_shopping_enabled: modesState.shopping.enabled,
        mode_shopping_rules: modesState.shopping.rules || undefined,
        mode_shopping_context: modesState.shopping.context || undefined,
        mode_drive_enabled: modesState.drive.enabled,
        mode_drive_rules: modesState.drive.rules || undefined,
        mode_drive_context: modesState.drive.context || undefined,
        mode_chat_enabled: modesState.chat.enabled,
        mode_chat_rules: modesState.chat.rules || undefined,
        mode_chat_context: modesState.chat.context || undefined,
        mode_work_enabled: modesState.work.enabled,
        mode_work_rules: modesState.work.rules || undefined,
        mode_work_context: modesState.work.context || undefined,
        manner_style: mannerStyle,
        manner_temperament: mannerTemperament,
        manner_humor: mannerHumor,
        manner_emoji_use: mannerEmoji,
        knowledge_text: knowledgeText || undefined,
        voice_id: voiceId || undefined,
        voice_speed: voiceSpeed,
        voice_pitch: voicePitch,
        appearance_face: appFace || undefined,
        appearance_hair: appHair || undefined,
        appearance_skin: appSkin || undefined,
        appearance_body: appBody || undefined,
        outfit_style: outfitStyle || undefined,
        outfit_top: outfitTop || undefined,
        outfit_bottom: outfitBottom || undefined,
        outfit_shoes: outfitShoes || undefined,
        outfit_accessory: outfitAccessory || undefined,
      };
      await contractorUpdateAgent(selectedAgent.id, data);
      setEditMode(false);
      loadMyAgents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 105 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          backdropFilter: "blur(12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {isAuthed ? companyName || "ЛК Бизнеса" : "Для бизнеса"}
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {isAuthed ? "Управление вашими AI-агентами" : "Войдите в личный кабинет"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAuthed && (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-full text-[10px] font-medium transition-all"
                style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-muted)" }}
              >
                Выйти
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

        {/* Контент */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">

          {/* Форма входа контрагента */}
          {!isAuthed ? (
            <div className="animate-fade-in py-4">
              <div className="text-center mb-6">
                <div className="text-4xl mb-3 opacity-60">🏢</div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Войдите в личный кабинет<br/>для управления агентами</p>
              </div>

              {authError && (
                <div className="rounded-xl px-4 py-2.5 mb-4 text-[12px]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
                  {authError}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Логин</label>
                  <input type="text" value={loginVal} onChange={(e) => setLoginVal(e.target.value)}
                    placeholder="Ваш логин"
                    className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Пароль</label>
                  <input type="password" value={passwordVal} onChange={(e) => setPasswordVal(e.target.value)}
                    placeholder="Ваш пароль"
                    className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                </div>
                <button
                  onClick={handleLogin}
                  disabled={authLoading || !loginVal || !passwordVal}
                  className="w-full py-3 rounded-xl text-sm font-semibold mt-2 transition-all"
                  style={{ background: authLoading ? "var(--bg-glass-border)" : "var(--accent)", color: authLoading ? "var(--text-muted)" : "var(--bg-deep)", opacity: (!loginVal || !passwordVal) ? 0.5 : 1 }}>
                  {authLoading ? "Вход..." : "Войти"}
                </button>
              </div>

              <div className="rounded-xl px-4 py-3 mt-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Логин и пароль выдаёт администратор платформы.<br/>
                  Для подключения свяжитесь с нами.
                </p>
              </div>
            </div>
          ) :

          /* Редактирование агента — полный UI настройки персонажа */
          selectedAgent && editMode ? (
            <div className="animate-fade-in">
              <button onClick={() => setEditMode(false)} className="text-sm mb-3" style={{ color: "var(--accent)" }}>‹ Назад</button>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{selectedAgent.name}</h3>

              {/* ── Табы секций ── */}
              <div className="flex gap-1 flex-wrap mb-4">
                {([
                  { id: "main" as const, label: "AI" },
                  { id: "rules" as const, label: "Правила" },
                  { id: "skills" as const, label: "Скилы" },
                  { id: "exclusions" as const, label: "Запреты" },
                  { id: "modes" as const, label: "Режимы" },
                  { id: "manners" as const, label: "Манеры" },
                  { id: "knowledge" as const, label: "Знания" },
                  { id: "voice" as const, label: "Голос" },
                  { id: "appearance" as const, label: "Внешность" },
                  { id: "outfit" as const, label: "Одежда" },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSection(tab.id)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
                    style={{
                      background: activeSection === tab.id ? "var(--accent)" : "var(--bg-glass)",
                      color: activeSection === tab.id ? "var(--bg-deep)" : "var(--text-secondary)",
                      border: `1px solid ${activeSection === tab.id ? "var(--accent)" : "var(--bg-glass-border)"}`,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ═══ Секция: Правила (read-only) ═══ */}
              {activeSection === "rules" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="rounded-xl px-4 py-2.5 text-[11px]" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", color: "rgba(147,197,253,1)" }}>
                    Правила установлены администратором. Доступ только для чтения.
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Системный промпт (правила)</label>
                    <textarea value={editPrompt} readOnly rows={10}
                      className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none font-mono opacity-70"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                  </div>
                </div>
              )}

              {/* ═══ Секция: Скилы ═══ */}
              {activeSection === "skills" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="rounded-xl px-4 py-2.5 text-[11px]" style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(147,51,234,0.3)", color: "rgba(196,181,253,1)" }}>
                    Навыки продаж, скрипты, воронки, реакции на возражения.
                  </div>
                  <textarea value={skillsText} onChange={(e) => setSkillsText(e.target.value)} rows={10}
                    placeholder="При возражении 'дорого' — предложить рассрочку...\nПри вопросе о гарантии — рассказать о 2-летней гарантии..."
                    className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none font-mono"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                  <p className="text-[10px] text-right" style={{ color: "var(--text-muted)" }}>{skillsText.length} / 50 000</p>
                </div>
              )}

              {/* ═══ Секция: Отмена ═══ */}
              {activeSection === "exclusions" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="rounded-xl px-4 py-2.5 text-[11px]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "rgba(252,165,165,1)" }}>
                    Что агент НЕ должен делать: стоп-слова, запрещённые темы, конкуренты.
                  </div>
                  <textarea value={exclusionsText} onChange={(e) => setExclusionsText(e.target.value)} rows={8}
                    placeholder="Не использовать слова: 'блин', 'типа'...\nНе обсуждать: политику, конкурентов...\nНе давать скидки без согласования..."
                    className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none font-mono"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                  <p className="text-[10px] text-right" style={{ color: "var(--text-muted)" }}>{exclusionsText.length} / 10 000</p>
                </div>
              )}

              {/* ═══ Секция: Режимы ═══ */}
              {activeSection === "modes" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="rounded-xl px-4 py-2.5 text-[11px]" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)", color: "rgba(103,232,249,1)" }}>
                    Поведение агента в разных режимах пользователя.
                  </div>
                  {(["walk", "shopping", "drive", "chat", "work"] as const).map((mode) => {
                    const labels: Record<string, string> = { walk: "🚶 Прогулка", shopping: "🛍️ Шоппинг", drive: "🚗 Дорога", chat: "💬 Общение", work: "💼 Работа" };
                    const m = modesState[mode];
                    return (
                      <div key={mode} className="rounded-xl p-3" style={{ background: "var(--bg-glass)", border: `1px solid ${m.enabled ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{labels[mode]}</span>
                          <button onClick={() => setModesState({...modesState, [mode]: {...m, enabled: !m.enabled}})}
                            className="text-[10px] px-2 py-1 rounded-full font-medium"
                            style={{ background: m.enabled ? "var(--accent)" : "var(--bg-glass-border)", color: m.enabled ? "var(--bg-deep)" : "var(--text-muted)" }}>
                            {m.enabled ? "ВКЛ" : "ВЫКЛ"}
                          </button>
                        </div>
                        {m.enabled && (
                          <div className="flex flex-col gap-2">
                            <textarea value={m.rules} onChange={(e) => setModesState({...modesState, [mode]: {...m, rules: e.target.value}})} rows={2}
                              placeholder="Правила режима..."
                              className="w-full rounded-lg px-3 py-2 text-[11px] bg-transparent outline-none resize-none"
                              style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                            <textarea value={m.context} onChange={(e) => setModesState({...modesState, [mode]: {...m, context: e.target.value}})} rows={2}
                              placeholder="Контекст режима..."
                              className="w-full rounded-lg px-3 py-2 text-[11px] bg-transparent outline-none resize-none"
                              style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ═══ Секция: AI (описание + промпт + модель) ═══ */}
              {activeSection === "main" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Описание</label>
                    <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                      className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Приветствие</label>
                    <textarea value={editGreeting} onChange={(e) => setEditGreeting(e.target.value)} rows={2}
                      className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>AI инструкция</label>
                    <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={4} placeholder="Как агент должен отвечать..."
                      className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none font-mono"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>AI модель</label>
                    <div className="flex gap-2">
                      {[{ id: "gpt-4o-mini", label: "GPT-4o Mini" }, { id: "gpt-4o", label: "GPT-4o" }].map((m) => (
                        <button key={m.id} onClick={() => setEditModel(m.id)} className="flex-1 px-3 py-2.5 rounded-xl text-[12px] transition-all text-center"
                          style={{ background: editModel === m.id ? "var(--accent)" : "var(--bg-glass)", color: editModel === m.id ? "var(--bg-deep)" : "var(--text-secondary)", border: editModel === m.id ? "1px solid var(--accent)" : "1px solid var(--bg-glass-border)" }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>Длина ответа</label>
                    <div className="flex gap-2">
                      {[{ v: 400, label: "Короткий" }, { v: 1000, label: "Средний" }, { v: 2000, label: "Развёрнутый" }].map((m) => (
                        <button key={m.v} onClick={() => setEditMaxTokens(m.v)} className="flex-1 px-3 py-2.5 rounded-xl text-[12px] transition-all text-center"
                          style={{ background: editMaxTokens === m.v ? "var(--accent)" : "var(--bg-glass)", color: editMaxTokens === m.v ? "var(--bg-deep)" : "var(--text-secondary)", border: editMaxTokens === m.v ? "1px solid var(--accent)" : "1px solid var(--bg-glass-border)" }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Короче ответы — меньше расход баланса.</p>
                  </div>
                </div>
              )}

              {/* ═══ Секция: Манеры ═══ */}
              {activeSection === "manners" && (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Стиль общения</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {MANNER_STYLES.map((s) => (
                        <button key={s.id} onClick={() => setMannerStyle(s.id)} className="px-3 py-2.5 rounded-xl text-[12px] transition-all text-center"
                          style={{ background: mannerStyle === s.id ? "var(--accent)" : "var(--bg-glass)", color: mannerStyle === s.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${mannerStyle === s.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Темперамент</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TEMPERAMENTS.map((t) => (
                        <button key={t.id} onClick={() => setMannerTemperament(t.id)} className="px-3 py-2.5 rounded-xl text-[12px] transition-all text-center"
                          style={{ background: mannerTemperament === t.id ? "var(--accent)" : "var(--bg-glass)", color: mannerTemperament === t.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${mannerTemperament === t.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setMannerHumor(!mannerHumor)} className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={{ background: "var(--bg-glass)", border: `1px solid ${mannerHumor ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Юмор</span>
                      <span className="text-[12px] font-medium" style={{ color: mannerHumor ? "var(--accent)" : "var(--text-muted)" }}>{mannerHumor ? "ВКЛ" : "ВЫКЛ"}</span>
                    </button>
                    <button onClick={() => setMannerEmoji(!mannerEmoji)} className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={{ background: "var(--bg-glass)", border: `1px solid ${mannerEmoji ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Эмодзи</span>
                      <span className="text-[12px] font-medium" style={{ color: mannerEmoji ? "var(--accent)" : "var(--text-muted)" }}>{mannerEmoji ? "ВКЛ" : "ВЫКЛ"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ═══ Секция: Знания ═══ */}
              {activeSection === "knowledge" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>База знаний</label>
                    <p className="text-[11px] mb-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      FAQ, описания товаров, прайс-лист, правила — всё, что агент должен знать.
                    </p>
                    <textarea value={knowledgeText} onChange={(e) => setKnowledgeText(e.target.value)} rows={8}
                      placeholder="Наш магазин работает с 9:00 до 21:00...\nДоставка бесплатная от 3000₽...\nВозврат 14 дней..."
                      className="w-full rounded-xl px-4 py-2.5 text-sm bg-transparent outline-none resize-none"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
                    <p className="text-[10px] mt-1.5 text-right" style={{ color: "var(--text-muted)" }}>
                      {knowledgeText.length} / 50 000 символов
                    </p>
                  </div>
                  {/* Плейсхолдеры будущих фич */}
                  <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Загрузка файлов (PDF, DOCX)</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(212,168,67,0.1)", color: "var(--accent)" }}>Скоро</span>
                    </div>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Парсинг сайтов (URL)</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(212,168,67,0.1)", color: "var(--accent)" }}>Скоро</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ Секция: Голос ═══ */}
              {activeSection === "voice" && (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Тип голоса</label>
                    <div className="flex flex-col gap-1.5">
                      {VOICE_PRESETS.map((v) => (
                        <button key={v.id} onClick={() => setVoiceId(v.id)} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                          style={{ background: voiceId === v.id ? "rgba(212,168,67,0.12)" : "var(--bg-glass)", border: `1px solid ${voiceId === v.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                          <span className="text-base">{v.icon}</span>
                          <span className="text-[12px]" style={{ color: voiceId === v.id ? "var(--accent)" : "var(--text-secondary)" }}>{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Скорость: {voiceSpeed.toFixed(1)}x</label>
                    <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSpeed} onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]" style={{ accentColor: "var(--accent)" }} />
                    <div className="flex justify-between text-[9px]" style={{ color: "var(--text-muted)" }}>
                      <span>Медленно</span><span>Быстро</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Тон: {voicePitch.toFixed(1)}</label>
                    <input type="range" min="0.5" max="2.0" step="0.1" value={voicePitch} onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                      className="w-full" style={{ accentColor: "var(--accent)" }} />
                    <div className="flex justify-between text-[9px]" style={{ color: "var(--text-muted)" }}>
                      <span>Низкий</span><span>Высокий</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ Секция: Внешность (фото) ═══ */}
              {activeSection === "appearance" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="rounded-xl px-4 py-2.5 text-[11px]" style={{ background: "rgba(63,169,245,0.1)", border: "1px solid rgba(63,169,245,0.3)", color: "rgba(147,197,253,1)" }}>
                    Загрузите фото — это и есть внешность агента (аватар + источник видео).
                  </div>
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-40 h-40 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                      {photoUrl ? <img src={mediaUrl(photoUrl)} alt="Фото агента" className="w-full h-full object-cover" /> : <span className="text-4xl opacity-40">🖼️</span>}
                    </div>
                    <div className="flex gap-2">
                      <label className="px-4 py-2 rounded-xl text-[12px] font-medium cursor-pointer" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                        {uploadingPhoto ? "Загрузка..." : "Загрузить фото"}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }} />
                      </label>
                      {photoUrl && <button onClick={handlePhotoDelete} className="px-4 py-2 rounded-xl text-[12px]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-muted)" }}>Удалить</button>}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ Секция: Одежда (гардероб) ═══ */}
              {activeSection === "outfit" && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="rounded-xl px-4 py-2.5 text-[11px]" style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(147,51,234,0.3)", color: "rgba(196,181,253,1)" }}>
                    Гардероб агента: загрузите изображения нарядов, выберите активный (напр. на праздник).
                  </div>
                  <label className="px-4 py-2 rounded-xl text-[12px] font-medium cursor-pointer text-center" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                    {uploadingOutfit ? "Загрузка..." : "+ Добавить наряд"}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingOutfit} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWardrobeUpload(f); e.target.value = ""; }} />
                  </label>
                  {wardrobe.length === 0 ? <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Гардероб пуст</p> : (
                    <div className="grid grid-cols-3 gap-2">
                      {wardrobe.map((w) => (
                        <div key={w.id} className="relative rounded-xl overflow-hidden aspect-square" style={{ border: `2px solid ${w.is_active ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                          <img src={mediaUrl(w.image_url)} alt={w.label || ""} className="w-full h-full object-cover cursor-pointer" onClick={() => handleWardrobeActivate(w.id)} />
                          {w.is_active && <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>АКТИВЕН</span>}
                          <button onClick={() => handleWardrobeDelete(w.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px]" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Кнопка сохранения */}
              <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold mt-5 transition-all"
                style={{ background: saving ? "var(--bg-glass-border)" : "var(--accent)", color: saving ? "var(--text-muted)" : "var(--bg-deep)" }}>
                {saving ? "Сохраняю..." : "Сохранить все изменения"}
              </button>
            </div>
          ) : selectedAgent ? (
            /* Детали агента + аналитика */
            <div className="animate-fade-in">
              <button onClick={() => setSelectedAgent(null)} className="text-sm mb-4" style={{ color: "var(--accent)" }}>‹ Назад</button>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ background: `${selectedAgent.color}22`, border: `2px solid ${selectedAgent.color}55`, color: selectedAgent.color }}>{selectedAgent.name[0]}</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{selectedAgent.name}</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedAgent.profession} &bull; {selectedAgent.brand}</p>
                </div>
              </div>

              <div className="flex gap-1 mb-4">
                {([{ id: "home", label: "Обзор" }, { id: "stats", label: "Статистика" }, { id: "dialogs", label: "Диалоги" }] as const).map((t) => (
                  <button key={t.id} onClick={() => { setDetailView(t.id); setOpenDialogUser(null); }}
                    className="flex-1 px-3 py-2 rounded-xl text-[12px] font-medium transition-all"
                    style={{ background: detailView === t.id ? "var(--accent)" : "var(--bg-glass)", color: detailView === t.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${detailView === t.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {detailView === "home" && (
                <div className="animate-fade-in">
                  <div className="grid grid-cols-3 gap-2 mb-5">
                    {[{ label: "Клиентов", value: stats ? String(stats.clients_total) : "—" }, { label: "Сообщений", value: stats ? String(stats.total_messages) : "—" }, { label: "Рейтинг", value: selectedAgent.rating.toFixed(1) }].map((s) => (
                      <div key={s.label} className="rounded-xl px-3 py-3 text-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                        <div className="text-lg font-semibold" style={{ color: "var(--accent)" }}>{s.value}</div>
                        <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {selectedAgent.description && <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>{selectedAgent.description}</p>}
                  {storage && (
                    <div className="rounded-xl px-4 py-2.5 mb-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Данные на сервере</span>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{storage.used_mb} / {storage.quota_mb} МБ</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-glass-border)" }}>
                        <div className="h-full rounded-full" style={{ width: `${storage.percent}%`, background: "var(--accent)" }} />
                      </div>
                    </div>
                  )}
                  <button onClick={() => openEdit(selectedAgent)} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>Настроить агента</button>
                </div>
              )}

              {detailView === "stats" && (
                <div className="animate-fade-in flex flex-col gap-4">
                  {!stats && <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Нет данных</p>}
                  {stats && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ l: "Всего сообщений", v: stats.total_messages }, { l: "За 7 дней", v: stats.messages_7d }, { l: "Клиентов", v: stats.clients_total }, { l: "Вернулись", v: stats.returning_total }, { l: "Новых", v: stats.new_total }, { l: "Ср. длина диалога", v: stats.avg_dialog_len }].map((s) => (
                          <div key={s.l} className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                            <div className="text-base font-semibold" style={{ color: "var(--accent)" }}>{s.v}</div>
                            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{s.l}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Активность по часам</p>
                        <div className="flex items-end gap-[2px] h-16">
                          {stats.by_hour.map((c, h) => (
                            <div key={h} className="flex-1 rounded-sm" title={`${h}:00 — ${c}`} style={{ height: `${Math.max(3, (c / Math.max(1, ...stats!.by_hour)) * 100)}%`, background: c ? "var(--accent)" : "var(--bg-glass-border)" }} />
                          ))}
                        </div>
                      </div>
                      {stats.by_day.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Обращения по дням</p>
                          <div className="flex flex-col gap-1">
                            {stats.by_day.map((d) => (
                              <div key={d.date} className="flex items-center gap-2">
                                <span className="text-[10px] w-16 shrink-0" style={{ color: "var(--text-muted)" }}>{d.date.slice(5)}</span>
                                <div className="rounded-sm h-3" style={{ width: `${(d.count / Math.max(1, ...stats!.by_day.map((x) => x.count))) * 100}%`, background: "var(--accent)", minWidth: 6 }} />
                                <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{d.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {detailView === "dialogs" && (
                <div className="animate-fade-in">
                  {openDialogUser ? (
                    <div>
                      <button onClick={() => setOpenDialogUser(null)} className="text-sm mb-3" style={{ color: "var(--accent)" }}>‹ К списку</button>
                      <p className="text-[12px] font-medium mb-2" style={{ color: "var(--text-primary)" }}>{openDialogUser.user_name}</p>
                      <div className="flex flex-col gap-2">
                        {dialogMessages.map((m) => (
                          <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] ${m.sender_type === "user" ? "self-start" : "self-end"}`}
                            style={{ background: m.sender_type === "user" ? "var(--bg-glass)" : "var(--accent)", color: m.sender_type === "user" ? "var(--text-primary)" : "var(--bg-deep)", border: "1px solid var(--bg-glass-border)" }}>
                            {m.text}
                          </div>
                        ))}
                        {dialogMessages.length === 0 && <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Пусто</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {dialogs.length === 0 ? <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Пока нет обращений</p> :
                        dialogs.map((d) => (
                          <button key={d.user_id} onClick={() => openDialog(selectedAgent.id, d)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                            <div className="flex-1 min-w-0">
                              <span className="text-[13px] font-medium block" style={{ color: "var(--text-primary)" }}>{d.user_name}</span>
                              <span className="text-[11px] truncate block" style={{ color: "var(--text-muted)" }}>{d.last_message}</span>
                            </div>
                            <span className="text-[10px] shrink-0" style={{ color: "var(--text-secondary)" }}>{d.message_count}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                Ваши агенты ({myAgents.length})
              </p>

              {loading ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Загрузка...</p>
                </div>
              ) : myAgents.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3 opacity-30">🤖</div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>У вас пока нет привязанных агентов</p>
                  <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>Свяжитесь с нами для создания<br />AI-агента для вашего бизнеса</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {myAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                      style={{ background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
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
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block" style={{ color: "var(--text-primary)" }}>
                          {agent.name}
                        </span>
                        <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                          {agent.profession} &bull; {agent.brand}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span style={{ color: "#FFD700", fontSize: "11px" }}>★</span>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                          {agent.rating.toFixed(1)}
                        </span>
                      </div>
                      <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>›</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-xl px-4 py-3 mt-5" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                <p className="text-[11px] font-medium mb-1" style={{ color: "var(--accent)" }}>Как это работает?</p>
                <ul className="text-[11px] leading-relaxed space-y-1" style={{ color: "var(--text-muted)" }}>
                  <li>1. Мы создаём AI-агента для вашего бизнеса</li>
                  <li>2. Вы настраиваете его голос, внешность, манеры и знания</li>
                  <li>3. Агент появляется в Городе Агентов</li>
                  <li>4. Пользователи общаются с ним</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
