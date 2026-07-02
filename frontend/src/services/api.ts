/**
 * JinnTell API Client
 * Единая точка взаимодействия фронтенда с бэкендом
 */

/**
 * Production: NEXT_PUBLIC_API_URL="" → relative URLs (nginx проксирует /api/ и /ws/)
 * Dev: NEXT_PUBLIC_API_URL не задан → fallback на http://localhost:8000
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL !== undefined
  ? process.env.NEXT_PUBLIC_API_URL
  : "http://localhost:8000";

/** Хранение JWT токена */
let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("jinntell_token", token);
  } else {
    localStorage.removeItem("jinntell_token");
  }
}

export function getToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("jinntell_token");
  }
  return authToken;
}

/** Базовый fetch с авторизацией */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail || "Ошибка сервера");
  }

  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ═══════════════════════════════════════════════
//  AUTH — Регистрация / Вход / Восстановление / OAuth
// ═══════════════════════════════════════════════

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  display_name: string;
  is_admin: boolean;
}

export interface MessageResponse {
  message: string;
  debug_code?: string;
}

export interface SendSMSResponse {
  message: string;
  debug_code?: string;
}

/** Регистрация (телефон + пароль + email) */
export async function register(data: {
  phone: string;
  password: string;
  email?: string;
  display_name?: string;
}): Promise<TokenResponse> {
  const res = await apiFetch<TokenResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setToken(res.access_token);
  _saveSession(res);
  return res;
}

/** Вход (телефон + пароль) */
/** Синтез речи через бэкенд (Yandex SpeechKit) -> blob URL для проигрывания */
export async function ttsBlobUrl(text: string, voice = "ermil", emotion = "neutral"): Promise<string | null> {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text: text.slice(0, 5000), voice, emotion }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function login(phone: string, password: string): Promise<TokenResponse> {
  const res = await apiFetch<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  setToken(res.access_token);
  _saveSession(res);
  return res;
}

