import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <p className="font-mono text-sm uppercase tracking-widest">{site.concept}</p>
      <h1 className="text-4xl font-semibold tracking-tight">{site.name}</h1>
      <p className="max-w-[56ch] text-lg">
        {site.tagline} for {site.store.name}, a fictional shop. In development.
      </p>
    </main>
  );
}
