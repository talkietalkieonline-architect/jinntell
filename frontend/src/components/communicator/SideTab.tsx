"use client";

/** Золотой язычок для открытия/закрытия боковой панели */
export default function SideTab({
  side,
  onClick,
  panelOpen = false,
}: {
  side: "left" | "right";
  onClick: () => void;
  panelOpen?: boolean;
}) {
  // Когда панель открыта — язычок мгновенно на краю панели (w-48 = 192px)
  const PANEL_W = 192;
  const offset = panelOpen ? PANEL_W : 0;

  // Стрелка: при открытой панели — направление закрытия
  const icon = side === "left"
    ? (panelOpen ? "←" : "→")
    : (panelOpen ? "→" : "←");

  return (
    <button
      onClick={onClick}
      className="fixed top-1/2 -translate-y-1/2 flex items-center justify-center hover:scale-110 active:scale-95"
      style={{
        [side]: offset + "px",
        width: "14px",
        height: "60px",
        background: panelOpen
          ? "linear-gradient(to bottom, var(--accent-bright), var(--accent))"
          : "linear-gradient(to bottom, var(--accent), var(--accent-bright))",
        borderRadius: side === "left" ? "0 8px 8px 0" : "8px 0 0 8px",
        boxShadow: "0 0 15px var(--accent-glow)",
        zIndex: 48,
        cursor: "pointer",
      }}
    >
      <span
        className="text-[10px] font-bold"
        style={{ color: "var(--bg-deep)" }}
      >
        {icon}
      </span>
    </button>
  );
}
