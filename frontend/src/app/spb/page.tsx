import { redirect } from "next/navigation";

/** /spb — короткая ссылка для Петербурга (листовки, QR, рассылки): Марк, промоутер Города. */
export default async function Spb({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { src } = await searchParams;
  redirect(`/a/promoter?city=spb${src ? `&src=${encodeURIComponent(src)}` : ""}`);
}
