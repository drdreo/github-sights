import { Github } from "lucide-react";

export function LandingFooter() {
    return (
        <footer className="max-w-6xl mx-auto px-6 pb-10">
            <div className="border-t border-gray-800/60 pt-6 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Github className="w-4 h-4" />
                    GitHub Sights
                </div>
                <div className="flex gap-6 text-sm text-gray-500">
                    <a
                        href="https://github.com/drdreo/github-sights"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-gray-300 transition-colors duration-150 focus-visible:outline-none focus-visible:text-gray-300"
                    >
                        Source
                    </a>
                </div>
            </div>
        </footer>
    );
}
