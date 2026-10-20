"use client";
/**
 * Вкладка «📡 Канал» в настройках джинна: автоканал (источники / частота / режим / тема-фильтр).
 * Движок — backend services/channel_engine.py. Одинаково для любого джинна.
 */
import { useEffect, useState } from "react";
import {
  adminGetChannel, adminSaveChannel, adminTestChannelSource,
  type ChannelConfig, type ChannelSource, type ChannelSourceType,
} from "@/services/api";

const TYPES: { id: ChannelSourceType; label: string; hint: string }[] = [
  { id: "rss", label: "RSS-лента", hint: "адрес ленты сайта, напр. https://habr.com/ru/rss/hubs/artificial_intelligence/articles/" },
  { id: "github", label: "GitHub · новые", hint: "новые репозитории (до 7 дней) по запросу, напр. topic:llm или topic:ai-agents" },
  { id: "gh_trending", label: "GitHub Trending", hint: "что набирает звёзды сегодня; поле — язык (необязательно), напр. python" },
  { id: "gh_releases", label: "GitHub · релизы", hint: "свежие релизы проектов: owner/repo через запятую, напр. ollama/ollama, vllm-project/vllm" },
  { id: "gh_org_new", label: "GitHub · команды", hint: "новые репозитории команд: организации через запятую, напр. openai, deepseek-ai, QwenLM" },
  { id: "gh_popular", label: "GitHub · классика", hint: "давно популярные и живые проекты по теме (★>1000), по одной за выпуск; напр. topic:ai-agents" },
  { id: "hn", label: "Hacker News", hint: "запрос (пусто — про ИИ)" },
  { id: "hf", label: "HuggingFace", hint: "трендовые модели" },
  { id: "arxiv", label: "arXiv", hint: "свежие статьи по ИИ" },
];
const INTERVALS = [
  { v: 30, l: "каждые 30 минут" }, { v: 60, l: "каждый час" }, { v: 180, l: "каждые 3 часа" },
  { v: 360, l: "каждые 6 часов" }, { v: 720, l: "каждые 12 часов" }, { v: 1440, l: "раз в сутки" },
];

type TestRes = { ok: boolean; count?: number; sample?: string[]; error?: string } | "busy";

