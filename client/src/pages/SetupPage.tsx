import React, { useState } from "react";
import { useSetConfig } from "../hooks/useGitHub";
import { useAuth, useMyOrgs } from "../hooks/useAuth";
import { API_BASE } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Building2, User, ArrowRight, Loader2, Github, Calendar, Pencil } from "lucide-react";
import { addRecentOwner } from "./LandingPage";
import { subYears, format } from "date-fns";

function SignInStep() {
    const handleSignIn = () => {
        window.location.href = `${API_BASE}/auth/github`;
    };

    return (
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
    );
}

interface AccountOption {
    login: string;
    avatar_url: string;
    type: "user" | "org";
}

function AccountPicker({
    selected,
    onSelect,
    onCustom,
}: {
    selected: { owner: string; ownerType: "user" | "org" } | null;
    onSelect: (owner: string, ownerType: "user" | "org") => void;
    onCustom: () => void;
}) {
    const { user, isAuthenticated } = useAuth();
    const { orgs, isLoading: orgsLoading } = useMyOrgs(isAuthenticated);

    const accounts: AccountOption[] = [];
    if (user) {
        accounts.push({ login: user.login, avatar_url: user.avatar_url, type: "user" });
    }
    for (const org of orgs) {
        accounts.push({ login: org.login, avatar_url: org.avatar_url, type: "org" });
    }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
                Choose an account to sync
            </label>
            <div className="space-y-1.5">
                {accounts.map((account) => {
                    const isSelected = selected?.owner === account.login && selected?.ownerType === account.type;
                    return (
                        <button
                            key={`${account.type}:${account.login}`}
                            type="button"
                            onClick={() => onSelect(account.login, account.type)}
                            className={`
                                w-full flex items-center gap-3 p-3 rounded-xl border transition-colors duration-200
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
                                ${isSelected
                                    ? "bg-blue-600/10 border-blue-500/50 ring-1 ring-blue-500/30"
                                    : "bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-800/80"
                                }
                            `}
                        >
                            <img
                                src={account.avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full ring-1 ring-gray-700 bg-gray-700"
                            />
                            <div className="text-left min-w-0">
                                <p className={`text-sm font-medium truncate ${isSelected ? "text-blue-300" : "text-gray-100"}`}>
                                    {account.login}
                                </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 flex items-center gap-1">
                                    {account.type === "user" ? (
                                        <><User className="w-3 h-3" /> User</>
                                    ) : (
                                        <><Building2 className="w-3 h-3" /> Org</>
                                    )}
                                </span>
                                {isSelected && (
                                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                )}
                            </div>
                        </button>
                    );
                })}

                {orgsLoading && (
                    <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading organizations...
                    </div>
                )}

                <button
                    type="button"
                    onClick={onCustom}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
                >
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                        <Pencil className="w-4 h-4" />
                    </div>
                    <span className="text-sm">Enter a different name...</span>
                </button>
            </div>
        </div>
    );
}

function CustomOwnerInput({
    owner,
    ownerType,
    onOwnerChange,
    onOwnerTypeChange,
    onBack,
}: {
    owner: string;
    ownerType: "user" | "org";
    onOwnerChange: (v: string) => void;
    onOwnerTypeChange: (v: "user" | "org") => void;
    onBack: () => void;
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-sm text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 -ml-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                >
                    &larr; Back
                </button>
                <span className="text-sm text-gray-500">Enter any GitHub user or organization</span>
            </div>

            {/* Owner Name */}
            <div className="space-y-2 group">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 group-focus-within:text-blue-400 transition-colors">
                    Owner Name
                </label>
                <input
                    type="text"
                    value={owner}
                    onChange={(e) => onOwnerChange(e.target.value)}
                    placeholder="e.g. vercel"
                    autoFocus
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder:text-gray-500 focus:bg-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all duration-200"
                />
            </div>

            {/* Account Type */}
            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                    Account Type
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-800 rounded-xl border border-gray-700">
                    {([
                        { type: "user" as const, label: "User", icon: User },
                        { type: "org" as const, label: "Organization", icon: Building2 },
                    ]).map(({ type, label, icon: Icon }) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => onOwnerTypeChange(type)}
                            className={`
                                flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200
                                ${ownerType === type
                                    ? "bg-gray-700 text-gray-100 shadow-sm ring-1 ring-gray-600"
                                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                                }
                            `}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ConfigureStep() {
    const { user } = useAuth();
    const setConfig = useSetConfig();
    const navigate = useNavigate();

    const [owner, setOwner] = useState("");
    const [ownerType, setOwnerType] = useState<"user" | "org">("user");
    const [customMode, setCustomMode] = useState(false);
    const [syncSince, setSyncSince] = useState(() => format(subYears(new Date(), 1), "yyyy-MM-dd"));
    const [error, setError] = useState<string | null>(null);

    const selected = owner ? { owner, ownerType } : null;

    const handleAccountSelect = (login: string, type: "user" | "org") => {
        setOwner(login);
        setOwnerType(type);
        setCustomMode(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!owner.trim()) {
            setError("Please select an account or enter a name");
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
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Authenticated user info */}
            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700">
                <img
                    src={user!.avatar_url}
                    alt={user!.login}
                    className="w-9 h-9 rounded-full ring-2 ring-gray-700 bg-gray-700"
                />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">
                        {user!.login}
                    </p>
                    <p className="text-xs text-gray-400">Connected via GitHub</p>
                </div>
                <div className="ml-auto w-2 h-2 bg-green-500 rounded-full shrink-0" />
            </div>

            {customMode ? (
                <CustomOwnerInput
                    owner={owner}
                    ownerType={ownerType}
                    onOwnerChange={setOwner}
                    onOwnerTypeChange={setOwnerType}
                    onBack={() => setCustomMode(false)}
                />
            ) : (
                <AccountPicker
                    selected={selected}
                    onSelect={handleAccountSelect}
                    onCustom={() => {
                        setOwner("");
                        setOwnerType("user");
                        setCustomMode(true);
                    }}
                />
            )}

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

            {error && (
                <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={setConfig.isPending || !owner.trim()}
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
    );
}

function CardContent() {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <SignInStep />;
    }

    return <ConfigureStep />;
}

export default function SetupPage() {
    const { isAuthenticated } = useAuth();

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
                <div className="h-1 bg-gray-800 w-full flex">
                    <div
                        className={`h-full bg-blue-600 rounded-r-full transition-all duration-500 ${isAuthenticated ? "w-full" : "w-1/2"}`}
                    />
                </div>

                <div className="p-8 space-y-6">
                    <CardContent />
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
