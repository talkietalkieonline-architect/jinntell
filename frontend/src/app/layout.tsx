import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "JinnTell — AI-First",
  description: "Экосистема голосового общения с ИИ-агентами",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-theme="noir-gold">
      <head>
        <style>{`
          @keyframes marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee {
            animation: marquee 30s linear infinite;
          }
        `}</style>
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