/** Запрос кода восстановления на email */
export function forgotPassword(email: string): Promise<MessageResponse> {
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** Сброс пароля по коду */
export async function resetPassword(data: {
  email: string;
  code: string;
  new_password: string;
}): Promise<TokenResponse> {
  const res = await apiFetch<TokenResponse>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setToken(res.access_token);
  _saveSession(res);
  return res;
}

/** OAuth: ВК */
export function getOAuthVKUrl(): string {
  return `${API_BASE}/api/auth/oauth/vk`;
}

/** OAuth: Яндекс */
export function getOAuthYandexUrl(): string {
  return `${API_BASE}/api/auth/oauth/yandex`;
}

/** OAuth: Telegram (отправка данных виджета) */
export async function oauthTelegram(data: Record<string, unknown>): Promise<TokenResponse> {
  const res = await apiFetch<TokenResponse>("/api/auth/oauth/telegram", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setToken(res.access_token);
  _saveSession(res);
  return res;
}

/** Сохраняем сессию после успешной авторизации */
function _saveSession(res: TokenResponse) {
  localStorage.setItem("jinntell_session", JSON.stringify({
    loggedIn: true,
    userId: res.user_id,
    displayName: res.display_name,
    isAdmin: res.is_admin,
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  }));
}

// Legacy SMS (backward compat)

/** Отправить SMS-код (legacy) */
export function sendSMS(phone: string): Promise<SendSMSResponse> {
  return apiFetch("/api/auth/send-sms", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

/** Проверить SMS-код → получить JWT (legacy) */
export async function verifySMS(phone: string, code: string): Promise<TokenResponse> {
  const data = await apiFetch<TokenResponse>("/api/auth/verify-sms", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  setToken(data.access_token);
  _saveSession(data);
  return data;
}

// ═══════════════════════════════════════════════
//  AGENTS — Город Агентов
// ═══════════════════════════════════════════════

export interface AgentOut {
  id: number;
  uid?: string;
  name: string;
  profession: string;
  brand: string;
  agent_type: string;
  description: string;
  color: string;
  jinntell_link?: string;
  rating: number;
  rating_count: number;
  greeting?: string;
  owner_id?: number;
}

export interface AgentCreate {
  name: string;
  profession: string;
  brand?: string;
  description?: string;
  color?: string;
  agent_type?: string;
  system_prompt?: string;
  llm_model?: string;
  greeting?: string;
}

/** Полные данные агента для настройки (ЛК бизнеса + личный агент) */
export interface AgentFullOut extends AgentOut {
  // AI
  system_prompt?: string;
  llm_model: string;
  llm_max_tokens?: number;
  photo_url?: string;
  is_active: boolean;
  created_at?: string;
  // Голос
  voice_id?: string;
  voice_speed: number;
  voice_pitch: number;
  tts_voice_id?: string;
  tts_emotion?: string;
  // Внешность
  appearance_preset?: string;
  appearance_face?: string;
  appearance_hair?: string;
  appearance_skin?: string;
  appearance_body?: string;
  // Одежда
  outfit_style?: string;
  outfit_top?: string;
  outfit_bottom?: string;
  outfit_shoes?: string;
  outfit_accessory?: string;
  // Манеры
  manner_style: string;
  manner_temperament: string;
  manner_humor: boolean;
  manner_emoji_use: boolean;
  // Знания (Обучение)
  knowledge_text?: string;
  knowledge_urls?: string;
  knowledge_files?: string;
  // Скилы
  skills_text?: string;
  // Отмена (исключения)
  exclusions_text?: string;
  // Режимы
  mode_walk_enabled: boolean;
  mode_walk_rules?: string;
  mode_walk_context?: string;
  mode_shopping_enabled: boolean;
  mode_shopping_rules?: string;
  mode_shopping_context?: string;
  mode_drive_enabled: boolean;
  mode_drive_rules?: string;
  mode_drive_context?: string;
  mode_chat_enabled: boolean;
  mode_chat_rules?: string;
  mode_chat_context?: string;
  mode_work_enabled: boolean;
  mode_work_rules?: string;
  mode_work_context?: string;
  // Contractor
  contractor_id?: number;
}

/** Обновление настроек персонажа агента */
export interface AgentPersonaUpdate {
  // AI / текст
  description?: string;
  greeting?: string;
  system_prompt?: string;
  llm_model?: string;
  llm_max_tokens?: number;
  visibility?: string;
  // Голос
  voice_id?: string;
  voice_speed?: number;
  voice_pitch?: number;
  tts_voice_id?: string;
  tts_emotion?: string;
  // Внешность
  appearance_preset?: string;
  appearance_face?: string;
  appearance_hair?: string;
  appearance_skin?: string;
  appearance_body?: string;
  // Одежда
  outfit_style?: string;
  outfit_top?: string;
  outfit_bottom?: string;
  outfit_shoes?: string;
  outfit_accessory?: string;
  // Манеры
  manner_style?: string;
  manner_temperament?: string;
  manner_humor?: boolean;
  manner_emoji_use?: boolean;
  // Знания (Обучение)
  knowledge_text?: string;
  knowledge_urls?: string;
  knowledge_files?: string;
  // Скилы
  skills_text?: string;
  // Отмена
  exclusions_text?: string;
  // Режимы
  mode_walk_enabled?: boolean;
  mode_walk_rules?: string;
  mode_walk_context?: string;
  mode_shopping_enabled?: boolean;
  mode_shopping_rules?: string;
  mode_shopping_context?: string;
  mode_drive_enabled?: boolean;
  mode_drive_rules?: string;
  mode_drive_context?: string;
  mode_chat_enabled?: boolean;
  mode_chat_rules?: string;
  mode_chat_context?: string;
  mode_work_enabled?: boolean;
  mode_work_rules?: string;
  mode_work_context?: string;
}

export interface AgentListResponse {
  agents: AgentOut[];
  total: number;
  business_count: number;
  citizen_count: number;
  system_count: number;
}

/** Каталог агентов */
export function getAgents(params?: {
  search?: string;
  profession?: string;
  agent_type?: string;
}): Promise<AgentListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.profession) query.set("profession", params.profession);
  if (params?.agent_type) query.set("agent_type", params.agent_type);
  const qs = query.toString();
  return apiFetch(`/api/agents${qs ? `?${qs}` : ""}`);
}

/** Карточка агента */
export function getAgent(id: number): Promise<AgentOut> {
  return apiFetch(`/api/agents/${id}`);
}

/** Мои агенты (созданные мной) — полные данные для настройки */
export function getMyAgents(): Promise<AgentFullOut[]> {
  return apiFetch("/api/agents/my");
}
export function getFavoriteAgents(): Promise<AgentOut[]> {
  return apiFetch("/api/agents/favorites");
}
export function getRecommendedAgents(): Promise<AgentOut[]> {
  return apiFetch("/api/agents/recommended");
}
export function addFavoriteAgent(agentId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/api/agents/favorites/${agentId}`, { method: "POST" });
}
export function removeFavoriteAgent(agentId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/api/agents/favorites/${agentId}`, { method: "DELETE" });
}

export interface ContactOut {
  id: number;
  display_name: string;
  phone: string;
  jinntell_link?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
  is_online: boolean;
}
export function getContacts(): Promise<ContactOut[]> {
  return apiFetch("/api/contacts");
}
export function addContact(identifier: string): Promise<ContactOut> {
  return apiFetch("/api/contacts", { method: "POST", body: JSON.stringify({ identifier }) });
}
export function removeContact(userId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/api/contacts/${userId}`, { method: "DELETE" });
}
export function searchUsers(q: string): Promise<ContactOut[]> {
  return apiFetch(`/api/contacts/search?q=${encodeURIComponent(q)}`);
}
export function dmRoom(a: number, b: number): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `dm-${lo}-${hi}`;
}

export interface MyChat {
  room: string;
  kind: string;
  name: string;
  color: string;
  photo?: string | null;
  count: number;
}
export function getMyChats(): Promise<MyChat[]> {
  return apiFetch("/api/chat/my-chats");
}

/** Обновить настройки агента (бизнес / личный) */
export function updateAgent(id: number, data: AgentPersonaUpdate): Promise<AgentFullOut> {
  return apiFetch(`/api/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ═══════════════════════════════════════════════
//  ADMIN API
// ═══════════════════════════════════════════════

export interface AgentDetailOut extends AgentOut {
  system_prompt?: string;
  llm_model: string;
  is_active: boolean;
  visibility: string;
  created_at?: string;
}

export interface AdminStats {
  agents: { total: number; core: number; system: number; business: number; citizen: number; specialist: number };
  users: { total: number };
}

export interface AdminUser {
  id: number;
  phone: string;
  display_name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  is_admin: boolean;
  is_online: boolean;
  is_verified: boolean;
  vk_linked: boolean;
  telegram_linked: boolean;
  yandex_linked: boolean;
  created_at?: string;
}

/** Админ: все агенты */
export function adminGetAgents(params?: { search?: string; agent_type?: string; include_inactive?: boolean }): Promise<AgentDetailOut[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.agent_type) q.set("agent_type", params.agent_type);
  if (params?.include_inactive) q.set("include_inactive", "true");
  const qs = q.toString();
  return apiFetch(`/api/admin/agents${qs ? `?${qs}` : ""}`);
}

/** Админ: карточка агента */
export function adminGetAgent(id: number): Promise<AgentDetailOut> {
  return apiFetch(`/api/admin/agents/${id}`);
}

/** Админ: создать агента */
export function adminCreateAgent(data: AgentCreate, ownerId?: number): Promise<AgentDetailOut> {
  const q = ownerId ? `?owner_id=${ownerId}` : "";
  return apiFetch(`/api/admin/agents${q}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Админ: обновить агента */
export function adminUpdateAgent(id: number, data: Partial<AgentCreate>): Promise<AgentDetailOut> {
  return apiFetch(`/api/admin/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Админ: привязать агента к бизнесу */
export function adminAssignAgent(id: number, ownerId: number | null): Promise<AgentDetailOut> {
  const q = ownerId !== null ? `?owner_id=${ownerId}` : "";
  return apiFetch(`/api/admin/agents/${id}/assign${q}`, { method: "PATCH" });
}

/** Админ: удалить агента */
export function adminDeleteAgent(id: number, hard = false): Promise<void> {
  return apiFetch(`/api/admin/agents/${id}?hard=${hard}`, { method: "DELETE" });
}

/** Админ: восстановить агента */
export function adminRestoreAgent(id: number): Promise<AgentDetailOut> {
  return apiFetch(`/api/admin/agents/${id}/restore`, { method: "PATCH" });
}

/** Админ: пользователи */
export function adminGetUsers(search?: string): Promise<AdminUser[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/api/admin/users${q}`);
}

/** Админ: статистика */
export function adminGetStats(): Promise<AdminStats> {
  return apiFetch("/api/admin/stats");
}

/** LLM статус */
export interface LLMProviderInfo {
  connected: boolean;
  key: string;
  model: string;
}
export interface LLMStatus {
  active_provider: string;
  active_model: string;
  default_provider: string;
  providers: {
    openai: LLMProviderInfo;
    gemini: LLMProviderInfo;
    groq: LLMProviderInfo;
  };
}
export function adminGetLLMStatus(): Promise<LLMStatus> {
  return apiFetch("/api/admin/llm-status");
}

// System settings
export interface SystemSettings {
  sms_provider: string;
  sms_ru_api_key: string;
  sms_ru_api_key_set: boolean;
  smsc_login: string;
  smsc_password_set: boolean;
  debug_mode: boolean;
  embedding_provider: string;
  jina_api_key: string;
  jina_api_key_set: boolean;
}

export function adminGetSystemSettings(): Promise<SystemSettings> {
  return apiFetch("/api/admin/system-settings");
}

export function adminUpdateSystemSettings(data: Record<string, unknown>): Promise<{ status: string; updated: string[] }> {
  return apiFetch("/api/admin/system-settings", { method: "PATCH", body: JSON.stringify(data) });
}

// ═══════════════════════════════════════════════
//  ADMIN: CORE AGENTS
// ═══════════════════════════════════════════════

/** Админ: core-агенты (Помощник, Агент Админ, Агент Контента, Агент Железа) */
export function adminGetCoreAgents(): Promise<AgentDetailOut[]> {
  return apiFetch("/api/admin/core-agents");
}

export interface IntegrationItem { key: string; label: string; is_set: boolean; masked: string; }
export function adminGetIntegrations(): Promise<IntegrationItem[]> {
  return apiFetch("/api/admin/integrations");
}
export function adminSetIntegration(key: string, value: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/integrations/${key}`, { method: "PATCH", body: JSON.stringify({ value }) });
}
export interface EmbeddingConfigItem { key: string; label: string; options: string[] | null; value: string; }
export function adminGetEmbeddingConfig(): Promise<EmbeddingConfigItem[]> {
  return apiFetch("/api/admin/embedding-config");
}
export function adminSetEmbeddingConfig(key: string, value: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/embedding-config/${key}`, { method: "PATCH", body: JSON.stringify({ value }) });
}

// ═══════════════════════════════════════════════
//  ADMIN: SYSTEM INFO
// ═══════════════════════════════════════════════

export interface SystemServiceInfo {
  status: string;
  error?: string;
  memory_used?: string;
  url?: string;
  collections?: number;
  collection_names?: string[];
  total_users?: number;
  provider?: string;
  model?: string;
  key_set?: boolean;
  key?: string;
  sms_ru_key_set?: boolean;
  smsc_configured?: boolean;
  debug_mode?: boolean;
}

export interface SystemInfo {
  services: {
    redis: SystemServiceInfo;
    qdrant: SystemServiceInfo;
    postgres: SystemServiceInfo;
    embedding: SystemServiceInfo;
    sms: SystemServiceInfo;
  };
  llm_providers: Record<string, { connected: boolean; key: string; model: string }>;
  default_llm_provider: string;
}

/** Админ: полная информация о системе */
export function adminGetSystemInfo(): Promise<SystemInfo> {
  return apiFetch("/api/admin/system-info");
}

// ═══════════════════════════════════════════════
//  ADMIN: ASSISTANT SETTINGS
// ═══════════════════════════════════════════════

export interface AssistantTestResult {
  reply: string;
  provider: string;
  model: string;
  response_time_ms: number;
}

// Помощник (assistant) — актуальные эндпоинты
export interface AssistantSettings {
  provider: string;
  model: string;
  system_prompt: string;
  available_models: { value: string; label: string; group: string }[];
}

/** Админ: настройки Помощника */
export function adminGetAssistantSettings(): Promise<AssistantSettings> {
  return apiFetch("/api/admin/assistant-settings");
}

/** Админ: обновить настройки Помощника */
export function adminUpdateAssistantSettings(data: { provider?: string; model?: string; system_prompt?: string }): Promise<AssistantSettings> {
  return apiFetch("/api/admin/assistant-settings", { method: "PATCH", body: JSON.stringify(data) });
}

/** Админ: тест Помощника */
export function adminTestAssistant(message: string): Promise<AssistantTestResult> {
  return apiFetch("/api/admin/assistant-test", { method: "POST", body: JSON.stringify({ message }) });
}

/** Админ: тест конкретного агента (его модель + промпт + RAG) */
export function adminTestAgentChat(agentId: number, message: string): Promise<{ reply: string; model: string; rag_used: boolean; response_time_ms: number }> {
  return apiFetch("/api/admin/agents/" + agentId + "/test", { method: "POST", body: JSON.stringify({ message }) });
}

// ═══════════════════════════════════════════════
//  ADMIN: CONTRACTORS
// ═══════════════════════════════════════════════

export interface ContractorOut {
  id: number;
  uid?: string;
  company_name: string;
  inn?: string;
  legal_address?: string;
  actual_address?: string;
  bank_details?: string;
  director_name?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  login: string;
  balance_kopecks: number;
  discount_percent: number;
  is_active: boolean;
  created_at?: string;
}

export interface ContractorCreateData {
  company_name: string;
  login: string;
  password: string;
  inn?: string;
  legal_address?: string;
  actual_address?: string;
  bank_details?: string;
  director_name?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  discount_percent?: number;
}

export interface ContractorUpdateData {
  company_name?: string;
  inn?: string;
  legal_address?: string;
  actual_address?: string;
  bank_details?: string;
  director_name?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  discount_percent?: number;
  is_active?: boolean;
}

/** Админ: список контрагентов */
export function adminGetContractors(search?: string): Promise<ContractorOut[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/api/admin/contractors${q}`);
}

/** Админ: создать контрагента */
export function adminCreateContractor(data: ContractorCreateData): Promise<ContractorOut> {
  return apiFetch("/api/admin/contractors", { method: "POST", body: JSON.stringify(data) });
}

/** Админ: карточка контрагента */
export function adminGetContractor(id: number): Promise<ContractorOut> {
  return apiFetch(`/api/admin/contractors/${id}`);
}

/** Админ: обновить контрагента */
export function adminUpdateContractor(id: number, data: ContractorUpdateData): Promise<ContractorOut> {
  return apiFetch(`/api/admin/contractors/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

/** Админ: деактивировать контрагента */
export function adminDeleteContractor(id: number): Promise<void> {
  return apiFetch(`/api/admin/contractors/${id}`, { method: "DELETE" });
}

/** Админ: пополнить баланс */
export function adminAddBalance(id: number, amountKopecks: number): Promise<ContractorOut> {
  return apiFetch(`/api/admin/contractors/${id}/add-balance`, {
    method: "POST",
    body: JSON.stringify({ amount_kopecks: amountKopecks }),
  });
}

/** Админ: привязать агента к контрагенту */
export function adminAssignAgentToContractor(contractorId: number, agentId: number): Promise<AgentDetailOut> {
  return apiFetch(`/api/admin/contractors/${contractorId}/assign-agent`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
  });
}

// ═══════════════════════════════════════════════
//  CONTRACTOR AUTH (ЛК бизнеса)
// ═══════════════════════════════════════════════

export interface ContractorTokenResponse {
  access_token: string;
  token_type: string;
  contractor_id: number;
  company_name: string;
}

/** Contractor token storage */
let contractorToken: string | null = null;

export function setContractorToken(token: string | null) {
  contractorToken = token;
  if (token) {
    localStorage.setItem("jinntell_contractor_token", token);
  } else {
    localStorage.removeItem("jinntell_contractor_token");
  }
}

export function getContractorToken(): string | null {
  if (contractorToken) return contractorToken;
  if (typeof window !== "undefined") {
    contractorToken = localStorage.getItem("jinntell_contractor_token");
  }
  return contractorToken;
}

/** Fetch с contractor token */
async function contractorFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getContractorToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail || "Ошибка сервера");
  }
  return res.json();
}

/** Контрагент: вход по логину/паролю */
export async function contractorLogin(login: string, password: string): Promise<ContractorTokenResponse> {
  const data = await apiFetch<ContractorTokenResponse>("/api/contractor/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
  setContractorToken(data.access_token);
  localStorage.setItem("jinntell_contractor_session", JSON.stringify({
    contractorId: data.contractor_id,
    companyName: data.company_name,
  }));
  return data;
}

/** Контрагент: профиль */
export function contractorGetMe(): Promise<ContractorOut> {
  return contractorFetch("/api/contractor/me");
}

/** Контрагент: мои агенты */
export function contractorGetAgents(): Promise<AgentFullOut[]> {
  return contractorFetch("/api/contractor/agents");
}

/** Контрагент: обновить агента */
export function contractorUpdateAgent(id: number, data: AgentPersonaUpdate): Promise<AgentFullOut> {
  return contractorFetch(`/api/contractor/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export interface AccessUser {
  id: number;
  display_name: string;
  phone: string;
  jinntell_link?: string | null;
}
export function contractorGetAgentAccess(agentId: number): Promise<AccessUser[]> {
  return contractorFetch(`/api/contractor/agents/${agentId}/access`);
}
export function contractorAddAgentAccess(agentId: number, identifier: string): Promise<AccessUser> {
  return contractorFetch(`/api/contractor/agents/${agentId}/access`, { method: "POST", body: JSON.stringify({ identifier }) });
}
export function contractorRemoveAgentAccess(agentId: number, userId: number): Promise<{ ok: boolean }> {
  return contractorFetch(`/api/contractor/agents/${agentId}/access/${userId}`, { method: "DELETE" });
}

/** Контрагент: статистика агента */
export interface ContractorAgentStats {
  total_messages: number;
  messages_7d: number;
  messages_30d: number;
  last_activity: string | null;
  clients_total: number;
  returning_total: number;
  new_total: number;
  avg_dialog_len: number;
  rating: number;
  rating_count: number;
  by_hour: number[];
  by_day: { date: string; count: number }[];
}
export interface ContractorDialogItem {
  user_id: number;
  user_name: string;
  message_count: number;
  last_message: string;
  last_active: string | null;
}
export interface ContractorDialogMessage {
  id: number;
  sender_type: string;
  sender_name: string;
  text: string;
  created_at: string;
}
export function contractorGetAgentStats(id: number): Promise<ContractorAgentStats> {
  return contractorFetch(`/api/contractor/agents/${id}/stats`);
}
export function contractorGetDialogs(id: number): Promise<ContractorDialogItem[]> {
  return contractorFetch(`/api/contractor/agents/${id}/dialogs`);
}
export function contractorGetDialog(id: number, userId: number): Promise<ContractorDialogMessage[]> {
  return contractorFetch(`/api/contractor/agents/${id}/dialogs/${userId}`);
}

async function contractorUpload<T>(path: string, form: FormData): Promise<T> {
  const token = getContractorToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail || "Ошибка загрузки");
  }
  return res.json();
}

export interface WardrobeItem {
  id: number;
  image_url: string;
  label: string | null;
  occasion: string | null;
  is_active: boolean;
}
export interface StorageUsage {
  used_bytes: number;
  used_mb: number;
  quota_mb: number;
  percent: number;
}

export function mediaUrl(path: string): string {
  return path ? `${API_BASE}${path}` : "";
}
export function contractorUploadPhoto(agentId: number, file: File): Promise<{ photo_url: string }> {
  const f = new FormData(); f.append("file", file);
  return contractorUpload(`/api/contractor/agents/${agentId}/photo`, f);
}
export function contractorDeletePhoto(agentId: number): Promise<{ ok: boolean }> {
  return contractorFetch(`/api/contractor/agents/${agentId}/photo`, { method: "DELETE" });
}
export function contractorGetWardrobe(agentId: number): Promise<WardrobeItem[]> {
  return contractorFetch(`/api/contractor/agents/${agentId}/wardrobe`);
}
export function contractorAddWardrobe(agentId: number, file: File, label?: string): Promise<WardrobeItem> {
  const f = new FormData(); f.append("file", file); if (label) f.append("label", label);
  return contractorUpload(`/api/contractor/agents/${agentId}/wardrobe`, f);
}
export function contractorActivateWardrobe(agentId: number, itemId: number): Promise<{ ok: boolean }> {
  return contractorFetch(`/api/contractor/agents/${agentId}/wardrobe/${itemId}`, { method: "PATCH" });
}
export function contractorDeleteWardrobe(agentId: number, itemId: number): Promise<{ ok: boolean }> {
  return contractorFetch(`/api/contractor/agents/${agentId}/wardrobe/${itemId}`, { method: "DELETE" });
}
export function contractorGetStorage(): Promise<StorageUsage> {
  return contractorFetch(`/api/contractor/storage`);
}

/** Контрагент: выход */
export function contractorLogout() {
  setContractorToken(null);
  localStorage.removeItem("jinntell_contractor_session");
}

// ═══════════════════════════════════════════════
//  ADMIN: RAG (Парсер + Индексация)
// ═══════════════════════════════════════════════

export interface RAGSource {
  id: number;
  agent_id: number;
  source_type: string;
  url: string;
  title: string;
  layer: string;
  last_parsed_at?: string;
  last_change_found_at?: string;
  chunks_count: number;
  schedule: string;
  is_active: boolean;
  created_at?: string;
}

export interface RAGParseLog {
  id: number;
  agent_id: number;
  source_id: number;
  action: string;
  article_number?: string;
  chunks_added: number;
  chunks_updated: number;
  chunks_deleted: number;
  error_message?: string;
  parsed_at?: string;
}

export interface RAGStats {
  total_chunks_db: number;
  total_chunks_qdrant: number;
  collection_exists: boolean;
  vector_dimensions: number;
  sources_count: number;
}

export interface RAGSearchResult {
  text: string;
  score: number;
  article_number?: string;
  layer: string;
  source_title: string;
}

/** RAG: получить источники агента */
export function adminGetRAGSources(agentId: number): Promise<RAGSource[]> {
  return apiFetch(`/api/admin/rag/sources/${agentId}`);
}

/** RAG: добавить источник */
export function adminAddRAGSource(data: {
  agent_id: number; url: string; title?: string; source_type?: string; layer?: string; schedule?: string;
}): Promise<RAGSource> {
  return apiFetch("/api/admin/rag/sources", { method: "POST", body: JSON.stringify(data) });
}

/** RAG: удалить источник */
export function adminDeleteRAGSource(sourceId: number): Promise<void> {
  return apiFetch(`/api/admin/rag/sources/${sourceId}`, { method: "DELETE" });
}

/** RAG: запустить парсинг */
export function adminParseSource(sourceId: number): Promise<{ status: string; chunks_parsed: number; chunks_indexed: number }> {
  return apiFetch("/api/admin/rag/parse", { method: "POST", body: JSON.stringify({ source_id: sourceId }) });
}

/** RAG: индексировать сырой текст */
export function adminParseRawText(data: {
  agent_id: number; text: string; title?: string; layer?: string;
}): Promise<{ status: string; source_id: number; chunks_parsed: number; chunks_indexed: number }> {
  return apiFetch("/api/admin/rag/parse-text", { method: "POST", body: JSON.stringify(data) });
}

/** RAG: тестовый поиск */
export function adminSearchRAG(data: {
  agent_id: number; query: string; top_k?: number; layer?: string;
}): Promise<RAGSearchResult[]> {
  return apiFetch("/api/admin/rag/search", { method: "POST", body: JSON.stringify(data) });
}

/** RAG: статистика агента */
export function adminGetRAGStats(agentId: number): Promise<RAGStats> {
  return apiFetch(`/api/admin/rag/stats/${agentId}`);
}

/** RAG: лог парсинга */
export function adminGetRAGLog(agentId: number): Promise<RAGParseLog[]> {
  return apiFetch(`/api/admin/rag/log/${agentId}`);
}

/** RAG: удалить все chunks агента */
export function adminDeleteAllRAGChunks(agentId: number): Promise<void> {
  return apiFetch(`/api/admin/rag/chunks/${agentId}`, { method: "DELETE" });
}

// ═══════════════════════════════════════════════
//  CHAT — История + отправка
// ═══════════════════════════════════════════════

export interface MessageOut {
  id: number;
  room: string;
  sender_type: string;
  sender_user_id?: number;
  sender_agent_id?: number;
  sender_name: string;
  text: string;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  context?: boolean;
}

/** История сообщений */
export function getChatHistory(room: string = "general", limit: number = 50): Promise<MessageOut[]> {
  return apiFetch(`/api/chat/history?room=${room}&limit=${limit}`);
}

/** Отправить сообщение (HTTP fallback) */
export function sendMessage(room: string, text: string): Promise<MessageOut> {
  return apiFetch("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ room, text }),
  });
}

// ═══════════════════════════════════════════════
//  USER — Профиль
// ═══════════════════════════════════════════════

export interface UserProfile {
  id: number;
  phone: string;
  display_name: string;
  jinntell_link?: string;
  theme: string;
  avatar_color: string;
  background?: string;
  custom_accent?: string;
  is_online: boolean;
  is_admin: boolean;
  bio?: string;
  // Персональные данные
  email?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  city?: string;
  about?: string;
  // OAuth привязки
  vk_linked?: boolean;
  telegram_linked?: boolean;
  yandex_linked?: boolean;
  // Персонализация помощника
  assistant_name?: string;
  assistant_gender?: string;
  assistant_voice?: string;
  gender?: string;
  persona_gender?: string;
  interests?: string;
  avatar_url?: string;
  assistant_photo?: string;
  user_age?: number;
}

/** Профиль текущего пользователя */
export function getMe(): Promise<UserProfile> {
  return apiFetch("/api/users/me");
}
export async function uploadAssistantPhoto(file: File): Promise<{ photo_url: string }> {
  const token = getToken();
  const f = new FormData();
  f.append("file", file);
  const res = await fetch(`${API_BASE}/api/users/me/assistant-photo`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: f });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, b.detail || "Ошибка загрузки");
  }
  return res.json();
}
export async function uploadUserAvatar(file: File): Promise<{ avatar_url: string }> {
  const token = getToken();
  const f = new FormData();
  f.append("file", file);
  const res = await fetch(`${API_BASE}/api/users/me/avatar`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: f });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, b.detail || "Ошибка загрузки");
  }
  return res.json();
}
export function deleteUserAvatar(): Promise<{ ok: boolean }> {
  return apiFetch("/api/users/me/avatar", { method: "DELETE" });
}
export async function uploadChatMedia(file: File): Promise<{ url: string; type: string }> {
  const token = getToken();
  const f = new FormData();
  f.append("file", file);
  const res = await fetch(`${API_BASE}/api/chat/media`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: f });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, b.detail || "Ошибка загрузки");
  }
  return res.json();
}
export function deleteAssistantPhoto(): Promise<{ ok: boolean }> {
  return apiFetch("/api/users/me/assistant-photo", { method: "DELETE" });
}

