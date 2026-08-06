"use client";
import { useEffect, useState, type ReactNode } from "react";
import { getFeed, dismissFeed, getChannelsUnread, getChannels, getFavoriteAgents, getRecommendedAgents, getContacts, getAgents, addFavoriteAgent, searchUsers, addContact, listDigests, mediaUrl, type FeedEvent, type ChannelUnread, type AgentOut, type ContactOut } from "@/services/api";
import { type OpenChat } from "@/components/communicator/NavBar";

interface Props {
  topPad: number;
  bottomPad: number;
  assistantName: string;
  assistantPhoto?: string | null;
  userId?: number;
  openChats?: OpenChat[];
  favIds?: Set<number>;
  onOpenAssistant: () => void;
  onOpenFlow?: () => void;
  onOpenAgent?: (agentId: number, meta?: { name?: string; color?: string }) => void;
  onOpenContact?: (c: { id: number; display_name: string; avatar_color?: string | null; avatar_url?: string | null; is_online?: boolean; avatar_frame?: string | null }) => void;
  onOpenChat?: (room: string) => void;
  onOpenActions?: () => void;
  onOpenDigest?: (id: number) => void;
  onOpenInvites?: () => void;
  onCreateJinn?: () => void;
}

const KIND_ICON: Record<string, string> = { info: "ℹ️", reminder: "⏰", offer: "🏷️", event: "📅" };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

// Кружок (джинн/человек/коллекция): аватар + подпись; варианты — закреплён, платный, малый, онлайн, счётчик
function Circle({ label, sub, photo, color, emoji, pinned, badge, paid, small, online, star, onClick, onLongPress }: {
  label: string; sub?: string; photo?: string | null; color?: string; emoji?: string; pinned?: boolean; badge?: number; paid?: boolean; small?: boolean; online?: boolean; star?: boolean; onClick?: () => void; onLongPress?: () => void;
}) {
  const src = photo ? (photo.startsWith("http") || photo.startsWith("data:") || photo.startsWith("blob:") ? photo : mediaUrl(photo)) : null;
  const d = small ? 44 : 56;
  let lp: ReturnType<typeof setTimeout> | null = null;
  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => { if (onLongPress) { e.preventDefault(); onLongPress(); } }}
      onTouchStart={() => { if (onLongPress) lp = setTimeout(onLongPress, 550); }}
      onTouchEnd={() => { if (lp) clearTimeout(lp); }}
      onTouchMove={() => { if (lp) clearTimeout(lp); }}
      className="flex flex-col items-center gap-1 shrink-0 transition-transform hover:scale-105"
      style={{ width: small ? 54 : 64 }}
    >
      <div className="relative rounded-full flex items-center justify-center overflow-hidden" style={{ width: d, height: d, border: (badge && badge > 0) ? "2px solid var(--accent)" : pinned ? "2px solid var(--accent)" : `2px solid ${color || "var(--bg-glass-border)"}`, background: color ? `${color}22` : "var(--bg-glass)", boxShadow: (badge && badge > 0) ? "0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent)" : undefined }}>
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <span style={{ fontSize: small ? 16 : 20 }}>{emoji || "💬"}</span>}
        {!!badge && badge > 0 && <span className="absolute inset-0 rounded-full animate-ping pointer-events-none" style={{ boxShadow: "0 0 0 2px var(--accent)", opacity: 0.35 }} />}
        {!!badge && badge > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>{badge}</span>}
        {paid && <span className="absolute -bottom-0.5 -right-0.5 w-[16px] h-[16px] rounded-full flex items-center justify-center text-[9px]" style={{ background: "#e8b84a", color: "#1a1400" }}>₽</span>}
        {star && <span className="absolute -top-0.5 -left-0.5 text-[11px]" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}>⭐</span>}
        {online && <span className="absolute bottom-0 left-0 w-[11px] h-[11px] rounded-full" style={{ background: "#3ecf6a", border: "2px solid var(--panel-bg, #101018)" }} />}
      </div>
      <span className="text-[10px] leading-tight truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>{label}</span>
      {sub && <span className="text-[9px] leading-tight truncate w-full text-center -mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</span>}
    </button>
  );
}

function Strip({ title, children, empty }: { title: string; children: ReactNode; empty?: string }) {
  return (
    <div>
      {title && <div className="text-[11px] uppercase tracking-[0.12em] mb-1.5 px-1 font-semibold" style={{ color: "var(--text-muted)" }}>{title}</div>}
      <div className="flex gap-2.5 overflow-x-auto pb-1.5 home-strip" style={{ scrollbarWidth: "none" }}>
        {children}
        {empty && <span className="text-[11px] self-center px-2" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{empty}</span>}
      </div>
    </div>
  );
}

