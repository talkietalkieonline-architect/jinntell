"use client";

interface Props {
  topPad: number;
  bottomPad: number;
  assistantName: string;
  onOpenAssistant: () => void;
}

const SECTIONS = [
  { id: "attention", title: "На что обратить внимание", icon: "👁" },
  { id: "today", title: "События дня", icon: "📅" },
  { id: "urgent", title: "Срочные новости", icon: "🔴" },
  { id: "notify", title: "Уведомления", icon: "🔔" },
];

export default function HomeRoom({ topPad, bottomPad, assistantName, onOpenAssistant }: Props) {
  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 12 }}>
      <div className="min-h-full flex flex-col justify-center items-center">
        <div className="w-full max-w-[620px] px-4 flex flex-col gap-4">
          {/* Приветствие помощника */}
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>🧞</div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{assistantName}</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>ваш помощник</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              С возвращением! Здесь будут события дня, срочные новости и напоминания. Чтобы задать вопрос — откройте чат помощника.
            </p>
            <button onClick={onOpenAssistant} className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
              Чат с {assistantName}
            </button>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.id} className="rounded-2xl p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{s.icon}</span>
                <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{s.title}</span>
              </div>
              <p className="text-[13px] text-center py-3" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Пока пусто</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
