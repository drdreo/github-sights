import { Outlet, Link, useLocation } from 'react-router-dom';
import { Github, BarChart3, Settings } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 selection:bg-blue-500/30 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-30 backdrop-blur-xl bg-gray-900/80 supports-[backdrop-filter]:bg-gray-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo Area */}
            <div className="flex items-center gap-3 group cursor-default">
              <div className="p-2 bg-gray-100 rounded-lg shadow-sm group-hover:bg-gray-200 transition-colors">
                <Github className="h-5 w-5 text-gray-900" />
              </div>
              <span className="text-lg font-semibold tracking-tight text-gray-100">
                GitHub Sights
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              <Link
                to="/dashboard"
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${isActive('/dashboard') 
                    ? 'bg-gray-800 text-gray-100' 
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50'}
                `}
              >
                <BarChart3 className={`h-4 w-4 ${isActive('/dashboard') ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-400'}`} />
                Dashboard
              </Link>
              
              <Link
                to="/setup"
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${isActive('/setup') 
                    ? 'bg-gray-800 text-gray-100' 
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50'}
                `}
              >
                <Settings className={`h-4 w-4 ${isActive('/setup') ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-400'}`} />
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500 slide-in-from-bottom-2">
        <Outlet />
      </main>
    </div>
  );
}
