import { Link } from "react-router-dom";
import { Github, ArrowRight, Clock, Search, Eye } from "lucide-react";

interface LandingHeroProps {
    recentOwners: string[];
}

export function LandingHero({ recentOwners }: LandingHeroProps) {
    return (
        <section className="relative">
            <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
                {/* Nav */}
                <nav className="flex items-center justify-between mb-20">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-gray-900 rounded-xl border border-gray-800">
                            <Github className="w-5 h-5 text-gray-100" />
                        </div>
                        <span className="text-lg font-semibold text-gray-100 tracking-tight">
                            GitHub Sights
                        </span>
                    </div>
                    <Link
                        to="/setup"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                    >
                        Get Started
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </nav>

                {/* Hero content */}
                <div className="text-center max-w-3xl mx-auto animate-in fade-in zoom-in duration-500">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm text-blue-400 mb-6">
                        <Eye className="w-3.5 h-3.5" />
                        Visualize your GitHub activity
                    </div>

                    <h1 className="text-5xl sm:text-6xl font-bold text-gray-100 tracking-tight mb-5 leading-tight">
                        Insights for your
                        <br />
                        <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                            GitHub repositories
                        </span>
                    </h1>

                    <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
                        Track commits, analyze contributors, and uncover trends across any
                        GitHub user or organization. Beautiful analytics in minutes.
                    </p>

                    {recentOwners.length > 0 ? (
                        <div className="flex flex-col items-center gap-8">
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Link
                                    to={`/${recentOwners[0]}/dashboard`}
                                    className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-[background-color,box-shadow,transform] duration-200 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                                >
                                    <Clock className="w-4 h-4" />
                                    Resume {recentOwners[0]}
                                </Link>
                                <Link
                                    to="/setup"
                                    className="inline-flex items-center gap-2 px-7 py-3.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl border border-gray-700 transition-[background-color,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                                >
                                    <Search className="w-4 h-4" />
                                    New Analysis
                                </Link>
                            </div>
                            
                            {recentOwners.length > 1 && (
                                <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <div className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">
                                        Other Recent Owners
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                                        {recentOwners.slice(1).map((owner) => (
                                            <Link
                                                key={owner}
                                                to={`/${owner}/dashboard`}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 hover:text-white hover:border-gray-600 hover:bg-gray-800 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                                            >
                                                <Github className="w-3.5 h-3.5 text-gray-500" />
                                                {owner}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/setup"
                                className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-[background-color,box-shadow,transform] duration-200 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                            >
                                Get Started
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}