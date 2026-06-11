import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 gap-4">
      <h1 className="font-bebas text-5xl tracking-widest text-gray-900">
        Waging<span className="text-amber-400">War</span>
      </h1>
      <p className="text-sm text-gray-500">Australian horse racing analytics</p>
      <Link href="/races" className="px-6 py-3 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors">
        View Races
      </Link>
    </main>
  );
}
