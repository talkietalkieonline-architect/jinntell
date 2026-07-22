"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { updateMe, uploadAssistantPhoto, deleteAssistantPhoto, uploadUserAvatar, deleteUserAvatar, mediaUrl, getMyJinn, createMyJinn, updateAgent, clearAssistantMemory, getActionSettings, updateActionSettings, type UserProfile, type AgentFullOut } from "@/services/api";
import { backgroundsForTheme, defaultBgFor } from "@/components/communicator/AppBackground";

const THEMES = [
  { id: "light", name: "Светлая", desc: "Белый фон, тёмный текст" },
  { id: "dark", name: "Тёмная", desc: "Тёмный + золото" },
];

const GENDERS = [
  { id: "male", name: "Мужской", icon: "♂" },
  { id: "female", name: "Женский", icon: "♀" },
  { id: "neutral", name: "Нейтральный", icon: "⚬" },
];

const VOICES = [
  { id: "ermil", name: "Эрмил", desc: "Мужской, спокойный", gender: "male" },
  { id: "zahar", name: "Захар", desc: "Мужской, уверенный", gender: "male" },
  { id: "filipp", name: "Филипп", desc: "Мужской, мягкий", gender: "male" },
  { id: "madirus", name: "Мадирус", desc: "Мужской, нейтральный", gender: "male" },
  { id: "alena", name: "Алёна", desc: "Женский, тёплый", gender: "female" },
  { id: "jane", name: "Джейн", desc: "Женский, эмоциональный", gender: "female" },
  { id: "oksana", name: "Оксана", desc: "Женский, классический", gender: "female" },
  { id: "omazh", name: "Омаж", desc: "Женский, выразительный", gender: "female" },
];

const SECTIONS = [
  "Настройки пользователя",
  "Настройки действий",
  "Настройки Помощника",
  "Настройка интерфейса",
];

const INTEREST_TOPICS = ["Космос", "Технологии", "Спорт", "Кино", "Музыка", "Игры", "Бизнес", "Здоровье", "Путешествия", "Мода", "Наука", "Авто", "Кулинария", "Искусство", "Финансы", "Психология"];