export interface FeedEvent {
  id: number;
  kind: string;
  icon?: string | null;
  title: string;
  body?: string | null;
  link_room?: string | null;
  agent_id?: number | null;
  is_read: boolean;
  created_at: string;
}
export function getFeed(): Promise<FeedEvent[]> {
  return apiFetch("/api/feed");
}
export function markFeedRead(id: number): Promise<{ ok: boolean }> {
  return apiFetch(`/api/feed/${id}/read`, { method: "POST" });
}
export function dismissFeed(id: number): Promise<{ ok: boolean }> {
  return apiFetch(`/api/feed/${id}`, { method: "DELETE" });
}

export interface RoomMember {
  id: number;
  name: string;
  profession: string;
  color: string;
  photo_url?: string | null;
}
export interface RoomData {
  id: number;
  room: string;
  title?: string | null;
  members: RoomMember[];
}
export function createRoom(agentIds: number[], title?: string): Promise<RoomData> {
  return apiFetch("/api/rooms", { method: "POST", body: JSON.stringify({ agent_ids: agentIds, title }) });
}
export function inviteToRoom(roomId: number, agentId: number): Promise<RoomData> {
  return apiFetch(`/api/rooms/${roomId}/invite`, { method: "POST", body: JSON.stringify({ agent_id: agentId }) });
}
export interface LinkedBusiness { id: number; company_name: string; }
export function getMyBusinesses(): Promise<LinkedBusiness[]> {
  return apiFetch("/api/users/me/businesses");
}
export function getBusinessToken(contractorId: number): Promise<{ access_token: string; company_name: string; contractor_id: number }> {
  return apiFetch(`/api/users/me/businesses/${contractorId}/token`, { method: "POST" });
}

/** Обновить профиль */
export function updateMe(data: Partial<UserProfile>): Promise<UserProfile> {
  return apiFetch("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ═══════════════════════════════════════════════
//  WEBSOCKET — Реалтайм чат
// ═══════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function connectChat(room: string, onMessage: (msg: any) => void): WebSocket | null {
  const token = getToken();
  if (!token) return null;

  // В production: тот же хост, wss://; в dev: ws://localhost:8000
  let wsUrl: string;
  if (API_BASE && API_BASE !== "") {
    const wsBase = API_BASE.replace(/^http/, "ws");
    wsUrl = `${wsBase}/ws/chat/${room}?token=${token}`;
  } else if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    wsUrl = `${proto}://${window.location.host}/ws/chat/${room}?token=${token}`;
  } else {
    return null;
  }
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch { /* ignore parse errors */ }
  };

  return ws;
}

// ═══════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════

export function healthCheck(): Promise<{ status: string; service: string; version: string }> {
  return apiFetch("/api/health");
}
