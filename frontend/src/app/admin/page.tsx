"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  adminGetAgents,
  adminGetStats,
  adminGetUsers,
  adminCreateAgent,

  adminGetLLMStatus,
  adminGetSystemSettings,
  adminUpdateSystemSettings,
  adminGetCoreAgents,
  adminGetIntegrations,
  adminSetIntegration,
  adminGetEmbeddingConfig,
  adminSetEmbeddingConfig,
  type IntegrationItem,
  type EmbeddingConfigItem,
  adminGetSystemInfo,
  adminGetContractors,
  adminCreateContractor,
  adminUpdateContractor,
  adminDeleteContractor,
  adminAddBalance,
  adminAssignAgentToContractor,
  type AgentDetailOut,
  type AgentCreate,
  type AdminStats,
  type AdminUser,
  type LLMStatus,
  type SystemSettings,
  type SystemInfo,
  type ContractorOut,
  type ContractorCreateData,
  getAllCities,
  createCity,
  updateCity,
  adminGetUsage,
  adminGetModels,
  adminSetPricing,
  adminDelPricing,
  adminAddUserBalance,
  type UsageSummary,
  type ModelInfo,
} from "@/services/api";
import AgentSettingsPanel from "@/components/admin/AgentSettingsPanel";

/* ══════════════════════════════════════════════════════════════
   Админ-панель JinnTell
   Управление агентами, пользователями, статистика
   ══════════════════════════════════════════════════════════════ */

type Tab = "agents" | "core_agents" | "contractors" | "users" | "system" | "stats" | "integrations" | "cities";

const AGENT_TYPES = [
  { id: "", label: "Все" },
  { id: "system", label: "Системные" },
  { id: "business", label: "Бизнес" },
  { id: "citizen", label: "Жители" },
  { id: "specialist", label: "Специалисты" },
];

const PRESET_COLORS = [
  "#FFD700", "#4CAF50", "#E91E63", "#2196F3", "#FF9800",
  "#9C27B0", "#00BCD4", "#FF5722", "#607D8B", "#8BC34A",
  "#3F51B5", "#F44336", "#795548", "#CDDC39",
];

