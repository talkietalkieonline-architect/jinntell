"use client";
import { useId } from "react";

/** Монограмма JinnTell — лигатура «JT», золото. Чистый SVG, масштабируется. */
export default function JTLogo({
  size = 40,
  className,
  style,
}: {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const raw = useId();
  const gid = `jt-gold-${raw.replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="JinnTell"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#F0C95C" />
          <stop offset="1" stopColor="#B9841C" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 14 H50" />
        <path d="M22 14 V36 Q22 45 13.5 45 Q8.5 45 8.5 38" />
        <path d="M36 14 V48" />
      </g>
    </svg>
  );
}
