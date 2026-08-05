"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  getToken,
  setToken,
  getMe,
  type UserProfile,
} from "@/services/api";

/* ═══════════════════════════════════════════════
   AuthContext — единый контекст авторизации
   Управляет сессией, профилем, онлайн-статусом
   ═══════════════════════════════════════════════ */

interface AuthState {
  /** null = ещё не определён, false = не залогинен */
  isLoggedIn: boolean | null;
  /** Профиль пользователя из API (или из localStorage) */
  user: UserProfile | null;
  /** Залогиниться (вызывается из LoginScreen после верификации SMS) */
  login: (user: Partial<UserProfile>) => void;
  /** Выйти */
  logout: () => void;
  /** Перечитать профиль с сервера (после сохранения настроек) */
  refreshUser: () => void;
  /** Бэкенд доступен? */
  isOnline: boolean;
  /** Админ? */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({
  isLoggedIn: null,
  user: null,
  login: () => {},
  logout: () => {},
  refreshUser: () => {},
  isOnline: false,
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

/** Читаем сессию из localStorage */
function getSavedSession(): { loggedIn: boolean; user: Partial<UserProfile> } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("jinntell_session");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.loggedIn) return null;
    if (data.expires && data.expires < Date.now()) {
      localStorage.removeItem("jinntell_session");
      localStorage.removeItem("jinntell_token");
      return null;
    }
    return { loggedIn: true, user: data };
  } catch {
    return null;
  }
}

/** Сохраняем сессию в localStorage (30 дней) */
function saveSession(user: Partial<UserProfile>) {
  localStorage.setItem(
    "jinntell_session",
    JSON.stringify({
      loggedIn: true,
      userId: user.id,
      displayName: user.display_name || "Пользователь",
      phone: user.phone,
      theme: user.theme,
      avatarColor: user.avatar_color,
      isAdmin: user.is_admin || false,
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // При монтировании — проверяем сессию + OAuth token из URL
  useEffect(() => {
    // Проверяем OAuth callback token в URL (?auth_token=...)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const oauthToken = params.get("auth_token");
      if (oauthToken) {
        setToken(oauthToken);
        // Убираем токен из URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    const session = getSavedSession();
    const token = getToken();

    if (!session || !session.loggedIn) {
      setIsLoggedIn(false);
      return;
    }

    // Есть сессия. Пробуем подтянуть профиль из API
    if (token) {
      getMe()
        .then((profile) => {
          setUser(profile);
          if (typeof document !== "undefined") {
            if (profile.theme) document.documentElement.setAttribute("data-theme", profile.theme);
            if (profile.custom_accent) document.documentElement.style.setProperty("--custom-accent", profile.custom_accent);
            if (profile.theme) localStorage.setItem("jinntell_theme", profile.theme);
            if (profile.background) localStorage.setItem("jinntell_bg", profile.background);
            if (profile.custom_accent) localStorage.setItem("jinntell_accent", profile.custom_accent);
            window.dispatchEvent(new Event("jinntell_theme_change"));
            window.dispatchEvent(new Event("jinntell_bg_change"));
          }
          setIsOnline(true);
          setIsLoggedIn(true);
          setIsAdmin(profile.is_admin || false);
          // Обновляем локальную сессию свежими данными
          saveSession(profile);
        })
        .catch(() => {
          // API недоступен — используем данные из localStorage
          const savedData = session.user as Record<string, unknown>;
          setUser({
            id: session.user.id ?? 0,
            phone: savedData.phone as string ?? "",
            display_name: session.user.display_name ?? "Пользователь",
            theme: session.user.theme ?? "noir-gold",
            avatar_color: session.user.avatar_color ?? "#d4a843",
            is_online: true,
            is_admin: !!savedData.isAdmin,
          } as UserProfile);
          setIsOnline(false);
          setIsLoggedIn(true);
          setIsAdmin(!!savedData.isAdmin);
        });
    } else {
      // Нет токена, но есть сессия (offline-вход)
      setUser({
        id: 0,
        phone: "",
        display_name: "Пользователь",
        theme: "noir-gold",
        avatar_color: "#d4a843",
        is_online: true,
      } as UserProfile);
      setIsOnline(false);
      setIsLoggedIn(true);
    }
  }, []);

  const login = useCallback((userData: Partial<UserProfile>) => {
    const profile: UserProfile = {
      id: userData.id ?? 0,
      phone: userData.phone ?? "",
      display_name: userData.display_name ?? "Пользователь",
      theme: userData.theme ?? "noir-gold",
      avatar_color: userData.avatar_color ?? "#d4a843",
      is_online: true,
      is_admin: userData.is_admin ?? false,
    };
    setUser(profile);
    saveSession(profile);
    setIsLoggedIn(true);
    setIsAdmin(profile.is_admin);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    localStorage.removeItem("jinntell_session");
    localStorage.removeItem("jinntell_token");
    localStorage.removeItem("jinntell_phone");
  }, []);

  const refreshUser = useCallback(() => {
    getMe().then((profile) => { if (profile) { setUser(profile); saveSession(profile); } }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, login, logout, refreshUser, isOnline, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}
