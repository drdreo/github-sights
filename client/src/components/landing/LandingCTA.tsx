import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function LandingCTA() {
    return (
        <section className="max-w-6xl mx-auto px-6 pb-20">
            <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-blue-600/5 pointer-events-none" />
                <div className="relative">
                    <h2 className="text-2xl font-bold text-gray-100 mb-3">Ready to explore?</h2>
                    <p className="text-gray-400 mb-6 max-w-md mx-auto">
                        Connect your GitHub account and start visualizing your repository
                        analytics in seconds.
                    </p>
                    <Link
                        to="/setup"
                        className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-[background-color,box-shadow,transform] duration-200 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                    >
                        Get Started
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </section>
    );
}