export default function ChannelTab({ agentId }: { agentId: number }) {
  const [cfg, setCfg] = useState<ChannelConfig | null>(null);
  const [meta, setMeta] = useState<{ last_run: string | null; posts: number; public_url: string | null }>({ last_run: null, posts: 0, public_url: null });
  const [tests, setTests] = useState<Record<number, TestRes>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    adminGetChannel(agentId)
      .then((s) => { setCfg(s.config); setMeta({ last_run: s.last_run, posts: s.posts, public_url: s.public_url }); })
      .catch(() => setNote("Не удалось загрузить настройки канала."));
  }, [agentId]);

  if (!cfg) return <div className="text-sm text-gray-500 py-6">{note || "Загрузка…"}</div>;

  const set = (patch: Partial<ChannelConfig>) => { setCfg({ ...cfg, ...patch }); setNote(""); };
  const setSrc = (i: number, patch: Partial<ChannelSource>) => {
    set({ sources: cfg.sources.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
    setTests((t) => { const n = { ...t }; delete n[i]; return n; });
  };
  const addSrc = () => set({ sources: [...cfg.sources, { type: "rss", url: "", label: "" }] });
  const delSrc = (i: number) => { set({ sources: cfg.sources.filter((_, k) => k !== i) }); setTests({}); };

  const test = async (i: number) => {
    setTests((t) => ({ ...t, [i]: "busy" }));
    try { const r = await adminTestChannelSource(agentId, cfg.sources[i]); setTests((t) => ({ ...t, [i]: r })); }
    catch { setTests((t) => ({ ...t, [i]: { ok: false, error: "Ошибка сети" } })); }
  };

  const save = async () => {
    setSaving(true); setNote("");
    try { const r = await adminSaveChannel(agentId, cfg); setCfg(r.config); setNote("Сохранено"); }
    catch { setNote("Не удалось сохранить"); }
    finally { setSaving(false); }
  };

  const fmt = (iso: string | null) => { if (!iso) return "ещё не было"; try { return new Date(iso).toLocaleString("ru"); } catch { return iso; } };
  const field = "bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500";

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Статус */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm font-semibold text-white">Автоканал включён</span>
        </label>
        <span className="text-xs text-gray-500">Последний выпуск: <span className="text-gray-300">{fmt(meta.last_run)}</span></span>
        <span className="text-xs text-gray-500">Постов в канале: <span className="text-gray-300">{meta.posts}</span></span>
        {meta.public_url && <a href={meta.public_url} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:underline">Открыть канал ↗</a>}
      </div>

      {/* Режим */}
      <div>
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Как подавать</div>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: "voice", t: "Своим голосом", d: "Джинн сам выбирает лучшее и пересказывает жителям. Как Гит." },
            { id: "raw", t: "Как есть", d: "Каждая находка — отдельный пост из источника, без пересказа. Как Новости СПб." },
          ] as const).map((m) => (
            <button key={m.id} type="button" onClick={() => set({ mode: m.id })}
              className={`text-left rounded-xl p-3 border transition-colors ${cfg.mode === m.id ? "border-amber-500 bg-amber-500/10" : "border-gray-800 bg-gray-900 hover:border-gray-600"}`}>
              <div className="text-sm font-semibold text-white">{m.t}</div>
              <div className="text-xs text-gray-400 mt-1">{m.d}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Частота / объём / тема */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Частота выпуска</span>
          <select value={cfg.interval_min} onChange={(e) => set({ interval_min: Number(e.target.value) })} className={field}>
            {!INTERVALS.some((o) => o.v === cfg.interval_min) && <option value={cfg.interval_min}>каждые {cfg.interval_min} мин</option>}
            {INTERVALS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>
        {cfg.mode === "voice" ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Постов за выпуск</span>
            <input type="number" min={1} max={10} value={cfg.posts_per_run} onChange={(e) => set({ posts_per_run: Number(e.target.value) })} className={field} />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Не больше постов за выпуск</span>
            <input type="number" min={1} max={50} value={cfg.max_raw} onChange={(e) => set({ max_raw: Number(e.target.value) })} className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-xs text-gray-400">Тема-фильтр <span className="text-gray-600">— ключевые слова через запятую; брать только материалы, где они встречаются. Пусто — всё подряд.</span></span>
          <input value={cfg.topic_filter} onChange={(e) => set({ topic_filter: e.target.value })} placeholder="напр.: нейросет, ИИ, LLM, агент" className={field} />
        </label>
      </div>

      {/* Источники */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-gray-500">Источники · {cfg.sources.length}</div>
          <button type="button" onClick={addSrc} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700">+ Добавить источник</button>
        </div>
        {cfg.sources.length === 0 && <div className="text-sm text-gray-500 bg-gray-900 border border-dashed border-gray-800 rounded-xl p-4">Источников нет. Добавьте RSS-ленту сайта или поиск GitHub.</div>}
        <div className="flex flex-col gap-2">
          {cfg.sources.map((s, i) => {
            const meta2 = TYPES.find((t) => t.id === s.type);
            const tr = tests[i];
            const needsUrl = s.type === "rss";
            const needsQuery = ["github", "hn", "gh_trending", "gh_releases", "gh_org_new", "gh_popular"].includes(s.type);
            const ph: Record<string, string> = { github: "topic:llm", hn: "AI OR LLM", gh_trending: "язык (необязательно)",
              gh_releases: "ollama/ollama, vllm-project/vllm", gh_org_new: "openai, deepseek-ai", gh_popular: "topic:ai-agents" };
            return (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                  <select value={s.type} onChange={(e) => setSrc(i, { type: e.target.value as ChannelSourceType })} className={`${field} w-44 shrink-0`}>
                    {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  {needsUrl && <input value={s.url || ""} onChange={(e) => setSrc(i, { url: e.target.value })} placeholder="https://…/rss" className={`${field} flex-1 min-w-0`} />}
                  {needsQuery && <input value={s.query || ""} onChange={(e) => setSrc(i, { query: e.target.value })} placeholder={ph[s.type] || ""} className={`${field} flex-1 min-w-0`} />}
                  {!needsUrl && !needsQuery && <div className="flex-1 text-xs text-gray-500">{meta2?.hint}</div>}
                  <input value={s.label || ""} onChange={(e) => setSrc(i, { label: e.target.value })} placeholder="подпись" className={`${field} w-32 shrink-0`} />
                  <button type="button" onClick={() => test(i)} disabled={tr === "busy"} className="text-xs px-3 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 shrink-0">{tr === "busy" ? "…" : "Проверить"}</button>
                  <button type="button" onClick={() => delSrc(i)} aria-label="Удалить источник" className="text-gray-500 hover:text-red-400 px-1 shrink-0">✕</button>
                </div>
                {(needsUrl || needsQuery) && <div className="text-[11px] text-gray-600">{meta2?.hint}</div>}
                {tr && tr !== "busy" && (tr.ok ? (
                  <div className="text-xs text-green-400">✓ Открывается · материалов сейчас: {tr.count}{tr.sample && tr.sample.length > 0 && <span className="text-gray-500"> — {tr.sample.join(" · ").slice(0, 220)}</span>}</div>
                ) : (
                  <div className="text-xs text-red-400">✗ {tr.error}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="px-5 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-60">{saving ? "Сохраняю…" : "Сохранить канал"}</button>
        {note && <span className={`text-sm ${note === "Сохранено" ? "text-green-400" : "text-red-400"}`}>{note}</span>}
      </div>
    </div>
  );
}
