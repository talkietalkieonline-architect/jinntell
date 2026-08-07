"use client";
import { useEffect, useState, type ReactNode } from "react";
import { getChannels, getFavoriteAgents, getRecommendedAgents, getContacts, getAgents, addFavoriteAgent, searchUsers, addContact, listDigests, getFeed, getMyInvites, mediaUrl, type ChannelUnread, type AgentOut, type ContactOut, type FeedEvent, type GeoInvite } from "@/services/api";
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
  onOpenFeed?: () => void;
  onOpenCity?: () => void;
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
      <div className="relative" style={{ width: d, height: d }}>
        {/* сам круг — только он обрезает картинку; бейджи ниже вынесены НАРУЖУ (не обрезаются) */}
        <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden" style={{ border: (badge && badge > 0) ? "2px solid var(--accent)" : pinned ? "2px solid var(--accent)" : `2px solid ${color || "var(--bg-glass-border)"}`, background: color ? `${color}22` : "var(--bg-glass)", boxShadow: (badge && badge > 0) ? "0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent)" : undefined }}>
          {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <span style={{ fontSize: small ? 16 : 20 }}>{emoji || "💬"}</span>}
        </div>
        {!!badge && badge > 0 && <span className="absolute inset-0 rounded-full animate-ping pointer-events-none" style={{ boxShadow: "0 0 0 2px var(--accent)", opacity: 0.35 }} />}
        {!!badge && badge > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)", zIndex: 2, boxShadow: "0 0 0 2px var(--panel-bg, #101018)" }}>{badge}</span>}
        {paid && <span className="absolute -bottom-0.5 -right-0.5 w-[16px] h-[16px] rounded-full flex items-center justify-center text-[9px]" style={{ background: "#e8b84a", color: "#1a1400", zIndex: 2 }}>₽</span>}
        {star && <span className="absolute -top-1 -left-1 text-[11px]" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))", zIndex: 2 }}>⭐</span>}
        {online && <span className="absolute bottom-0 left-0 w-[11px] h-[11px] rounded-full" style={{ background: "#3ecf6a", border: "2px solid var(--panel-bg, #101018)", zIndex: 2 }} />}
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

