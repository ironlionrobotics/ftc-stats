import { MEXICAN_EVENTS } from "@/lib/constants";
import { notFound } from "next/navigation";

export function generateStaticParams() {
    return MEXICAN_EVENTS.map((event) => ({
        eventCode: event.code,
    }));
}

export default function EventPage({ params }: { params: { eventCode: string } }) {
    const event = MEXICAN_EVENTS.find((e) => e.code === params.eventCode);

    if (!event) {
        notFound();
    }

    return (
        <div className="container mx-auto px-4 py-12">
            <header className="mb-8 border-b border-white/10 pb-6">
                <h1 className="text-4xl font-bold font-display text-white mb-2">
                    {event.name}
                </h1>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/10 border border-white/5">
                    <span className="text-sm font-mono text-gray-400">{event.code}</span>
                    {event.abbr && (
                        <>
                            <span className="text-gray-600">|</span>
                            <span className="text-sm font-bold text-accent">{event.abbr}</span>
                        </>
                    )}
                </div>
            </header>

            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
                <p className="text-lg text-gray-400">
                    Detalles del evento próximamente...
                </p>
            </div>
        </div>
    );
}
