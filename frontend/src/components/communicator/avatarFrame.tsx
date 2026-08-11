import type { CSSProperties } from "react";

export interface FramePreset {
  id: string;
  label: string;
  ring?: string;      // box-shadow вокруг аватара
  emojis?: string[];  // мелкий декор по верхней дуге
}

export const AVATAR_FRAMES: FramePreset[] = [
  { id: "", label: "Без рамки" },
  { id: "gold", label: "Золото", ring: "0 0 0 2px #d9a534, 0 0 8px rgba(217,165,52,0.55)" },
  { id: "neon", label: "Неон", ring: "0 0 0 2px #6c7bff, 0 0 10px rgba(108,123,255,0.6)" },
  { id: "rose", label: "Роза", ring: "0 0 0 2px #e0679a, 0 0 8px rgba(224,103,154,0.55)" },
  { id: "flowers", label: "🌸 Цветы", emojis: ["🌸", "🌼", "🌷"] },
  { id: "hearts", label: "💗 Сердечки", emojis: ["💗", "💕", "💖"] },
  { id: "stars", label: "✨ Звёзды", emojis: ["✨", "⭐", "🌟"] },
];

export function frameRing(frame?: string | null): string | undefined {
  return AVATAR_FRAMES.find((x) => x.id === frame)?.ring;
}

/** Мелкий декор вокруг аватара (не мешает соседям — маленький, по верхней дуге).
 *  Требует родителя с position: relative и БЕЗ overflow: hidden. */
export function FrameDeco({ frame, size }: { frame?: string | null; size: number }) {
  const f = AVATAR_FRAMES.find((x) => x.id === frame);
  if (!f?.emojis) return null;
  const fs = Math.max(9, Math.round(size * 0.26));
  const pos: CSSProperties[] = [
    { top: -fs * 0.42, left: "50%", transform: "translateX(-50%)" },
    { top: -fs * 0.1, left: -fs * 0.2 },
    { top: -fs * 0.1, right: -fs * 0.2 },
  ];
  return (
    <>
      {f.emojis.slice(0, 3).map((e, i) => (
        <span key={i} style={{ position: "absolute", pointerEvents: "none", zIndex: 3, ...pos[i] }}>
          <span className="frame-deco-item" style={{ display: "inline-block", fontSize: fs, lineHeight: 1, animationDelay: `${i * 0.5}s` }}>{e}</span>
        </span>
      ))}
    </>
  );
}
