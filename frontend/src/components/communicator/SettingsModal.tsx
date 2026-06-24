"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { updateMe, type UserProfile } from "@/services/api";

const THEMES = [
  { id: "noir-gold", name: "Noir Gold", desc: "Тёмный + золото" },
  { id: "cyberpunk", name: "Cyberpunk", desc: "Тёмный + неон" },
  { id: "arctic", name: "Arctic", desc: "Светлый + лёд" },
  { id: "midnight", name: "Midnight", desc: "Глубокий синий" },
  { id: "sunset", name: "Sunset", desc: "Тёплые градиенты" },
];

const GENDERS = [
  { id: "male", name: "Мужской", icon: "♂" },
  { id: "female", name: "Женский", icon: "♀" },
  { id: "neutral", name: "Нейтральный", icon: "⚬" },
];

const VOICES = [
  { id: "male_low", name: "Мужской низкий", desc: "Спокойный, глубокий", gender: "male" },
  { id: "male_high", name: "Мужской высокий", desc: "Энергичный, молодой", gender: "male" },
  { id: "female_soft", name: "Женский мягкий", desc: "Тёплый, спокойный", gender: "female" },
  { id: "female_energy", name: "Женский энергичный", desc: "Бодрый, уверенный", gender: "female" },
  { id: "neutral", name: "Нейтральный", desc: "Без выраженного пола", gender: "neutral" },
];

const SECTIONS = [
  "Персональные данные",
  "Настройки Помощника",
  "Настройка интерфейса",
  "Настройка персонажа",
  "Интересы и Контент",
  "Система",
];

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
  const [currentTheme, setCurrentTheme] = useState("noir-gold");

  // Персональные данные
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emailField, setEmailField] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [aboutField, setAboutField] = useState("");

  // Настройки помощника
  const [assistantName, setAssistantName] = useState("Джим");
  const [assistantGender, setAssistantGender] = useState("male");
  const [assistantVoice, setAssistantVoice] = useState("male_low");
  const [userAge, setUserAge] = useState("");
  const [wakeEnabled, setWakeEnabled] = useState(
    typeof window !== "undefined" && localStorage.getItem("jinntell_wake_enabled") === "1"
  );
  const [animOn, setAnimOn] = useState(
    typeof window === "undefined" || localStorage.getItem("jinntell_anim_off") !== "1"
  );

  // Состояние сохранения
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Загрузить данные пользователя
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
      setDisplayName(user.display_name || "");
      setEmailField(user.email || "");
      setPhone(user.phone || "");
      setBirthDate(user.birth_date || "");
      setCity(user.city || "");
      setAboutField(user.about || "");
      setAssistantName(user.assistant_name || "Джим");
      setAssistantGender(user.assistant_gender || "male");
      setAssistantVoice(user.assistant_voice || "male_low");
      setUserAge(user.user_age ? String(user.user_age) : "");
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const changeTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute("data-theme", themeId);
  };

  const handleSavePersonal = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await updateMe({
        display_name: displayName || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: emailField || undefined,
        birth_date: birthDate || undefined,
        city: city || undefined,
        about: aboutField || undefined,
      } as Partial<UserProfile>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally { setSaving(false); }
  };

  const handleSaveAssistant = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await updateMe({
        assistant_name: assistantName || "Джим",
        assistant_gender: assistantGender,
        assistant_voice: assistantVoice,
        user_age: userAge ? parseInt(userAge) : undefined,
      } as Partial<UserProfile>);
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

  const filteredVoices = VOICES.filter(
    (v) => v.gender === assistantGender || v.gender === "neutral"
  );

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
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Центр Управления
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
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
        {activeSection === "Персональные данные" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>

            <div className="flex flex-col gap-3">
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
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Отображаемое имя</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Как вас видят другие" className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
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
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>О себе</label>
                <textarea value={aboutField} onChange={(e) => setAboutField(e.target.value)} placeholder="Расскажите немного о себе..." rows={3} className="w-full px-3 py-2.5 rounded-xl outline-none text-sm resize-none" style={inputStyle} />
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

              <button onClick={handleSavePersonal} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: saving ? "var(--bg-glass-border)" : "var(--accent)", color: saving ? "var(--text-muted)" : "var(--bg-deep)" }}>
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

            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Настройте вашего персонального помощника — он будет общаться с вами в стиле, который вам подходит.
            </p>

            <div className="flex flex-col gap-4">
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

              {/* Фоновая анимация */}
              <div>
                <label className="flex items-center justify-between cursor-pointer gap-3">
                  <span className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Фоновая анимация</span>
                    <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Частицы на фоне. Отключите для скорости и экономии батареи</span>
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
                        if (g.id === "male") setAssistantVoice("male_low");
                        else if (g.id === "female") setAssistantVoice("female_soft");
                        else setAssistantVoice("neutral");
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

              {/* Ваш возраст */}
              <div>
                <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Ваш возраст</label>
                <input
                  type="number" value={userAge} onChange={(e) => setUserAge(e.target.value)}
                  placeholder="25" min="10" max="120"
                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Помощник адаптирует стиль общения под ваш возраст</p>
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

              <button onClick={handleSaveAssistant} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: saving ? "var(--bg-glass-border)" : "var(--accent)", color: saving ? "var(--text-muted)" : "var(--bg-deep)" }}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        )}

        {/* === НАСТРОЙКА ИНТЕРФЕЙСА === */}
        {activeSection === "Настройка интерфейса" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>
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
          </div>
        )}

        {/* === ОСТАЛЬНЫЕ РАЗДЕЛЫ (заглушки) === */}
        {activeSection !== null && activeSection !== "Персональные данные" && activeSection !== "Настройки Помощника" && activeSection !== "Настройка интерфейса" && (
          <div>
            <button onClick={() => setActiveSection(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: "var(--accent)" }}>
              ‹ Назад
            </button>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {activeSection} — в разработке
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
