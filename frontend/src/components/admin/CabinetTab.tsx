"use client";
/**
 * Вкладка «🗄 Шкафчик» — склад готовых джинов-профессий с GitHub (backend services/template_cabinet.py).
 * Поиск заготовок, просмотр оригинала, «В бан» (удалить и больше не брать), «Создать джина» из заготовки.
 * Правило владельца: любое подозрение (свой фильтр или SkillSpector) → бан, без ручных разборов.
 * Тем же шкафчиком пользуется Архитектор #47 в чате (инструменты list_templates / adopt_template).
 */
import { useCallback, useEffect, useState } from "react";
import {
  adminCabinetStats, adminCabinetList, adminCabinetGet, adminCabinetSync, adminCabinetSources,
  adminCabinetBan, adminCabinetAdopt,
  type CabinetItem, type CabinetStats, type CabinetAdoptResult,
} from "@/services/api";

const PAGE = 30;

export default function CabinetTab() {
  const [stats, setStats] = useState<CabinetStats | null>(null);
  const [q, setQ] = useState("");
  const [division, setDivision] = useState("");
  const [source, setSource] = useState("");
  const [items, setItems] = useState<CabinetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<CabinetItem | null>(null);
  const [showBody, setShowBody] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [srcEdit, setSrcEdit] = useState<string | null>(null);
  // форма «создать джина»
  const [brief, setBrief] = useState("");
  const [visibility, setVisibility] = useState<"public" | "hidden">("public");
  const [agentType, setAgentType] = useState("specialist");
  const [adopted, setAdopted] = useState<CabinetAdoptResult | null>(null);

  const loadStats = useCallback(() => adminCabinetStats().then(setStats).catch(() => setNote("Не удалось загрузить шкафчик.")), []);
  const load = useCallback(async (off = 0) => {
    try {
      const r = await adminCabinetList({ q, division, source, limit: PAGE, offset: off });
      setItems(r.items); setTotal(r.total); setOffset(off);
    } catch { setNote("Ошибка поиска."); }
  }, [q, division, source]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setTimeout(() => load(0), 300); return () => clearTimeout(t); }, [load]);

  const open = async (it: CabinetItem) => {
    setSel(it); setShowBody(false); setAdopted(null); setBrief("");
    try { setSel(await adminCabinetGet(it.id)); } catch { /* карточка из списка уже есть */ }
  };

  const sync = async () => {
    setBusy("sync"); setNote("");
    try {
      const r = await adminCabinetSync();
      setNote(r.reports.map((x) => x.ok ? `${x.source}: ${x.total} (новых ${x.added}, обновлено ${x.updated}, убрано ${x.removed}, в бан ${x.banned})` : `${x.source}: ${x.error}`).join(" · "));
      await loadStats(); await load(0);
    } catch { setNote("Не удалось обновить с GitHub."); }
    setBusy("");
  };

  const saveSources = async () => {
    if (srcEdit === null) return;
    const list = srcEdit.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    try { await adminCabinetSources(list); setSrcEdit(null); await loadStats(); setNote("Источники сохранены. Нажмите «Обновить с GitHub»."); }
    catch { setNote("Не удалось сохранить источники."); }
  };

  const banSel = async () => {
    if (!sel || !confirm(`Удалить «${sel.name_ru || sel.name}» из шкафчика и больше не брать?`)) return;
    setBusy("ban");
    try { await adminCabinetBan(sel.id); setNote(`«${sel.name_ru || sel.name}» — в бане.`); setSel(null); await load(offset); await loadStats(); }
    catch { setNote("Не удалось отправить в бан."); }
    setBusy("");
  };

  const adopt = async () => {
    if (!sel) return;
    setBusy("adopt"); setAdopted(null);
    try { setAdopted(await adminCabinetAdopt(sel.id, { brief, visibility, agent_type: agentType })); await load(offset); }
    catch { setAdopted({ ok: false, error: "Ошибка сети" }); }
    setBusy("");
  };

  const divisions = stats ? Array.from(new Set(Object.entries(stats.by_source)
    .filter(([s]) => !source || s === source)
    .flatMap(([, v]) => Object.keys(v.divisions)))).sort() : [];
  const grand = stats ? Object.values(stats.by_source).reduce((a, v) => a + v.total, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">🗄 Шкафчик Архитектора</h2>
          <p className="text-xs text-gray-400 max-w-2xl mt-1">
            Готовые джины-профессии с GitHub — только текстовые описания, скрипты репозиториев не запускаются.
            Архитектор находит заготовку, переводит экспертизу в русскую персону с нашими инструментами и проводит рождение.
          </p>
        </div>
        <button onClick={sync} disabled={busy === "sync"}
          className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-50">
          {busy === "sync" ? "Обновляю…" : "Обновить с GitHub"}
        </button>
      </div>

      {stats && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-gray-400 flex flex-wrap gap-x-5 gap-y-1">
          <span>Заготовок: <b className="text-white">{grand}</b></span>
          {Object.entries(stats.by_source).map(([s, v]) => <span key={s}>{s}: <b className="text-gray-200">{v.total}</b></span>)}
          <span>В бане: <b className="text-gray-200">{stats.banned}</b></span>
          <span>Без перевода: <b className="text-gray-200">{stats.untranslated}</b>{stats.translating ? " (переводится…)" : ""}</span>
          <span>Обновлено: {stats.last_sync ? new Date(stats.last_sync).toLocaleString("ru-RU") : "—"}</span>
          {srcEdit === null
            ? <button className="text-amber-400 hover:underline" onClick={() => setSrcEdit(stats.sources.join("\n"))}>Источники…</button>
            : (
              <div className="w-full mt-2 flex flex-col gap-2">
                <textarea value={srcEdit} onChange={(e) => setSrcEdit(e.target.value)} rows={3}
                  className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-gray-200 font-mono" placeholder="owner/repo — по одному в строке" />
                <div className="flex gap-2">
                  <button onClick={saveSources} className="px-3 py-1 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700">Сохранить</button>
                  <button onClick={() => setSrcEdit(null)} className="px-3 py-1 rounded-lg text-gray-400 hover:text-white">Отмена</button>
                </div>
              </div>
            )}
        </div>
      )}
      {note && <div className="text-xs text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-2">{note}</div>}

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Профессия или задача: юрист, HR, продажи, поддержка…"
          className="flex-1 min-w-[220px] bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white" />
        <select value={source} onChange={(e) => { setSource(e.target.value); setDivision(""); }}
          className="bg-gray-900 border border-gray-800 rounded-lg px-2 text-sm text-gray-200">
          <option value="">Все источники</option>
          {stats?.sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={division} onChange={(e) => setDivision(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-2 text-sm text-gray-200 max-w-[200px]">
          <option value="">Все разделы</option>
          {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        <div className="space-y-2">
          <div className="text-xs text-gray-500">Найдено: {total}</div>
          {items.map((it) => (
            <button key={it.id} onClick={() => open(it)}
              className={`w-full text-left rounded-xl border p-3 transition ${sel?.id === it.id ? "border-amber-500 bg-gray-800" : "border-gray-800 bg-gray-900 hover:bg-gray-800/60"}`}>
              <div className="flex items-center gap-2">
                <span>{it.emoji || "🧞"}</span>
                <span className="text-sm font-semibold text-white">{it.name_ru || it.name}</span>
                {it.safety === "flagged" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">проверить</span>}
                {it.adopted_count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">создано: {it.adopted_count}</span>}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{it.name} · {it.division}</div>
              <div className="text-xs text-gray-400 mt-1 line-clamp-2">{it.summary_ru || it.description}</div>
            </button>
          ))}
          {total > PAGE && (
            <div className="flex items-center gap-2 text-xs">
              <button disabled={offset === 0} onClick={() => load(Math.max(0, offset - PAGE))} className="px-3 py-1 rounded-lg bg-gray-800 text-gray-200 disabled:opacity-40">← Назад</button>
              <span className="text-gray-500">{offset + 1}–{Math.min(offset + PAGE, total)} из {total}</span>
              <button disabled={offset + PAGE >= total} onClick={() => load(offset + PAGE)} className="px-3 py-1 rounded-lg bg-gray-800 text-gray-200 disabled:opacity-40">Дальше →</button>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4">
          {!sel ? (
            <div className="text-sm text-gray-500 bg-gray-900 border border-dashed border-gray-800 rounded-xl p-4">
              Выберите заготовку слева — здесь будет оригинал и кнопка «Создать джина».
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div>
                <div className="text-base font-semibold text-white">{sel.emoji} {sel.name_ru || sel.name}</div>
                <div className="text-xs text-gray-500">{sel.name} · {sel.division} · {sel.source} · {sel.license || "лицензия ?"} ·{" "}
                  <a href={sel.url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">GitHub</a>
                </div>
              </div>
              {sel.summary_ru && <p className="text-sm text-gray-300">{sel.summary_ru}</p>}
              {sel.tags_ru && <div className="flex flex-wrap gap-1">{sel.tags_ru.split(",").map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{t}</span>)}</div>}
              <p className="text-xs text-gray-400">{sel.description}</p>

              <button onClick={banSel} disabled={busy === "ban"} className="text-xs text-red-400 hover:underline disabled:opacity-50">
                В бан (удалить и больше не брать)
              </button>

              <div>
                <button onClick={() => setShowBody(!showBody)} className="text-xs text-amber-400 hover:underline">
                  {showBody ? "Скрыть оригинал" : "Показать оригинал (англ.)"}
                </button>
                {showBody && sel.body && (
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[11px] text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-2">{sel.body}</pre>
                )}
              </div>

              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-gray-500">Создать джина из заготовки</div>
                <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
                  placeholder="Уточнения: для кого, отрасль, город, имя, стиль. Напр.: «консультант для сети автосервисов в СПб, зовут Олег, по-деловому»"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-gray-200" />
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "hidden")} className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-200">
                    <option value="public">В Городе (публичный)</option>
                    <option value="hidden">Внутренний (скрыт)</option>
                  </select>
                  <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-200">
                    <option value="specialist">Специалист</option>
                    <option value="business">Бизнес</option>
                    <option value="core">Core (штат)</option>
                  </select>
                  <button onClick={adopt} disabled={busy === "adopt" || sel.safety === "flagged"}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-50">
                    {busy === "adopt" ? "Рождается… (до минуты)" : "Создать джина"}
                  </button>
                </div>
                {adopted && (adopted.ok ? (
                  <div className="text-xs text-emerald-300">
                    Создан #{adopted.agent_id}: {adopted.name} ({adopted.profession}).{" "}
                    {adopted.birth?.steps?.verify?.discoverable ? "Найден в Городе. " : ""}
                    {adopted.birth?.steps?.verify?.responds ? "Отвечает. " : ""}
                    <a href={`/a/${adopted.slug}`} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">Открыть</a>
                    {" "}· настройки — во вкладке «Агенты».
                  </div>
                ) : <div className="text-xs text-red-300">Не получилось: {adopted.error}</div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
