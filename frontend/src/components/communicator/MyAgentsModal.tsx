"use client";
import { useState, useEffect, useCallback } from "react";
import {
  getMyAgents,
  getFavoriteAgents,
  getRecommendedAgents,
  addFavoriteAgent,
  removeFavoriteAgent,
  type AgentOut,
  type AgentFullOut,
} from "@/services/api";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--text-muted)" }}>{title}</p>
      {children}
    </div>
  );
}

export default function MyAgentsModal({
  isOpen,
  onClose,
  onOpenCity,
  onStartChat,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenCity: () => void;
  onStartChat?: (agentId: number) => void;
}) {
  const [personal, setPersonal] = useState<AgentFullOut[]>([]);
  const [favorites, setFavorites] = useState<AgentOut[]>([]);
  const [recommended, setRecommended] = useState<AgentOut[]>([]);

  const load = useCallback(async () => {
    try { const m = await getMyAgents(); setPersonal(m.filter((a) => a.agent_type === "citizen")); } catch { /* offline */ }
    try { setFavorites(await getFavoriteAgents()); } catch { /* offline */ }
    try { setRecommended(await getRecommendedAgents()); } catch { /* offline */ }
  }, []);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  if (!isOpen) return null;

  const startChat = (id: number) => { onStartChat?.(id); onClose(); };

  const addFav = async (a: AgentOut) => {
    setFavorites((p) => (p.some((x) => x.id === a.id) ? p : [...p, a]));
    setRecommended((p) => p.filter((x) => x.id !== a.id));
    try { await addFavoriteAgent(a.id); } catch { /* noop */ }
  };
  const removeFav = async (a: AgentOut) => {
    setFavorites((p) => p.filter((x) => x.id !== a.id));
    try { await removeFavoriteAgent(a.id); } catch { /* noop */ }
  };

  const Tile = ({ a, action }: { a: AgentOut; action?: React.ReactNode }) => (
    <div
      className="flex flex-col items-center cursor-pointer transition-all hover:scale-105"
      style={{ width: 64 }}
      onClick={() => startChat(a.id)}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold mb-1"
        style={{ background: `${a.color}22`, border: `1.5px solid ${a.color}44`, color: a.color }}
      >
        {a.name[0]}
      </div>
      <span className="text-[10px] text-center leading-tight truncate max-w-[60px]" style={{ color: "var(--text-secondary)" }}>{a.name}</span>
      <span className="text-[9px] truncate max-w-[60px]" style={{ color: "var(--text-muted)" }}>{a.profession}</span>
      {action}
    </div>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100 }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", backdropFilter: "blur(12px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Мои Джинны</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>

        {/* Личные */}
        <Section title="Личные">
          {personal.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {personal.map((a) => (
                <Tile key={a.id} a={a} action={<span className="text-[9px]" style={{ color: "var(--accent)" }}>Личный</span>} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
              <p className="text-[12px] mb-1" style={{ color: "var(--text-secondary)" }}>Создайте своего AI-джинна</p>
              <p className="text-[11px] leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>Личный джинн с вашим характером, голосом и внешностью — по подписке.</p>
              <button className="px-4 py-2 rounded-xl text-[12px] font-medium transition-all hover:scale-[1.02]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>Подписаться</button>
            </div>
          )}
        </Section>

        {/* Избранное */}
        {favorites.length > 0 && (
          <Section title="Избранное">
            <div className="flex flex-wrap gap-3">
              {favorites.map((a) => (
                <Tile key={a.id} a={a} action={
                  <button onClick={(e) => { e.stopPropagation(); removeFav(a); }} className="text-[9px]" style={{ color: "var(--text-muted)" }}>убрать</button>
                } />
              ))}
            </div>
          </Section>
        )}

        {/* Рекомендованные */}
        {recommended.length > 0 && (
          <Section title="Рекомендованные">
            <div className="flex flex-wrap gap-3">
              {recommended.map((a) => (
                <Tile key={a.id} a={a} action={
                  <button onClick={(e) => { e.stopPropagation(); addFav(a); }} className="text-[9px]" style={{ color: "var(--accent)" }}>+ в избранное</button>
                } />
              ))}
            </div>
          </Section>
        )}

        {/* Город Джиннов */}
        <button
          onClick={() => { onClose(); onOpenCity(); }}
          className="w-full py-3 rounded-xl text-sm font-semibold mt-2 transition-all hover:scale-[1.02]"
          style={{ background: "var(--accent)", color: "var(--bg-deep)" }}
        >
          Город Джиннов
        </button>
      </div>
    </div>
  );
}
