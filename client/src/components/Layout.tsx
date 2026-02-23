import { Outlet, Link, useLocation } from "react-router-dom";
import { Github, BarChart3, Settings, Users, FolderGit2 } from "lucide-react";
import { useOwner } from "../hooks/useOwner";

export default function Layout() {
    const location = useLocation();
    const owner = useOwner();
    const isActive = (path: string) => location.pathname === `/${owner}${path}`;

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-gray-100 selection:bg-blue-500/30 selection:text-white">
            <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-30 backdrop-blur-xl bg-gray-900/80 supports-[backdrop-filter]:bg-gray-900/60">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        {/* Logo Area */}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="p-2 bg-gray-100 rounded-lg shadow-sm group-hover:bg-gray-200 transition-colors">
                                <Github className="h-5 w-5 text-gray-900" />
                            </div>
                            <span className="text-lg font-semibold tracking-tight text-gray-100">
                                GitHub Sights
                            </span>
                        </Link>

                        {/* Navigation */}
                        <nav className="flex items-center gap-1">
                            <Link
                                to={`/${owner}/dashboard`}
                                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${
                      isActive("/dashboard")
                          ? "bg-gray-800 text-gray-100"
                          : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/50"
                  }
                `}
                            >
                                <BarChart3
                                    className={`h-4 w-4 ${isActive("/dashboard") ? "text-blue-400" : "text-gray-500 group-hover:text-gray-400"}`}
                                />
                                Dashboard
                            </Link>

                            <Link
                                to={`/${owner}/contributors`}
                                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${
                      isActive("/contributors")
                          ? "bg-gray-800 text-gray-100"
                          : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/50"
                  }
                `}
                            >
                                <Users
                                    className={`h-4 w-4 ${isActive("/contributors") ? "text-blue-400" : "text-gray-500"}`}
                                />
                                Contributors
                            </Link>

                            <Link
                                to={`/${owner}/repositories`}
                                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${
                      isActive("/repositories")
                          ? "bg-gray-800 text-gray-100"
                          : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/50"
                  }
                `}
                            >
                                <FolderGit2
                                    className={`h-4 w-4 ${isActive("/repositories") ? "text-blue-400" : "text-gray-500"}`}
                                />
                                Repositories
                            </Link>

                            <Link
                                to="/setup"
                                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                  text-gray-400 hover:text-gray-100 hover:bg-gray-800/50
                `}
                            >
                                <Settings className="h-4 w-4 text-gray-500" />
                                Settings
                            </Link>
                        </nav>
                    </div>
                </div>
            </header>

            <main className="animate-in fade-in duration-500 slide-in-from-bottom-2">
                <Outlet />
            </main>
        </div>
    );
}
