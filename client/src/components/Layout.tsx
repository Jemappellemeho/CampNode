// =============================================================
// FILE LOCATION: client/src/components/Layout.tsx
// REPLACE existing file entirely
//
// WHAT THIS DOES:
// Shared header for ALL pages. Every page wrapped in <Layout>
// gets the same fixed header automatically.
//
// HEADER CONTAINS:
// - Left: CampNode logo (full on md+, small on phones)
// - Right: avatar circle → dropdown menu with 4 items
//
// DROPDOWN ITEMS:
// - My Profile → /profile
// - My Courses → /prof/dashboard
// - Dark/Light toggle
// - Log Out → /login
//
// HOW THE DROPDOWN WORKS:
// isOpen state = true/false
// Clicking avatar toggles it
// Clicking anywhere OUTSIDE closes it (useEffect + mousedown listener)
// =============================================================

import { type ReactNode, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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

// Mock user — later comes from your auth context/API
const MOCK_USER = {
  name: "Dr. Elena Vasquez",
  role: "Professor",
  initials: "EV",
};

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside of it
  // WHY useEffect: we need to attach/detach the listener to the whole document
  // The cleanup function (return) removes it when component unmounts
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown when navigating to a new page
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleLogOut = () => {
    // Later: clear JWT token, clear auth context
    navigate("/login");
  };

  return (
    <>
      {/* CSS variables — defined once here, available to ALL pages */}
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

      <div
        className="min-h-screen transition-colors duration-200"
        style={{ background: "var(--cn-page)" }}
      >
        {/* ======================================================
            FIXED HEADER — same on every single page
        ====================================================== */}
        <header
          className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b px-3 sm:px-6 py-2 sm:py-3"
          style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}
        >
          <div className="max-w-7xl mx-auto flex justify-between items-center">

            {/* LEFT: Logo — clickable, goes to dashboard */}
            {/* full logo on md+ (tablet/desktop), small logo on phones */}
            <button
              onClick={() => navigate("/prof/dashboard")}
              className="flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <img
                src={logoFull}
                className="hidden md:block h-10 lg:h-12 object-contain"
                alt="CampNode"
              />
              <img
                src={logoSmall}
                className="block md:hidden h-8 object-contain"
                alt="CampNode"
              />
            </button>

            {/* RIGHT: Avatar + dropdown */}
            <div className="relative" ref={dropdownRef}>

              {/* Avatar button — shows initials, clicking opens dropdown */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-xl transition-all"
                style={{
                  background: isOpen ? CN.blue + "18" : "var(--cn-bg)",
                  border: `1px solid ${isOpen ? CN.blue + "44" : "var(--cn-border)"}`,
                }}
              >
                {/* Initials circle */}
                <div
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: CN.blue, color: "white" }}
                >
                  {MOCK_USER.initials}
                </div>

                {/* Name — hidden on phones */}
                <span
                  className="hidden sm:block text-sm font-semibold"
                  style={{ color: "var(--cn-text)" }}
                >
                  {MOCK_USER.name.split(" ")[0]}{" "}
                  {MOCK_USER.name.split(" ")[1]}
                </span>

                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--cn-muted)" }}
                />
              </button>

              {/* DROPDOWN PANEL */}
              {/* position: absolute right-0 = aligned to right edge of avatar button */}
              {isOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-lg overflow-hidden z-50"
                  style={{
                    background: "var(--cn-card)",
                    border: "1px solid var(--cn-border)",
                  }}
                >
                  {/* User info at top of dropdown */}
                  <div
                    className="px-4 py-3 border-b"
                    style={{ borderColor: "var(--cn-border)" }}
                  >
                    <p
                      className="text-sm font-bold"
                      style={{ color: "var(--cn-text)" }}
                    >
                      {MOCK_USER.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--cn-muted)" }}>
                      {MOCK_USER.role}
                    </p>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">

                    {/* My Profile */}
                    <button
                      onClick={() => navigate("/profile")}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors"
                      style={{ color: "var(--cn-text)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cn-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <User size={15} style={{ color: CN.blue }} />
                      My Profile
                    </button>

                    {/* My Courses */}
                    <button
                      onClick={() => navigate("/prof/dashboard")}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors"
                      style={{ color: "var(--cn-text)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cn-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <BookOpen size={15} style={{ color: CN.blue }} />
                      My Courses
                    </button>

                    {/* Dark / Light Mode Toggle */}
                    <button
                      onClick={toggleTheme}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors"
                      style={{ color: "var(--cn-text)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cn-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="text-base leading-none">
                        {theme === "light" ? "🌙" : "☀️"}
                      </span>
                      {theme === "light" ? "Dark Mode" : "Light Mode"}
                    </button>

                    {/* Divider */}
                    <div
                      className="my-1 border-t"
                      style={{ borderColor: "var(--cn-border)" }}
                    />

                    {/* Log Out — red because it's a destructive action */}
                    <button
                      onClick={handleLogOut}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors"
                      style={{ color: CN.red }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = CN.red + "0D")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <LogOut size={15} />
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        {/* pt-16/20 = pushes content below the fixed header */}
        <div className="pt-16 sm:pt-20">
          {children}
        </div>
      </div>
    </>
  );
}

export default Layout;