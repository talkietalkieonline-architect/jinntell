"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * JinnTell — публичная страница агента
 * URL: /a/tim-adidas, /a/dvoretskiy и т.д.
 *
 * Показывает карточку агента и кнопку «Начать чат».
 * Если пользователь не авторизован — редирект на вход, потом в чат.
 */

interface AgentPublic {
  id: number;
  name: string;
  profession: string;
  brand: string;
  description: string;
  color: string;
  agent_type: string;
  jinntell_link: string;
  rating: number;
  rating_count: number;
  greeting?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function JinnTellLinkPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [agent, setAgent] = useState<AgentPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;

    fetch(`${API_BASE}/api/agents/link/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Агент не найден");
        return res.json();
      })
      .then((data) => {
        setAgent(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  /** Начать чат — сохраняем intent и переходим на главную */
  const handleStartChat = () => {
    if (agent) {
      // Сохраняем в localStorage — page.tsx подхватит и откроет чат
      localStorage.setItem("jinntell_open_agent", String(agent.id));
    }
    router.push("/");
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-center">
          <div className="text-3xl mb-4" style={{ color: "#d4a843" }}>JINNTELL</div>
          <div className="text-sm" style={{ color: "rgba(245,240,232,0.5)" }}>Загрузка...</div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-center">
          <div className="text-6xl mb-6">🔍</div>
          <div className="text-xl font-bold mb-2" style={{ color: "#f5f0e8" }}>
            Агент не найден
          </div>
          <div className="text-sm mb-8" style={{ color: "rgba(245,240,232,0.5)" }}>
            Ссылка устарела или агент был удалён
          </div>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 rounded-xl font-medium transition-all"
            style={{
              background: "rgba(212,168,67,0.15)",
              color: "#d4a843",
              border: "1px solid rgba(212,168,67,0.3)",
            }}
          >
            Перейти в JinnTell
          </button>
        </div>
      </div>
    );
  }

  // ── Agent Card ──
  const agentColor = agent.color || "#d4a843";
  const initial = agent.name.charAt(0).toUpperCase();
  const stars = "★".repeat(Math.round(agent.rating)) + "☆".repeat(5 - Math.round(agent.rating));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: `linear-gradient(180deg, #0a0a0a 0%, ${agentColor}10 50%, #0a0a0a 100%)`,
      }}
    >
      {/* Logo */}
      <div className="mb-8 text-center">
        <div
          className="text-sm font-bold tracking-[0.3em] uppercase"
          style={{ color: "rgba(245,240,232,0.4)" }}
        >
          JINNTELL
        </div>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-3xl p-8 text-center"
        style={{
          background: "rgba(26,26,26,0.95)",
          border: `1px solid ${agentColor}30`,
          boxShadow: `0 0 60px ${agentColor}15, 0 20px 60px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Avatar */}
        <div
          className="w-24 h-24 rounded-full mx-auto mb-5 flex items-center justify-center text-4xl font-bold"
          style={{
            background: `${agentColor}20`,
            color: agentColor,
            border: `2px solid ${agentColor}40`,
            boxShadow: `0 0 30px ${agentColor}20`,
          }}
        >
          {initial}
        </div>

        {/* Name */}
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#f5f0e8" }}>
          {agent.name}
        </h1>

        {/* Profession + Brand */}
        <div className="text-sm mb-3" style={{ color: agentColor }}>
          {agent.profession}
          {agent.brand && ` · ${agent.brand}`}
        </div>

        {/* Rating */}
        {agent.rating > 0 && (
          <div className="text-sm mb-4" style={{ color: "rgba(245,240,232,0.5)" }}>
            <span style={{ color: "#f0c95c" }}>{stars}</span>
            <span className="ml-1">({agent.rating_count})</span>
          </div>
        )}

        {/* Description */}
        {agent.description && (
          <p
            className="text-sm leading-relaxed mb-6"
            style={{ color: "rgba(245,240,232,0.7)" }}
          >
            {agent.description}
          </p>
        )}

        {/* Greeting preview */}
        {agent.greeting && (
          <div
            className="text-xs italic mb-6 px-4 py-3 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(245,240,232,0.5)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            «{agent.greeting}»
          </div>
        )}

        {/* Type badge */}
        <div className="flex justify-center gap-2 mb-6">
          <span
            className="text-[10px] px-3 py-1 rounded-full uppercase tracking-wider"
            style={{
              background: `${agentColor}15`,
              color: agentColor,
              border: `1px solid ${agentColor}25`,
            }}
          >
            {agent.agent_type === "system"
              ? "Системный"
              : agent.agent_type === "business"
              ? "Бизнес"
              : "Житель"}
          </span>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleStartChat}
          className="w-full py-4 rounded-2xl text-lg font-bold transition-all active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${agentColor}, ${agentColor}cc)`,
            color: "#0a0a0a",
            boxShadow: `0 4px 20px ${agentColor}40`,
          }}
        >
          💬 Начать чат
        </button>

        {/* JinnTell link copy */}
        <div className="mt-4">
          <button
            onClick={() => {
              const url = `${window.location.origin}/a/${agent.jinntell_link}`;
              navigator.clipboard.writeText(url);
            }}
            className="text-xs transition-opacity hover:opacity-80"
            style={{ color: "rgba(245,240,232,0.3)" }}
          >
            📋 Скопировать ссылку
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <button
          onClick={() => router.push("/")}
          className="text-xs transition-opacity hover:opacity-80"
          style={{ color: "rgba(245,240,232,0.3)" }}
        >
          Создано на платформе JINNTELL →
        </button>
      </div>
    </div>
  );
}
