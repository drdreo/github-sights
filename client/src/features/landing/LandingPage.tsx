import { useEffect, useState } from "react";
import { getRecentOwners } from "../../shared/lib/recentOwners";
import {
    LandingAnalytics,
    LandingCTA,
    LandingFeatures,
    LandingFooter,
    LandingHero,
    LandingShowcase
} from "./components";

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