export default function HomeRoom({ topPad, bottomPad, assistantName, assistantPhoto, userId, openChats = [], favIds, onOpenAssistant, onOpenFlow, onOpenAgent, onOpenContact, onOpenChat, onOpenActions, onOpenDigest, onOpenInvites, onCreateJinn }: Props) {
  const [digests, setDigests] = useState<{ id: number; query: string; created_at: string }[]>([]);
  const [allChannels, setAllChannels] = useState<ChannelUnread[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [channels, setChannels] = useState<ChannelUnread[]>([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState<AgentOut[]>([]);
  const [recommended, setRecommended] = useState<AgentOut[]>([]);
  const [popular, setPopular] = useState<AgentOut[]>([]);
  const [contacts, setContacts] = useState<ContactOut[]>([]);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [userResults, setUserResults] = useState<ContactOut[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [pinned, setPinned] = useState<Set<number>>(new Set());

  useEffect(() => {
    try { const raw = localStorage.getItem("jinntell_pinned"); if (raw) setPinned(new Set(JSON.parse(raw))); } catch { /* noop */ }
  }, []);
  const togglePin = (id: number) => {
    setPinned((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      try { localStorage.setItem("jinntell_pinned", JSON.stringify([...n])); } catch { /* noop */ }
      return n;
    });
  };

  useEffect(() => {
    let alive = true;
    const load = () => {
      getFeed().then((list) => { if (alive) setEvents(list); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
      getChannelsUnread().then((c) => { if (alive) setChannels(c); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 20000);
    const onPing = () => load();
    window.addEventListener("jinntell_feed_ping", onPing);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("jinntell_feed_ping", onPing); };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadAll = () => {
      getFavoriteAgents().then((f) => { if (alive) setFavs(f); }).catch(() => {});
      getRecommendedAgents().then((r) => { if (alive) setRecommended(r); }).catch(() => {});
      getAgents().then((r) => { if (alive) setPopular(r.agents || []); }).catch(() => {});
      getContacts().then((c) => { if (alive) setContacts(c); }).catch(() => {});
      listDigests().then((r) => { if (alive) setDigests(r.items || []); }).catch(() => {});
      getChannels().then((c) => { if (alive) setAllChannels(c); }).catch(() => {});
    };
    loadAll();
    // обновляемся при изменении избранного/контактов (из Города и др.) и при возврате на вкладку
    window.addEventListener("jinntell_feed_ping", loadAll);
    window.addEventListener("jinntell_favs_change", loadAll);
    const onVis = () => { if (document.visibilityState === "visible") loadAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.removeEventListener("jinntell_feed_ping", loadAll); window.removeEventListener("jinntell_favs_change", loadAll); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const handleDismiss = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try { await dismissFeed(id); } catch { /* noop */ }
  };

  // Категоризация «Мои джинны» из избранного
  const personal = favs.filter((a) => userId && a.owner_id === userId);
  const personalIds = new Set(personal.map((a) => a.id));
  const consultants = favs.filter((a) => a.agent_type === "business" && !personalIds.has(a.id));
  const specialists = favs.filter((a) => a.agent_type === "specialist" && !personalIds.has(a.id));
  const grouped = new Set([...personal, ...consultants, ...specialists].map((a) => a.id));
  const others = favs.filter((a) => !grouped.has(a.id));
  const recIds = new Set(favs.map((a) => a.id));
  const recs = recommended.filter((a) => !recIds.has(a.id)).slice(0, 12);
  const recSet = new Set(recs.map((a) => a.id));
  const pops = popular.filter((a) => !recIds.has(a.id) && !recSet.has(a.id)).slice(0, 12);

  // Гости — недавние чаты с джиннами, которых нет в избранном (авто-истечение 12ч — TODO)
  const guests = openChats.filter((c) => (c.room.startsWith("agent-") || c.room.startsWith("room-")) && !(favIds && favIds.has(c.agentId)));

  useEffect(() => {
    const q = peopleSearch.trim();
    if (q.length < 2) { setUserResults([]); return; }
    const t = setTimeout(() => { searchUsers(q).then(setUserResults).catch(() => setUserResults([])); }, 300);
    return () => clearTimeout(t);
  }, [peopleSearch]);

  const contactIds = new Set(contacts.map((c) => c.id));
  const doAddContact = async (identifier: string) => {
    const id = (identifier || "").trim();
    if (!id || addBusy) return;
    setAddBusy(true);
    try { await addContact(id); const cs = await getContacts(); setContacts(cs); setPeopleSearch(""); setUserResults([]); } catch { /* noop */ } finally { setAddBusy(false); }
  };

  // Непрочитанные из открытых чатов → «живой» кружок джинна
  const unreadByAgent = new Map<number, number>();
  openChats.forEach((c) => { if (c.count && c.count > 0 && c.agentId) unreadByAgent.set(c.agentId, (unreadByAgent.get(c.agentId) || 0) + c.count); });

  const important = favs.filter((a) => pinned.has(a.id));

  const agentCircle = (a: AgentOut, small?: boolean) => (
    <Circle key={a.id} label={a.name} sub={a.profession} color={a.color} emoji="🧞" paid={a.is_paid} small={small} star={pinned.has(a.id)} badge={unreadByAgent.get(a.id) || 0} onClick={() => onOpenAgent?.(a.id, { name: a.name, color: a.color })} onLongPress={() => togglePin(a.id)} />
  );
  // Кружок «Гостиной» — удержи, чтобы перенести в «Мои джинны» (иначе пропадёт)
  const guestAgentCircle = (a: AgentOut) => (
    <Circle key={a.id} label={a.name} sub={a.profession} color={a.color} emoji="🧞" paid={a.is_paid} small onClick={() => onOpenAgent?.(a.id, { name: a.name, color: a.color })} onLongPress={async () => { try { await addFavoriteAgent(a.id); window.dispatchEvent(new Event("jinntell_favs_change")); } catch { /* noop */ } }} />
  );

  return (
    <div className="absolute inset-0 overflow-y-auto flex justify-center" style={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 12 }}>
      <div className="w-full max-w-[620px] px-4 flex flex-col gap-3.5">

        {/* ═══════════ СОБЕСЕДНИКИ ═══════════ */}
        <div className="text-[15px] font-extrabold px-1 pt-1" style={{ color: "var(--text-primary)" }}>Собеседники</div>

        {/* Помощники */}
        <Strip title="Помощники">
          <Circle label={assistantName} sub="помощник" photo={assistantPhoto} emoji="🧞" pinned onClick={onOpenAssistant} />
          <Circle label="Поток" sub="голос" emoji="🌀" pinned onClick={onOpenFlow} />
          {personal.map((a) => agentCircle(a))}
        </Strip>

        {/* Мои джинны (из Города) */}
        <div className="flex items-baseline justify-between px-1 pt-0.5">
          <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Мои джинны</span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>удержи кружок → ⭐</span>
        </div>
        <Strip title="" empty={(important.length + consultants.length + specialists.length + others.length + recs.length) === 0 ? "добавь джиннов из Города ниже" : undefined}>
          {onCreateJinn && <Circle label="Создать" emoji="➕" onClick={onCreateJinn} />}
        </Strip>
        {important.length > 0 && <Strip title="⭐ Важные">{important.map((a) => agentCircle(a, true))}</Strip>}
        {consultants.length > 0 && <Strip title="Консультанты">{consultants.map((a) => agentCircle(a, true))}</Strip>}
        {specialists.length > 0 && <Strip title="Специалисты">{specialists.map((a) => agentCircle(a, true))}</Strip>}
        {others.length > 0 && <Strip title="Другие">{others.map((a) => agentCircle(a, true))}</Strip>}

        {/* Мои контакты */}
        <div className="text-[13px] font-bold px-1 pt-0.5" style={{ color: "var(--text-primary)" }}>Мои контакты</div>
        <Strip title="" empty={contacts.length === 0 ? "нет контактов — найди человека ниже" : undefined}>
          {contacts.map((c) => (
            <Circle key={c.id} label={c.display_name} photo={c.avatar_url} color={c.avatar_color || undefined} emoji="👤" online={c.is_online} onClick={() => onOpenContact?.(c)} />
          ))}
        </Strip>
        <div className="flex gap-2 px-1">
          <input value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} placeholder="Найти человека (имя, @username, телефон)…" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" }} />
          <button onClick={() => doAddContact(peopleSearch)} disabled={addBusy || peopleSearch.trim().length < 2} className="px-3 py-2 rounded-xl text-sm font-semibold shrink-0" style={{ background: "var(--accent)", color: "var(--bg-deep)", opacity: (addBusy || peopleSearch.trim().length < 2) ? 0.5 : 1 }}>Добавить</button>
        </div>
        {userResults.filter((u) => !contactIds.has(u.id)).length > 0 && (
          <div className="flex flex-col gap-1 px-1">
            {userResults.filter((u) => !contactIds.has(u.id)).slice(0, 8).map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] overflow-hidden" style={{ background: `${u.avatar_color || "var(--accent)"}22`, border: `1.5px solid ${u.avatar_color || "var(--accent)"}` }}>{u.avatar_url ? <img src={u.avatar_url.startsWith("data:") ? u.avatar_url : mediaUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" /> : "👤"}</span>
                <span className="flex-1 min-w-0 text-sm truncate" style={{ color: "var(--text-primary)" }}>{u.display_name}{u.jinntell_link ? ` · @${u.jinntell_link}` : ""}</span>
                <button onClick={() => doAddContact(u.jinntell_link || u.phone)} disabled={addBusy} className="text-[12px] font-semibold shrink-0" style={{ color: "var(--accent)" }}>+ добавить</button>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════ ГОСТИНАЯ (гости пропадают, если не перенести в «Мои джинны») ═══════════ */}
        <div className="flex items-baseline justify-between px-1 pt-2">
          <span className="text-[15px] font-extrabold" style={{ color: "var(--text-primary)" }}>Гостиная</span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>удержи → в «Мои джинны»</span>
        </div>
        {recs.length > 0 && <Strip title="Рекомендованные">{recs.map((a) => guestAgentCircle(a))}</Strip>}
        {pops.length > 0 && <Strip title="Популярные">{pops.map((a) => guestAgentCircle(a))}</Strip>}
        {guests.length > 0 && <Strip title="Были недавно">{guests.map((c) => <Circle key={c.room} label={c.name} photo={c.photo} color={c.color} emoji="🧞" small badge={c.count} onClick={() => onOpenChat?.(c.room)} />)}</Strip>}
        {(recs.length + pops.length + guests.length) === 0 && <p className="text-[11px] px-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>Здесь появятся рекомендованные, популярные и недавние гости.</p>}

        {/* ═══════════ ИНФОРМАЦИЯ ═══════════ */}
        <div className="text-[15px] font-extrabold px-1 pt-2" style={{ color: "var(--text-primary)" }}>Информация</div>

        {/* Потоки (уведомления/предложения/приглашения) */}
        <Strip title="Потоки">
          <Circle label="Лента" sub="уведомления" emoji="🔔" color="#5ea0e8" small onClick={() => document.getElementById("home-feed")?.scrollIntoView({ behavior: "smooth" })} />
          <Circle label="Предложения" sub="от джиннов" emoji="💡" color="#e0a13a" small onClick={() => document.getElementById("home-feed")?.scrollIntoView({ behavior: "smooth" })} />
          <Circle label="Приглашения" sub="рядом" emoji="📍" color="#c0563a" small onClick={onOpenInvites} />
          <Circle label="Действия" sub="помощника" emoji="📋" color="#4a9e7f" small onClick={onOpenActions} />
        </Strip>

        {/* Подборки и результаты */}
        <Strip title="Подборки и результаты" empty={digests.length === 0 ? "скажи помощнику «составь подборку …»" : undefined}>
          {digests.map((d) => <Circle key={d.id} label={d.query} emoji="📑" color="#8a6fd0" small onClick={() => onOpenDigest?.(d.id)} />)}
        </Strip>

        {/* Каналы */}
        {allChannels.length > 0 && (
          <Strip title="Каналы">
            {allChannels.map((ch) => <Circle key={ch.agent_id} label={ch.name} sub="канал" color={ch.color} emoji="📰" badge={ch.unread} onClick={() => onOpenChat?.(ch.link_room)} />)}
          </Strip>
        )}

        {/* ═══ БЛОК: ЛЕНТА (события + каналы) ═══ */}
        <div id="home-feed" className="flex items-center gap-2 px-1 pt-2">
          <span className="text-base">🔔</span>
          <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Лента</span>
        </div>

        {channels.map((ch) => (
          <button key={ch.agent_id} onClick={() => onOpenChat?.(ch.link_room)} className="rounded-2xl p-3.5 flex items-center gap-3 text-left transition-all hover:scale-[1.01]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: `${ch.color}22`, border: `1.5px solid ${ch.color}55`, color: ch.color }}>📰</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{ch.unread} непрочитанных новостей →</p>
            </div>
            <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>{ch.unread}</span>
          </button>
        ))}

        {loading ? (
          <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
        ) : events.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
            <p className="text-[13px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пока тихо. Важные события появятся здесь.</p>
          </div>
        ) : (
          events.map((e) => {
            const clickable = !!e.link_room && !!onOpenChat;
            return (
              <div key={e.id} onClick={() => { if (clickable) onOpenChat!(e.link_room!); }} className={`rounded-2xl p-3.5 relative transition-all ${clickable ? "cursor-pointer hover:scale-[1.01]" : ""}`} style={{ background: "var(--bg-glass)", border: `1px solid ${e.is_read ? "var(--bg-glass-border)" : "var(--accent)"}` }}>
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{e.icon || KIND_ICON[e.kind] || "ℹ️"}</span>
                  <div className="min-w-0 flex-1 pr-5">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{e.title}</p>
                    {e.body && <p className="text-[13px] mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>{e.body}</p>}
                    <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>{timeAgo(e.created_at)}{clickable ? " · открыть чат →" : ""}</p>
                  </div>
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); handleDismiss(e.id); }} title="Убрать" className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: "var(--bg-glass-hover)", color: "var(--text-muted)" }}>✕</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
