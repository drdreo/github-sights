import { FEATURES } from "./mockData";

export function LandingFeatures() {
    return (
        <section className="max-w-6xl mx-auto px-6 pb-20">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {FEATURES.map((f) => (
                    <div
                        key={f.title}
                        className="bg-gray-900/50 border border-gray-800/60 rounded-xl p-5"
                    >
                        <div className="p-2.5 bg-gray-800 rounded-lg w-fit mb-3">
                            <f.icon className="w-5 h-5 text-blue-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-100 mb-1.5">
                            {f.title}
                        </h3>
                        <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}