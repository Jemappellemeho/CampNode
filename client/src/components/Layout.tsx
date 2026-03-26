import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useTheme } from "../ThemeContext";
import logoFull from "../assets/logo_full.png";
import logoSmall from "../assets/logo_small.png";
import { User, BookOpen, LogOut, ChevronDown } from "lucide-react";

const CN = {
  blue: "#1E6FFF",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
  navyDeep: "#0F1628",
};

export default function Layout({ children }: { children?: any }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  
  // FIX 1: Initialize directly from localStorage to prevent "Guest" flicker
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  // FIX 2: Logic for the display name
  // Uses user.name, or the prefix of their email, or "Guest" as a last resort
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : "Guest");
  const userInitials = userName.substring(0, 2).toUpperCase();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleLogOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null); // Clear state immediately
    navigate("/login");
  };

  return (
    <>
      <style>{`
        :root {
          --cn-bg: #FFFFFF;
          --cn-card: #FFFFFF;
          --cn-page: #F4F6FB;
          --cn-text: #111827;
          --cn-muted: #6B7280;
          --cn-border: #E5E7EB;
        }
        .dark {
          --cn-bg: ${CN.navyDeep};
          --cn-card: #161f3d;
          --cn-page: ${CN.navyDeep};
          --cn-text: #F0F4FF;
          --cn-muted: #8B9CC8;
          --cn-border: #2a3558;
        }
      `}</style>

      <div className="min-h-screen transition-colors duration-200" style={{ background: "var(--cn-page)" }}>
        <header
          className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b px-3 sm:px-6 py-2 sm:py-3"
          style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}
        >
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <img src={logoFull} className="hidden md:block h-10 object-contain" alt="Logo" />
              <img src={logoSmall} className="block md:hidden h-8 object-contain" alt="Logo" />
            </button>

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-xl transition-all"
                style={{
                  background: isOpen ? CN.blue + "18" : "var(--cn-bg)",
                  border: `1px solid ${isOpen ? CN.blue + "44" : "var(--cn-border)"}`,
                }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: CN.blue }}>
                  {userInitials}
                </div>
                <span className="hidden sm:block text-sm font-semibold" style={{ color: "var(--cn-text)" }}>
                  {userName}
                </span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-lg overflow-hidden z-50"
                  style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: "var(--cn-border)" }}>
                    <p className="text-sm font-bold" style={{ color: "var(--cn-text)" }}>{userName}</p>
                    <p className="text-xs" style={{ color: "var(--cn-muted)" }}>{user?.role || "User"}</p>
                  </div>

                  <div className="py-1">
                    <button onClick={() => navigate("/profile")} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left" style={{ color: "var(--cn-text)" }}>
                      <User size={15} style={{ color: CN.blue }} /> My Profile
                    </button>
                    <button onClick={() => navigate("/dashboard")} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left" style={{ color: "var(--cn-text)" }}>
                      <BookOpen size={15} style={{ color: CN.blue }} /> My Courses
                    </button>
                    <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left" style={{ color: "var(--cn-text)" }}>
                      {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
                    </button>
                    <div className="my-1 border-t" style={{ borderColor: "var(--cn-border)" }} />
                    <button onClick={handleLogOut} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left" style={{ color: CN.red }}>
                      <LogOut size={15} /> Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="pt-20 px-4 max-w-7xl mx-auto">
          {children ? children : <Outlet />}
        </main>
      </div>
    </>
  );
}