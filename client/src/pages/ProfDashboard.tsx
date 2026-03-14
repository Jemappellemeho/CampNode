// =============================================================
// FILE LOCATION: client/src/pages/ProfDashboard.tsx
// REPLACE existing file entirely
// Header is now handled by Layout.tsx — this page has NO header
// =============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Users, TrendingUp, Plus, Lock,
  Globe, Copy, Check, AlertTriangle, ChevronRight,
} from "lucide-react";
import { MOCK_COURSES, MOCK_PROFESSOR, type Course } from "../data/mockProfData";

const CN = {
  blue: "#1E6FFF",
  blueDark: "#1557CC",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

function StatCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string | number; accent: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
      style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: accent + "18", color: accent }}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--cn-muted)" }}>{label}</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: "var(--cn-text)" }}>{value}</p>
      </div>
    </div>
  );
}

function JoinCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} title="Click to copy"
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-mono transition-colors cursor-pointer"
      style={{ background: "var(--cn-bg)", color: "var(--cn-text)", border: "1px solid var(--cn-border)" }}>
      <span>{code}</span>
      {copied ? <Check size={13} style={{ color: CN.green }} /> : <Copy size={13} style={{ color: "var(--cn-muted)" }} />}
    </button>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: "var(--cn-border)" }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, background: CN.yellow }} />
    </div>
  );
}

function CourseCard({ course, onManage }: { course: Course; onManage: (id: string) => void }) {
  return (
    <div className="rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-4"
      style={{ background: "var(--cn-card)", border: `2px solid ${course.isPublic ? CN.green : CN.blue}` }}>

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold leading-snug" style={{ color: "var(--cn-text)" }}>
          {course.title}
        </h3>
        <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
          style={course.isPublic
            ? { background: CN.green + "18", color: CN.green }
            : { background: "var(--cn-bg)", color: "var(--cn-muted)", border: "1px solid var(--cn-border)" }}>
          {course.isPublic ? <Globe size={11} /> : <Lock size={11} />}
          {course.isPublic ? "Public" : "Private"}
        </span>
      </div>

      <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "var(--cn-muted)" }}>
        {course.description}
      </p>

      <div className="flex items-center gap-4 text-sm" style={{ color: "var(--cn-muted)" }}>
        <span className="flex items-center gap-1.5"><Users size={14} />{course.studentCount} students</span>
        <span className="flex items-center gap-1.5"><BookOpen size={14} />{course.nodeCount} nodes</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs" style={{ color: "var(--cn-muted)" }}>
          <span>Avg. completion</span>
          <span className="font-semibold" style={{ color: "var(--cn-text)" }}>{course.avgCompletion}%</span>
        </div>
        <ProgressBar value={course.avgCompletion} />
      </div>

      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--cn-border)" }}>
        <JoinCodeBadge code={course.joinCode} />
        <button onClick={() => onManage(course.id)}
          className="flex items-center gap-1 text-sm font-bold transition-colors"
          style={{ color: CN.blue }}
          onMouseEnter={(e) => (e.currentTarget.style.color = CN.blueDark)}
          onMouseLeave={(e) => (e.currentTarget.style.color = CN.blue)}>
          Manage <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default function ProfDashboard() {
  const navigate = useNavigate();

  const totalStudents = MOCK_COURSES.reduce((sum, c) => sum + c.studentCount, 0);
  const avgCompletion = Math.round(
    MOCK_COURSES.reduce((sum, c) => sum + c.avgCompletion, 0) / MOCK_COURSES.length
  );
  const totalFlags = 4;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: "var(--cn-muted)" }}>Welcome back 👋</p>
          <h1 className="text-2xl font-bold" style={{ color: "var(--cn-text)" }}>{MOCK_PROFESSOR.name}</h1>
        </div>
        <button onClick={() => navigate("/prof/create-course")}
          className="flex items-center gap-2 font-bold text-xs sm:text-sm px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-md active:scale-95 transition-all text-white flex-shrink-0"
          style={{ background: CN.blue }}>
          <Plus size={15} />
          <span className="hidden sm:inline">New Course</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={BookOpen} label="Total Courses" value={MOCK_COURSES.length} accent={CN.blue} />
        <StatCard icon={Users} label="Total Students" value={totalStudents} accent={CN.blue} />
        <StatCard icon={TrendingUp} label="Avg. Completion" value={`${avgCompletion}%`} accent={CN.blue} />
      </div>

      {totalFlags > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-8"
          style={{ background: CN.red + "10", border: `1px solid ${CN.red}44` }}>
          <AlertTriangle size={18} style={{ color: CN.red, flexShrink: 0 }} />
          <p className="text-sm" style={{ color: "var(--cn-text)" }}>
            <span className="font-bold">{totalFlags} confusion flags</span> from students.{" "}
            <button className="underline font-semibold" style={{ color: CN.blue }}>Review →</button>
          </p>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--cn-text)" }}>Your Courses</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_COURSES.map((course) => (
            <CourseCard key={course.id} course={course} onManage={(id) => navigate(`/prof/course/${id}`)} />
          ))}
        </div>
      </div>

    </div>
  );
}