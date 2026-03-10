import React, { useState, useEffect } from "react";
import { useSetConfig } from "../hooks/useGitHub";
import { useAuth } from "../hooks/useAuth";
import { API_BASE } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Building2, User, ArrowRight, Loader2, Github, Calendar } from "lucide-react";
import { addRecentOwner } from "./LandingPage";
import { subYears, format } from "date-fns";

export default function SetupPage() {
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();

    const [owner, setOwner] = useState("");
    const [ownerType, setOwnerType] = useState<"user" | "org">("org");
    const [syncSince, setSyncSince] = useState(() => format(subYears(new Date(), 1), "yyyy-MM-dd"));
    const [error, setError] = useState<string | null>(null);

    const setConfig = useSetConfig();
    const navigate = useNavigate();

    // Pre-fill owner with GitHub login once authenticated
    useEffect(() => {
        if (user && !owner) {
            setOwner(user.login);
        }
    }, [user]);

    const handleSignIn = () => {
        window.location.href = `${API_BASE}/auth/github`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!owner.trim()) {
            setError("Please enter an owner name");
            return;
        }

        try {
            await setConfig.mutateAsync({ owner, ownerType, syncSince });
            addRecentOwner(owner);
            navigate(`/${owner}/dashboard?syncSince=${syncSince}`);
        } catch (err) {
            console.error("Setup failed:", err);
            setError("Failed to save configuration. Please try again.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 selection:text-white">
            {/* Header / Brand */}
            <div className="mb-8 text-center animate-in fade-in zoom-in duration-500">
                <div className="inline-flex items-center justify-center p-3 bg-gray-900 rounded-xl border border-gray-800 mb-4">
                    <Github className="w-8 h-8 text-gray-100" />
                </div>
                <h1 className="text-2xl font-semibold text-gray-100 tracking-tight">
                    Connect your GitHub
                </h1>
                <p className="mt-2 text-gray-400 text-sm max-w-sm mx-auto">
                    Sign in with GitHub to visualize repository insights and analytics.
                </p>
            </div>

            {/* Main Card */}
            <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-xl shadow-black/30 border border-gray-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
                {/* Progress Bar (Decorative) */}
                <div className="h-1 bg-gray-800 w-full flex">
                    <div
                        className={`h-full bg-blue-600 rounded-r-full transition-all duration-500 ${isAuthenticated ? "w-full" : "w-1/2"}`}
                    />
                </div>

                <div className="p-8 space-y-6">
                    {authLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : !isAuthenticated ? (
                        /* Step 1: Sign in */
                        <div className="space-y-4">
                            <div className="text-center space-y-2">
                                <p className="text-sm text-gray-400">
                                    Sign in with your GitHub account to get started.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleSignIn}
                                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-100 font-semibold rounded-xl transition-all duration-200 active:scale-[0.98]"
                            >
                                <Github className="w-5 h-5" />
                                Sign in with GitHub
                            </button>
                        </div>
                    ) : (
                        /* Step 2: Configure syncing */
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Authenticated user info */}
                            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700">
                                <img
                                    src={user!.avatar_url}
                                    alt={user!.login}
                                    className="w-9 h-9 rounded-full ring-2 ring-gray-700"
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-100 truncate">
                                        {user!.login}
                                    </p>
                                    <p className="text-xs text-gray-400">Connected via GitHub</p>
                                </div>
                                <div className="ml-auto w-2 h-2 bg-green-500 rounded-full shrink-0" />
                            </div>

                            {/* Owner Field */}
                            <div className="space-y-2 group">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 group-focus-within:text-blue-400 transition-colors">
                                    <User className="w-4 h-4" />
                                    Owner Name
                                </label>
                                <input
                                    type="text"
                                    value={owner}
                                    onChange={(e) => setOwner(e.target.value)}
                                    placeholder="vercel"
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder:text-gray-500 focus:bg-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all duration-200"
                                />
                            </div>

                            {/* Type Toggle */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">
                                    Account Type
                                </label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-800 rounded-xl border border-gray-700">
                                    <button
                                        type="button"
                                        onClick={() => setOwnerType("org")}
                                        className={`
                      flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200
                      ${
                          ownerType === "org"
                              ? "bg-gray-700 text-gray-100 shadow-sm ring-1 ring-gray-600"
                              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                      }
                    `}
                                    >
                                        <Building2 className="w-4 h-4" />
                                        Organization
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOwnerType("user")}
                                        className={`
                      flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200
                      ${
                          ownerType === "user"
                              ? "bg-gray-700 text-gray-100 shadow-sm ring-1 ring-gray-600"
                              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                      }
                    `}
                                    >
                                        <User className="w-4 h-4" />
                                        User
                                    </button>
                                </div>
                            </div>

                            {/* Initial Sync Range */}
                            <div className="space-y-2 group">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 group-focus-within:text-blue-400 transition-colors">
                                    <Calendar className="w-4 h-4" />
                                    Sync History Since
                                </label>
                                <input
                                    type="date"
                                    value={syncSince}
                                    onChange={(e) => setSyncSince(e.target.value)}
                                    max={format(new Date(), "yyyy-MM-dd")}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 focus:bg-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all duration-200"
                                />
                                <p className="text-xs text-gray-500">
                                    How far back to crawl commit and PR history. Older dates use
                                    more API budget.
                                </p>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                                    {error}
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={setConfig.isPending}
                                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
                            >
                                {setConfig.isPending ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        Start Syncing
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Footer Links */}
            <div className="mt-8 flex gap-6 text-sm text-gray-500">
                <a href="#" className="hover:text-gray-300 transition-colors">
                    Documentation
                </a>
                <a href="#" className="hover:text-gray-300 transition-colors">
                    Support
                </a>
                <a href="#" className="hover:text-gray-300 transition-colors">
                    Privacy
                </a>
            </div>
        </div>
    );
}
