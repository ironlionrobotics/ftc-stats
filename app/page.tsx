import { getAggregatedStats } from "@/lib/aggregation";
import StatsTable from "@/components/StatsTable";
import { SEASON } from "@/lib/constants";

export default async function Home() {
  const stats = await getAggregatedStats();

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-96 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-full h-96 bg-secondary/10 blur-[100px] rounded-full translate-y-1/2 pointer-events-none" />

      <div className="container mx-auto px-10 py-12 relative z-10">
        <header className="mb-12 text-center md:text-left">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-white/10 pb-6">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold font-display tracking-tight text-white mb-2">
                FTC <span className="text-primary">México</span>
              </h1>
              <p className="text-xl text-gray-400 font-light">
                Estadísticas y Proyecciones <span className="text-accent font-medium">{SEASON}</span>
              </p>
            </div>
            <div className="flex gap-8">
              <div className="text-right hidden md:block">
                <span className="block text-sm text-gray-500 uppercase tracking-widest">Total de Equipos</span>
                <span className="text-3xl font-bold text-white font-display">{stats.length}</span>
              </div>
              <div className="text-right hidden md:block border-l border-white/10 pl-8">
                <span className="block text-sm text-secondary uppercase tracking-widest">Avanzaron</span>
                <span className="text-3xl font-bold text-secondary font-display">
                  {stats.filter(s => s.hasAdvanced).length}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-12">
          <StatsTable data={stats} />
        </section>

        <footer className="text-center text-gray-600 text-sm py-8">
          <p>© {new Date().getFullYear()} FTC México Stats. No afiliado oficialmente con FIRST.</p>
        </footer>
      </div>
    </main>
  );
}
