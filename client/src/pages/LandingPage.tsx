import { Link } from "react-router-dom";
import { Github, ArrowRight, Clock } from "lucide-react";
import { useEffect, useState } from "react";

const RECENT_OWNERS_KEY = "github-sights:recent-owners";

export function getRecentOwners(): string[] {
    try {
        const stored = localStorage.getItem(RECENT_OWNERS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function addRecentOwner(owner: string): void {
    const owners = getRecentOwners().filter((o) => o.toLowerCase() !== owner.toLowerCase());
    owners.unshift(owner);
    localStorage.setItem(RECENT_OWNERS_KEY, JSON.stringify(owners.slice(0, 10)));
}

export default function LandingPage() {
    const [recentOwners, setRecentOwners] = useState<string[]>([]);

    useEffect(() => {
        setRecentOwners(getRecentOwners());
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 selection:text-white">
            <div className="text-center animate-in fade-in zoom-in duration-500">
                <div className="inline-flex items-center justify-center p-4 bg-gray-900 rounded-2xl border border-gray-800 mb-6">
                    <Github className="w-10 h-10 text-gray-100" />
                </div>
                <h1 className="text-4xl font-bold text-gray-100 tracking-tight mb-3">
                    GitHub Sights
                </h1>
                <p className="text-gray-400 text-lg max-w-md mx-auto mb-8">
                    Visualize repository insights, contributor activity, and commit trends for any
                    GitHub user or organization.
                </p>

                <Link
                    to="/setup"
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-[0.98]"
                >
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>

            {recentOwners.length > 0 && (
                <div className="mt-12 w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <Clock className="w-3.5 h-3.5" />
                        Recent
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {recentOwners.map((owner) => (
                            <Link
                                key={owner}
                                to={`/${owner}/dashboard`}
                                className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 hover:text-gray-100 hover:border-gray-700 hover:bg-gray-800 transition-all"
                            >
                                {owner}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
