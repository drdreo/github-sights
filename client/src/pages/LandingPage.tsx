import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
    LandingHero,
    LandingShowcase,
    LandingAnalytics,
    LandingFeatures,
    LandingCTA,
    LandingFooter
} from "../components/landing";

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
        <div className="min-h-screen bg-gray-950 selection:bg-blue-500/30 selection:text-white relative">
            {/* Global Background gradient blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl opacity-100" />
                <div className="absolute top-64 -left-40 w-80 h-80 bg-purple-600/8 rounded-full blur-3xl opacity-100" />
            </div>

            <LandingHero recentOwners={recentOwners} />
            <LandingShowcase />
            <LandingAnalytics />
            <LandingFeatures />
            <LandingCTA />
            <LandingFooter />
        </div>
    );
}
