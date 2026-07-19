"use client";
import { useState, useEffect, useRef } from "react";
import {
  login as apiLogin,
  register as apiRegister,
  forgotPassword,
  resetPassword,
  contractorLogin,
  getOAuthVKUrl,
  getOAuthYandexUrl,
  type UserProfile,
} from "@/services/api";

type AuthStep = "login" | "register" | "forgot" | "reset_code";

function formatPhone(digits: string): string {
  const d = digits.slice(0, 10);
  let result = "";
  if (d.length > 0) result += "(" + d.slice(0, 3);
  if (d.length >= 3) result += ") ";
  if (d.length > 3) result += d.slice(3, 6);
  if (d.length > 6) result += "-" + d.slice(6, 8);
  if (d.length > 8) result += "-" + d.slice(8, 10);
  return result;
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export default function LoginScreen({ onLogin, onBusinessLogin }: { onLogin: (userData?: Partial<UserProfile>) => void; onBusinessLogin?: () => void }) {
  const [step, setStep] = useState<AuthStep>("login");
  const [digits, setDigits] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [debugCode, setDebugCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountMode, setAccountMode] = useState<"user" | "business">("user");
  const [bizLogin, setBizLogin] = useState("");
  const [bizPassword, setBizPassword] = useState("");
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("jinntell_phone");
    if (saved) setDigits(onlyDigits(saved).slice(0, 10));
  }, []);

  const fullPhone = "+7" + digits;
  const isPhoneComplete = digits.length === 10;

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDigits(onlyDigits(e.target.value).slice(0, 10));
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") { e.preventDefault(); action(); }
  };

  // === ВХОД ===
  const handleLogin = async () => {
    if (!isPhoneComplete || !password) return;
    setError(""); setSending(true);
    localStorage.setItem("jinntell_phone", digits);
    try {
      const res = await apiLogin(fullPhone, password);
      onLogin({ id: res.user_id, phone: fullPhone, display_name: res.display_name, is_admin: res.is_admin } as Partial<UserProfile>);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка входа";
      // Fallback: оффлайн-режим
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
        localStorage.setItem("jinntell_session", JSON.stringify({
          phone: fullPhone, loggedIn: true, expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }));
        onLogin({ phone: fullPhone } as Partial<UserProfile>);
      } else {
        setError(msg);
      }
    } finally { setSending(false); }
  };

  // === РЕГИСТРАЦИЯ ===
  const handleRegister = async () => {
    if (!isPhoneComplete || !password) return;
    if (password.length < 6) { setError("Пароль минимум 6 символов"); return; }
    if (password !== confirmPassword) { setError("Пароли не совпадают"); return; }
    setError(""); setSending(true);
    localStorage.setItem("jinntell_phone", digits);
    try {
      const res = await apiRegister({
        phone: fullPhone,
        password,
        email: email || undefined,
      });
      onLogin({ id: res.user_id, phone: fullPhone, display_name: res.display_name, is_admin: res.is_admin } as Partial<UserProfile>);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка регистрации");
    } finally { setSending(false); }
  };

  // === ЗАБЫЛ ПАРОЛЬ ===
  const handleForgotPassword = async () => {
    if (!email) { setError("Введите email"); return; }
    setError(""); setSending(true);
    try {
      const res = await forgotPassword(email);
      if (res.debug_code) setDebugCode(res.debug_code);
      setStep("reset_code");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setSending(false); }
  };

  // === СБРОС ПАРОЛЯ ===
  const handleResetPassword = async () => {
    if (!resetCode || !newPassword) return;
    if (newPassword.length < 6) { setError("Пароль минимум 6 символов"); return; }
    setError(""); setSending(true);
    try {
      const res = await resetPassword({ email, code: resetCode, new_password: newPassword });
      onLogin({ id: res.user_id, phone: fullPhone, display_name: res.display_name, is_admin: res.is_admin } as Partial<UserProfile>);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setSending(false); }
  };

  // === OAuth ===
  const handleOAuthVK = () => { window.location.href = getOAuthVKUrl(); };
  const handleOAuthYandex = () => { window.location.href = getOAuthYandexUrl(); };

  const handleBusinessLogin = async () => {
    if (!bizLogin || !bizPassword) return;
    setError(""); setSending(true);
    try {
      await contractorLogin(bizLogin, bizPassword);
      onBusinessLogin?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    } finally { setSending(false); }
  };

  // ======= Общие компоненты =======

  const PhoneField = () => (
    <div
      className="flex items-center rounded-xl overflow-hidden transition-all"
      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
      onClick={() => phoneInputRef.current?.focus()}
    >
      <div className="flex items-center gap-1.5 pl-4 pr-2 py-3.5 shrink-0" style={{ color: "var(--text-primary)" }}>
        <span className="text-lg">🇷🇺</span>
        <span className="text-base font-medium">+7</span>
      </div>
      <input
        ref={phoneInputRef}
        type="tel"
        inputMode="numeric"
        placeholder="(___) ___-__-__"
        value={formatPhone(digits)}
        onChange={handlePhoneInput}
        onKeyDown={(e) => handleKeyDown(e, step === "login" ? handleLogin : handleRegister)}
        className="flex-1 py-3.5 pr-4 bg-transparent outline-none text-base"
        style={{ color: "var(--text-primary)", caretColor: "var(--accent)" }}
        autoFocus
      />
    </div>
  );

  const PasswordField = ({ value, onChange, placeholder = "Пароль", onSubmit }: {
    value: string; onChange: (v: string) => void; placeholder?: string; onSubmit?: () => void;
  }) => (
    <div
      className="flex items-center rounded-xl overflow-hidden"
      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
    >
      <input
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setError("")}
        onKeyDown={(e) => onSubmit && handleKeyDown(e, onSubmit)}
        className="flex-1 px-4 py-3.5 bg-transparent outline-none text-base"
        style={{ color: "var(--text-primary)", caretColor: "var(--accent)", WebkitAppearance: "none" }}
        autoComplete="off"
      />
      <button
        onClick={() => setShowPassword(!showPassword)}
        className="px-3 py-3.5 shrink-0"
        style={{ color: "var(--text-muted)" }}
        type="button"
      >
        {showPassword ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );

  const InputField = ({ value, onChange, placeholder, type = "text", onSubmit }: {
    value: string; onChange: (v: string) => void; placeholder: string; type?: string; onSubmit?: () => void;
  }) => (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setError("")}
      onKeyDown={(e) => onSubmit && handleKeyDown(e, onSubmit)}
      className="w-full px-4 py-3.5 rounded-xl outline-none text-base"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--bg-glass-border)",
        color: "var(--text-primary)",
        caretColor: "var(--accent)",
      }}
    />
  );

  const SubmitButton = ({ onClick, disabled, children }: {
    onClick: () => void; disabled: boolean; children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: disabled ? "var(--bg-glass-border)" : "var(--accent)",
        color: disabled ? "var(--text-muted)" : "var(--bg-deep)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );

  const OAuthButtons = () => (
    <div className="flex flex-col gap-3 mt-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "var(--bg-glass-border)" }} />
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>или</span>
        <div className="flex-1 h-px" style={{ background: "var(--bg-glass-border)" }} />
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleOAuthVK}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" fill="currentColor"><path d="M25.54 34.58c-12.04 0-18.9-8.24-19.18-21.95h6.02c.2 10.04 4.62 14.3 8.12 15.18V12.63h5.66v8.66c3.46-.38 7.1-4.36 8.32-8.66h5.66c-.94 3.26-3.94 7.24-6.2 8.5 2.26 1 5.66 4.52 7 10.45h-6.24c-1.04-3.24-3.64-5.74-8.54-6.08v6.08h-.62Z"/></svg>
          ВК
        </button>
        <button
          onClick={handleOAuthYandex}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.63 21.85h-2.73V12.6L7.4 3.15h3.04l2.45 6.54 2.42-6.54h3.04l-3.72 8.58v10.12Z"/></svg>
          Яндекс
        </button>
        <button
          onClick={() => { /* Telegram widget — TODO */ }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 0C5.37 0 0 5.37 0 12s5.37 12 11.99 12S24 18.63 24 12 18.62 0 11.99 0zm5.9 8.17s-.34 3.62-.49 4.85c-.06.57-.23.76-.37.78-.32.04-.56-.21-.87-.41l-2.27-1.56c-.57.55-1.16 1.11-1.28 1.23-.17.17-.31.13-.43-.05l-.37-2.46-2.32-.78s-.35-.13-.38-.41c-.04-.29.4-.44.4-.44l9.38-3.7s.34-.16.53-.02c.14.1.13.35.13.35s.04.27-.06.62z"/></svg>
          TG
        </button>
      </div>
    </div>
  );

  const ErrorMsg = () => error ? (
    <p className="text-center text-xs" style={{ color: "var(--danger)" }}>{error}</p>
  ) : null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ background: "var(--bg-deep)", zIndex: 150 }}
    >
      {/* Свечение */}
      <div
        className="absolute rounded-full"
        style={{
          width: "400px", height: "400px",
          background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
          filter: "blur(80px)", opacity: 0.3,
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Логотип */}
        <div className="flex flex-col items-center mb-8">
          <span className="text-4xl font-bold tracking-tight mb-1" style={{ color: "var(--accent-bright)" }}>
            JinnTell
          </span>
          <span className="text-xs uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
            Город джиннов
          </span>
        </div>

        {/* Переключатель Пользователь / Бизнес */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
          {([{ id: "user", label: "Пользователь" }, { id: "business", label: "Бизнес" }] as const).map((m) => (
            <button key={m.id} onClick={() => { setAccountMode(m.id); setError(""); }}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-all"
              style={{ background: accountMode === m.id ? "var(--accent)" : "transparent", color: accountMode === m.id ? "var(--bg-deep)" : "var(--text-secondary)" }}>
              {m.label}
            </button>
          ))}
        </div>

        {accountMode === "business" && (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Вход в кабинет бизнеса</p>
            {InputField({ value: bizLogin, onChange: setBizLogin, placeholder: "Логин компании" })}
            {PasswordField({ value: bizPassword, onChange: setBizPassword, placeholder: "Пароль", onSubmit: handleBusinessLogin })}
            <ErrorMsg />
            <SubmitButton onClick={handleBusinessLogin} disabled={!bizLogin || !bizPassword || sending}>
              {sending ? "Вход..." : "Войти как бизнес"}
            </SubmitButton>
            <p className="text-[11px] text-center mt-1" style={{ color: "var(--text-muted)" }}>Логин и пароль выдаёт администратор платформы.</p>
          </div>
        )}

        {/* === ВХОД === */}
        {accountMode === "user" && step === "login" && (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Войдите в аккаунт
            </p>

            {PhoneField()}
            {PasswordField({ value: password, onChange: setPassword, onSubmit: handleLogin })}
            <ErrorMsg />

            <SubmitButton onClick={handleLogin} disabled={!isPhoneComplete || !password || sending}>
              {sending ? "Вход..." : "Войти"}
            </SubmitButton>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep("forgot"); setError(""); }}
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Забыли пароль?
              </button>
              <button
                onClick={() => { setStep("register"); setError(""); setPassword(""); setConfirmPassword(""); }}
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
              >
                Создать аккаунт
              </button>
            </div>

            <OAuthButtons />
          </div>
        )}

        {/* === РЕГИСТРАЦИЯ === */}
        {accountMode === "user" && step === "register" && (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Создайте аккаунт
            </p>

            {PhoneField()}
            {InputField({ value: email, onChange: setEmail, placeholder: "Email (для восстановления пароля)", type: "email" })}
            {PasswordField({ value: password, onChange: setPassword, placeholder: "Придумайте пароль (мин. 6 симв.)" })}
            {PasswordField({ value: confirmPassword, onChange: setConfirmPassword, placeholder: "Повторите пароль", onSubmit: handleRegister })}
            <ErrorMsg />

            <SubmitButton onClick={handleRegister} disabled={!isPhoneComplete || !password || !confirmPassword || sending}>
              {sending ? "Регистрация..." : "Зарегистрироваться"}
            </SubmitButton>

            <button
              onClick={() => { setStep("login"); setError(""); }}
              className="text-xs text-center"
              style={{ color: "var(--text-muted)" }}
            >
              ← Уже есть аккаунт? Войти
            </button>

            <OAuthButtons />
          </div>
        )}

        {/* === ЗАБЫЛ ПАРОЛЬ === */}
        {accountMode === "user" && step === "forgot" && (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Восстановление пароля
            </p>
            <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Введите email, указанный при регистрации
            </p>

            {InputField({ value: email, onChange: setEmail, placeholder: "Ваш email", type: "email", onSubmit: handleForgotPassword })}
            <ErrorMsg />

            <SubmitButton onClick={handleForgotPassword} disabled={!email || sending}>
              {sending ? "Отправка..." : "Отправить код"}
            </SubmitButton>

            <button
              onClick={() => { setStep("login"); setError(""); }}
              className="text-xs text-center"
              style={{ color: "var(--text-muted)" }}
            >
              ← Назад к входу
            </button>
          </div>
        )}

        {/* === СБРОС ПАРОЛЯ === */}
        {accountMode === "user" && step === "reset_code" && (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Новый пароль
            </p>
            <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Код отправлен на {email}
            </p>

            {debugCode && (
              <p className="text-center text-[11px]" style={{ color: "var(--accent)" }}>
                DEBUG код: {debugCode}
              </p>
            )}

            {InputField({ value: resetCode, onChange: setResetCode, placeholder: "Код из письма (6 цифр)" })}
            {PasswordField({ value: newPassword, onChange: setNewPassword, placeholder: "Новый пароль (мин. 6 симв.)", onSubmit: handleResetPassword })}
            <ErrorMsg />

            <SubmitButton onClick={handleResetPassword} disabled={!resetCode || !newPassword || sending}>
              {sending ? "Сохранение..." : "Сменить пароль и войти"}
            </SubmitButton>

            <button
              onClick={() => { setStep("forgot"); setError(""); setResetCode(""); setDebugCode(""); }}
              className="text-xs text-center"
              style={{ color: "var(--text-muted)" }}
            >
              ← Отправить код повторно
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