export default function AdminPage() {
  const router = useRouter();
  const { isLoggedIn, isAdmin, user } = useAuth();
  const [tab, setTab] = useState<Tab>("agents");

  // Agents state
  const [agents, setAgents] = useState<AgentDetailOut[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentTypeFilter, setAgentTypeFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentDetailOut | null>(null);
  // editMode removed — editing is now in AgentSettingsPanel
  const editMode = false;
  const [createMode, setCreateMode] = useState(false);

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelCur, setModelCur] = useState("₽");
  const [modelDrafts, setModelDrafts] = useState<Record<string, { provider: string; cost: string; sell: string; valid_until: string }>>({});
  const [newModel, setNewModel] = useState("");
  const loadModels = async () => {
    try {
      const r = await adminGetModels();
      setModels(r.models); setModelCur(r.currency);
      setModelDrafts(Object.fromEntries(r.models.map((m) => [m.model, { provider: m.provider, cost: String(m.cost), sell: String(m.sell), valid_until: m.valid_until }])));
    } catch { /* noop */ }
  };
  const saveModel = async (model: string) => {
    const d = modelDrafts[model]; if (!d) return;
    try { await adminSetPricing({ model, provider: d.provider, cost: Number(d.cost) || 0, sell: Number(d.sell) || 0, valid_until: d.valid_until }); await loadModels(); const u = await adminGetUsage().catch(() => null); setUsage(u); } catch { /* noop */ }
  };
  const [citiesList, setCitiesList] = useState<{ id: number; name: string; slug: string; lat?: number | null; lng?: number | null; is_active?: boolean }[]>([]);
  const [newCity, setNewCity] = useState({ name: "", slug: "", lat: "", lng: "" });
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  // System settings
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [smsProvider, setSmsProvider] = useState("sms_ru");
  const [smsRuApiKey, setSmsRuApiKey] = useState("");
  const [smscLogin, setSmscLogin] = useState("");
  const [smscPassword, setSmscPassword] = useState("");
  const [debugMode, setDebugMode] = useState(true);
  const [shaderBg, setShaderBg] = useState(true);
  const [ragMinScore, setRagMinScore] = useState(0.6);
  const [systemSaving, setSystemSaving] = useState(false);
  const [embeddingProvider, setEmbeddingProvider] = useState("jina");
  const [jinaApiKey, setJinaApiKey] = useState("");


  // Core agents
  const [coreAgents, setCoreAgents] = useState<AgentDetailOut[]>([]);
  const [selectedCoreAgent, setSelectedCoreAgent] = useState<AgentDetailOut | null>(null);

  // System info
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [intDraft, setIntDraft] = useState<Record<string, string>>({});
  const [embConfig, setEmbConfig] = useState<EmbeddingConfigItem[]>([]);
  const [embDraft, setEmbDraft] = useState<Record<string, string>>({});


  // Contractors state
  const [contractors, setContractors] = useState<ContractorOut[]>([]);
  const [contractorSearch, setContractorSearch] = useState("");
  const [selectedContractor, setSelectedContractor] = useState<ContractorOut | null>(null);
  const [contractorCreateMode, setContractorCreateMode] = useState(false);
  const [contractorEditMode, setContractorEditMode] = useState(false);
  const [contractorForm, setContractorForm] = useState<ContractorCreateData>({
    company_name: "", login: "", password: "", inn: "",
    legal_address: "", actual_address: "", bank_details: "",
    director_name: "", contact_name: "", contact_phone: "", contact_email: "",
    discount_percent: 0,
  });
  const [balanceAmount, setBalanceAmount] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("");

  // Create/Edit form
  const [form, setForm] = useState<AgentCreate>({
    name: "", profession: "", brand: "", description: "",
    color: "#FFD700", agent_type: "system", system_prompt: "",
    llm_model: "gpt-4o-mini", greeting: "",
  });
  const [assignOwnerId, setAssignOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Redirect if not admin
  useEffect(() => {
    if (isLoggedIn === false) {
      router.push("/");
    } else if (isLoggedIn === true && !isAdmin) {
      router.push("/");
    }
  }, [isLoggedIn, isAdmin, router]);

  // Load data
  const loadAgents = useCallback(async () => {
    try {
      const data = await adminGetAgents({
        search: agentSearch,
        agent_type: agentTypeFilter,
        include_inactive: showInactive,
      });
      setAgents(data);
    } catch {}
  }, [agentSearch, agentTypeFilter, showInactive]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await adminGetUsers(userSearch);
      setUsers(data);
    } catch {}
  }, [userSearch]);

  const loadContractors = useCallback(async () => {
    try {
      const data = await adminGetContractors(contractorSearch);
      setContractors(data);
    } catch {}
  }, [contractorSearch]);

  const loadCoreAgents = useCallback(async () => {
    try {
      const data = await adminGetCoreAgents();
      setCoreAgents(data);
    } catch {}
  }, []);

  const loadSystemInfo = useCallback(async () => {
    try {
      const [sysInfo] = await Promise.all([
        adminGetSystemInfo(),
      ]);
      setSystemInfo(sysInfo);
    } catch {}
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [statsData, llmData, sysData, usageData] = await Promise.all([
        adminGetStats(),
        adminGetLLMStatus(),
        adminGetSystemSettings(),
        adminGetUsage().catch(() => null),
      ]);
      setStats(statsData);
      setUsage(usageData);
      setLlmStatus(llmData);
      setSystemSettings(sysData);
      setSmsProvider(sysData.sms_provider);
      setSmscLogin(sysData.smsc_login);
      setDebugMode(sysData.debug_mode);
      setShaderBg(sysData.shader_bg_enabled ?? true);
      setRagMinScore(sysData.rag_min_score ?? 0.6);
      setEmbeddingProvider(sysData.embedding_provider || "jina");
    } catch {}
  }, []);

  const loadCities = useCallback(async () => {
    try { setCitiesList(await getAllCities()); } catch {}
  }, []);

  const loadIntegrations = useCallback(async () => {
    try { setIntegrations(await adminGetIntegrations()); } catch {}
    try { setEmbConfig(await adminGetEmbeddingConfig()); } catch {}
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      if (tab === "agents") await loadAgents();
      if (tab === "core_agents") await loadCoreAgents();
      if (tab === "contractors") await loadContractors();
      if (tab === "users") await loadUsers();
      if (tab === "system") await loadSystemInfo();
      if (tab === "stats") await loadStats();
      if (tab === "integrations") { await loadIntegrations(); await loadModels(); }
      if (tab === "cities") await loadCities();
    };
    load();
  }, [tab, isAdmin, loadAgents, loadCoreAgents, loadContractors, loadUsers, loadSystemInfo, loadStats, loadIntegrations]);

  // Actions
  const handleCreate = async () => {
    setSaving(true);
    setError("");
    try {
      const ownerId = assignOwnerId ? parseInt(assignOwnerId) : undefined;
      await adminCreateAgent(form, ownerId);
      setCreateMode(false);
      setForm({ name: "", profession: "", brand: "", description: "", color: "#FFD700", agent_type: "system", system_prompt: "", llm_model: "gpt-4o-mini", greeting: "" });
      setAssignOwnerId("");
      loadAgents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };





  // Contractor actions
  const handleCreateContractor = async () => {
    setSaving(true); setError("");
    try {
      await adminCreateContractor(contractorForm);
      setContractorCreateMode(false);
      setContractorForm({ company_name: "", login: "", password: "", inn: "", legal_address: "", actual_address: "", bank_details: "", director_name: "", contact_name: "", contact_phone: "", contact_email: "", discount_percent: 0 });
      loadContractors();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setSaving(false); }
  };

  const handleUpdateContractor = async () => {
    if (!selectedContractor) return;
    setSaving(true); setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, login, ...updateData } = contractorForm;
      const updated = await adminUpdateContractor(selectedContractor.id, updateData);
      setSelectedContractor(updated);
      setContractorEditMode(false);
      loadContractors();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setSaving(false); }
  };

  const handleDeleteContractor = async (id: number) => {
    if (!confirm("Деактивировать контрагента?")) return;
    try { await adminDeleteContractor(id); setSelectedContractor(null); loadContractors(); } catch {}
  };

  const handleAddBalance = async () => {
    if (!selectedContractor || !balanceAmount) return;
    try {
      const kopecks = Math.round(parseFloat(balanceAmount) * 100);
      if (kopecks <= 0) return;
      const updated = await adminAddBalance(selectedContractor.id, kopecks);
      setSelectedContractor(updated);
      setBalanceAmount("");
      loadContractors();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleAssignAgentToContractor = async () => {
    if (!selectedContractor || !assignAgentId) return;
    try {
      await adminAssignAgentToContractor(selectedContractor.id, parseInt(assignAgentId));
      setAssignAgentId("");
      alert("Агент привязан!");
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Ошибка"); }
  };

  const openContractorEdit = (c: ContractorOut) => {
    setContractorForm({
      company_name: c.company_name, login: c.login, password: "",
      inn: c.inn || "", legal_address: c.legal_address || "",
      actual_address: c.actual_address || "", bank_details: c.bank_details || "",
      director_name: c.director_name || "", contact_name: c.contact_name || "",
      contact_phone: c.contact_phone || "", contact_email: c.contact_email || "",
      discount_percent: c.discount_percent || 0,
    });
    setContractorEditMode(true);
    setError("");
  };

  // System settings actions
  const handleSystemSave = async () => {
    setSystemSaving(true);
    try {
      const data: Record<string, unknown> = {
        sms_provider: smsProvider,
        debug_mode: debugMode,
        shader_bg_enabled: shaderBg,
        rag_min_score: ragMinScore,
        smsc_login: smscLogin,
        embedding_provider: embeddingProvider,
      };
      // Отправляем ключи только если заполнены (не перезаписывать пустотой)
      if (smsRuApiKey) data.sms_ru_api_key = smsRuApiKey;
      if (smscPassword) data.smsc_password = smscPassword;
      if (jinaApiKey) data.jina_api_key = jinaApiKey;
      await adminUpdateSystemSettings(data);
      setSmsRuApiKey("");
      setSmscPassword("");
      setJinaApiKey("");
      loadStats();
    } catch {} finally { setSystemSaving(false); }
  };





  // Маппинг провайдер → группа моделей




  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        Проверка доступа...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-amber-400">JINNTELL Admin</h1>
          <span className="text-xs text-gray-500">
            {user?.display_name} ({user?.phone})
          </span>
        </div>
        <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← К коммуникатору
        </Link>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-52 border-r border-gray-800 min-h-[calc(100vh-65px)] p-4">
          {([
            { id: "agents" as Tab, label: "Агенты", icon: "🤖" },
            { id: "core_agents" as Tab, label: "Core-агенты", icon: "⚙️" },
            { id: "contractors" as Tab, label: "Контрагенты", icon: "🏢" },
            { id: "users" as Tab, label: "Пользователи", icon: "👥" },
            { id: "system" as Tab, label: "Система", icon: "🖥️" },
            { id: "stats" as Tab, label: "Статистика", icon: "📊" },
            { id: "cities" as Tab, label: "Города", icon: "📍" },
            { id: "integrations" as Tab, label: "Интеграции", icon: "🔌" },
          ]).map((item) => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setSelectedAgent(null); setCreateMode(false); setSelectedContractor(null); setContractorCreateMode(false); setContractorEditMode(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-all flex items-center gap-2 ${
                tab === item.id ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto max-h-[calc(100vh-65px)]">

          {/* ═══ AGENTS TAB ═══ */}
          {tab === "agents" && !selectedAgent && !createMode && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Агенты</h2>
                <button
                  onClick={() => {
                    setCreateMode(true);
                    setForm({ name: "", profession: "", brand: "", description: "", color: "#FFD700", agent_type: "system", system_prompt: "", llm_model: "gpt-4o-mini", greeting: "" });
                    setAssignOwnerId("");
                    setError("");
                  }}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors"
                >
                  + Создать агента
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Поиск..."
                  className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500 w-60"
                />
                <div className="flex gap-1">
                  {AGENT_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setAgentTypeFilter(t.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        agentTypeFilter === t.id
                          ? "bg-amber-500 text-black"
                          : "bg-gray-800 text-gray-400 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Показать удалённых
                </label>
              </div>

              {/* Table */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                      <th className="text-left px-4 py-3">Агент</th>
                      <th className="text-left px-4 py-3">Тип</th>
                      <th className="text-left px-4 py-3">Профессия</th>
                      <th className="text-left px-4 py-3">Бренд</th>
                      <th className="text-left px-4 py-3">Владелец</th>
                      <th className="text-left px-4 py-3">Рейтинг</th>
                      <th className="text-left px-4 py-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.filter((a) => a.agent_type !== "core" && a.visibility !== "core").map((agent) => (
                      <tr
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/50 ${
                          !agent.is_active ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-4 py-3 flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: `${agent.color}22`, border: `1.5px solid ${agent.color}55`, color: agent.color }}
                          >
                            {agent.name[0]}
                          </div>
                          <span className="font-medium">{agent.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            agent.agent_type === "core" ? "bg-red-900/50 text-red-300" :
                            agent.agent_type === "system" ? "bg-purple-900/50 text-purple-300" :
                            agent.agent_type === "business" ? "bg-blue-900/50 text-blue-300" :
                            agent.agent_type === "specialist" ? "bg-cyan-900/50 text-cyan-300" :
                            "bg-green-900/50 text-green-300"
                          }`}>
                            {agent.agent_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{agent.profession}</td>
                        <td className="px-4 py-3 text-gray-400">{agent.brand}</td>
                        <td className="px-4 py-3 text-gray-500">{agent.owner_id ? `#${agent.owner_id}` : "—"}</td>
                        <td className="px-4 py-3">
                          <span className="text-amber-400">★</span> {agent.rating.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          {agent.is_active ? (
                            <span className="text-green-400 text-xs">Активен</span>
                          ) : (
                            <span className="text-red-400 text-xs">Удалён</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {agents.length === 0 && (
                  <div className="text-center py-12 text-gray-500 text-sm">Нет агентов</div>
                )}
              </div>
            </div>
          )}

          {/* ═══ AGENT DETAIL (full settings panel) ═══ */}
          {tab === "agents" && selectedAgent && !editMode && !createMode && (
            <AgentSettingsPanel
              agentId={selectedAgent.id}
              onBack={() => setSelectedAgent(null)}
              onAgentUpdated={loadAgents}
            />
          )}

          {/* ═══ AGENT CREATE FORM ═══ */}
          {tab === "agents" && createMode && (
            <div>
              <button
                onClick={() => { setCreateMode(false); setError(""); }}
                className="text-sm text-amber-400 mb-4 hover:underline"
              >
                ← Назад
              </button>

              <h2 className="text-lg font-semibold mb-6">Создать агента</h2>

              {error && (
                <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-6 max-w-3xl">
                {/* Left column */}
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Имя *</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Профессия *</label>
                    <input value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Бренд</label>
                    <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Тип</label>
                    <div className="flex gap-2">
                      {["core", "system", "business", "citizen", "specialist"].map((t) => (
                        <button key={t}
                          onClick={() => setForm({ ...form, agent_type: t })}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            form.agent_type === t ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400"
                          }`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Цвет</label>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button key={c} onClick={() => setForm({ ...form, color: c })}
                          className="w-7 h-7 rounded-full transition-all hover:scale-110"
                          style={{ background: c, border: form.color === c ? "3px solid white" : "2px solid transparent" }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">AI Модель</label>
                    <select value={form.llm_model} onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                      <optgroup label="DeepSeek (работает из РФ, дешёвый)">
                        <option value="deepseek-chat">DeepSeek V3 (рекомендуемый)</option>
                        <option value="deepseek-reasoner">DeepSeek R1 (рассуждающий)</option>
                      </optgroup>
                      <optgroup label="OpenRouter (бесплатные, работают из РФ)">
                        <option value="google/gemma-3-27b-it:free">Gemma 3 27B (бесплатная)</option>
                        <option value="google/gemma-3-12b-it:free">Gemma 3 12B (бесплатная)</option>
                        <option value="google/gemma-3-4b-it:free">Gemma 3 4B (бесплатная, быстрая)</option>
                        <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (бесплатная)</option>
                      </optgroup>
                      <optgroup label="OpenRouter (платные, качественные)">
                        <option value="deepseek/deepseek-chat">DeepSeek V3 ($0.27/M)</option>
                        <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash ($0.10/M)</option>
                        <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku ($0.80/M)</option>
                        <option value="openai/gpt-4o-mini">GPT-4o Mini ($0.15/M)</option>
                        <option value="openai/gpt-4o">GPT-4o ($2.50/M)</option>
                      </optgroup>
                      <optgroup label="Прямые API (если ключ настроен)">
                        <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                        <option value="gpt-4o">OpenAI GPT-4o</option>
                        <option value="gemini-2.0-flash">Google Gemini 2.0 Flash</option>
                        <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
                      </optgroup>
                    </select>
                  </div>
                  {createMode && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                        Привязать к бизнесу (ID пользователя)
                      </label>
                      <input value={assignOwnerId} onChange={(e) => setAssignOwnerId(e.target.value)}
                        placeholder="Пусто = без привязки"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                    </div>
                  )}
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Описание</label>
                    <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Приветствие</label>
                    <textarea value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500 resize-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Системный промпт</label>
                    <textarea value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                      rows={8} placeholder="Инструкция для AI. Пусто = автогенерация из описания."
                      className="w-full h-full min-h-[200px] px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500 resize-none font-mono" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCreate}
                  disabled={saving || !form.name || !form.profession}
                  className="px-6 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-default"
                >
                  {saving ? "Сохраню..." : "Создать"}
                </button>
                <button
                  onClick={() => { setCreateMode(false); setError(""); }}
                  className="px-6 py-2.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}


          {/* ═══ CORE AGENTS TAB ═══ */}
          {tab === "core_agents" && !selectedCoreAgent && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Core-агенты</h2>
                <button
                  onClick={() => {
                    setTab("agents");
                    setCreateMode(true);
                    setForm({ name: "", profession: "", brand: "JinnTell", description: "", color: "#607D8B", agent_type: "core", system_prompt: "", llm_model: "deepseek-chat", greeting: "" });
                  }}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors"
                >
                  + Добавить core-агента
                </button>
              </div>

              <p className="text-sm text-gray-400 mb-6">
                Core-агенты — ядро платформы. Скрыты из Города Агентов. Помощник, администрирование, контент, инфраструктура.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {coreAgents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedCoreAgent(agent)}
                    className="bg-gray-900 rounded-xl p-5 border border-gray-800 cursor-pointer hover:border-gray-600 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0"
                        style={{ background: `${agent.color}22`, border: `2px solid ${agent.color}55`, color: agent.color }}
                      >
                        {agent.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white">{agent.name}</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                            {agent.uid || `ID:${agent.id}`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{agent.profession}</p>
                        <p className="text-sm text-gray-400 line-clamp-2">{agent.description}</p>
                        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                          <span>Модель: <span className="text-gray-300">{agent.llm_model}</span></span>
                          <span className={agent.is_active ? "text-green-400" : "text-red-400"}>
                            {agent.is_active ? "Активен" : "Отключён"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {coreAgents.length === 0 && (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-4xl mb-3">⚙️</p>
                  <p>Нет системных агентов. Перезапустите бэкенд для создания.</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ CORE AGENT DETAIL ═══ */}
          {tab === "core_agents" && selectedCoreAgent && (
            <AgentSettingsPanel
              agentId={selectedCoreAgent.id}
              onBack={() => { setSelectedCoreAgent(null); loadCoreAgents(); }}
              onAgentUpdated={loadCoreAgents}
            />
          )}

          {/* ═══ CONTRACTORS TAB ═══ */}
          {tab === "contractors" && !selectedContractor && !contractorCreateMode && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Контрагенты</h2>
                <button
                  onClick={() => { setContractorCreateMode(true); setContractorForm({ company_name: "", login: "", password: "", inn: "", legal_address: "", actual_address: "", bank_details: "", director_name: "", contact_name: "", contact_phone: "", contact_email: "", discount_percent: 0 }); setError(""); }}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors"
                >
                  + Создать контрагента
                </button>
              </div>

              <input type="text" value={contractorSearch} onChange={(e) => setContractorSearch(e.target.value)}
                placeholder="Поиск по компании, логину, ИНН..."
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500 w-72 mb-4" />

              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                      <th className="text-left px-4 py-3">Компания</th>
                      <th className="text-left px-4 py-3">ИНН</th>
                      <th className="text-left px-4 py-3">Логин</th>
                      <th className="text-left px-4 py-3">Баланс</th>
                      <th className="text-left px-4 py-3">Скидка</th>
                      <th className="text-left px-4 py-3">Статус</th>
                      <th className="text-left px-4 py-3">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractors.map((c) => (
                      <tr key={c.id} onClick={() => setSelectedContractor(c)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/50 ${!c.is_active ? "opacity-40" : ""}`}>
                        <td className="px-4 py-3 font-medium">{c.company_name}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.inn || "—"}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono">{c.login}</td>
                        <td className="px-4 py-3">
                          <span className={c.balance_kopecks > 0 ? "text-green-400" : "text-gray-500"}>
                            {(c.balance_kopecks / 100).toLocaleString("ru")} ₽
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{c.discount_percent > 0 ? `${c.discount_percent}%` : "—"}</td>
                        <td className="px-4 py-3">
                          {c.is_active ? <span className="text-green-400 text-xs">Активен</span> : <span className="text-red-400 text-xs">Отключён</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString("ru") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {contractors.length === 0 && <div className="text-center py-12 text-gray-500 text-sm">Нет контрагентов</div>}
              </div>
            </div>
          )}

          {/* ═══ CONTRACTOR DETAIL ═══ */}
          {tab === "contractors" && selectedContractor && !contractorEditMode && (
            <div>
              <button onClick={() => setSelectedContractor(null)} className="text-sm text-amber-400 mb-4 hover:underline">← Назад к списку</button>

              <div className="flex items-start gap-5 mb-6">
                <div className="w-16 h-16 rounded-xl bg-blue-900/30 border border-blue-800 flex items-center justify-center text-2xl shrink-0">🏢</div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{selectedContractor.company_name}</h2>
                <div className="text-xs text-gray-500 font-mono mt-1">UID: <span className="text-amber-400">{selectedContractor.uid || "—"}</span></div>
                  <p className="text-gray-400 text-sm">Логин: {selectedContractor.login} • ID: {selectedContractor.id}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {selectedContractor.is_active
                      ? <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded-full">Активен</span>
                      : <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full">Отключён</span>}
                    <span className="text-sm font-medium text-green-400">Баланс: {(selectedContractor.balance_kopecks / 100).toLocaleString("ru")} ₽</span>
                    {selectedContractor.discount_percent > 0 && <span className="text-xs text-amber-400">Скидка: {selectedContractor.discount_percent}%</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Юридические данные</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">ИНН:</span> <span className="text-gray-300">{selectedContractor.inn || "—"}</span></p>
                    <p><span className="text-gray-500">Юр. адрес:</span> <span className="text-gray-300">{selectedContractor.legal_address || "—"}</span></p>
                    <p><span className="text-gray-500">Факт. адрес:</span> <span className="text-gray-300">{selectedContractor.actual_address || "—"}</span></p>
                    <p><span className="text-gray-500">Реквизиты:</span> <span className="text-gray-300">{selectedContractor.bank_details || "—"}</span></p>
                    <p><span className="text-gray-500">Директор:</span> <span className="text-gray-300">{selectedContractor.director_name || "—"}</span></p>
                  </div>
                </div>
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Контакты</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Контактное лицо:</span> <span className="text-gray-300">{selectedContractor.contact_name || "—"}</span></p>
                    <p><span className="text-gray-500">Телефон:</span> <span className="text-gray-300">{selectedContractor.contact_phone || "—"}</span></p>
                    <p><span className="text-gray-500">Email:</span> <span className="text-gray-300">{selectedContractor.contact_email || "—"}</span></p>
                  </div>
                </div>
              </div>

              {/* Balance + Assign */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Пополнить баланс</p>
                  <div className="flex gap-2">
                    <input type="number" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)}
                      placeholder="Сумма в рублях"
                      className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                    <button onClick={handleAddBalance} disabled={!balanceAmount || parseFloat(balanceAmount) <= 0}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 disabled:opacity-50">Пополнить</button>
                  </div>
                </div>
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Привязать агента</p>
                  <div className="flex gap-2">
                    <input type="number" value={assignAgentId} onChange={(e) => setAssignAgentId(e.target.value)}
                      placeholder="ID или UID агента (напр. A-00001)"
                      className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                    <button onClick={handleAssignAgentToContractor} disabled={!assignAgentId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50">Привязать</button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button onClick={() => openContractorEdit(selectedContractor)}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400">Редактировать</button>
                {selectedContractor.is_active && (
                  <button onClick={() => handleDeleteContractor(selectedContractor.id)}
                    className="px-4 py-2 bg-gray-800 text-red-400 rounded-lg text-sm hover:bg-gray-700">Деактивировать</button>
                )}
              </div>
            </div>
          )}

          {/* ═══ CONTRACTOR CREATE/EDIT ═══ */}
          {tab === "contractors" && (contractorCreateMode || contractorEditMode) && (
            <div>
              <button onClick={() => { setContractorCreateMode(false); setContractorEditMode(false); setError(""); }}
                className="text-sm text-amber-400 mb-4 hover:underline">← Назад</button>

              <h2 className="text-lg font-semibold mb-6">
                {contractorCreateMode ? "Создать контрагента" : `Редактировать: ${selectedContractor?.company_name}`}
              </h2>

              {error && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-6 max-w-3xl">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Название компании *</label>
                    <input value={contractorForm.company_name} onChange={(e) => setContractorForm({ ...contractorForm, company_name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  {contractorCreateMode && (<>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Логин *</label>
                      <input value={contractorForm.login} onChange={(e) => setContractorForm({ ...contractorForm, login: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Пароль *</label>
                      <input type="password" value={contractorForm.password} onChange={(e) => setContractorForm({ ...contractorForm, password: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                    </div>
                  </>)}
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">ИНН</label>
                    <input value={contractorForm.inn} onChange={(e) => setContractorForm({ ...contractorForm, inn: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Юридический адрес</label>
                    <input value={contractorForm.legal_address} onChange={(e) => setContractorForm({ ...contractorForm, legal_address: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Фактический адрес</label>
                    <input value={contractorForm.actual_address} onChange={(e) => setContractorForm({ ...contractorForm, actual_address: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Банковские реквизиты</label>
                    <textarea value={contractorForm.bank_details} onChange={(e) => setContractorForm({ ...contractorForm, bank_details: e.target.value })}
                      rows={2} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500 resize-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">ФИО директора</label>
                    <input value={contractorForm.director_name} onChange={(e) => setContractorForm({ ...contractorForm, director_name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Контактное лицо</label>
                    <input value={contractorForm.contact_name} onChange={(e) => setContractorForm({ ...contractorForm, contact_name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Телефон контакта</label>
                    <input value={contractorForm.contact_phone} onChange={(e) => setContractorForm({ ...contractorForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Email контакта</label>
                    <input value={contractorForm.contact_email} onChange={(e) => setContractorForm({ ...contractorForm, contact_email: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Корп. скидка %</label>
                    <input type="number" step="0.1" min="0" max="100" value={contractorForm.discount_percent}
                      onChange={(e) => setContractorForm({ ...contractorForm, discount_percent: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                    <p className="text-xs text-gray-600 mt-1">Видно только админу</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={contractorCreateMode ? handleCreateContractor : handleUpdateContractor}
                  disabled={saving || !contractorForm.company_name || (contractorCreateMode && (!contractorForm.login || !contractorForm.password))}
                  className="px-6 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-default">
                  {saving ? "Сохраняю..." : contractorCreateMode ? "Создать" : "Сохранить"}
                </button>
                <button onClick={() => { setContractorCreateMode(false); setContractorEditMode(false); setError(""); }}
                  className="px-6 py-2.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">Отмена</button>
              </div>
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
          {tab === "users" && (
            <div>
              <h2 className="text-lg font-semibold mb-6">Пользователи</h2>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Поиск по телефону, имени, email..."
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500 w-72 mb-4"
              />
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                      <th className="text-left px-4 py-3">ID</th>
                      <th className="text-left px-4 py-3">Телефон</th>
                      <th className="text-left px-4 py-3">Имя</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Город</th>
                      <th className="text-left px-4 py-3">Роль</th>
                      <th className="text-left px-4 py-3">Соцсети</th>
                      <th className="text-left px-4 py-3">Статус</th>
                      <th className="text-left px-4 py-3">Баланс</th>
                      <th className="text-left px-4 py-3">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-800/50">
                        <td className="px-4 py-3 text-gray-500">#{u.id}</td>
                        <td className="px-4 py-3 font-mono text-gray-300 text-xs">{u.phone}</td>
                        <td className="px-4 py-3">
                          <div>{u.display_name}</div>
                          {(u.first_name || u.last_name) && (
                            <div className="text-xs text-gray-500">{u.first_name} {u.last_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{u.email || "—"}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{u.city || "—"}</td>
                        <td className="px-4 py-3">
                          {u.is_admin ? (
                            <span className="text-xs bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded-full">admin</span>
                          ) : (
                            <span className="text-xs text-gray-500">user</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {u.vk_linked && <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded">ВК</span>}
                            {u.telegram_linked && <span className="text-[10px] bg-cyan-900/40 text-cyan-300 px-1.5 py-0.5 rounded">TG</span>}
                            {u.yandex_linked && <span className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded">Я</span>}
                            {!u.vk_linked && !u.telegram_linked && !u.yandex_linked && <span className="text-gray-600">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`w-2 h-2 rounded-full inline-block mr-1 ${u.is_online ? "bg-green-400" : "bg-gray-600"}`} />
                          <span className="text-xs text-gray-400">{u.is_online ? "Online" : "Offline"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={(u.balance_kopecks ?? 0) > 0 ? "text-green-400 text-xs" : "text-gray-500 text-xs"}>{(((u.balance_kopecks ?? 0)) / 100).toLocaleString("ru")} ₽</span>
                          <button onClick={async () => { const v = prompt(`Пополнить #${u.id} на (₽):`); const r = parseFloat(v || ""); if (r > 0) { try { await adminAddUserBalance(u.id, Math.round(r * 100)); loadUsers(); } catch { /* noop */ } } }} className="ml-2 px-1.5 rounded bg-amber-600 text-black text-xs" title="Пополнить">＋</button>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString("ru") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div className="text-center py-12 text-gray-500 text-sm">Нет пользователей</div>
                )}
              </div>
            </div>
          )}


          {/* ═══ SYSTEM TAB ═══ */}
          {tab === "integrations" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Ключи интеграций. Сохраняются в БД и применяются сразу — без правки .env.</p>

              {/* Реестр моделей: ставки/сроки/расход */}
              <div className="bg-gray-900 border border-emerald-800/40 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-emerald-400 font-medium">Модели — ставки (за 1 млн токенов), сроки и расход</p>
                  <label className="flex items-center gap-2"><span className="text-[11px] text-gray-500">Валюта</span>
                    <input defaultValue={modelCur} onBlur={(e) => adminSetPricing({ currency: e.target.value }).then(loadModels)} className="w-14 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-white" /></label>
                </div>
                <div className="grid grid-cols-12 gap-2 text-[11px] text-gray-500 px-1">
                  <span className="col-span-3">Модель</span><span className="col-span-2">Провайдер</span><span>Себест./1М</span><span>Прод./1М</span><span className="col-span-2">Действует до</span><span className="col-span-2">Выручка·маржа</span><span>Джиннов</span>
                </div>
                {models.map((m) => {
                  const d = modelDrafts[m.model] || { provider: "", cost: "0", sell: "0", valid_until: "" };
                  const upd = (k: string, v: string) => setModelDrafts((prev) => ({ ...prev, [m.model]: { ...(prev[m.model] || d), [k]: v } }));
                  return (
                    <div key={m.model} className="grid grid-cols-12 gap-2 items-center text-sm">
                      <span className="col-span-3 text-gray-200 truncate" title={m.model}>{m.model}</span>
                      <input value={d.provider} onChange={(e) => upd("provider", e.target.value)} placeholder="—" className="col-span-2 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-xs" />
                      <input value={d.cost} onChange={(e) => upd("cost", e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-xs w-full" />
                      <input value={d.sell} onChange={(e) => upd("sell", e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-xs w-full" />
                      <input value={d.valid_until} onChange={(e) => upd("valid_until", e.target.value)} placeholder="ГГГГ-ММ-ДД" className="col-span-2 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-xs" />
                      <span className="col-span-2 text-xs text-gray-400">{m.revenue.toLocaleString()}/<span className={m.margin >= 0 ? "text-emerald-400" : "text-red-400"}>{m.margin.toLocaleString()}</span>{modelCur}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">{m.agents}
                        <button onClick={() => saveModel(m.model)} className="ml-1 px-2 py-0.5 rounded bg-emerald-600 text-white text-xs">✓</button>
                        {m.has_rate && <button onClick={() => adminDelPricing(m.model).then(loadModels)} className="text-gray-600 text-xs" title="Сбросить ставку">✕</button>}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  <input placeholder="новая модель (id, напр. deepseek-reasoner)" value={newModel} onChange={(e) => setNewModel(e.target.value)} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
                  <button onClick={() => { const nm = newModel.trim(); if (nm) adminSetPricing({ model: nm, cost: 0, sell: 0 }).then(() => { setNewModel(""); loadModels(); }); }} className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white">+ модель</button>
                </div>
                <p className="text-[11px] text-gray-600">Ставки — за 1 млн токенов. «default» применяется к моделям без своей ставки. ✓ сохранить · ✕ сбросить.</p>
              </div>

              <div className="bg-gray-900 border border-amber-800/40 rounded-lg p-4 space-y-3">
                <p className="text-sm text-amber-400 font-medium">Эмбеддинги (семантика / RAG)</p>
                {embConfig.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="text-sm text-gray-300 w-2/5">{c.label}</span>
                    {c.options ? (
                      <select value={embDraft[c.key] ?? c.value} onChange={async (e) => { setEmbDraft({ ...embDraft, [c.key]: e.target.value }); await adminSetEmbeddingConfig(c.key, e.target.value); loadIntegrations(); }} className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                        <option value="">— выбрать —</option>
                        {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <>
                        <input value={embDraft[c.key] ?? c.value} onChange={(e) => setEmbDraft({ ...embDraft, [c.key]: e.target.value })} placeholder="http://user:pass@host:port (пусто = без прокси)" className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                        <button onClick={async () => { await adminSetEmbeddingConfig(c.key, embDraft[c.key] ?? c.value); loadIntegrations(); }} className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-black">OK</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {integrations.map((it) => (
                <div key={it.key} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white">{it.label}</span>
                    <span className="text-[11px] text-gray-500">{it.is_set ? `задан: ${it.masked}` : "не задан"}</span>
                  </div>
                  <div className="flex gap-2">
                    <input type="password" placeholder="Новое значение" value={intDraft[it.key] || ""} onChange={(e) => setIntDraft({ ...intDraft, [it.key]: e.target.value })} className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                    <button onClick={async () => { await adminSetIntegration(it.key, intDraft[it.key] || ""); setIntDraft({ ...intDraft, [it.key]: "" }); loadIntegrations(); }} disabled={!intDraft[it.key]} className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-black disabled:opacity-40">Сохранить</button>
                  </div>
                </div>
              ))}
              {integrations.length === 0 && <p className="text-sm text-gray-500">Загрузка…</p>}
            </div>
          )}

          {tab === "system" && (
            <div>
              <h2 className="text-lg font-semibold mb-6">Система</h2>

              {/* Сервисы */}
              <h3 className="text-md font-semibold mb-4">Сервисы</h3>
              {systemInfo ? (
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {Object.entries(systemInfo.services).map(([name, info]) => (
                    <div key={name} className={`bg-gray-900 rounded-xl p-4 border ${
                      info.status === "ok" ? "border-green-800" : "border-red-800"
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${info.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="text-sm font-medium uppercase">{name}</span>
                      </div>
                      {info.status === "ok" ? (
                        <div className="text-xs text-gray-400 space-y-1">
                          {info.memory_used && <p>Память: <span className="text-gray-200">{info.memory_used}</span></p>}
                          {info.collections !== undefined && <p>Коллекций: <span className="text-gray-200">{info.collections}</span></p>}
                          {info.collection_names && info.collection_names.length > 0 && (
                            <p className="text-[10px] text-gray-500">{info.collection_names.join(", ")}</p>
                          )}
                          {info.total_users !== undefined && <p>Пользователей: <span className="text-gray-200">{info.total_users}</span></p>}
                          {info.provider && <p>Провайдер: <span className="text-gray-200">{info.provider}</span></p>}
                          {info.model && <p>Модель: <span className="text-gray-200">{info.model}</span></p>}
                          {info.key_set !== undefined && <p>Ключ: <span className={info.key_set ? "text-green-400" : "text-red-400"}>{info.key_set ? "задан" : "не задан"}</span></p>}
                          {info.debug_mode !== undefined && <p>Debug: <span className={info.debug_mode ? "text-amber-400" : "text-green-400"}>{info.debug_mode ? "ВКЛ" : "ВЫКЛ"}</span></p>}
                        </div>
                      ) : (
                        <p className="text-xs text-red-400">{info.error || "Ошибка подключения"}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 mb-8">Загрузка...</p>
              )}

              {/* LLM Провайдеры */}
              <h3 className="text-md font-semibold mb-4">LLM Провайдеры</h3>
              {systemInfo ? (
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {Object.entries(systemInfo.llm_providers).map(([name, info]) => (
                    <div key={name} className={`bg-gray-900 rounded-xl p-4 border ${
                      info.connected ? "border-green-800" : "border-gray-800"
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${info.connected ? "bg-green-500" : "bg-gray-600"}`} />
                        <span className="text-sm font-medium">{name.toUpperCase()}</span>
                        {systemInfo.default_llm_provider === name && (
                          <span className="text-[10px] bg-amber-900/50 text-amber-300 px-1.5 py-0.5 rounded">default</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-1">Модель: <span className="text-gray-300">{info.model}</span></p>
                      <p className="text-xs text-gray-500">Ключ: <span className={`font-mono ${info.connected ? "text-green-400" : "text-gray-600"}`}>
                        {info.key || "не задан"}
                      </span></p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 mb-8">Загрузка...</p>
              )}

{/* Embedding настройки */}
              <h3 className="text-md font-semibold mb-4">Embedding (RAG)</h3>
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-8">
                <p className="text-xs text-gray-500 mb-4">
                  Embedding нужен для RAG — базы знаний агентов. Текст превращается в вектор и ищется по смыслу.
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Провайдер</label>
                    <select value={embeddingProvider} onChange={(e) => setEmbeddingProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                      <option value="local">Local (fastembed) — бесплатно, рекомендуемый</option>
                      <option value="jina">Jina AI — 1M токенов бесплатно</option>
                      <option value="gemini">Gemini — бесплатно (заблокирован из РФ)</option>
                      <option value="openai">OpenAI — платный</option>
                    </select>
                    <p className="text-[10px] text-gray-600 mt-1">
                      {embeddingProvider === "local" && "Работает локально на сервере, без API-ключей. Нужна установка fastembed."}
                      {embeddingProvider === "jina" && "Заблокирован из РФ (HTTP 451). Нужен VPN или proxy."}
                      {embeddingProvider === "gemini" && "Заблокирован из РФ (HTTP 400). Нужен VPN."}
                      {embeddingProvider === "openai" && "Требует API-ключ OpenAI."}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                      Jina API Key {systemSettings?.jina_api_key_set && <span className="text-green-400">(задан: {systemSettings.jina_api_key})</span>}
                    </label>
                    <input type="password" value={jinaApiKey} onChange={(e) => setJinaApiKey(e.target.value)}
                      placeholder={systemSettings?.jina_api_key_set ? "Оставьте пустым чтобы не менять" : "jina_xxxxx..."}
                      className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                    <p className="text-[10px] text-gray-600 mt-1">Получить: <span className="text-gray-400">jina.ai → API Keys</span></p>
                  </div>
                </div>
                <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                  <p className="text-xs text-amber-400 font-medium mb-1">Roadmap RAG:</p>
                  <p className="text-[11px] text-gray-500">Этап 2 — после запуска сервиса. Установить fastembed (локальные embeddings, бесплатно навсегда), RAG для каждого агента, авто-парсинг источников.</p>
                </div>
              </div>

              {/* SMS настройки */}
              <h3 className="text-md font-semibold mb-4">SMS настройки</h3>
              {systemSettings ? (
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">SMS Провайдер</label>
                      <select value={smsProvider} onChange={(e) => setSmsProvider(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                        <option value="sms_ru">sms.ru</option>
                        <option value="smsc">smsc.ru</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Debug режим</label>
                      <button onClick={() => setDebugMode(!debugMode)}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          debugMode ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-green-500/20 border-green-500 text-green-400"
                        } border`}>
                        {debugMode ? "DEBUG ВКЛ (СМС не отправляются)" : "PRODUCTION (СМС реальные)"}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Фон-шейдеры «Аврора» (Paper Shaders)</label>
                    <button onClick={() => setShaderBg(!shaderBg)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        shaderBg ? "bg-green-500/20 border-green-500 text-green-400" : "bg-red-500/20 border-red-500 text-red-400"
                      } border`}>
                      {shaderBg ? "ВКЛ — доступны пользователям" : "ВЫКЛ — скрыты, откат на обычный фон"}
                    </button>
                    <p className="text-[10px] text-gray-500 mt-1">Глобальный рубильник анимированных WebGL-фонов. Выключите, если библиотека Paper станет недоступна — пресеты «Аврора» исчезнут, текущие фоны откатятся автоматически.</p>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Порог релевантности RAG (score): {ragMinScore.toFixed(2)}</label>
                    <input type="range" min="0" max="0.95" step="0.05" value={ragMinScore}
                      onChange={(e) => setRagMinScore(parseFloat(e.target.value))}
                      className="w-full" style={{ accentColor: "#d4a843" }} />
                    <p className="text-[10px] text-gray-500 mt-1">Чанки знаний со score ниже порога не подмешиваются в ответ джинна. Выше — строже (меньше шума, но можно потерять полезное); ниже — больше контекста. 0 — без фильтра. Рекомендуется 0.55–0.65.</p>
                  </div>

                  {smsProvider === "sms_ru" && (
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                        SMS.ru API ключ {systemSettings.sms_ru_api_key_set && <span className="text-green-400">(задан: {systemSettings.sms_ru_api_key})</span>}
                      </label>
                      <input type="password" value={smsRuApiKey} onChange={(e) => setSmsRuApiKey(e.target.value)}
                        placeholder={systemSettings.sms_ru_api_key_set ? "Оставьте пустым чтобы не менять" : "Вставьте API-ключ"}
                        className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                    </div>
                  )}

                  {smsProvider === "smsc" && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">SMSC Логин</label>
                        <input type="text" value={smscLogin} onChange={(e) => setSmscLogin(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">SMSC Пароль</label>
                        <input type="password" value={smscPassword} onChange={(e) => setSmscPassword(e.target.value)}
                          placeholder={systemSettings.smsc_password_set ? "Оставьте пустым" : "Пароль SMSC"}
                          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                      </div>
                    </div>
                  )}

                  <button onClick={handleSystemSave} disabled={systemSaving}
                    className="px-5 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50">
                    {systemSaving ? "Сохраняю..." : "Сохранить настройки"}
                  </button>
                </div>
              ) : (
                <p className="text-gray-500">Загрузка...</p>
              )}
            </div>
          )}

          {/* ═══ STATS TAB ═══ */}
          {tab === "cities" && (
            <div>
              <h2 className="text-lg font-semibold mb-6">Города</h2>
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6 max-w-2xl">
                <div className="text-sm text-gray-400 mb-3">Добавить город</div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <input placeholder="Название" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} className="bg-gray-800 rounded px-2 py-1.5 text-sm text-white col-span-2" />
                  <input placeholder="slug" value={newCity.slug} onChange={(e) => setNewCity({ ...newCity, slug: e.target.value })} className="bg-gray-800 rounded px-2 py-1.5 text-sm text-white" />
                  <div className="grid grid-cols-2 gap-1">
                    <input placeholder="lat" value={newCity.lat} onChange={(e) => setNewCity({ ...newCity, lat: e.target.value })} className="bg-gray-800 rounded px-2 py-1.5 text-sm text-white" />
                    <input placeholder="lng" value={newCity.lng} onChange={(e) => setNewCity({ ...newCity, lng: e.target.value })} className="bg-gray-800 rounded px-2 py-1.5 text-sm text-white" />
                  </div>
                </div>
                <button onClick={async () => { if (!newCity.name || !newCity.slug) return; try { await createCity({ name: newCity.name, slug: newCity.slug, lat: newCity.lat ? Number(newCity.lat) : undefined, lng: newCity.lng ? Number(newCity.lng) : undefined }); setNewCity({ name: "", slug: "", lat: "", lng: "" }); loadCities(); } catch {} }} className="bg-amber-500 text-black rounded-lg px-4 py-1.5 text-sm font-medium">Добавить</button>
              </div>
              <div className="space-y-2 max-w-2xl">
                {citiesList.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-2.5 border border-gray-800">
                    <span className="text-lg">📍</span>
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{c.name}</div>
                      <div className="text-gray-500 text-xs">{c.slug} · {c.lat ?? "—"}, {c.lng ?? "—"}</div>
                    </div>
                    <button onClick={async () => { try { await updateCity(c.id, { is_active: !c.is_active }); loadCities(); } catch {} }} className={`px-3 py-1 rounded text-xs font-medium ${c.is_active ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-500"}`}>{c.is_active ? "активен" : "скрыт"}</button>
                  </div>
                ))}
                {citiesList.length === 0 && <div className="text-gray-500 text-sm">Городов пока нет</div>}
              </div>
            </div>
          )}

          {tab === "stats" && (
            <div>
              <h2 className="text-lg font-semibold mb-6">Статистика</h2>
              {stats ? (
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Агентов всего", value: stats.agents.total, color: "text-white" },
                    { label: "Ядро", value: stats.agents.core, color: "text-red-300" },
                    { label: "Системных", value: stats.agents.system, color: "text-purple-300" },
                    { label: "Бизнес", value: stats.agents.business, color: "text-blue-300" },
                    { label: "Жителей", value: stats.agents.citizen, color: "text-green-300" },
                    { label: "Специалистов", value: stats.agents.specialist, color: "text-cyan-300" },
                    { label: "Пользователей", value: stats.users.total, color: "text-amber-300" },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-900 rounded-xl p-5 border border-gray-800 text-center">
                      <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{s.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Загрузка...</p>
              )}

              {/* Расход LLM */}
              {usage && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Расход LLM <span className="text-xs text-gray-500 font-normal">(оценка токенов; ставки — во вкладке «Интеграции»)</span></h3>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    {[
                      { label: "Вызовов", value: usage.total_calls.toLocaleString(), color: "text-white" },
                      { label: "Всего токенов", value: usage.total_tokens.toLocaleString(), color: "text-amber-300" },
                      { label: "Оплачиваемых", value: usage.billable_tokens.toLocaleString(), color: "text-blue-300" },
                      { label: "Бесплатных", value: usage.free_tokens.toLocaleString(), color: "text-gray-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-gray-900 rounded-xl p-5 border border-gray-800 text-center">
                        <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {[
                      { label: "Выручка", value: `${usage.revenue.toLocaleString()} ${usage.currency}`, color: "text-emerald-300" },
                      { label: "Себестоимость", value: `${usage.cost.toLocaleString()} ${usage.currency}`, color: "text-red-300" },
                      { label: "Маржа", value: `${usage.margin.toLocaleString()} ${usage.currency}`, color: usage.margin >= 0 ? "text-amber-300" : "text-red-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-gray-900 rounded-xl p-5 border border-gray-800 text-center">
                        <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {[
                      { label: "💼 Контрагенты", t: usage.by_payer_type.contractor },
                      { label: "👤 Пользователи (платно)", t: usage.by_payer_type.user },
                      { label: "🆓 Бесплатно (платформа)", t: usage.by_payer_type.free },
                    ].map((x) => (
                      <div key={x.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
                        <div className="text-lg font-bold text-white">{x.t.revenue.toLocaleString()} {usage.currency}</div>
                        <div className="text-[11px] text-gray-500 mt-1">{x.label}</div>
                        <div className="text-[11px] text-gray-600">{x.t.tokens.toLocaleString()} тк · себест. {x.t.cost.toLocaleString()}{usage.currency}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <div className="text-sm text-gray-400 mb-2">По моделям (выручка/себест./маржа)</div>
                      {usage.by_model.length ? usage.by_model.map((m) => (
                        <div key={m.model} className="flex justify-between text-sm py-1 border-b border-gray-800/50">
                          <span className="text-gray-300 truncate mr-2">{m.model}</span>
                          <span className="text-gray-500 shrink-0">{m.revenue.toLocaleString()}/{m.cost.toLocaleString()}/<span className={m.margin >= 0 ? "text-emerald-400" : "text-red-400"}>{m.margin.toLocaleString()}</span></span>
                        </div>
                      )) : <div className="text-gray-600 text-sm">пусто</div>}
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <div className="text-sm text-gray-400 mb-2">Счёт контрагентам (выручка · маржа)</div>
                      {usage.contractors.length ? usage.contractors.map((u) => (
                        <div key={u.payer_id ?? "none"} className="flex justify-between text-sm py-1 border-b border-gray-800/50">
                          <span className="text-gray-300">контрагент #{u.payer_id ?? "—"}</span>
                          <span className="shrink-0 text-gray-500">{u.revenue.toLocaleString()}{usage.currency} · <span className={u.margin >= 0 ? "text-emerald-400" : "text-red-400"}>{u.margin.toLocaleString()}</span></span>
                        </div>
                      )) : <div className="text-gray-600 text-sm">пусто</div>}
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <div className="text-sm text-gray-400 mb-2">Счёт пользователям</div>
                      {usage.paying_users.length ? usage.paying_users.map((u) => (
                        <div key={u.payer_id ?? "none"} className="flex justify-between text-sm py-1 border-b border-gray-800/50">
                          <span className="text-gray-300">user #{u.payer_id ?? "—"}</span>
                          <span className="text-emerald-400 shrink-0">{u.revenue.toLocaleString()}{usage.currency}</span>
                        </div>
                      )) : <div className="text-gray-600 text-sm">пусто</div>}
                    </div>
                  </div>
                </div>
              )}

                            {/* LLM Статус */}
              <h3 className="text-lg font-semibold mt-8 mb-4">LLM Провайдеры</h3>
              {llmStatus ? (
                <div>
                  {/* Активный */}
                  <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-white">Активный провайдер: <span className="text-amber-400">{llmStatus.active_provider.toUpperCase()}</span></span>
                    </div>
                    <p className="text-xs text-gray-400">Активная модель: <span className="text-gray-200">{llmStatus.active_model}</span></p>
                  </div>

                  {/* Все провайдеры */}
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(llmStatus.providers).map(([name, info]) => (
                      <div key={name} className={`bg-gray-900 rounded-xl p-4 border ${
                        info.connected ? "border-green-800" : "border-gray-800"
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${info.connected ? "bg-green-500" : "bg-gray-600"}`} />
                          <span className="text-sm font-medium">{name.toUpperCase()}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">Модель: <span className="text-gray-300">{info.model}</span></p>
                        <p className="text-xs text-gray-500">Ключ: <span className={`font-mono ${info.connected ? "text-green-400" : "text-gray-600"}`}>
                          {info.key || "не задан"}
                        </span></p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Загрузка LLM статуса...</p>
              )}

              {/* Системные настройки */}
              <h3 className="text-lg font-semibold mt-8 mb-4">Системные настройки</h3>
              {systemSettings ? (
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">SMS Провайдер</label>
                      <select value={smsProvider} onChange={(e) => setSmsProvider(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500">
                        <option value="sms_ru">sms.ru</option>
                        <option value="smsc">smsc.ru</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Debug режим</label>
                      <button onClick={() => setDebugMode(!debugMode)}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          debugMode ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-green-500/20 border-green-500 text-green-400"
                        } border`}>
                        {debugMode ? "DEBUG ВКЛ (СМС не отправляются)" : "PRODUCTION (СМС реальные)"}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Фон-шейдеры «Аврора» (Paper Shaders)</label>
                    <button onClick={() => setShaderBg(!shaderBg)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        shaderBg ? "bg-green-500/20 border-green-500 text-green-400" : "bg-red-500/20 border-red-500 text-red-400"
                      } border`}>
                      {shaderBg ? "ВКЛ — доступны пользователям" : "ВЫКЛ — скрыты, откат на обычный фон"}
                    </button>
                    <p className="text-[10px] text-gray-500 mt-1">Глобальный рубильник анимированных WebGL-фонов. Выключите, если библиотека Paper станет недоступна — пресеты «Аврора» исчезнут, текущие фоны откатятся автоматически.</p>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Порог релевантности RAG (score): {ragMinScore.toFixed(2)}</label>
                    <input type="range" min="0" max="0.95" step="0.05" value={ragMinScore}
                      onChange={(e) => setRagMinScore(parseFloat(e.target.value))}
                      className="w-full" style={{ accentColor: "#d4a843" }} />
                    <p className="text-[10px] text-gray-500 mt-1">Чанки знаний со score ниже порога не подмешиваются в ответ джинна. Выше — строже (меньше шума, но можно потерять полезное); ниже — больше контекста. 0 — без фильтра. Рекомендуется 0.55–0.65.</p>
                  </div>

                  {smsProvider === "sms_ru" && (
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                        SMS.ru API ключ {systemSettings.sms_ru_api_key_set && <span className="text-green-400">(задан: {systemSettings.sms_ru_api_key})</span>}
                      </label>
                      <input type="password" value={smsRuApiKey} onChange={(e) => setSmsRuApiKey(e.target.value)}
                        placeholder={systemSettings.sms_ru_api_key_set ? "Оставьте пустым чтобы не менять" : "Вставьте API-ключ с sms.ru/my/settings"}
                        className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                    </div>
                  )}

                  {smsProvider === "smsc" && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">SMSC Логин</label>
                        <input type="text" value={smscLogin} onChange={(e) => setSmscLogin(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                          SMSC Пароль {systemSettings.smsc_password_set && <span className="text-green-400">(задан)</span>}
                        </label>
                        <input type="password" value={smscPassword} onChange={(e) => setSmscPassword(e.target.value)}
                          placeholder={systemSettings.smsc_password_set ? "Оставьте пустым" : "Пароль SMSC"}
                          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500" />
                      </div>
                    </div>
                  )}

                  <button onClick={handleSystemSave} disabled={systemSaving}
                    className="px-5 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50">
                    {systemSaving ? "Сохраняю..." : "Сохранить настройки"}
                  </button>
                </div>
              ) : (
                <p className="text-gray-500">Загрузка...</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
