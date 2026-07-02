"use client";
import { useState, useEffect, useCallback } from "react";
import {
  getMyAgents,
  getFavoriteAgents,
  getRecommendedAgents,
  addFavoriteAgent,
  removeFavoriteAgent,
  getContacts,
  addContact,
  removeContact,
  type AgentOut,
  type AgentFullOut,
  type ContactOut,
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
  onStartDM,
  initialTab = "jinns",
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenCity: () => void;
  onStartChat?: (agentId: number) => void;
  onStartDM?: (contact: ContactOut) => void;
  initialTab?: "jinns" | "people";
}) {
  const [tab, setTab] = useState<"jinns" | "people">(initialTab);
  const [personal, setPersonal] = useState<AgentFullOut[]>([]);
  const [favorites, setFavorites] = useState<AgentOut[]>([]);
  const [recommended, setRecommended] = useState<AgentOut[]>([]);
  const [contacts, setContacts] = useState<ContactOut[]>([]);
  const [contactInput, setContactInput] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState("");

  const load = useCallback(async () => {
    try { const m = await getMyAgents(); setPersonal(m.filter((a) => a.agent_type === "citizen")); } catch { /* offline */ }
    try { setFavorites(await getFavoriteAgents()); } catch { /* offline */ }
    try { setRecommended(await getRecommendedAgents()); } catch { /* offline */ }
    try { setContacts(await getContacts()); } catch { /* offline */ }
  }, []);

  useEffect(() => { if (isOpen) { setTab(initialTab); load(); } }, [isOpen, initialTab, load]);

  if (!isOpen) return null;

  const startChat = (id: number) => { onStartChat?.(id); onClose(); };
  const startDM = (c: ContactOut) => { onStartDM?.(c); onClose(); };

  const addFav = async (a: AgentOut) => {
    setFavorites((p) => (p.some((x) => x.id === a.id) ? p : [...p, a]));
    setRecommended((p) => p.filter((x) => x.id !== a.id));
    try { await addFavoriteAgent(a.id); } catch { /* noop */ }
  };
  const removeFav = async (a: AgentOut) => {
    setFavorites((p) => p.filter((x) => x.id !== a.id));
    try { await removeFavoriteAgent(a.id); } catch { /* noop */ }
  };

  const handleAddContact = async () => {
    if (!contactInput.trim()) return;
    setContactBusy(true); setContactError("");
    try {
      const c = await addContact(contactInput.trim());
      setContacts((p) => (p.some((x) => x.id === c.id) ? p : [c, ...p]));
      setContactInput("");
    } catch (e) {
      setContactError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setContactBusy(false);
    }
  };
  const handleRemoveContact = async (id: number) => {
    setContacts((p) => p.filter((x) => x.id !== id));
    try { await removeContact(id); } catch { /* noop */ }
  };

  const Tile = ({ a, action }: { a: AgentOut; action?: React.ReactNode }) => (
    <div className="flex flex-col items-center cursor-pointer transition-all hover:scale-105" style={{ width: 64 }} onClick={() => startChat(a.id)}>
      <div className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold mb-1" style={{ background: `${a.color}22`, border: `1.5px solid ${a.color}44`, color: a.color }}>
        {a.name[0]}
      </div>
      <span className="text-[10px] text-center leading-tight truncate max-w-[60px]" style={{ color: "var(--text-secondary)" }}>{a.name}</span>
      <span className="text-[9px] truncate max-w-[60px]" style={{ color: "var(--text-muted)" }}>{a.profession}</span>
      {action}
    </div>
  );

  const TabBtn = ({ id, label }: { id: "jinns" | "people"; label: string }) => (
    <button onClick={() => setTab(id)} className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
      style={{ background: tab === id ? "var(--accent)" : "var(--bg-glass)", color: tab === id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${tab === id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100 }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl p-6" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", backdropFilter: "blur(12px)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Собеседники</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
        </div>

        <div className="flex gap-2 mb-5">
          <TabBtn id="jinns" label="Джинны" />
          <TabBtn id="people" label="Контакты" />
        </div>

        {tab === "jinns" ? (
          <>
            <Section title="Личные">
              {personal.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {personal.map((a) => <Tile key={a.id} a={a} action={<span className="text-[9px]" style={{ color: "var(--accent)" }}>Личный</span>} />)}
                </div>
              ) : (
                <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                  <p className="text-[12px] mb-1" style={{ color: "var(--text-secondary)" }}>Создайте своего AI-джинна</p>
                  <p className="text-[11px] leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>Личный джинн с вашим характером, голосом и внешностью — по подписке.</p>
                  <button className="px-4 py-2 rounded-xl text-[12px] font-medium transition-all hover:scale-[1.02]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>Подписаться</button>
                </div>
              )}
            </Section>

            {favorites.length > 0 && (
              <Section title="Избранное">
                <div className="flex flex-wrap gap-3">
                  {favorites.map((a) => <Tile key={a.id} a={a} action={<button onClick={(e) => { e.stopPropagation(); removeFav(a); }} className="text-[9px]" style={{ color: "var(--text-muted)" }}>убрать</button>} />)}
                </div>
              </Section>
            )}

            {recommended.length > 0 && (
              <Section title="Рекомендованные">
                <div className="flex flex-wrap gap-3">
                  {recommended.map((a) => <Tile key={a.id} a={a} action={<button onClick={(e) => { e.stopPropagation(); addFav(a); }} className="text-[9px]" style={{ color: "var(--accent)" }}>+ в избранное</button>} />)}
                </div>
              </Section>
            )}

            <button onClick={() => { onClose(); onOpenCity(); }} className="w-full py-3 rounded-xl text-sm font-semibold mt-2 transition-all hover:scale-[1.02]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
              Город Джиннов
            </button>
          </>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <input value={contactInput} onChange={(e) => setContactInput(e.target.value)} placeholder="Телефон или jinntell-ссылка"
                className="flex-1 rounded-xl px-3 py-2 text-sm bg-transparent outline-none" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
              <button onClick={handleAddContact} disabled={contactBusy} className="px-3 py-2 rounded-xl text-sm font-medium" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                {contactBusy ? "..." : "Добавить"}
              </button>
            </div>
            {contactError && <p className="text-[11px] mb-2" style={{ color: "#e06b6b" }}>{contactError}</p>}

            {contacts.length === 0 ? (
              <p className="text-[12px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пока нет контактов. Добавьте человека по телефону или ссылке.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-all hover:scale-[1.01]"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }} onClick={() => startDM(c)}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative"
                      style={{ background: `${c.avatar_color || "#6c7bff"}22`, border: `1.5px solid ${c.avatar_color || "#6c7bff"}55`, color: c.avatar_color || "#6c7bff" }}>
                      {c.display_name[0]}
                      {c.is_online && <span className="absolute -bottom-0 -right-0 w-2.5 h-2.5 rounded-full bg-green-500" style={{ border: "1.5px solid var(--panel-bg)" }} />}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.display_name}</span>
                      <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{c.phone}{c.jinntell_link ? ` · @${c.jinntell_link}` : ""}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveContact(c.id); }} className="text-[11px] px-2 py-1 rounded-lg shrink-0" style={{ background: "var(--bg-glass-hover)", color: "var(--text-muted)" }}>убрать</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
