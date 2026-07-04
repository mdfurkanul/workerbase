import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  Code2,
  FileText,
  Github,
  RefreshCw,
  Settings as SettingsIcon,
  Terminal,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/ThemeToggle";

/* ─── Top bar ──────────────────────────────────────────────────────── */
export function TopBar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const navItem = (to: string, label: string, icon: ReactNode) => {
    const active = location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[13px] font-medium transition ${
          active
            ? "bg-white/15 text-white"
            : "text-white/85 hover:text-white hover:bg-white/10"
        }`}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  const roleLabel =
    user?.role === "admin" ? "Admin" : user?.role === "editor" ? "Editor" : "Viewer";

  return (
    <header className="bg-brand text-white">
      <div className="px-4 h-11 flex items-center justify-between gap-4">
        {/* Left — brand + nav */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <CloudflareMark />
            <span>Workerbase</span>
            <span className="ml-1 text-[10px] font-mono uppercase tracking-widest bg-white/20 px-1.5 py-0.5 rounded">
              beta
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {navItem("/api-preview", "API", <Code2 size={14} />)}
            {navItem("/logs", "Logs", <Terminal size={14} />)}
            {navItem("/sql", "SQL", <FileText size={14} />)}
            {navItem("/settings", "Settings", <SettingsIcon size={14} />)}
          </nav>
        </div>

        {/* Right — refresh, github, theme, user */}
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded hover:bg-white/15 transition"
            title="Refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} />
          </button>
          <a
            href="https://github.com/mdfurkanul/workerbase"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-white/15 transition"
            title="GitHub repository"
          >
            <Github size={14} />
          </a>
          <ThemeToggle inverted />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/15 transition text-[13px]"
            >
              <span className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center">
                <User size={13} />
              </span>
              <span className="hidden sm:inline max-w-[180px] truncate">{user?.email}</span>
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-52 bg-surface border border-line-strong rounded-md shadow-2xl z-40 py-1 text-ink">
                  <div className="px-3 py-2 hairline-b">
                    <div className="text-[12px] text-ink-muted">Signed in as</div>
                    <div className="text-[13px] truncate">{user?.email}</div>
                    <div className="label-mono mt-1">
                      {roleLabel}
                    </div>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-[13px] hover:bg-surface-2"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-2 border-t border-line"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function CloudflareMark() {
  return (
    <svg viewBox="0 0 308 308" className="w-5 h-5" aria-hidden>
      <path
        fill="currentColor"
        d="M231.06 196.18c2.73-9.86 1.7-18.86-2.7-25.6-3.97-6.06-10.6-9.55-18.78-10.05l-152.7-1.97a3.7 3.7 0 0 1-2.92-1.48 4.16 4.16 0 0 1-.5-3.4c.7-3.18 4.4-5.46 8.16-5.46l154.2-1.97c18.27-.84 38.06-15.66 44.97-33.66l8.78-22.86a5.32 5.32 0 0 0 .25-3.05c-9.86-44.74-49.46-78.18-97.05-78.18-43.86 0-81.16 28.4-94.4 67.92-8.6-6.46-21.78-8.34-34.46-6.6-11.7 1.6-21.27 8.96-25.34 19.96 13.43 4.04 23.74 13.66 27.5 26.94-2.07 1.46-3.86 3.2-5.34 5.18C20.9 132.6 19.74 156 28.32 178.06c1.1 2.78 2.32 5.46 3.7 8.06a51.7 51.7 0 0 1 31.4-13.34h140.32c8.92 0 16.46 7.18 16.46 16.1l-.04 7.3z"
      />
    </svg>
  );
}
