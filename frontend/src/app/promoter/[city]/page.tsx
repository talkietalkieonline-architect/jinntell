import { redirect } from "next/navigation";

/** /promoter/spb?src=kp-azs — Марк с городом клиента (гостю ставится город) и меткой источника. */
export default async function PromoterCity({ params, searchParams }: {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { city } = await params;
  const { src } = await searchParams;
  redirect(`/a/promoter?city=${encodeURIComponent(city)}${src ? `&src=${encodeURIComponent(src)}` : ""}`);
}
