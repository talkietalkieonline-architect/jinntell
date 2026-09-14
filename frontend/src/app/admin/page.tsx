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
  adminGetMonitor,
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
  type MonitorData,
  type ContractorOut,
  type ContractorCreateData,
  getAllCities,
  createCity,
  updateCity,
  adminListCampaigns,
  adminSaveCampaign,
  adminDelCampaign,
  type SponsorCampaignItem,
  councilCandidates,
  councilConvene,
  councilList,
  councilGet,
  type CouncilCandidate,
  type CouncilSessionOut,
  adminListRequests,
  adminTriageRequest,
  adminAskInternal,
  adminPatchRequest,
  adminCreateRequest,
  type AssistantRequestItem,
  type TargetInfo,
  adminGetUsage,
  adminGetModels,
  adminSetPricing,
  adminDelPricing,
  adminAddUserBalance,
  type UsageSummary,
  type ModelInfo,
  type PriceOverride,
  getActivityLog,
  type ActivityItem,
  adminGetGlobalBlocklist,
  adminSetGlobalBlocklist,
  adminGetBalances,
  adminGetHardware,
  adminSetHardware,
  type BalanceItem,
  type HardwareItem,
  adminWaitlistUsers,
  adminActivateWaitlistUser,
  adminWaitlistSettings,
  type WaitlistState,
  adminListTariffs,
  adminCreateTariff,
  adminUpdateTariff,
  adminDeleteTariff,
  adminSetUserTariff,
  type TariffOut,
  type TariffIn,
  adminListDocs,
  adminSaveDocs,
  type AdminDoc,
  adminGetCatalog,
  adminSaveCatalog,
  type CatalogItem,
  adminGetTokenConfig,
  adminSaveTokenConfig,
  type TokenConfig,
} from "@/services/api";
import AgentSettingsPanel from "@/components/admin/AgentSettingsPanel";

/* ══════════════════════════════════════════════════════════════
   Админ-панель JinnTell
   Управление агентами, пользователями, статистика
   ══════════════════════════════════════════════════════════════ */

type Tab = "agents" | "core_agents" | "contractors" | "users" | "system" | "stats" | "integrations" | "cities" | "activity" | "dispatch" | "waitlist" | "tariffs" | "docs" | "tokens" | "catalog" | "requests" | "campaigns" | "council";

const CATALOG_CATEGORIES = ["интерфейс", "голос", "одежда", "аксессуар"];
const CATALOG_TARGETS = ["помощник", "персонаж", "оба"];

