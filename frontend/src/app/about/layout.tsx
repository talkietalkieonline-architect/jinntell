import type { Metadata } from "next";
import "./about.css";

export const metadata: Metadata = {
  title: "О JinnTell — город ИИ-джиннов",
  description:
    "JinnTell — город ИИ-джиннов: личный помощник для людей и ИИ-сотрудник для бизнеса. Говорите голосом, помощник сам позовёт нужного специалиста.",
};

/** Публичный раздел «О JinnTell»: общая навигация + стили (страницы — серверные, текст сразу в HTML для поиска). */
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ab">
      <nav className="ab-nav" aria-label="Разделы">
        <div className="ab-wrap">
          <a className="ab-logo" href="/about">JinnTell</a>
          <a className="ab-link" href="/about#users">Пользователям</a>
          <a className="ab-link" href="/about#business">Бизнесу</a>
          <a className="ab-link" href="/about#us">О нас</a>
          <a className="ab-link" href="/about#solutions">Готовые решения</a>
          <a className="ab-btn ab-btn-gold ab-cta" href="/" style={{ padding: "8px 14px", fontSize: 14 }}>Открыть JinnTell</a>
        </div>
      </nav>
      {children}
    </div>
  );
}