export default function SettingsModal({
  isOpen,
  onClose,
  onLogout,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}) {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("jinntell_theme") || "light" : "light"));
  const [customAccent, setCustomAccent] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("jinntell_accent") || "#6c7bff" : "#6c7bff"));
  const [bgId, setBgId] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("jinntell_bg") || "indigo" : "indigo"));

  // Персональные данные
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emailField, setEmailField] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [aboutField, setAboutField] = useState("");
  const [gender, setGender] = useState("");
  const [personaGender, setPersonaGender] = useState("");
  const [username, setUsername] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Настройки помощника
  const [assistantName, setAssistantName] = useState("Джим");
  const [assistantGender, setAssistantGender] = useState("male");
  const [assistantVoice, setAssistantVoice] = useState("male_low");
  const [assistantPhoto, setAssistantPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [assistantAge, setAssistantAge] = useState("");
  const [wakeEnabled, setWakeEnabled] = useState(
    typeof window !== "undefined" && localStorage.getItem("jinntell_wake_enabled") === "1"
  );
  const [animOn, setAnimOn] = useState(
    typeof window === "undefined" || localStorage.getItem("jinntell_anim_off") !== "1"
  );
  const [actApproaches, setActApproaches] = useState("all");
  const [actLocation, setActLocation] = useState(false);
  const [actPromo, setActPromo] = useState(true);
  const [textScale, setTextScale] = useState(
    typeof window !== "undefined" ? localStorage.getItem("jinntell_text_scale") || "1" : "1"
  );

  // Состояние сохранения
  const [saving, setSaving] = useState(false);
  const [myJinn, setMyJinn] = useState<AgentFullOut | null>(null);
  const [jName, setJName] = useState("");
  const [jDesc, setJDesc] = useState("");
  const [jGreet, setJGreet] = useState("");
  const [jinnSaving, setJinnSaving] = useState(false);
  const [jinnMsg, setJinnMsg] = useState("");
  useEffect(() => {
    if (!isOpen) return;
    getMyJinn().then((a) => { if (a) { setMyJinn(a); setJName(a.name); setJDesc(a.description || ""); setJGreet(a.greeting || ""); } }).catch(() => {});
    getActionSettings().then((s) => { setActApproaches(s.approaches); setActLocation(s.allow_location); setActPromo(s.allow_promo); }).catch(() => {});
  }, [isOpen]);
  const createJinn = async () => {
    setJinnSaving(true);
    try { const a = await createMyJinn(); setMyJinn(a); setJName(a.name); setJDesc(a.description || ""); setJGreet(a.greeting || ""); } catch { /* noop */ } finally { setJinnSaving(false); }
  };
  const saveJinn = async () => {
    if (!myJinn) return;
    setJinnSaving(true); setJinnMsg("");
    try { const a = await updateAgent(myJinn.id, { description: jDesc, greeting: jGreet }); setMyJinn(a); setJinnMsg("Сохранено!"); setTimeout(() => setJinnMsg(""), 2000); } catch { /* noop */ } finally { setJinnSaving(false); }
  };
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Загрузить данные пользователя
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
      setDisplayName(user.display_name || "");
      setUsername(user.jinntell_link || "");
      setEmailField(user.email || "");
      setPhone(user.phone || "");
      setBirthDate(user.birth_date || "");
      setCity(user.city || "");
      setAboutField(user.about || "");
      setGender(user.gender || "");
      setPersonaGender(user.persona_gender || "");
      setInterests((user.interests || "").split(",").map((x) => x.trim()).filter(Boolean));
      setAvatarUrl(user.avatar_url || null);
      setAssistantName(user.assistant_name || "Джим");
      setAssistantGender(user.assistant_gender || "male");
      setAssistantPhoto(user.assistant_photo || null);
const _av = user.assistant_voice || "ermil";
      setAssistantVoice(_av);
      if (typeof window !== "undefined") localStorage.setItem("jinntell_assistant_voice", _av);
      setAssistantAge(user.assistant_age != null ? String(user.assistant_age) : "");
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const changeTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute("data-theme", themeId);
    localStorage.setItem("jinntell_theme", themeId);
    const bg = defaultBgFor(themeId);
    setBgId(bg);
    localStorage.setItem("jinntell_bg", bg);
    window.dispatchEvent(new Event("jinntell_theme_change"));
    window.dispatchEvent(new Event("jinntell_bg_change"));
    updateMe({ theme: themeId, background: bg } as Partial<UserProfile>).catch(() => {});
  };

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploading(true); setError("");
    try { const r = await uploadUserAvatar(file); setAvatarUrl(r.avatar_url); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setAvatarUploading(false); }
  };
  const handleAvatarDelete = async () => {
    try { await deleteUserAvatar(); setAvatarUrl(null); } catch { /* noop */ }
  };

  const handleSavePersonal = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await updateMe({
        display_name: displayName || firstName || undefined,
        jinntell_link: username || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: emailField || undefined,
        birth_date: birthDate || undefined,
        city: city || undefined,
        about: aboutField || undefined,
        gender: gender || undefined,
        persona_gender: personaGender || undefined,
        interests: interests.join(",") || undefined,
      } as Partial<UserProfile>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally { setSaving(false); }
  };

  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true); setError("");
    try { const r = await uploadAssistantPhoto(file); setAssistantPhoto(r.photo_url); window.dispatchEvent(new CustomEvent("jinntell_assistant_photo", { detail: r.photo_url })); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setPhotoUploading(false); }
  };
  const handlePhotoDelete = async () => {
    try { await deleteAssistantPhoto(); setAssistantPhoto(null); window.dispatchEvent(new CustomEvent("jinntell_assistant_photo", { detail: null })); } catch { /* noop */ }
  };

  const handleSaveAssistant = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await updateMe({
        assistant_name: assistantName || "Джим",
        assistant_gender: assistantGender,
        assistant_voice: assistantVoice,
        assistant_age: assistantAge ? parseInt(assistantAge) : undefined,
      } as Partial<UserProfile>);
      localStorage.setItem("jinntell_assistant_voice", assistantVoice);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally { setSaving(false); }
  };

  const inputStyle = {
    background: "var(--bg-glass)",
    border: "1px solid var(--bg-glass-border)",
    color: "var(--text-primary)",
  };

  const filteredVoices = assistantGender === "male" || assistantGender === "female" ? VOICES.filter((v) => v.gender === assistantGender) : VOICES;

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
          backdropFilter: "blur(12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Центр Управления
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-70"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--bg-glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            ✕
          </button>
        </div>

        {/* === ГЛАВНОЕ МЕНЮ === */}
        {activeSection === null && (
          <div className="flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <button
                key={section}
                onClick={() => { setActiveSection(section); setError(""); setSaved(false); }}
                className="flex items-center justify-between px-4 py-3.5 rounded-xl text-left text-sm transition-all"
                style={{ color: "var(--text-primary)", background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {section}
                <span style={{ color: "var(--text-muted)" }}>›</span>
              </button>
            ))}

            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--bg-glass-border)" }}>
              <button
                onClick={() => { onClose(); onLogout?.(); }}
                className="flex items-center gap-2.5 w-full px-4 py-3.5 rounded-xl text-left text-sm transition-all"
                style={{ color: "var(--danger)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(231,76,60,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Выйти
              </button>
            </div>
          </div>
        )}

        {/* === ПЕРСОНАЛЬНЫЕ ДАННЫЕ === */}
        {activeSection === "Настройки пользователя" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>
            <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{activeSection}</h2>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-2 mb-1">
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                  {avatarUrl ? <img src={avatarUrl.startsWith("data:") ? avatarUrl : mediaUrl(avatarUrl)} alt="Аватар" className="w-full h-full object-cover" /> : <span className="text-3xl" style={{ color: "var(--text-muted)" }}>{(displayName || firstName || "?")[0]}</span>}
                </div>
                <div className="flex gap-2">
                  <label className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                    {avatarUploading ? "Загрузка..." : "Загрузить аватар"}
                    <input type="file" accept="image/*" className="hidden" disabled={avatarUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ""; }} />
                  </label>
                  {avatarUrl && <button onClick={handleAvatarDelete} className="px-3 py-1.5 rounded-lg text-[11px]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-muted)" }}>Удалить</button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Имя</label>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Фамилия</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Ник · так вас видят собеседники</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Кем хотите быть (хоть Дарт Вейдер)" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>@username · чтобы вас находили</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase())} placeholder="username" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Образ · как к вам обращаться</label>
                <div className="flex gap-2">
                  {[{ id: "", label: "Не указывать" }, { id: "male", label: "Муж." }, { id: "female", label: "Жен." }, { id: "neutral", label: "Нейтр." }].map((g) => (
                    <button key={g.id || "none"} onClick={() => setPersonaGender(g.id)} className="flex-1 py-2 rounded-xl text-[12px] font-medium transition-all" style={{ background: personaGender === g.id ? "var(--accent)" : "var(--bg-glass)", color: personaGender === g.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${personaGender === g.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>{g.label}</button>
                  ))}
                </div>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Публичный образ — может отличаться от реального пола.</p>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Телефон (логин)</label>
                <input type="tel" value={phone} readOnly className="w-full px-3 py-2.5 rounded-xl outline-none text-sm opacity-60 cursor-not-allowed" style={inputStyle} />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Email <span className="normal-case tracking-normal ml-1" style={{ color: "var(--text-muted)", fontSize: "10px" }}>(для восстановления пароля)</span>
                </label>
                <input type="email" value={emailField} onChange={(e) => setEmailField(e.target.value)} placeholder="email@example.com" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Дата рождения</label>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Город</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Москва" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Пол (реальный · виден только сервису)</label>
                <div className="flex gap-2">
                  {[{ id: "male", label: "Мужской" }, { id: "female", label: "Женский" }, { id: "other", label: "Другой" }].map((g) => (
                    <button key={g.id} onClick={() => setGender(g.id)} className="flex-1 py-2 rounded-xl text-sm font-medium transition-all" style={{ background: gender === g.id ? "var(--accent)" : "var(--bg-glass)", color: gender === g.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${gender === g.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>{g.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Статус</label>
                <textarea value={aboutField} onChange={(e) => setAboutField(e.target.value)} placeholder="Ваш статус — коротко о себе или настроение" rows={3} className="w-full px-3 py-2.5 rounded-xl outline-none text-sm resize-none" style={inputStyle} />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Интересы и темы контента</label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_TOPICS.map((t) => { const on = interests.includes(t); return (
                    <button key={t} onClick={() => setInterests((p) => (on ? p.filter((x) => x !== t) : [...p, t]))} className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all" style={{ background: on ? "var(--accent)" : "var(--bg-glass)", color: on ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${on ? "var(--accent)" : "var(--bg-glass-border)"}` }}>{t}</button>
                  ); })}
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Привязанные аккаунты</label>
                <div className="flex flex-col gap-2">
                  {[
                    { name: "ВКонтакте", linked: user?.vk_linked, icon: "\uD83D\uDFE6" },
                    { name: "Telegram", linked: user?.telegram_linked, icon: "✈️" },
                    { name: "Яндекс", linked: user?.yandex_linked, icon: "\uD83D\uDFE1" },
                  ].map((acc) => (
                    <div key={acc.name} className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm" style={inputStyle}>
                      <span style={{ color: "var(--text-primary)" }}>{acc.icon} {acc.name}</span>
                      {acc.linked ? (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(46,204,113,0.15)", color: "#2ecc71" }}>Привязан</span>
                      ) : (
                        <button className="text-xs" style={{ color: "var(--accent)" }}>Привязать</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-center" style={{ color: "var(--danger)" }}>{error}</p>}
              {saved && <p className="text-xs text-center" style={{ color: "#2ecc71" }}>Сохранено!</p>}

              {/* Баланс */}
              <div className="pt-4" style={{ borderTop: "1px solid var(--bg-glass-border)" }}>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Баланс</label>
                <div className="text-lg font-semibold" style={{ color: "var(--accent)" }}>{(((user?.balance_kopecks ?? 0)) / 100).toLocaleString("ru")} ₽</div>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Списывается за платных джиннов и вашего джинна. Пополнение — скоро.</p>
                <button onClick={async () => { if (confirm("Очистить всё, что помощник запомнил о вас?")) { try { await clearAssistantMemory(); alert("Память помощника очищена"); } catch { /* noop */ } } }} className="mt-2 text-[12px] transition-opacity hover:opacity-70" style={{ color: "var(--text-muted)" }}>🧠 Очистить память помощника</button>
              </div>

              {/* Мой джинн в Городе */}
              <div className="pt-4" style={{ borderTop: "1px solid var(--bg-glass-border)" }}>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Мой джинн в Городе</label>
                {!myJinn ? (
                  <div>
                    <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>Ваш представитель в Городе — с ним смогут познакомиться и написать другие.</p>
                    <button onClick={createJinn} disabled={jinnSaving} className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90" style={{ background: "var(--bg-glass)", border: "1px solid var(--accent)", color: "var(--accent)" }}>{jinnSaving ? "Создаю…" : "🧞 Создать моего джинна"}</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Имя: <b>{jName}</b> — из вашего профиля (поле «Ник»)</p>
                    <textarea value={jDesc} onChange={(e) => setJDesc(e.target.value)} placeholder="О себе — что увидят собеседники" rows={2} className="w-full px-3 py-2 rounded-xl outline-none text-sm resize-none" style={inputStyle} />
                    <input value={jGreet} onChange={(e) => setJGreet(e.target.value)} placeholder="Приветствие" className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
                    <button onClick={saveJinn} disabled={jinnSaving} className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>{jinnSaving ? "Сохранение…" : "Сохранить джинна"}</button>
                    {jinnMsg && <p className="text-[11px] text-center" style={{ color: "#2ecc71" }}>{jinnMsg}</p>}
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Виден в Городе → Жители. Аватар и цвет берутся из профиля.</p>
                  </div>
                )}
              </div>

              <button onClick={handleSavePersonal} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: saving ? "var(--bg-glass-border)" : "var(--accent)", color: saving ? "var(--text-muted)" : "var(--bg-deep)" }}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        )}

        {/* === НАСТРОЙКИ ПОМОЩНИКА === */}
        {activeSection === "Настройки Помощника" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>
            <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{activeSection}</h2>

            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Настройте вашего персонального помощника — он будет общаться с вами в стиле, который вам подходит.
            </p>

            <div className="flex flex-col gap-4">
              {/* Фото помощника */}
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                  {assistantPhoto ? <img src={assistantPhoto.startsWith("data:") ? assistantPhoto : mediaUrl(assistantPhoto)} alt="Помощник" className="w-full h-full object-cover" /> : <span className="text-3xl opacity-40">🧞</span>}
                </div>
                <div className="flex gap-2">
                  <label className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                    {photoUploading ? "Загрузка..." : "Загрузить фото"}
                    <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }} />
                  </label>
                  {assistantPhoto && <button onClick={handlePhotoDelete} className="px-3 py-1.5 rounded-lg text-[11px]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-muted)" }}>Удалить</button>}
                </div>
              </div>

              {/* Имя помощника */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Имя помощника</label>
                <input
                  type="text" value={assistantName} onChange={(e) => setAssistantName(e.target.value)}
                  placeholder="Джим"
                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Так вы будете обращаться к помощнику</p>
              </div>

              {/* Активация по имени (wake-word) */}
              <div>
                <label className="flex items-center justify-between cursor-pointer gap-3">
                  <span className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Активация по имени</span>
                    <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Произнесите «{assistantName || "Джим"}», чтобы помощник начал слушать</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={wakeEnabled}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setWakeEnabled(on);
                      localStorage.setItem("jinntell_wake_enabled", on ? "1" : "0");
                      window.dispatchEvent(new Event("jinntell_wake_change"));
                    }}
                    className="w-5 h-5 shrink-0 cursor-pointer"
                    style={{ accentColor: "var(--accent)" }}
                  />
                </label>
              </div>


              {/* Пол помощника */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Пол помощника</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setAssistantGender(g.id);
                        // Авто-переключение голоса при смене пола
                        if (g.id === "male") setAssistantVoice("ermil");
                        else if (g.id === "female") setAssistantVoice("alena");
                        else setAssistantVoice("ermil");
                      }}
                      className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl text-sm transition-all"
                      style={{
                        background: assistantGender === g.id ? "var(--bg-glass-hover)" : "var(--bg-glass)",
                        border: assistantGender === g.id ? "1px solid var(--accent)" : "1px solid var(--bg-glass-border)",
                        color: assistantGender === g.id ? "var(--accent)" : "var(--text-primary)",
                      }}
                    >
                      <span className="text-lg">{g.icon}</span>
                      <span className="text-xs">{g.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Возраст помощника */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Возраст помощника</label>
                <input
                  type="number" value={assistantAge} onChange={(e) => setAssistantAge(e.target.value)}
                  placeholder="25" min="10" max="120"
                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Возраст влияет на манеру общения помощника</p>
              </div>

              {/* Голос помощника */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Голос помощника</label>
                <div className="flex flex-col gap-2">
                  {filteredVoices.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setAssistantVoice(v.id)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: assistantVoice === v.id ? "var(--bg-glass-hover)" : "var(--bg-glass)",
                        border: assistantVoice === v.id ? "1px solid var(--accent)" : "1px solid var(--bg-glass-border)",
                      }}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        style={{
                          background: assistantVoice === v.id ? "var(--accent)" : "var(--bg-glass-border)",
                          boxShadow: assistantVoice === v.id ? "0 0 8px var(--accent-glow)" : "none",
                        }}
                      />
                      <div>
                        <div className="text-sm" style={{ color: assistantVoice === v.id ? "var(--accent)" : "var(--text-primary)" }}>{v.name}</div>
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-center" style={{ color: "var(--danger)" }}>{error}</p>}
              {saved && <p className="text-xs text-center" style={{ color: "#2ecc71" }}>Сохранено!</p>}

              <button onClick={handleSaveAssistant} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: saving ? "var(--bg-glass-border)" : "var(--accent)", color: saving ? "var(--text-muted)" : "var(--bg-deep)" }}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        )}

        {activeSection === "Настройки действий" && (
          <div className="animate-fade-in">
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>‹ Назад</button>
            <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{activeSection}</h2>
            <p className="text-[12px] mb-5" style={{ color: "var(--text-muted)" }}>Вы решаете, что вам могут показывать джинны и система.</p>

            <div className="mb-5">
              <span className="text-[11px] uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Обращения от джиннов</span>
              <div className="flex flex-col gap-1.5">
                {[
                  { id: "all", label: "Принимать сразу", desc: "Джинны могут обращаться и показывать предложения" },
                  { id: "assistant", label: "Только через помощника", desc: "Обращения собирает помощник — покажет, когда спросите" },
                  { id: "off", label: "Не беспокоить", desc: "Никаких обращений от джиннов" },
                ].map((o) => (
                  <button key={o.id} onClick={() => { setActApproaches(o.id); updateActionSettings({ approaches: o.id as "all" | "assistant" | "off" }).catch(() => {}); }}
                    className="px-4 py-2.5 rounded-xl text-left transition-all"
                    style={{ background: actApproaches === o.id ? "var(--accent)" : "var(--bg-glass)", border: `1px solid ${actApproaches === o.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
                    <span className="text-sm block" style={{ color: actApproaches === o.id ? "var(--bg-deep)" : "var(--text-primary)" }}>{o.label}</span>
                    <span className="text-[10px]" style={{ color: actApproaches === o.id ? "var(--bg-deep)" : "var(--text-muted)" }}>{o.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <span className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Предложения рядом</span>
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Разрешить геолокацию — джинны рядом (кафе, магазины) смогут предложить акции. Выключено — вас не найдут по месту.</span>
                </span>
                <input type="checkbox" checked={actLocation} onChange={(e) => { const on = e.target.checked; setActLocation(on); updateActionSettings({ allow_location: on }).catch(() => {}); }} className="w-5 h-5 shrink-0 cursor-pointer" style={{ accentColor: "var(--accent)" }} />
              </label>
            </div>

            <div className="mb-4">
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <span className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Акции и купоны</span>
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Показывать купоны, флаеры и подарки от бизнес-джиннов.</span>
                </span>
                <input type="checkbox" checked={actPromo} onChange={(e) => { const on = e.target.checked; setActPromo(on); updateActionSettings({ allow_promo: on }).catch(() => {}); }} className="w-5 h-5 shrink-0 cursor-pointer" style={{ accentColor: "var(--accent)" }} />
              </label>
            </div>

            <button onClick={() => { setSaved(true); setTimeout(() => onClose(), 600); }} className="w-full mt-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>Готово</button>
            {saved && <p className="text-xs text-center mt-2" style={{ color: "#2ecc71" }}>Сохранено!</p>}
          </div>
        )}

        {/* === НАСТРОЙКА ИНТЕРФЕЙСА === */}
        {activeSection === "Настройка интерфейса" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>
            <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{activeSection}</h2>
            <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>Тема оформления</h3>
            <div className="flex flex-col gap-2">
              {THEMES.map((theme) => (
                <button key={theme.id} onClick={() => changeTheme(theme.id)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all" style={{ background: theme.id === currentTheme ? "var(--bg-glass-hover)" : "transparent", border: theme.id === currentTheme ? "1px solid var(--accent)" : "1px solid transparent" }}>
                  <div className="w-4 h-4 rounded-full" style={{ background: theme.id === currentTheme ? "var(--accent)" : "var(--bg-glass-border)", boxShadow: theme.id === currentTheme ? "0 0 10px var(--accent-glow)" : "none" }} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{theme.name}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{theme.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <h3 className="text-sm font-medium mb-3 mt-6" style={{ color: "var(--text-primary)" }}>Фон</h3>
            <div className="grid grid-cols-3 gap-2">
              {backgroundsForTheme(currentTheme).map((b) => (
                <button key={b.id} onClick={() => { setBgId(b.id); localStorage.setItem("jinntell_bg", b.id); window.dispatchEvent(new Event("jinntell_bg_change")); updateMe({ background: b.id } as Partial<UserProfile>).catch(() => {}); }}
                  className="rounded-xl overflow-hidden transition-all" style={{ border: bgId === b.id ? "2px solid var(--accent)" : "1px solid var(--bg-glass-border)" }}>
                  <div className="h-12 w-full" style={{ background: b.preview }} />
                  <div className="text-[10px] py-1 text-center" style={{ color: bgId === b.id ? "var(--accent)" : "var(--text-muted)" }}>{b.name}</div>
                </button>
              ))}
            </div>
            {currentTheme === "custom" && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Цвет акцента</span>
                <input type="color" value={customAccent} onChange={(e) => { const c = e.target.value; setCustomAccent(c); document.documentElement.style.setProperty("--custom-accent", c); localStorage.setItem("jinntell_accent", c); updateMe({ custom_accent: c } as Partial<UserProfile>).catch(() => {}); }} className="w-12 h-8 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Загрузка своих обоев — скоро</span>
              </div>
            )}
            <div className="mt-4">
              <span className="text-[11px] uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Размер текста</span>
              <div className="flex gap-2">
                {[{ id: "0.9", label: "Мелкий" }, { id: "1", label: "Обычный" }, { id: "1.2", label: "Крупный" }].map((o) => (
                  <button key={o.id} onClick={() => { setTextScale(o.id); localStorage.setItem("jinntell_text_scale", o.id); document.documentElement.style.setProperty("--chat-text-scale", o.id); }} className="flex-1 py-2 rounded-xl text-sm font-medium transition-all" style={{ background: textScale === o.id ? "var(--accent)" : "var(--bg-glass)", color: textScale === o.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${textScale === o.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>{o.label}</button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <span className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Анимация фона</span>
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Отключите для скорости и экономии батареи (слабые устройства)</span>
                </span>
                <input
                  type="checkbox"
                  checked={animOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAnimOn(on);
                    localStorage.setItem("jinntell_anim_off", on ? "0" : "1");
                    window.dispatchEvent(new Event("jinntell_anim_change"));
                  }}
                  className="w-5 h-5 shrink-0 cursor-pointer"
                  style={{ accentColor: "var(--accent)" }}
                />
              </label>
            </div>
            <button onClick={() => { setSaved(true); setTimeout(() => onClose(), 600); }} className="w-full mt-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>Готово</button>
            {saved && <p className="text-xs text-center mt-2" style={{ color: "#2ecc71" }}>Сохранено!</p>}
          </div>
        )}

        {/* === ОСТАЛЬНЫЕ РАЗДЕЛЫ (заглушки) === */}
        {activeSection !== null && activeSection !== "Настройки пользователя" && activeSection !== "Настройки Помощника" && activeSection !== "Настройка интерфейса" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>
            <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{activeSection}</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {activeSection} — в разработке
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