const EMPTY_TARIFF: TariffIn = { code: "", name: "", description: "", llm_model: "deepseek-chat", msgs_per_day: 0, jinn_calls_per_day: 0, context_limit: 0, gates: {}, is_default: false, sort: 0 };

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

  // Тарифы
  const [tariffs, setTariffs] = useState<TariffOut[]>([]);
  const [tariffForm, setTariffForm] = useState<TariffIn | null>(null);
  const [tariffEditId, setTariffEditId] = useState<number | null>(null);
  const [tariffBusy, setTariffBusy] = useState(false);

  // Доки
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [docForm, setDocForm] = useState<AdminDoc>({ title: "", section: "", url: "", status: "" });

  // Токены
  const [tokenCfg, setTokenCfg] = useState<TokenConfig | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  // Каталог
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catForm, setCatForm] = useState<CatalogItem>({ category: "интерфейс", name: "", price_tokens: 0, target: "оба", active: true });

  // #4 Обращения
  const [requests, setRequests] = useState<AssistantRequestItem[]>([]);
  const [reqCounts, setReqCounts] = useState<Record<string, number>>({});
  const [reqTargets, setReqTargets] = useState<Record<string, TargetInfo>>({});
  const [reqFilter, setReqFilter] = useState("");
  const [reqSel, setReqSel] = useState<AssistantRequestItem | null>(null);
  const [reqAsk, setReqAsk] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [reqNewForm, setReqNewForm] = useState<{ task_text: string; reason: string } | null>(null);
  const loadRequests = useCallback(async () => {
    try { const r = await adminListRequests(reqFilter); setRequests(r.requests); setReqCounts(r.counts); setReqTargets(r.targets); } catch { /* noop */ }
  }, [reqFilter]);

  // #5 Спонсорские кампании
  const [campaigns, setCampaigns] = useState<SponsorCampaignItem[]>([]);
  const [campForm, setCampForm] = useState<{ sponsor_name: string; agent_id: string; bonus_tokens: string; budget_rub: string; message: string; active: boolean }>({ sponsor_name: "", agent_id: "", bonus_tokens: "1000", budget_rub: "10000", message: "", active: true });
  const loadCampaigns = useCallback(async () => {
    try { const r = await adminListCampaigns(); setCampaigns(r.campaigns); } catch { /* noop */ }
  }, []);

  // #7 Совещательная комната
  const [councilCands, setCouncilCands] = useState<CouncilCandidate[]>([]);   // внутренние core-джинны
  const [cityPool, setCityPool] = useState<CouncilCandidate[]>([]);            // подключённые из Города
  const [cityResults, setCityResults] = useState<CouncilCandidate[]>([]);      // результаты поиска Города
  const [councilPick, setCouncilPick] = useState<number[]>([]);                // кто в разговоре
  const [councilTopic, setCouncilTopic] = useState("");
  const [councilQuery, setCouncilQuery] = useState("");
  const [councilBusy, setCouncilBusy] = useState(false);
  const [councilResult, setCouncilResult] = useState<CouncilSessionOut | null>(null);
  const [councilHistory, setCouncilHistory] = useState<CouncilSessionOut[]>([]);
  const loadCouncilCands = useCallback(async () => {
    try { const r = await councilCandidates("core"); setCouncilCands(r.candidates); setCouncilPick((p) => p.length ? p : r.candidates.map((c) => c.id)); } catch { /* noop */ }
  }, []);
  const loadCouncilHistory = useCallback(async () => {
    try { const r = await councilList(); setCouncilHistory(r.sessions); } catch { /* noop */ }
  }, []);
  const searchCityForCouncil = async () => {
    if (councilQuery.trim().length < 2) return;
    try { const r = await councilCandidates("city", councilQuery.trim()); setCityResults(r.candidates); } catch { /* noop */ }
  };
  const addCityToCouncil = (c: CouncilCandidate) => {
    setCityPool((p) => p.some((x) => x.id === c.id) ? p : [...p, c]);
    setCouncilPick((p) => p.includes(c.id) ? p : [...p, c.id]);
  };
  const toggleCouncilPick = (id: number) => setCouncilPick((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const runCouncil = async () => {
    if (!councilTopic.trim() || councilPick.length === 0) return;
    const cityIds = new Set(cityPool.map((c) => c.id));
    const mode = councilPick.some((id) => cityIds.has(id)) ? "city" : "core";
    setCouncilBusy(true); setCouncilResult(null);
    try { const r = await councilConvene(councilTopic.trim(), mode, councilPick); setCouncilResult(r); await loadCouncilHistory(); }
    catch (e) { alert(e instanceof Error ? e.message : "Не удалось собрать совещание"); }
    finally { setCouncilBusy(false); }
  };
  const openCouncilSession = async (id: number) => {
    try { setCouncilResult(await councilGet(id)); } catch { /* noop */ }
  };
  const saveCampaign = async () => {
    try {
      await adminSaveCampaign({
        sponsor_name: campForm.sponsor_name, agent_id: campForm.agent_id ? Number(campForm.agent_id) : null,
        bonus_tokens: Number(campForm.bonus_tokens) || 0, budget_rub: Number(campForm.budget_rub) || 0,
        message: campForm.message, active: campForm.active,
      });
      setCampForm({ sponsor_name: "", agent_id: "", bonus_tokens: "1000", budget_rub: "10000", message: "", active: true });
      await loadCampaigns();
    } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
  };

  // Диспетчерская
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [balLoading, setBalLoading] = useState(false);
  const [hardware, setHardware] = useState<HardwareItem[]>([]);
  const [hwSaving, setHwSaving] = useState(false);

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
  const [modelDrafts, setModelDrafts] = useState<Record<string, { provider: string; cost_in: string; cost_out: string; sell_in: string; sell_out: string; valid_until: string }>>({});
  const [newModel, setNewModel] = useState("");
  const [bizMarkup, setBizMarkup] = useState("1");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceOverride>>({});
  const [ovKey, setOvKey] = useState("");
  const [ovMult, setOvMult] = useState("");
  const [providerKeys, setProviderKeys] = useState<Record<string, boolean>>({});
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [mkKey, setMkKey] = useState("");
  const [hubKey, setHubKey] = useState<Record<string, string>>({});
  const HUBS = new Set(["openrouter", "orcarouter", "omnirouter"]); // хабы моделей = второстепенный маршрут (тест/фри-токены)
  const isHub = (short: string) => HUBS.has(short);
  const providerOf = (hint: string): [string, string] => {
    const s = (hint || "").toLowerCase();
    if (s.includes("deepseek")) return ["deepseek", "DEEPSEEK_API_KEY"];
    if (s.includes("orcarouter")) return ["orcarouter", "ORCAROUTER_API_KEY"];
    if (s.includes("omnirouter")) return ["omnirouter", "OMNIROUTER_API_KEY"];
    if (s.includes("openrouter")) return ["openrouter", "OPENROUTER_API_KEY"];
    if (s.includes("gemini")) return ["gemini", "GEMINI_API_KEY"];
    if (s.includes("groq")) return ["groq", "GROQ_API_KEY"];
    if (s.includes("claude") || s.includes("anthropic")) return ["anthropic", "ANTHROPIC_API_KEY"];
    if (s.includes("kimi") || s.includes("moonshot")) return ["moonshot", "MOONSHOT_API_KEY"];
    if (s.includes("minimax")) return ["minimax", "MINIMAX_API_KEY"];
    if (s.includes("qwen") || s.includes("dashscope")) return ["dashscope", "DASHSCOPE_API_KEY"];
    if (s.includes("glm") || s.includes("zhipu") || s.includes("z.ai") || s.includes("zai")) return ["zai", "ZAI_API_KEY"];
    if (s.includes("gpt") || s.includes("openai") || s.startsWith("o1") || s.startsWith("o3")) return ["openai", "OPENAI_API_KEY"];
    return ["", ""];
  };
  const loadModels = async () => {
    try {
      const r = await adminGetModels();
      setModels(r.models); setModelCur(r.currency);
      setBizMarkup(r.biz_markup || "1"); setPriceOverrides(r.overrides || {}); setProviderKeys(r.provider_keys || {});
      setModelDrafts(Object.fromEntries(r.models.map((m) => [m.model, { provider: m.provider, cost_in: String(m.cost_in), cost_out: String(m.cost_out), sell_in: String(m.sell_in), sell_out: String(m.sell_out), valid_until: m.valid_until }])));
    } catch { /* noop */ }
  };
  const saveModel = async (model: string) => {
    const d = modelDrafts[model]; if (!d) return;
    try { await adminSetPricing({ model, provider: d.provider, cost_in: Number(d.cost_in) || 0, cost_out: Number(d.cost_out) || 0, sell_in: Number(d.sell_in) || 0, sell_out: Number(d.sell_out) || 0, valid_until: d.valid_until }); await loadModels(); const u = await adminGetUsage().catch(() => null); setUsage(u); } catch { /* noop */ }
  };
  const saveBizMarkup = async (v: string) => { try { await adminSetPricing({ biz_markup: Number(v) || 1 }); await loadModels(); } catch { /* noop */ } };
  const saveOverride = async () => { const k = ovKey.trim(); if (!k) return; try { await adminSetPricing({ override_key: k, free: ovMult.trim() === "0", mult: ovMult.trim() === "" ? undefined : Number(ovMult) }); setOvKey(""); setOvMult(""); await loadModels(); } catch { /* noop */ } };
  const delOverride = async (k: string) => { try { await adminSetPricing({ override_key: k, override_delete: true }); await loadModels(); } catch { /* noop */ } };
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
  const [guardian, setGuardian] = useState(true);
  const [systemSaving, setSystemSaving] = useState(false);
  const [embeddingProvider, setEmbeddingProvider] = useState("jina");
  const [jinaApiKey, setJinaApiKey] = useState("");


  // Core agents
  const [coreAgents, setCoreAgents] = useState<AgentDetailOut[]>([]);
  const [selectedCoreAgent, setSelectedCoreAgent] = useState<AgentDetailOut | null>(null);
  const [coreSubTab, setCoreSubTab] = useState<"settings" | "requests">("settings");

  // System info
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [globalBlock, setGlobalBlock] = useState("");
  const [blockSaved, setBlockSaved] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityActor, setActivityActor] = useState<string>("");
  const [activityHours, setActivityHours] = useState<number>(24);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [intDraft, setIntDraft] = useState<Record<string, string>>({});
  const [embConfig, setEmbConfig] = useState<EmbeddingConfigItem[]>([]);
  const [embDraft, setEmbDraft] = useState<Record<string, string>>({});
  const [wl, setWl] = useState<WaitlistState | null>(null);
  const [wlLimitDraft, setWlLimitDraft] = useState<string>("");


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
      const [sysInfo, mon] = await Promise.all([
        adminGetSystemInfo(),
        adminGetMonitor().catch(() => null),
      ]);
      setSystemInfo(sysInfo);
      setMonitor(mon);
      try { setGlobalBlock((await adminGetGlobalBlocklist()).raw); } catch { /* noop */ }
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
      setGuardian(sysData.guardian_enabled ?? true);
      setEmbeddingProvider(sysData.embedding_provider || "jina");
    } catch {}
  }, []);

  const loadCities = useCallback(async () => {
    try { setCitiesList(await getAllCities()); } catch {}
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const res = await getActivityLog({ actor: activityActor || undefined, hours: activityHours, limit: 300 });
      setActivity(res.items);
    } catch {}
  }, [activityActor, activityHours]);

  const loadIntegrations = useCallback(async () => {
    try { setIntegrations(await adminGetIntegrations()); } catch {}
    try { setEmbConfig(await adminGetEmbeddingConfig()); } catch {}
  }, []);
  const loadWaitlist = useCallback(async () => {
    try { const w = await adminWaitlistUsers(); setWl(w); setWlLimitDraft(String(w.limit)); } catch {}
  }, []);
  const loadTariffs = useCallback(async () => {
    try { setTariffs(await adminListTariffs()); } catch {}
  }, []);
  const saveTariff = useCallback(async () => {
    if (!tariffForm) return;
    setTariffBusy(true);
    try {
      if (tariffEditId != null) await adminUpdateTariff(tariffEditId, tariffForm);
      else await adminCreateTariff(tariffForm);
      setTariffForm(null); setTariffEditId(null);
      setTariffs(await adminListTariffs());
    } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
    setTariffBusy(false);
  }, [tariffForm, tariffEditId]);
  const removeTariff = useCallback(async (id: number) => {
    if (!confirm("Удалить тариф?")) return;
    try { await adminDeleteTariff(id); setTariffs(await adminListTariffs()); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
  }, []);
  const loadDocs = useCallback(async () => {
    try { setDocs(await adminListDocs()); } catch {}
  }, []);
  const addDoc = useCallback(async () => {
    if (!docForm.title || !docForm.url) return;
    const next = [...docs, { ...docForm }];
    try { await adminSaveDocs(next); setDocs(next); setDocForm({ title: "", section: "", url: "", status: "" }); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
  }, [docs, docForm]);
  const removeDoc = useCallback(async (idx: number) => {
    const next = docs.filter((_, i) => i !== idx);
    try { await adminSaveDocs(next); setDocs(next); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
  }, [docs]);
  const loadTokenConfig = useCallback(async () => {
    try { const c = await adminGetTokenConfig(); setTokenCfg({ packs: c.packs || [], gifts: c.gifts || {}, note: c.note || "" }); } catch {}
  }, []);
  const saveTokenConfig = useCallback(async () => {
    if (!tokenCfg) return;
    setTokenBusy(true);
    try { await adminSaveTokenConfig(tokenCfg); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
    setTokenBusy(false);
  }, [tokenCfg]);
  const loadCatalog = useCallback(async () => {
    try { setCatalog(await adminGetCatalog()); } catch {}
  }, []);
  const addCatItem = useCallback(async () => {
    if (!catForm.name) return;
    const next = [...catalog, { ...catForm }];
    try { await adminSaveCatalog(next); setCatalog(next); setCatForm({ category: catForm.category, name: "", price_tokens: 0, target: catForm.target, active: true }); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
  }, [catalog, catForm]);
  const removeCatItem = useCallback(async (idx: number) => {
    const next = catalog.filter((_, i) => i !== idx);
    try { await adminSaveCatalog(next); setCatalog(next); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); }
  }, [catalog]);

  const loadDispatch = useCallback(async () => {
    setBalLoading(true);
    try { setBalances((await adminGetBalances()).balances); } catch {}
    setBalLoading(false);
    try { setHardware((await adminGetHardware()).items); } catch {}
  }, []);
  const saveHardware = useCallback(async (items: HardwareItem[]) => {
    setHwSaving(true);
    try { await adminSetHardware(items); setHardware(items); } catch {}
    setHwSaving(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      if (tab === "agents") await loadAgents();
      if (tab === "core_agents") await loadCoreAgents();
      if (tab === "contractors") await loadContractors();
      if (tab === "users") { await loadUsers(); await loadTariffs(); }
      if (tab === "system") await loadSystemInfo();
      if (tab === "stats") await loadStats();
      if (tab === "integrations") { await loadIntegrations(); await loadModels(); }
      if (tab === "cities") await loadCities();
      if (tab === "activity") await loadActivity();
      if (tab === "dispatch") await loadDispatch();
      if (tab === "waitlist") await loadWaitlist();
      if (tab === "tariffs") await loadTariffs();
      if (tab === "docs") await loadDocs();
      if (tab === "tokens") await loadTokenConfig();
      if (tab === "catalog") await loadCatalog();
      if (tab === "requests") await loadRequests();
      if (tab === "campaigns") await loadCampaigns();
      if (tab === "council") { await loadCouncilCands(); await loadCouncilHistory(); }
    };
    load();
  }, [tab, isAdmin, loadAgents, loadCoreAgents, loadContractors, loadUsers, loadSystemInfo, loadStats, loadIntegrations, loadDispatch, loadTariffs, loadDocs, loadTokenConfig, loadCatalog, loadRequests, loadCampaigns, loadCouncilCands, loadCouncilHistory]);

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
        guardian_enabled: guardian,
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
            { id: "dispatch" as Tab, label: "Диспетчерская", icon: "🎛️" },
            { id: "users" as Tab, label: "Пользователи", icon: "👥" },
            { id: "system" as Tab, label: "Система", icon: "🖥️" },
            { id: "stats" as Tab, label: "Статистика", icon: "📊" },
            { id: "cities" as Tab, label: "Города", icon: "📍" },
            { id: "activity" as Tab, label: "Журнал", icon: "📜" },
            { id: "integrations" as Tab, label: "Интеграции", icon: "🔌" },
            { id: "waitlist" as Tab, label: "Лист ожидания", icon: "🕐" },
            { id: "requests" as Tab, label: `Обращения${reqCounts.new ? ` (${reqCounts.new})` : ""}`, icon: "🆘" },
            { id: "campaigns" as Tab, label: "Спонсоры", icon: "🎁" },
            { id: "council" as Tab, label: "Совещательная", icon: "🏛" },
            { id: "tokens" as Tab, label: "Токены", icon: "🪙" },
            { id: "catalog" as Tab, label: "Каталог", icon: "🛍" },
            { id: "tariffs" as Tab, label: "Бизнес-планы", icon: "💳" },
            { id: "docs" as Tab, label: "Доки", icon: "📄" },
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
                    onClick={() => { setSelectedCoreAgent(agent); setCoreSubTab("settings"); }}
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
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setCoreSubTab("settings")} className={`px-3 py-1.5 rounded-lg text-sm ${coreSubTab === "settings" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}>⚙️ Настройки</button>
                <button onClick={() => { setCoreSubTab("requests"); loadRequests(); }} className={`px-3 py-1.5 rounded-lg text-sm ${coreSubTab === "requests" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}>🆘 Обращения{(() => { const n = requests.filter((r) => r.target_agent_id === selectedCoreAgent.id && r.status === "new").length; return n ? ` (${n})` : ""; })()}</button>
              </div>
              {coreSubTab === "settings" ? (
                <AgentSettingsPanel
                  agentId={selectedCoreAgent.id}
                  onBack={() => { setSelectedCoreAgent(null); loadCoreAgents(); }}
                  onAgentUpdated={loadCoreAgents}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Обращения, направленные этому джину (авто-маршрут по домену). Так видно, что у него спрашивают и как он разбирается. Клик — карточка с триажем и чатом.</p>
                  <div className="overflow-x-auto border border-gray-800 rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-900 text-gray-400 text-left"><tr><th className="p-2">#</th><th className="p-2">Задача</th><th className="p-2">Причина</th><th className="p-2">Категория</th><th className="p-2">Статус</th></tr></thead>
                      <tbody>
                        {requests.filter((r) => r.target_agent_id === selectedCoreAgent.id).map((r) => (
                          <tr key={r.id} onClick={() => { setReqSel(r); setReqAsk(""); }} className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer">
                            <td className="p-2 text-gray-500">{r.id}</td>
                            <td className="p-2 text-gray-200 max-w-xs truncate">{r.task_text || "—"}</td>
                            <td className="p-2 text-gray-400 max-w-xs truncate">{r.reason || "—"}</td>
                            <td className="p-2 text-gray-400 text-xs">{r.triage_category || "—"}</td>
                            <td className="p-2"><span className={`text-[11px] px-1.5 py-0.5 rounded ${r.status === "new" ? "bg-red-900/60 text-red-300" : r.status === "closed" ? "bg-gray-800 text-gray-400" : "bg-amber-900/50 text-amber-300"}`}>{r.status}</span>{r.auto_resolved && <span className="ml-1" title="авто-ответ ИИ">🤖</span>}{r.resolution_type === "code" && r.status !== "closed" && <span className="ml-1" title="нужен Строитель — админ/владелец">🔧</span>}</td>
                          </tr>
                        ))}
                        {requests.filter((r) => r.target_agent_id === selectedCoreAgent.id).length === 0 && <tr><td colSpan={5} className="p-3 text-gray-500">Обращений к этому джину пока нет.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
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
                      <th className="text-left px-4 py-3">Тариф</th>
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
                        <td className="px-4 py-3">
                          <select
                            value={u.tariff_code || ""}
                            onChange={async (e) => { try { await adminSetUserTariff(u.id, e.target.value); loadUsers(); } catch { /* noop */ } }}
                            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-white outline-none"
                          >
                            <option value="">Полный (—)</option>
                            {tariffs.map((t) => <option key={t.id} value={t.code}>{t.name || t.code}</option>)}
                          </select>
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
                <div className="grid grid-cols-12 gap-1 text-[10px] text-gray-500 px-1">
                  <span className="col-span-3">Модель</span><span className="col-span-2">Провайдер</span><span title="Себестоимость входящих токенов">Себ·вх</span><span title="Себестоимость исходящих">Себ·вых</span><span title="Цена входящих (юзеру)">Цена·вх</span><span title="Цена исходящих (юзеру)">Цена·вых</span><span className="col-span-3">маржа · джинны · действия</span>
                </div>
                {models.map((m) => {
                  const d = modelDrafts[m.model] || { provider: "", cost_in: "0", cost_out: "0", sell_in: "0", sell_out: "0", valid_until: "" };
                  const upd = (k: string, v: string) => setModelDrafts((prev) => ({ ...prev, [m.model]: { ...(prev[m.model] || d), [k]: v } }));
                  return (
                    <div key={m.model} className="grid grid-cols-12 gap-1 items-center text-sm">
                      <button onClick={() => setSelectedModel(m)} className="col-span-3 text-gray-200 truncate text-left hover:text-emerald-400 hover:underline" title="Открыть карточку модели">{m.model}</button>
                      <input value={d.provider} onChange={(e) => upd("provider", e.target.value)} placeholder="—" className="col-span-2 bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs" />
                      <input value={d.cost_in} onChange={(e) => upd("cost_in", e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-1 py-1 text-white text-xs w-full" />
                      <input value={d.cost_out} onChange={(e) => upd("cost_out", e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-1 py-1 text-white text-xs w-full" />
                      <input value={d.sell_in} onChange={(e) => upd("sell_in", e.target.value)} className="bg-gray-950 border border-emerald-800/50 rounded px-1 py-1 text-white text-xs w-full" />
                      <input value={d.sell_out} onChange={(e) => upd("sell_out", e.target.value)} className="bg-gray-950 border border-emerald-800/50 rounded px-1 py-1 text-white text-xs w-full" />
                      <span className="col-span-3 text-xs text-gray-400 flex items-center gap-1">
                        <span className={m.margin >= 0 ? "text-emerald-400" : "text-red-400"}>{m.margin.toLocaleString()}{modelCur}</span>·{m.agents}
                        <button onClick={() => saveModel(m.model)} className="ml-1 px-2 py-0.5 rounded bg-emerald-600 text-white text-xs">✓</button>
                        {m.has_rate && <button onClick={() => adminDelPricing(m.model).then(loadModels)} className="text-gray-600 text-xs" title="Сбросить ставку">✕</button>}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  <input placeholder="новая модель (id, напр. deepseek-reasoner)" value={newModel} onChange={(e) => setNewModel(e.target.value)} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
                  <button onClick={() => { const nm = newModel.trim(); if (nm) adminSetPricing({ model: nm }).then(() => { setNewModel(""); loadModels(); }); }} className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white">+ модель</button>
                </div>
                <p className="text-[11px] text-gray-600">Ставки — за 1 млн токенов, отдельно вход/выход. «default» — для моделей без своей ставки. ✓ сохранить · ✕ сбросить.</p>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  <span className="text-[12px] text-gray-400">Наценка бизнесу ×</span>
                  <input defaultValue={bizMarkup} onBlur={(e) => saveBizMarkup(e.target.value)} className="w-16 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
                  <span className="text-[11px] text-gray-600">цена бизнесу = цена юзера × это (1 = одинаково)</span>
                </div>
              </div>

              {/* Индивидуальные цены (исключения) */}
              <div className="bg-gray-900 border border-indigo-800/40 rounded-lg p-4 space-y-2">
                <p className="text-sm text-indigo-300 font-medium">Индивидуальные цены (исключения)</p>
                <p className="text-[11px] text-gray-500">Множитель к цене для конкретного юзера/бизнеса. <b>0</b> = бесплатно, <b>0.5</b> = −50%, <b>1.2</b> = +20%. Ключ: <code>user:ID</code> или <code>contractor:ID</code>.</p>
                {Object.entries(priceOverrides).map(([k, o]) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-gray-300 w-40 truncate">{k}</span>
                    <span className="text-gray-400">{o.free ? "бесплатно" : `× ${o.mult ?? 1}`}</span>
                    <button onClick={() => delOverride(k)} className="ml-auto text-red-400 text-xs">удалить</button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  <input placeholder="user:123 или contractor:5" value={ovKey} onChange={(e) => setOvKey(e.target.value)} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
                  <input placeholder="множитель (0=беспл)" value={ovMult} onChange={(e) => setOvMult(e.target.value)} className="w-32 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
                  <button onClick={saveOverride} className="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white">+ цена</button>
                </div>
              </div>

              {selectedModel && (() => {
                const m = selectedModel;
                const bm = Number(bizMarkup) || 1;
                const [provShort, provKeyName] = providerOf((m.provider || "") + " " + m.model);
                const pk = provShort ? providerKeys[provShort] : undefined;
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedModel(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div><div className="text-lg font-semibold text-white flex items-center gap-2">{m.model}{provShort && (isHub(provShort) ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 font-normal">через хаб</span> : <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-normal">прямой</span>)}</div><div className="text-xs text-gray-500">{m.provider || "провайдер не указан"}</div></div>
                        <button onClick={() => setSelectedModel(null)} className="text-gray-500 hover:text-white text-xl">✕</button>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Цены (за 1 млн токенов, {modelCur})</div>
                        <div className="grid grid-cols-3 gap-2 text-sm items-center">
                          <div></div><div className="text-gray-500 text-xs">вход</div><div className="text-gray-500 text-xs">выход</div>
                          <div className="text-gray-400 text-xs">Себест.</div><div className="text-gray-200">{m.cost_in}</div><div className="text-gray-200">{m.cost_out}</div>
                          <div className="text-gray-400 text-xs">Юзеру</div><div className="text-emerald-300">{m.sell_in}</div><div className="text-emerald-300">{m.sell_out}</div>
                          <div className="text-gray-400 text-xs">Бизнесу ×{bm}</div><div className="text-amber-300">{(m.sell_in * bm).toFixed(2)}</div><div className="text-amber-300">{(m.sell_out * bm).toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-gray-950 rounded-lg p-2"><div className="text-[10px] text-gray-500">Токенов</div><div className="text-sm font-semibold text-white">{m.tokens.toLocaleString()}</div></div>
                        <div className="bg-gray-950 rounded-lg p-2"><div className="text-[10px] text-gray-500">Вызовов</div><div className="text-sm font-semibold text-white">{m.calls.toLocaleString()}</div></div>
                        <div className="bg-gray-950 rounded-lg p-2"><div className="text-[10px] text-gray-500">Джиннов</div><div className="text-sm font-semibold text-white">{m.agents}</div></div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-gray-950 rounded-lg p-2"><div className="text-[10px] text-gray-500">Себестоимость</div><div className="text-sm font-semibold text-red-300">{m.cost_total.toLocaleString()}{modelCur}</div></div>
                        <div className="bg-gray-950 rounded-lg p-2"><div className="text-[10px] text-gray-500">Выручка</div><div className="text-sm font-semibold text-emerald-300">{m.revenue.toLocaleString()}{modelCur}</div></div>
                        <div className="bg-gray-950 rounded-lg p-2"><div className="text-[10px] text-gray-500">Маржа</div><div className={`text-sm font-semibold ${m.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{m.margin.toLocaleString()}{modelCur}</div></div>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">API-ключ {provShort ? `(${provShort})` : "провайдера"}:</span>
                        {pk === undefined ? <span className="text-gray-500">провайдер не распознан</span> : pk ? <span className="text-emerald-400">● задан</span> : <span className="text-red-400">● не задан</span>}
                      </div>
                      {provKeyName && (
                        <div className="flex items-center gap-2">
                          <input type="password" value={mkKey} onChange={(e) => setMkKey(e.target.value)} placeholder={pk ? "заменить ключ…" : `вставить ключ ${provShort}`} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
                          <button disabled={!mkKey} onClick={async () => { try { await adminSetIntegration(provKeyName, mkKey); setMkKey(""); await loadModels(); alert("Ключ сохранён"); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); } }} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">Сохранить ключ</button>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-600">Ключ провайдера вводится здесь (одна модель = один провайдер = один ключ). {isHub(provShort) ? "Это ХАБ — второстепенный маршрут." : "Прямой доступ — основной маршрут."} Действует до: {m.valid_until || "—"}. {m.note}</p>
                      {!isHub(provShort) && (
                        <div className="pt-3 border-t border-gray-800 space-y-2">
                          <div className="text-[11px] uppercase tracking-wider text-gray-500">Хаб-доступ (тест / фри-токены)</div>
                          {[["openrouter", "OPENROUTER_API_KEY", "OpenRouter"], ["orcarouter", "ORCAROUTER_API_KEY", "OrcaRouter"], ["omnirouter", "OMNIROUTER_API_KEY", "OmniRouter"]].map(([short, keyName, label]) => (
                            <div key={short} className="flex items-center gap-2">
                              <span className="text-gray-400 text-sm w-28">{label}:</span>
                              {providerKeys[short] ? <span className="text-emerald-400 text-xs">● задан</span> : <span className="text-gray-500 text-xs">● нет</span>}
                              <input type="password" value={hubKey[short] || ""} onChange={(e) => setHubKey({ ...hubKey, [short]: e.target.value })} placeholder="ключ" className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
                              <button disabled={!hubKey[short]} onClick={async () => { try { await adminSetIntegration(keyName, hubKey[short]); setHubKey({ ...hubKey, [short]: "" }); await loadModels(); alert("Ключ хаба сохранён"); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); } }} className="px-3 py-1 rounded bg-sky-700 text-white text-sm font-semibold disabled:opacity-50">OK</button>
                            </div>
                          ))}
                          <p className="text-[11px] text-gray-600">Хабы (OpenRouter, OrcaRouter, OmniRouter…) — второстепенно: для тестов и бесплатных токенов. Чтобы гонять модель через хаб, заведите её отдельной моделью с id в формате хаба (напр. <code className="text-gray-400">openrouter/…</code>). Основной маршрут — прямой ключ провайдера выше.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="bg-gray-900 border border-amber-800/40 rounded-lg p-4 space-y-3">
                <p className="text-sm text-amber-400 font-medium">Провайдеры (RAG · веб-поиск)</p>
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

              <div className="bg-gray-900 rounded-xl p-5 border border-amber-800/40 mb-8">
                <p className="text-sm text-amber-400 font-medium mb-1">🛡 Блок-лист проекта (модерация)</p>
                <p className="text-[11px] text-gray-500 mb-3">Запретные темы для всего проекта: не попадают в Ленту/таргетинг и джинны их не обсуждают. По одной на строку или через запятую.</p>
                <textarea value={globalBlock} onChange={(e) => setGlobalBlock(e.target.value)} rows={4} placeholder="напр.: азартные игры, ставки на спорт" className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-amber-500 resize-none mb-2" />
                <button onClick={async () => { try { await adminSetGlobalBlocklist(globalBlock); setBlockSaved(true); setTimeout(() => setBlockSaved(false), 2000); } catch { /* noop */ } }} className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-black">Сохранить блок-лист</button>
                {blockSaved && <span className="text-[12px] text-emerald-400 ml-3">Сохранено</span>}
              </div>

              {monitor && (
                <div className="mb-8">
                  <h3 className="text-md font-semibold mb-4">Мониторинг (Агент Админ)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">Агентов</p>
                      <p className="text-2xl font-bold text-white">{monitor.agents.total}</p>
                      <p className="text-[10px] text-gray-500 mt-1">{Object.entries(monitor.agents.by_type).map(([t, c]) => `${t}: ${c}`).join(" · ")}</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">Сообщений 24ч</p>
                      <p className="text-2xl font-bold text-white">{monitor.activity.messages_24h}</p>
                      <p className="text-[10px] text-gray-500 mt-1">за 7 дней: {monitor.activity.messages_7d}</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">Пользователи</p>
                      <p className="text-2xl font-bold text-white">{monitor.activity.total_users}</p>
                      <p className="text-[10px] text-gray-500 mt-1">онлайн: {monitor.activity.online_users} · актив 24ч: {monitor.activity.active_users_24h}</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">LLM за 24ч</p>
                      <p className="text-2xl font-bold text-white">{monitor.llm_24h.calls}</p>
                      <p className="text-[10px] text-gray-500 mt-1">токенов: {monitor.llm_24h.tokens.toLocaleString("ru-RU")} · контрагентов: {monitor.contractors}</p>
                    </div>
                  </div>
                  {monitor.agents.top_active.length > 0 && (
                    <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Активные джинны (24ч)</p>
                      <div className="flex flex-wrap gap-2">
                        {monitor.agents.top_active.map((a) => (
                          <span key={a.name} className="text-[12px] text-gray-300 bg-gray-800 rounded-lg px-2 py-1">{a.name} · {a.msgs_24h}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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

                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Guardian — контроль галлюцинаций</label>
                    <button onClick={() => setGuardian(!guardian)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        guardian ? "bg-green-500/20 border-green-500 text-green-400" : "bg-gray-500/20 border-gray-500 text-gray-400"
                      } border`}>
                      {guardian ? "ВКЛ — ответы с базой знаний проверяются" : "ВЫКЛ — без проверки"}
                    </button>
                    <p className="text-[10px] text-gray-500 mt-1">Агент Контента сверяет ответы джиннов (у кого есть база знаний) с фактами и перегенерирует при выдумке. Добавляет один быстрый запрос на ответ. Выключите для минимальной задержки.</p>
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

          {/* ═══ ДИСПЕТЧЕРСКАЯ ═══ */}
          {tab === "dispatch" && (
            <div className="space-y-8">
              {/* Баланс/расходы */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white">💰 Баланс / расходы</h2>
                  <button onClick={loadDispatch} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white">↻ Обновить</button>
                </div>
                {balLoading ? <p className="text-gray-500 text-sm">Загружаю…</p> : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {balances.map((b) => {
                      const c = b.status === "ok" ? "border-green-700/50" : b.status === "error" ? "border-red-700/50" : "border-gray-700";
                      return (
                        <div key={b.provider} className={`rounded-xl border ${c} bg-gray-900/60 p-4`}>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{b.label}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.status === "ok" ? "bg-green-900/50 text-green-300" : b.status === "error" ? "bg-red-900/50 text-red-300" : "bg-gray-800 text-gray-400"}`}>{b.status}</span>
                          </div>
                          {b.status === "ok" ? (
                            <div className="mt-2 text-2xl font-bold text-white">{b.value} <span className="text-sm font-normal text-gray-400">{b.unit}</span></div>
                          ) : null}
                          {b.detail && <div className="mt-1 text-xs text-gray-400">{b.detail}</div>}
                          {b.cabinet_url && <a href={b.cabinet_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-400 hover:underline">Открыть кабинет →</a>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-gray-500">DeepSeek/OpenRouter тянем по API; Yandex/Gemini/Groq/Tavily — ссылка на кабинет (у них нет простого API баланса). OpenRouter требует прокси.</p>
              </div>

              {/* Арендованное железо */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white">🖥️ Арендованное железо</h2>
                  <div className="flex gap-2">
                    <button onClick={() => setHardware([...hardware, { name: "", provider: "", ip: "", purpose: "", cost: "", currency: "₽/мес", status: "active", note: "" }])} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white">+ Коробка</button>
                    <button onClick={() => saveHardware(hardware)} disabled={hwSaving} className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-50">{hwSaving ? "Сохраняю…" : "💾 Сохранить"}</button>
                  </div>
                </div>
                {hardware.length === 0 ? (
                  <p className="text-gray-500 text-sm">Пока нет коробок. «+ Коробка» → заполни → «Сохранить». Своего железа нет — тут будет заграничный VPS (прокси + SearXNG).</p>
                ) : (
                  <div className="space-y-2">
                    {hardware.map((h, i) => {
                      const upd = (field: keyof HardwareItem, val: string) => setHardware(hardware.map((x, j) => j === i ? { ...x, [field]: val } : x));
                      return (
                        <div key={i} className="rounded-xl border border-gray-700 bg-gray-900/60 p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <input value={h.name || ""} onChange={(e) => upd("name", e.target.value)} placeholder="Название (напр. proxy-eu)" className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none" />
                          <input value={h.provider || ""} onChange={(e) => upd("provider", e.target.value)} placeholder="Провайдер (Aeza…)" className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none" />
                          <input value={h.ip || ""} onChange={(e) => upd("ip", e.target.value)} placeholder="IP" className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none" />
                          <input value={h.purpose || ""} onChange={(e) => upd("purpose", e.target.value)} placeholder="Назначение (proxy+SearXNG)" className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none" />
                          <input value={h.cost || ""} onChange={(e) => upd("cost", e.target.value)} placeholder="Стоимость" className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none" />
                          <input value={h.currency || ""} onChange={(e) => upd("currency", e.target.value)} placeholder="₽/мес" className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none" />
                          <select value={h.status || "active"} onChange={(e) => upd("status", e.target.value)} className="bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none">
                            <option value="active">🟢 активна</option>
                            <option value="planned">🟡 планируется</option>
                            <option value="off">⚫ выключена</option>
                          </select>
                          <button onClick={() => setHardware(hardware.filter((_, j) => j !== i))} className="text-xs px-2 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/70">Удалить</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-gray-500">Реестр ведётся вручную. Позже сюда подключим авто-мониторинг (beszel) и джинна-по-железу.</p>
              </div>
            </div>
          )}

          {/* ═══ STATS TAB ═══ */}
          {tab === "waitlist" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Лист ожидания</h2>
              {wl ? (
                <>
                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="text-gray-300">Активных: <b className="text-emerald-400">{wl.active_count}</b></span>
                      <span className="text-gray-300">Ждут активации: <b className="text-amber-400">{wl.pending_count}</b></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-400">Режим:</span>
                      {(["off","on","auto"] as const).map((m) => (
                        <button key={m} onClick={async () => { await adminWaitlistSettings(m, 0); loadWaitlist(); }} className={`px-3 py-1.5 rounded text-sm ${wl.mode===m?"bg-amber-500 text-black":"bg-gray-800 text-gray-300"}`}>
                          {m==="off"?"Выкл":m==="on"?"Вкл":"Авто"}
                        </button>
                      ))}
                      <span className="text-sm text-gray-400 ml-3">Лимит активных:</span>
                      <input value={wlLimitDraft} onChange={(e)=>setWlLimitDraft(e.target.value)} className="w-24 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                      <button onClick={async () => { const n=parseInt(wlLimitDraft)||0; if(n>0){ await adminWaitlistSettings("", n); loadWaitlist(); } }} className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white">OK</button>
                    </div>
                    <p className="text-[11px] text-gray-500">Авто — при активных ≥ лимита новые регистрируются, но ждут активации. Вкл — всегда лист ожидания. Выкл — обычная регистрация.</p>
                  </div>
                  <div className="space-y-2">
                    {wl.pending.map((u) => (
                      <div key={u.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5">
                        <div className="text-sm min-w-0"><span className="text-white">{u.name || "—"}</span><span className="text-gray-500 ml-2">{u.phone}{u.email ? ` · ${u.email}` : ""}</span></div>
                        <button onClick={async () => { await adminActivateWaitlistUser(u.id); loadWaitlist(); }} className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white shrink-0">Активировать</button>
                      </div>
                    ))}
                    {wl.pending.length === 0 && <p className="text-sm text-gray-500">Ожидающих нет.</p>}
                  </div>
                </>
              ) : <p className="text-sm text-gray-500">Загрузка…</p>}
            </div>
          )}

          {tab === "catalog" && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Каталог фишек</h2>
              <p className="text-xs text-gray-500 mb-3">Покупаемое за токены: интерфейс (темы/фоны/обои), голоса, одежда и аксессуары для помощника и персонажей.</p>
              <div className="overflow-x-auto rounded border border-gray-800 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-left"><tr><th className="p-2">Категория</th><th className="p-2">Название</th><th className="p-2">Цена 🪙</th><th className="p-2">Для</th><th className="p-2">Актив</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {catalog.map((it, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        <td className="p-2 text-gray-400 text-xs">{it.category}</td>
                        <td className="p-2 text-gray-200">{it.name}</td>
                        <td className="p-2">{it.price_tokens.toLocaleString("ru")}</td>
                        <td className="p-2 text-gray-400 text-xs">{it.target}</td>
                        <td className="p-2">{it.active ? "✓" : "—"}</td>
                        <td className="p-2"><button onClick={() => removeCatItem(i)} className="text-red-400 text-xs">удалить</button></td>
                      </tr>
                    ))}
                    {catalog.length === 0 && <tr><td colSpan={6} className="p-3 text-gray-500">Каталог пуст.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="rounded border border-gray-800 p-4 flex flex-wrap gap-2 items-end max-w-3xl">
                <label className="text-xs text-gray-400">Категория<select value={catForm.category} onChange={(e) => setCatForm({ ...catForm, category: e.target.value })} className="block w-32 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white">{CATALOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
                <label className="text-xs text-gray-400">Название<input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="block w-44 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Цена (токены)<input type="number" value={catForm.price_tokens} onChange={(e) => setCatForm({ ...catForm, price_tokens: Number(e.target.value) || 0 })} className="block w-28 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Для<select value={catForm.target} onChange={(e) => setCatForm({ ...catForm, target: e.target.value })} className="block w-28 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white">{CATALOG_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="checkbox" checked={catForm.active} onChange={(e) => setCatForm({ ...catForm, active: e.target.checked })} />активно</label>
                <button onClick={addCatItem} disabled={!catForm.name} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-50">Добавить</button>
              </div>
            </div>
          )}

          {tab === "requests" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold mb-1">🆘 Обращения (внутренний helpdesk)</h2>
                  <p className="text-xs text-gray-500">Когда джинн/помощник не смог сам — обращение маршрутизируется к нужному внутреннему джину (Супер-помощник · Архитектор · Админ · Контент · Маркетолог · Железо). Триаж → чат со специалистом → ответ юзеру → закрыть.</p>
                </div>
                <button onClick={() => setReqNewForm({ task_text: "", reason: "" })} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm shrink-0">+ обращение (тест)</button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {["", "new", "triaged", "in_progress", "answered", "closed", "rejected"].map((st) => (
                  <button key={st || "all"} onClick={() => setReqFilter(st)} className={`px-2.5 py-1 rounded-full border ${reqFilter === st ? "bg-gray-700 text-white border-gray-600" : "text-gray-400 border-gray-800 hover:text-white"}`}>
                    {st === "" ? "все" : st}{reqCounts[st] ? ` (${reqCounts[st]})` : ""}
                  </button>
                ))}
              </div>
              {reqNewForm && (
                <div className="rounded border border-gray-800 p-3 space-y-2 max-w-2xl bg-gray-900/50">
                  <input value={reqNewForm.task_text} onChange={(e) => setReqNewForm({ ...reqNewForm, task_text: e.target.value })} placeholder="Что просил пользователь (задача)" className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-700 text-white text-sm" />
                  <input value={reqNewForm.reason} onChange={(e) => setReqNewForm({ ...reqNewForm, reason: e.target.value })} placeholder="Почему помощник не смог" className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-700 text-white text-sm" />
                  <div className="flex gap-2">
                    <button disabled={reqBusy || (!reqNewForm.task_text && !reqNewForm.reason)} onClick={async () => { setReqBusy(true); try { await adminCreateRequest(reqNewForm); setReqNewForm(null); await loadRequests(); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); } finally { setReqBusy(false); } }} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm disabled:opacity-50">Создать (авто-маршрут)</button>
                    <button onClick={() => setReqNewForm(null)} className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm">Отмена</button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto border border-gray-800 rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-left"><tr><th className="p-2">#</th><th className="p-2">Задача</th><th className="p-2">Причина</th><th className="p-2">Кому</th><th className="p-2">Категория</th><th className="p-2">Статус</th></tr></thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} onClick={() => { setReqSel(r); setReqAsk(""); }} className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer">
                        <td className="p-2 text-gray-500">{r.id}</td>
                        <td className="p-2 text-gray-200 max-w-xs truncate">{r.task_text || "—"}</td>
                        <td className="p-2 text-gray-400 max-w-xs truncate">{r.reason || "—"}</td>
                        <td className="p-2"><span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300">{r.target_label}</span></td>
                        <td className="p-2 text-gray-400 text-xs">{r.triage_category || "—"}</td>
                        <td className="p-2"><span className={`text-[11px] px-1.5 py-0.5 rounded ${r.status === "new" ? "bg-red-900/60 text-red-300" : r.status === "closed" ? "bg-gray-800 text-gray-400" : r.status === "rejected" ? "bg-gray-800 text-gray-500" : "bg-amber-900/50 text-amber-300"}`}>{r.status}</span>{r.auto_resolved && <span className="ml-1" title="авто-ответ ИИ">🤖</span>}{r.resolution_type === "code" && r.status !== "closed" && <span className="ml-1" title="нужен Строитель — админ/владелец">🔧</span>}</td>
                      </tr>
                    ))}
                    {requests.length === 0 && <tr><td colSpan={6} className="p-3 text-gray-500">Обращений нет.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reqSel && (() => {
                const r = reqSel;
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setReqSel(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-lg font-semibold text-white">Обращение #{r.id}</div>
                        <button onClick={() => setReqSel(null)} className="text-gray-500 hover:text-white text-xl">✕</button>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div><span className="text-gray-500">Задача юзера:</span> <span className="text-gray-200">{r.task_text || "—"}</span></div>
                        <div><span className="text-gray-500">Почему не смог:</span> <span className="text-gray-200">{r.reason || "—"}</span></div>
                        {r.context && <div><span className="text-gray-500">Контекст:</span> <span className="text-gray-400">{r.context}</span></div>}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">Кому:</span>
                        <select value={r.target} onChange={async (e) => { const u = await adminPatchRequest(r.id, { target: e.target.value }); setReqSel(u); await loadRequests(); }} className="px-2 py-1 rounded bg-gray-950 border border-gray-700 text-white text-sm">
                          {Object.entries(reqTargets).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <span className="text-xs text-gray-600">{reqTargets[r.target]?.domain}</span>
                      </div>
                      <div className="border-t border-gray-800 pt-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[11px] uppercase tracking-wider text-gray-500">Триаж (ИИ)</div>
                          <button disabled={reqBusy} onClick={async () => { setReqBusy(true); try { const u = await adminTriageRequest(r.id); setReqSel(u); await loadRequests(); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); } finally { setReqBusy(false); } }} className="px-2.5 py-1 rounded bg-purple-600 text-white text-xs disabled:opacity-50">{reqBusy ? "…" : "Запросить анализ"}</button>
                        </div>
                        {r.triage_category && <div className="text-xs text-purple-300 mb-1">Категория: {r.triage_category}</div>}
                        {r.triage_analysis ? <div className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-950 rounded p-2">{r.triage_analysis}</div> : <div className="text-xs text-gray-600">Нажми «Запросить анализ» — {reqTargets[r.target]?.label} разберёт обращение.</div>}
                      </div>
                      <div className="border-t border-gray-800 pt-3">
                        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Чат с {reqTargets[r.target]?.label}</div>
                        <div className="space-y-1.5 max-h-52 overflow-y-auto mb-2">
                          {r.thread.map((m, i) => (
                            <div key={i} className={`text-sm rounded px-2 py-1.5 ${m.role === "admin" ? "bg-gray-800 text-gray-200" : "bg-sky-950/60 text-sky-100"}`}><span className="text-[10px] text-gray-500 block">{m.role === "admin" ? "админ" : reqTargets[r.target]?.label}</span>{m.text}</div>
                          ))}
                          {r.thread.length === 0 && <div className="text-xs text-gray-600">Спроси специалиста: как решить, набросай код/объяснение…</div>}
                        </div>
                        <div className="flex gap-2">
                          <input value={reqAsk} onChange={(e) => setReqAsk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (reqAsk && !reqBusy) { (async () => { setReqBusy(true); try { const res = await adminAskInternal(r.id, reqAsk); setReqSel(res.request); setReqAsk(""); await loadRequests(); } catch (er) { alert(er instanceof Error ? er.message : "Ошибка"); } finally { setReqBusy(false); } })(); } } }} placeholder="Спросить специалиста…" className="flex-1 px-2 py-1.5 rounded bg-gray-950 border border-gray-700 text-white text-sm" />
                          <button disabled={!reqAsk || reqBusy} onClick={async () => { setReqBusy(true); try { const res = await adminAskInternal(r.id, reqAsk); setReqSel(res.request); setReqAsk(""); await loadRequests(); } catch (e) { alert(e instanceof Error ? e.message : "Ошибка"); } finally { setReqBusy(false); } }} className="px-3 py-1.5 rounded bg-sky-700 text-white text-sm disabled:opacity-50">→</button>
                        </div>
                      </div>
                      <div className="border-t border-gray-800 pt-3 space-y-2">
                        <div className="text-[11px] uppercase tracking-wider text-gray-500">Решение</div>
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-gray-400">Тип:</span>
                          {["code", "knowledge", "tool", "explain", "rejected"].map((rt) => (
                            <button key={rt} onClick={async () => { const u = await adminPatchRequest(r.id, { resolution_type: rt }); setReqSel(u); }} className={`px-2 py-1 rounded text-xs border ${r.resolution_type === rt ? "bg-emerald-800 text-white border-emerald-600" : "text-gray-400 border-gray-800"}`}>{rt}</button>
                          ))}
                        </div>
                        <textarea value={r.response_to_user} onChange={(e) => setReqSel({ ...r, response_to_user: e.target.value })} placeholder="Ответ помощнику → юзеру («теперь могу…»)" rows={2} className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-700 text-white text-sm" />
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={async () => { const u = await adminPatchRequest(r.id, { response_to_user: r.response_to_user }); setReqSel(u); alert("Сохранено"); }} className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm">Сохранить ответ</button>
                          <button onClick={async () => { await adminPatchRequest(r.id, { status: "answered", response_to_user: r.response_to_user }); await loadRequests(); setReqSel(null); }} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Отвечено</button>
                          <button onClick={async () => { await adminPatchRequest(r.id, { status: "closed" }); await loadRequests(); setReqSel(null); }} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm">Закрыть</button>
                          <button onClick={async () => { await adminPatchRequest(r.id, { status: "rejected" }); await loadRequests(); setReqSel(null); }} className="px-3 py-1.5 rounded bg-red-900/70 text-red-200 text-sm">Отклонить</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

          {tab === "campaigns" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-1">🎁 Спонсорские кампании</h2>
                <p className="text-xs text-gray-500">Бренд-спонсор дарит бонусные токены на конкретного джина. Помощник объявляет акцию при подборе; при первом использовании юзеру начисляется грант (тратится ПЕРВЫМ, до его рублей). Бюджет предоплачен спонсором — списывается по мере выдачи. Бонус = не деньги (не выводится) → налогобезопасно.</p>
              </div>
              <div className="overflow-x-auto border border-gray-800 rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-left"><tr><th className="p-2">Спонсор</th><th className="p-2">Джин</th><th className="p-2">Бонус</th><th className="p-2">Бюджет</th><th className="p-2">Истрачено</th><th className="p-2">Актив</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id} className="border-t border-gray-800">
                        <td className="p-2 text-gray-200">{c.sponsor_name}</td>
                        <td className="p-2 text-gray-400">{c.agent_id ?? "—"}</td>
                        <td className="p-2">{c.bonus_tokens.toLocaleString("ru")} ток.</td>
                        <td className="p-2">{c.budget_rub.toLocaleString("ru")} ₽</td>
                        <td className="p-2 text-amber-300">{c.spent_rub.toLocaleString("ru")} ₽</td>
                        <td className="p-2">{c.active ? "✓" : "—"}</td>
                        <td className="p-2"><button onClick={async () => { if (confirm("Удалить кампанию?")) { await adminDelCampaign(c.id); await loadCampaigns(); } }} className="text-red-400 text-xs">удалить</button></td>
                      </tr>
                    ))}
                    {campaigns.length === 0 && <tr><td colSpan={7} className="p-3 text-gray-500">Кампаний нет.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="rounded border border-gray-800 p-4 flex flex-wrap gap-3 items-end max-w-4xl">
                <label className="text-xs text-gray-400">Спонсор<input value={campForm.sponsor_name} onChange={(e) => setCampForm({ ...campForm, sponsor_name: e.target.value })} placeholder="Coca-Cola" className="block w-40 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Джин (id)<input value={campForm.agent_id} onChange={(e) => setCampForm({ ...campForm, agent_id: e.target.value })} placeholder="напр. 52" className="block w-24 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Бонус (токенов)<input type="number" value={campForm.bonus_tokens} onChange={(e) => setCampForm({ ...campForm, bonus_tokens: e.target.value })} className="block w-28 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Бюджет (₽)<input type="number" value={campForm.budget_rub} onChange={(e) => setCampForm({ ...campForm, budget_rub: e.target.value })} className="block w-32 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400 flex-1 min-w-[220px]">Текст промо (для помощника)<input value={campForm.message} onChange={(e) => setCampForm({ ...campForm, message: e.target.value })} placeholder="Попробуй дизайнера — первые 1000 токенов от Coca-Cola" className="block w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="checkbox" checked={campForm.active} onChange={(e) => setCampForm({ ...campForm, active: e.target.checked })} />активна</label>
                <button onClick={saveCampaign} disabled={!campForm.sponsor_name} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-50">+ кампания</button>
              </div>
            </div>
          )}

          {tab === "council" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-1">🏛 Совещательная</h2>
                <p className="text-xs text-gray-500">Собери команду джиннов по теме — каждый выскажется по кругу, Архитектор сведёт в решения и следующие шаги. Внутренних джиннов можно отключать из разговора, из Города — подключать через поиск.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {/* ── Участники ── */}
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-800 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Внутренняя команда · включить/выключить</div>
                    <div className="flex flex-col gap-1.5">
                      {councilCands.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={councilPick.includes(c.id)} onChange={() => toggleCouncilPick(c.id)} />
                          <span className="text-gray-200">{c.name}</span>
                          <span className="text-gray-500 text-xs">{c.profession}</span>
                        </label>
                      ))}
                      {councilCands.length === 0 && <span className="text-xs text-gray-600">Нет core-джиннов.</span>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-800 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Пригласить из Города</div>
                    <div className="flex gap-2 mb-2">
                      <input value={councilQuery} onChange={(e) => setCouncilQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchCityForCouncil(); } }} placeholder="профессия / имя (напр. юрист)" className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
                      <button onClick={searchCityForCouncil} className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm">Найти</button>
                    </div>
                    {cityPool.length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-2">
                        {cityPool.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={councilPick.includes(c.id)} onChange={() => toggleCouncilPick(c.id)} />
                            <span className="text-sky-300">{c.name}</span>
                            <span className="text-gray-500 text-xs">{c.profession}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {cityResults.filter((r) => !cityPool.some((p) => p.id === r.id)).length > 0 && (
                      <div className="flex flex-col gap-1 border-t border-gray-800 pt-2">
                        {cityResults.filter((r) => !cityPool.some((p) => p.id === r.id)).slice(0, 8).map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-300">{r.name} <span className="text-gray-500 text-xs">{r.profession}</span></span>
                            <button onClick={() => addCityToCouncil(r)} className="text-emerald-400 text-xs">+ добавить</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* ── Тема + запуск + результат ── */}
                <div className="space-y-3">
                  <textarea value={councilTopic} onChange={(e) => setCouncilTopic(e.target.value)} rows={3} placeholder="Тема совещания (напр. «как улучшить онбординг новых пользователей»)" className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                  <div className="flex items-center gap-3">
                    <button onClick={runCouncil} disabled={councilBusy || !councilTopic.trim() || councilPick.length === 0} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">{councilBusy ? "Идёт совещание…" : "🏛 Собрать совещание"}</button>
                    <span className="text-xs text-gray-500">участников: {councilPick.length}</span>
                  </div>
                  {councilResult && (
                    <div className="rounded-xl border border-gray-800 p-3 space-y-2.5">
                      <div className="text-sm font-semibold text-white">{councilResult.topic}</div>
                      {(councilResult.transcript || []).map((t, i) => (
                        <div key={i} className="text-sm"><span className="text-sky-300 font-semibold">{t.name}: </span><span className="text-gray-300">{t.text}</span></div>
                      ))}
                      {councilResult.summary && (
                        <div className="rounded-lg bg-indigo-950/40 border border-indigo-800/50 p-3">
                          <div className="text-[11px] uppercase tracking-wider text-indigo-300 mb-1">Итог Архитектора</div>
                          <div className="text-sm text-gray-200 whitespace-pre-wrap">{councilResult.summary}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {councilHistory.length > 0 && (
                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">История совещаний</div>
                  <div className="flex flex-col gap-1">
                    {councilHistory.map((s) => (
                      <button key={s.id} onClick={() => openCouncilSession(s.id)} className="flex items-center justify-between text-sm text-left hover:bg-gray-800/40 rounded px-2 py-1.5">
                        <span className="text-gray-200 truncate">{s.topic}</span>
                        <span className="text-gray-500 text-xs shrink-0 ml-2">{s.participants.length} уч.{s.created_at ? ` · ${new Date(s.created_at).toLocaleDateString("ru")}` : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "tokens" && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Токены</h2>
              <p className="text-xs text-gray-500 mb-3">Валюта пользователя (баланс). У юзера нет подписки — есть баланс токенов + подарки. 1 токен ≈ себестоимость×маржа → покрытие гарантировано.</p>
              {!tokenCfg ? <p className="text-sm text-gray-500">Загрузка…</p> : (
                <div className="space-y-5 max-w-3xl">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Пакеты токенов (магазин пополнения)</div>
                    <div className="overflow-x-auto rounded border border-gray-800">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-900 text-gray-400 text-left"><tr><th className="p-2">Название</th><th className="p-2">Токенов</th><th className="p-2">Цена ₽</th><th className="p-2">Активен</th><th className="p-2"></th></tr></thead>
                        <tbody>
                          {tokenCfg.packs.map((p, i) => (
                            <tr key={i} className="border-t border-gray-800">
                              <td className="p-2"><input value={p.name} onChange={(e) => { const packs = [...tokenCfg.packs]; packs[i] = { ...p, name: e.target.value }; setTokenCfg({ ...tokenCfg, packs }); }} className="w-32 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-white" /></td>
                              <td className="p-2"><input type="number" value={p.tokens} onChange={(e) => { const packs = [...tokenCfg.packs]; packs[i] = { ...p, tokens: Number(e.target.value) || 0 }; setTokenCfg({ ...tokenCfg, packs }); }} className="w-24 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-white" /></td>
                              <td className="p-2"><input type="number" value={p.price_rub} onChange={(e) => { const packs = [...tokenCfg.packs]; packs[i] = { ...p, price_rub: Number(e.target.value) || 0 }; setTokenCfg({ ...tokenCfg, packs }); }} className="w-24 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-white" /></td>
                              <td className="p-2"><input type="checkbox" checked={p.active} onChange={(e) => { const packs = [...tokenCfg.packs]; packs[i] = { ...p, active: e.target.checked }; setTokenCfg({ ...tokenCfg, packs }); }} /></td>
                              <td className="p-2"><button onClick={() => setTokenCfg({ ...tokenCfg, packs: tokenCfg.packs.filter((_, k) => k !== i) })} className="text-red-400 text-xs">удалить</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => setTokenCfg({ ...tokenCfg, packs: [...tokenCfg.packs, { name: "Новый", tokens: 1000, price_rub: 100, active: true }] })} className="mt-2 px-3 py-1.5 rounded bg-gray-700 text-white text-xs">+ пакет</button>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Подарки (начисления)</div>
                    <div className="grid grid-cols-2 gap-3">
                      {([["welcome", "Приветственный"], ["daily", "Ежедневный"], ["channel_subscribe", "За подписку на канал"], ["referral", "За приглашённого"]] as [string, string][]).map(([k, lbl]) => (
                        <label key={k} className="text-xs text-gray-400">{lbl}<input type="number" value={Number(tokenCfg.gifts[k]) || 0} onChange={(e) => setTokenCfg({ ...tokenCfg, gifts: { ...tokenCfg.gifts, [k]: Number(e.target.value) || 0 } })} className="block w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">Подарки субсидируются нами / провайдерскими free-кредитами / спонсорством бизнеса (бизнес дарит токены своим подписчикам на канал).</p>
                  </div>

                  <button disabled={tokenBusy} onClick={saveTokenConfig} className="px-4 py-2 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-50">Сохранить</button>
                </div>
              )}
            </div>
          )}

          {tab === "docs" && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Доки</h2>
              <p className="text-xs text-gray-500 mb-3">Реестр документов и генераций — ссылки, чтобы не терять. Кликабельно, открывается в новой вкладке.</p>
              <div className="overflow-x-auto rounded border border-gray-800 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-left"><tr><th className="p-2">Раздел</th><th className="p-2">Документ</th><th className="p-2">Статус</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {docs.map((d, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        <td className="p-2 text-gray-400 text-xs">{d.section || "—"}</td>
                        <td className="p-2"><a href={d.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{d.title}</a></td>
                        <td className="p-2 text-xs text-gray-400">{d.status || ""}</td>
                        <td className="p-2"><button onClick={() => removeDoc(i)} className="text-red-400 text-xs">удалить</button></td>
                      </tr>
                    ))}
                    {docs.length === 0 && <tr><td colSpan={4} className="p-3 text-gray-500">Доков нет.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="rounded border border-gray-800 p-4 flex flex-wrap gap-2 items-end max-w-3xl">
                <label className="text-xs text-gray-400">Название<input value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} className="block w-48 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Раздел<input value={docForm.section} onChange={(e) => setDocForm({ ...docForm, section: e.target.value })} className="block w-36 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Ссылка<input value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} className="block w-64 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <label className="text-xs text-gray-400">Статус<input value={docForm.status || ""} onChange={(e) => setDocForm({ ...docForm, status: e.target.value })} className="block w-32 mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                <button onClick={addDoc} disabled={!docForm.title || !docForm.url} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-50">Добавить</button>
              </div>
            </div>
          )}

          {tab === "tariffs" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Тарифы</h2>
                <button onClick={() => { setTariffForm({ ...EMPTY_TARIFF }); setTariffEditId(null); }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-semibold">+ Создать</button>
              </div>
              <p className="text-xs text-gray-500 mb-3">Тариф-маркер регулирует работу пользователя: модель · лимиты · гейты фич. Пустой тариф у юзера = «Полный» (без ограничений).</p>

              <div className="overflow-x-auto rounded border border-gray-800 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-left">
                    <tr><th className="p-2">Код</th><th className="p-2">Название</th><th className="p-2">Модель</th><th className="p-2">Сообщ./день</th><th className="p-2">Джинны/день</th><th className="p-2">Умолч.</th><th className="p-2"></th></tr>
                  </thead>
                  <tbody>
                    {tariffs.map((t) => (
                      <tr key={t.id} className="border-t border-gray-800">
                        <td className="p-2 font-mono">{t.code}</td>
                        <td className="p-2">{t.name}</td>
                        <td className="p-2 font-mono text-xs">{t.llm_model}</td>
                        <td className="p-2">{t.msgs_per_day || "∞"}</td>
                        <td className="p-2">{t.jinn_calls_per_day || "∞"}</td>
                        <td className="p-2">{t.is_default ? "★" : ""}</td>
                        <td className="p-2 whitespace-nowrap">
                          <button onClick={() => { setTariffForm({ code: t.code, name: t.name, description: t.description, llm_model: t.llm_model, msgs_per_day: t.msgs_per_day, jinn_calls_per_day: t.jinn_calls_per_day, context_limit: t.context_limit, gates: t.gates, is_default: t.is_default, sort: t.sort }); setTariffEditId(t.id); }} className="text-indigo-400 mr-3">править</button>
                          <button onClick={() => removeTariff(t.id)} className="text-red-400">удалить</button>
                        </td>
                      </tr>
                    ))}
                    {tariffs.length === 0 && <tr><td colSpan={7} className="p-3 text-gray-500">Тарифов нет.</td></tr>}
                  </tbody>
                </table>
              </div>

              {tariffForm && (
                <div className="rounded border border-gray-800 p-4 space-y-3 max-w-2xl">
                  <h3 className="font-semibold">{tariffEditId != null ? "Редактировать тариф" : "Новый тариф"}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-gray-400">Код<input value={tariffForm.code} onChange={(e) => setTariffForm({ ...tariffForm, code: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400">Название<input value={tariffForm.name} onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400 col-span-2">Описание<input value={tariffForm.description} onChange={(e) => setTariffForm({ ...tariffForm, description: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400">Модель<input value={tariffForm.llm_model} onChange={(e) => setTariffForm({ ...tariffForm, llm_model: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400">Сообщений/день (0=∞)<input type="number" value={tariffForm.msgs_per_day} onChange={(e) => setTariffForm({ ...tariffForm, msgs_per_day: Number(e.target.value) || 0 })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400">Вызовов джиннов/день (0=∞)<input type="number" value={tariffForm.jinn_calls_per_day} onChange={(e) => setTariffForm({ ...tariffForm, jinn_calls_per_day: Number(e.target.value) || 0 })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400">Лимит контекста (0=деф.)<input type="number" value={tariffForm.context_limit} onChange={(e) => setTariffForm({ ...tariffForm, context_limit: Number(e.target.value) || 0 })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                  </div>
                  <div className="text-xs text-gray-400 font-semibold pt-1">Гейты фич</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {([["vision", "Зрение (камера)"], ["paid_voices", "Платные голоса"], ["spending_jinns", "Джинны с тратами"], ["business_jinns_unlimited", "Бизнес-джинны безлимит"]] as [string, string][]).map(([k, lbl]) => (
                      <label key={k} className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={!!(tariffForm.gates as Record<string, unknown>)[k]} onChange={(e) => setTariffForm({ ...tariffForm, gates: { ...tariffForm.gates, [k]: e.target.checked } })} />{lbl}</label>
                    ))}
                    <label className="text-xs text-gray-400">Квота картинок, МБ<input type="number" value={Number((tariffForm.gates as Record<string, unknown>).image_quota_mb) || 0} onChange={(e) => setTariffForm({ ...tariffForm, gates: { ...tariffForm.gates, image_quota_mb: Number(e.target.value) || 0 } })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                    <label className="text-xs text-gray-400">Квота RAG, МБ<input type="number" value={Number((tariffForm.gates as Record<string, unknown>).rag_quota_mb) || 0} onChange={(e) => setTariffForm({ ...tariffForm, gates: { ...tariffForm.gates, rag_quota_mb: Number(e.target.value) || 0 } })} className="w-full mt-1 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-white" /></label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={tariffForm.is_default} onChange={(e) => setTariffForm({ ...tariffForm, is_default: e.target.checked })} />Тариф по умолчанию для новых</label>
                  <div className="flex gap-2 pt-1">
                    <button disabled={tariffBusy || !tariffForm.code} onClick={saveTariff} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-50">Сохранить</button>
                    <button onClick={() => { setTariffForm(null); setTariffEditId(null); }} className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm">Отмена</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Журнал действий</h2>
              <p className="text-xs text-gray-500 mb-4">Что делали пользователи и помощник: команды, открытие/закрытие чатов, избранное, звонки.</p>
              <div className="flex items-center gap-2 mb-4">
                {[{ v: "", l: "Все" }, { v: "user", l: "Пользователь" }, { v: "assistant", l: "Помощник" }, { v: "agent", l: "Джинн" }].map((f) => (
                  <button key={f.v} onClick={() => setActivityActor(f.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${activityActor === f.v ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:text-white"}`}>{f.l}</button>
                ))}
                <select value={activityHours} onChange={(e) => setActivityHours(Number(e.target.value))}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 ml-2">
                  <option value={24}>24 часа</option>
                  <option value={168}>7 дней</option>
                  <option value={720}>30 дней</option>
                </select>
                <button onClick={() => loadActivity()} className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-300 hover:text-white ml-auto">Обновить</button>
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs border-b border-gray-800">
                      <th className="px-3 py-2 font-medium">Время</th>
                      <th className="px-3 py-2 font-medium">Кто</th>
                      <th className="px-3 py-2 font-medium">Действие</th>
                      <th className="px-3 py-2 font-medium">Цель</th>
                      <th className="px-3 py-2 font-medium">Итог</th>
                      <th className="px-3 py-2 font-medium">Детали</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-600 text-xs">Записей нет</td></tr>
                    )}
                    {activity.map((a) => (
                      <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{new Date(a.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${a.actor === "assistant" ? "bg-indigo-900/50 text-indigo-300" : a.actor === "agent" ? "bg-emerald-900/50 text-emerald-300" : a.actor === "system" ? "bg-gray-700 text-gray-300" : "bg-blue-900/50 text-blue-300"}`}>{a.actor}</span>
                          {a.user_id ? <span className="text-gray-600 text-xs ml-1">#{a.user_id}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-gray-300 font-mono text-xs whitespace-nowrap">{a.action}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{a.target_name || (a.target_id ? `${a.target_type} #${a.target_id}` : "—")}</td>
                        <td className="px-3 py-2 text-xs">
                          {a.result ? <span className={a.result === "ok" ? "text-emerald-400" : a.result === "chat" ? "text-gray-500" : "text-amber-400"}>{a.result}</span> : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate" title={a.detail || ""}>{a.detail || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Guardian — контроль галлюцинаций</label>
                    <button onClick={() => setGuardian(!guardian)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        guardian ? "bg-green-500/20 border-green-500 text-green-400" : "bg-gray-500/20 border-gray-500 text-gray-400"
                      } border`}>
                      {guardian ? "ВКЛ — ответы с базой знаний проверяются" : "ВЫКЛ — без проверки"}
                    </button>
                    <p className="text-[10px] text-gray-500 mt-1">Агент Контента сверяет ответы джиннов (у кого есть база знаний) с фактами и перегенерирует при выдумке. Добавляет один быстрый запрос на ответ. Выключите для минимальной задержки.</p>
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