export default function HomeRoom({ topPad, bottomPad, assistantName, assistantPhoto, userId, openChats = [], favIds, onOpenAssistant, onOpenFlow, onOpenAgent, onOpenContact, onOpenChat, onOpenActions, onOpenDigest, onOpenInvites, onCreateJinn, onOpenFeed, onOpenCity }: Props) {
  const [digests, setDigests] = useState<{ id: number; query: string; created_at: string }[]>([]);
  const [allChannels, setAllChannels] = useState<ChannelUnread[]>([]);
  const [favs, setFavs] = useState<AgentOut[]>([]);
  const [recommended, setRecommended] = useState<AgentOut[]>([]);
  const [popular, setPopular] = useState<AgentOut[]>([]);
  const [contacts, setContacts] = useState<ContactOut[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [invites, setInvites] = useState<GeoInvite[]>([]);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [userResults, setUserResults] = useState<ContactOut[]>([]);
  const [addBusy, setAddBusy] = useState(false);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => { try { const raw = localStorage.getItem("jinntell_home_collapsed"); if (raw) setCollapsed(new Set(JSON.parse(raw))); } catch { /* noop */ } }, []);
  const toggleCollapse = (k: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); try { localStorage.setItem("jinntell_home_collapsed", JSON.stringify([...n])); } catch { /* noop */ } return n; });

  // Закрепления: джинны (id агентов) и люди (id пользователей) — вручную, для «Избранных контактов»
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [pinnedContacts, setPinnedContacts] = useState<Set<number>>(new Set());
  useEffect(() => {
    try { const a = localStorage.getItem("jinntell_pinned"); if (a) setPinned(new Set(JSON.parse(a))); } catch { /* noop */ }
    try { const c = localStorage.getItem("jinntell_pinned_contacts"); if (c) setPinnedContacts(new Set(JSON.parse(c))); } catch { /* noop */ }
  }, []);
  const togglePin = (id: number) => setPinned((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem("jinntell_pinned", JSON.stringify([...n])); } catch { /* noop */ } return n; });
  const togglePinContact = (id: number) => setPinnedContacts((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem("jinntell_pinned_contacts", JSON.stringify([...n])); } catch { /* noop */ } return n; });

  // Клиентский read-state (слой 1): документы просмотрены + отметка «когда смотрел ленту»
  const [seenDocs, setSeenDocs] = useState<Set<number>>(new Set());
  const [feedSeenTs, setFeedSeenTs] = useState<number>(0);
  const [invitesSeenTs, setInvitesSeenTs] = useState<number>(0);
  useEffect(() => {
    try { const s = localStorage.getItem("jinntell_seen_docs"); if (s) setSeenDocs(new Set(JSON.parse(s))); } catch { /* noop */ }
    try { const t = localStorage.getItem("jinntell_feed_seen_ts"); if (t) setFeedSeenTs(parseInt(t, 10) || 0); } catch { /* noop */ }
    try { const t = localStorage.getItem("jinntell_invites_seen_ts"); if (t) setInvitesSeenTs(parseInt(t, 10) || 0); } catch { /* noop */ }
  }, []);
  const markDocSeen = (id: number) => setSeenDocs((prev) => { const n = new Set(prev); n.add(id); try { localStorage.setItem("jinntell_seen_docs", JSON.stringify([...n])); } catch { /* noop */ } return n; });
  const openDoc = (id: number) => { markDocSeen(id); onOpenDigest?.(id); };
  const openFeed = () => { const now = Date.now(); setFeedSeenTs(now); try { localStorage.setItem("jinntell_feed_seen_ts", String(now)); } catch { /* noop */ } onOpenFeed?.(); };
  const openInvitesW = () => { const now = Date.now(); setInvitesSeenTs(now); try { localStorage.setItem("jinntell_invites_seen_ts", String(now)); } catch { /* noop */ } onOpenInvites?.(); };

  useEffect(() => {
    let alive = true;
    const loadAll = () => {
      getFavoriteAgents().then((f) => { if (alive) setFavs(f); }).catch(() => {});
      getRecommendedAgents().then((r) => { if (alive) setRecommended(r); }).catch(() => {});
      getAgents().then((r) => { if (alive) setPopular(r.agents || []); }).catch(() => {});
      getContacts().then((c) => { if (alive) setContacts(c); }).catch(() => {});
      listDigests().then((r) => { if (alive) setDigests(r.items || []); }).catch(() => {});
      getChannels().then((c) => { if (alive) setAllChannels(c); }).catch(() => {});
      getFeed().then((l) => { if (alive) setFeedEvents(l); }).catch(() => {});
      getMyInvites().then((r) => { if (alive) setInvites(r.items || []); }).catch(() => {});
    };
    loadAll();
    window.addEventListener("jinntell_feed_ping", loadAll);
    window.addEventListener("jinntell_favs_change", loadAll);
    const onVis = () => { if (document.visibilityState === "visible") loadAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.removeEventListener("jinntell_feed_ping", loadAll); window.removeEventListener("jinntell_favs_change", loadAll); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // Категоризация «Джинны» из избранного
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

  // Непрочитанное из открытых чатов
  const unreadByAgent = new Map<number, number>();
  openChats.forEach((c) => { if (c.count && c.count > 0 && c.agentId) unreadByAgent.set(c.agentId, (unreadByAgent.get(c.agentId) || 0) + c.count); });

  const important = favs.filter((a) => pinned.has(a.id));               // закреплённые джинны
  const favContacts = contacts.filter((c) => pinnedContacts.has(c.id)); // закреплённые люди

  // ── ВЕРХНИЕ «НОВОСТНЫЕ» ПОЛОСЫ ──
  const newMsgs = openChats.filter((c) => (c.count || 0) > 0);                              // непрочитанные чаты
  const newEvents = feedEvents.filter((e) => e.kind !== "offer" && new Date(e.created_at).getTime() > feedSeenTs).length;   // события
  const newOffers = feedEvents.filter((e) => e.kind === "offer" && new Date(e.created_at).getTime() > feedSeenTs).length;   // предложения
  const newInvites = invites.filter((i) => new Date(i.at).getTime() > invitesSeenTs).length;                               // приглашения
  const newDocs = digests.filter((d) => !seenDocs.has(d.id));                               // непросмотренные документы

  const agentCircle = (a: AgentOut, small?: boolean) => (
    <Circle key={a.id} label={a.name} sub={a.profession} color={a.color} emoji="🧞" paid={a.is_paid} small={small} star={pinned.has(a.id)} badge={unreadByAgent.get(a.id) || 0} onClick={() => onOpenAgent?.(a.id, { name: a.name, color: a.color })} onLongPress={() => togglePin(a.id)} />
  );
  const contactCircle = (c: ContactOut) => (
    <Circle key={c.id} label={c.display_name} photo={c.avatar_url} color={c.avatar_color || undefined} emoji="👤" online={c.is_online} star={pinnedContacts.has(c.id)} onClick={() => onOpenContact?.(c)} onLongPress={() => togglePinContact(c.id)} />
  );
  const guestAgentCircle = (a: AgentOut) => (
    <Circle key={a.id} label={a.name} sub={a.profession} color={a.color} emoji="🧞" paid={a.is_paid} small onClick={() => onOpenAgent?.(a.id, { name: a.name, color: a.color })} onLongPress={async () => { try { await addFavoriteAgent(a.id); window.dispatchEvent(new Event("jinntell_favs_change")); } catch { /* noop */ } }} />
  );

  const bigHead = (label: string, k: string, hint?: string) => (
    <button onClick={() => toggleCollapse(k)} className="w-full flex items-baseline justify-between px-1 pt-2 transition-opacity hover:opacity-80">
      <span className="text-[15px] font-extrabold" style={{ color: "var(--text-primary)" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{collapsed.has(k) ? "▸ " : "▾ "}</span>{label}
      </span>
      {hint && !collapsed.has(k) && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </button>
  );
  const subHead = (label: string, k: string, hint?: string) => (
    <button onClick={() => toggleCollapse(k)} className="w-full flex items-baseline justify-between px-1 pt-0.5 transition-opacity hover:opacity-80">
      <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{collapsed.has(k) ? "▸ " : "▾ "}</span>{label}
      </span>
      {hint && !collapsed.has(k) && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </button>
  );
  const newHead = (label: string) => (
    <div className="text-[13px] font-extrabold px-1 pt-1 flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />{label}
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-y-auto flex justify-center" style={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 12 }}>
      <div className="w-full max-w-[620px] px-4 flex flex-col gap-3.5">

        {/* ═══════════ ВЕРХ: три «новостные» полосы (просмотрел → исчезает) ═══════════ */}
        {newMsgs.length > 0 && (<div>
          {newHead("Новые события")}
          <Strip title="">{newMsgs.map((c) => <Circle key={c.room} label={c.name} photo={c.photo} color={c.color} emoji="💬" badge={c.count} online={c.online} onClick={() => onOpenChat?.(c.room)} />)}</Strip>
        </div>)}

        {(newEvents + newOffers + newInvites) > 0 && (<div>
          {newHead("Новые ленты")}
          <Strip title="">
            {newEvents > 0 && <Circle label="Лента" sub="события" emoji="🔔" color="#5ea0e8" badge={newEvents} onClick={openFeed} />}
            {newOffers > 0 && <Circle label="Предложения" sub="от джиннов" emoji="💡" color="#e0a13a" badge={newOffers} onClick={openFeed} />}
            {newInvites > 0 && <Circle label="Приглашения" sub="рядом" emoji="📍" color="#c0563a" badge={newInvites} onClick={openInvitesW} />}
          </Strip>
        </div>)}

        {newDocs.length > 0 && (<div>
          {newHead("Новые документы")}
          <Strip title="">{newDocs.map((d) => <Circle key={d.id} label={d.query} emoji="📑" color="#8a6fd0" badge={1} onClick={() => openDoc(d.id)} />)}</Strip>
        </div>)}

        {/* ═══════════ Контакты избранные (вручную: удержи кружок) ═══════════ */}
        {(important.length + favContacts.length) > 0 && (<div>
          {newHead("Контакты избранные")}
          <Strip title="">{[...important.map((a) => agentCircle(a, true)), ...favContacts.map((c) => contactCircle(c))]}</Strip>
        </div>)}

        {/* ═══════════ КОНТАКТЫ (помощники · джинны · люди) ═══════════ */}
        {bigHead("Контакты", "sob")}
        {!collapsed.has("sob") && (<>

        {subHead("Помощники", "asst")}
        {!collapsed.has("asst") && (
          <Strip title="">
            <Circle label={assistantName} sub="помощник" photo={assistantPhoto} emoji="🧞" pinned onClick={onOpenAssistant} />
            {personal.map((a) => agentCircle(a))}
          </Strip>
        )}

        {subHead("Джинны", "jinns", "удержи кружок → ⭐")}
        {!collapsed.has("jinns") && (<>
          <Strip title="" empty={(important.length + consultants.length + specialists.length + others.length + recs.length) === 0 ? "добавь джиннов из Города ниже" : undefined}>
            {onCreateJinn && <Circle label="Создать" emoji="➕" onClick={onCreateJinn} />}
          </Strip>
          {important.length > 0 && <Strip title="⭐ Важные">{important.map((a) => agentCircle(a, true))}</Strip>}
          {consultants.length > 0 && <Strip title="Консультанты">{consultants.map((a) => agentCircle(a, true))}</Strip>}
          {specialists.length > 0 && <Strip title="Специалисты">{specialists.map((a) => agentCircle(a, true))}</Strip>}
          {others.length > 0 && <Strip title="Другие">{others.map((a) => agentCircle(a, true))}</Strip>}
        </>)}

        {subHead("Люди", "ppl", "удержи → в избранные")}
        {!collapsed.has("ppl") && (<>
          <Strip title="" empty={contacts.length === 0 ? "нет контактов — найди человека ниже" : undefined}>
            {contacts.map((c) => contactCircle(c))}
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
        </>)}

        </>)}

        {/* ═══════════ ЛЕНТЫ (архив постоянных лент помощника) ═══════════ */}
        {bigHead("Ленты", "info")}
        {!collapsed.has("info") && (
          <Strip title="">
            <Circle label="Лента" sub="события" emoji="🔔" color="#5ea0e8" small onClick={openFeed} />
            <Circle label="Предложения" sub="от джиннов" emoji="💡" color="#e0a13a" small onClick={openFeed} />
            <Circle label="Приглашения" sub="рядом" emoji="📍" color="#c0563a" small onClick={openInvitesW} />
            <Circle label="Действия" sub="помощника" emoji="📋" color="#4a9e7f" small onClick={onOpenActions} />
          </Strip>
        )}

        {/* ═══════════ ДОКУМЕНТЫ (архив всего, что подготовил помощник) ═══════════ */}
        {bigHead("Документы", "docs")}
        {!collapsed.has("docs") && (
          <Strip title="" empty={digests.length === 0 ? "скажи помощнику «составь подборку …»" : undefined}>
            {digests.map((d) => <Circle key={d.id} label={d.query} emoji="📑" color="#8a6fd0" small onClick={() => openDoc(d.id)} />)}
          </Strip>
        )}

        {/* ═══════════ КАНАЛЫ (отдельным блоком; бейджи = новые посты) ═══════════ */}
        {allChannels.length > 0 && (<>
          {bigHead("Каналы", "chan")}
          {!collapsed.has("chan") && (
            <Strip title="">
              {allChannels.map((ch) => <Circle key={ch.agent_id} label={ch.name} sub="канал" color={ch.color} emoji="📰" badge={ch.unread} onClick={() => onOpenChat?.(ch.link_room)} />)}
            </Strip>
          )}
        </>)}

        {/* ═══════════ ГОСТИНАЯ (полистать; гости пропадают, если не перенести) ═══════════ */}
        {bigHead("Гостиная", "gost", "удержи → в «Джинны»")}
        {!collapsed.has("gost") && (<>
          {recs.length > 0 && <Strip title="Рекомендованные">{recs.map((a) => guestAgentCircle(a))}</Strip>}
          {pops.length > 0 && <Strip title="Популярные">{pops.map((a) => guestAgentCircle(a))}</Strip>}
          {guests.length > 0 && <Strip title="Были недавно">{guests.map((c) => <Circle key={c.room} label={c.name} photo={c.photo} color={c.color} emoji="🧞" small badge={c.count} onClick={() => onOpenChat?.(c.room)} />)}</Strip>}
          {(recs.length + pops.length + guests.length) === 0 && <p className="text-[11px] px-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>Здесь появятся рекомендованные, популярные и недавние гости.</p>}
        </>)}

        {/* Переход в Город — в самом низу */}
        <button onClick={onOpenCity} className="mt-3 rounded-2xl p-4 flex items-center justify-center gap-2 text-sm font-semibold transition-all hover:scale-[1.01]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
          🏙 Перейти в Город джиннов
        </button>
      </div>
    </div>
  );
}
