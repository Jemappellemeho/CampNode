// =============================================================
// FILE LOCATION: client/src/pages/CourseManager.tsx
// REPLACE existing file entirely
// Header handled by Layout.tsx — no header here
// AI nodes = red border (matches playground)
// =============================================================

import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  ArrowLeft, Users, BookOpen, TrendingUp, AlertTriangle,
  Copy, Check, Globe, Lock, Sparkles, Clock,
  CheckCircle, Circle, Flag,
} from "lucide-react";
import { MOCK_COURSES, MOCK_STUDENTS_COURSE_1, MOCK_NODES_COURSE_1, type TopicNode } from "../data/mockProfData";

const CN = {
  blue: "#1E6FFF",
  blueDark: "#1557CC",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: "var(--cn-border)" }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, background: CN.yellow }} />
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <Check size={14} style={{ color: CN.green }} /> : <Copy size={14} style={{ color: "var(--cn-muted)" }} />}
    </button>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-4 py-2.5 text-sm font-bold rounded-xl transition-all"
      style={{ background: active ? CN.blue : "transparent", color: active ? "white" : "var(--cn-muted)" }}>
      {label}
    </button>
  );
}

export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "students" | "nodes">("overview");

  const course = MOCK_COURSES.find((c) => c.id === courseId);

  if (!course) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center">
        <p className="mb-4" style={{ color: "var(--cn-muted)" }}>Course not found</p>
        <button onClick={() => navigate("/prof/dashboard")} className="text-sm underline" style={{ color: CN.blue }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  const students = MOCK_STUDENTS_COURSE_1;
  const nodes = MOCK_NODES_COURSE_1;
  const confused = students.filter((s) => s.confusionFlags > 0);
  const totalFlags = students.reduce((sum, s) => sum + s.confusionFlags, 0);

  const renderTab = () => {
    switch (tab) {

      case "overview":
        return (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Students", value: course.studentCount, icon: Users },
                { label: "Nodes", value: course.nodeCount, icon: BookOpen },
                { label: "Avg. Completion", value: `${course.avgCompletion}%`, icon: TrendingUp },
                { label: "Confusion Flags", value: totalFlags, icon: AlertTriangle },
              ].map(({ label, value, icon: Icon }) => {
                const isFlag = label === "Confusion Flags";
                const accent = isFlag && totalFlags > 0 ? CN.red : CN.blue;
                return (
                  <div key={label} className="rounded-2xl border p-4 flex items-center gap-3 shadow-sm"
                    style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: accent + "18", color: accent }}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: "var(--cn-muted)" }}>{label}</p>
                      <p className="text-lg font-bold" style={{ color: "var(--cn-text)" }}>{value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {confused.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: CN.red + "0D", border: `1px solid ${CN.red}44` }}>
                <p className="text-sm font-bold flex items-center gap-2 mb-3" style={{ color: CN.red }}>
                  <AlertTriangle size={15} /> Students who clicked "I'm lost"
                </p>
                <div className="flex flex-col gap-2">
                  {confused.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: "var(--cn-card)" }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--cn-text)" }}>{s.name}</p>
                        <p className="text-xs" style={{ color: "var(--cn-muted)" }}>{s.email}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                        style={{ background: CN.red + "18", color: CN.red }}>
                        <Flag size={11} /> {s.confusionFlags} flag{s.confusionFlags > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl p-5" style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>
              <p className="text-sm font-bold mb-3" style={{ color: "var(--cn-text)" }}>Course Info</p>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "var(--cn-muted)" }}>Join Code</span>
                  <div className="flex items-center gap-2 font-mono text-sm font-bold" style={{ color: "var(--cn-text)" }}>
                    {course.joinCode}<CopyBtn text={course.joinCode} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "var(--cn-muted)" }}>Visibility</span>
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                    style={course.isPublic
                      ? { background: CN.green + "18", color: CN.green }
                      : { background: "var(--cn-bg)", color: "var(--cn-muted)", border: "1px solid var(--cn-border)" }}>
                    {course.isPublic ? <Globe size={11} /> : <Lock size={11} />}
                    {course.isPublic ? "Public" : "Private"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "var(--cn-muted)" }}>Created</span>
                  <span className="text-sm" style={{ color: "var(--cn-text)" }}>
                    {new Date(course.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case "students":
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "var(--cn-muted)" }}>{students.length} enrolled students</p>
            {students.map((s) => {
              const pct = Math.round((s.completedNodes / s.totalNodes) * 100);
              return (
                <div key={s.id} className="rounded-2xl border p-4 shadow-sm"
                  style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: CN.blue + "18", color: CN.blue }}>
                        {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--cn-text)" }}>{s.name}</p>
                        <p className="text-xs" style={{ color: "var(--cn-muted)" }}>{s.email}</p>
                      </div>
                    </div>
                    {s.confusionFlags > 0 && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
                        style={{ background: CN.red + "18", color: CN.red }}>
                        <Flag size={11} /> {s.confusionFlags}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex justify-between text-xs" style={{ color: "var(--cn-muted)" }}>
                      <span>{s.completedNodes}/{s.totalNodes} nodes</span>
                      <span className="font-bold" style={{ color: "var(--cn-text)" }}>{pct}%</span>
                    </div>
                    <ProgressBar value={pct} />
                  </div>
                  <p className="text-xs flex items-center gap-1" style={{ color: "var(--cn-muted)" }}>
                    <Clock size={11} /> Last active {s.lastActive}
                  </p>
                </div>
              );
            })}
          </div>
        );

      case "nodes":
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "var(--cn-muted)" }}>{nodes.length} topics in this course</p>
            {nodes.map((node: TopicNode) => {
              const prereqTitles = node.prerequisiteIds.map((id) => nodes.find((n) => n.id === id)?.title).filter(Boolean);
              return (
                <div key={node.id} className="rounded-2xl border p-4 shadow-sm"
                  style={{
                    background: "var(--cn-card)",
                    borderColor: "var(--cn-border)",
                    // Blue = prof-added, Red = AI suggested (matches playground!)
                    borderLeft: `4px solid ${node.isAISuggested ? CN.red : CN.blue}`,
                  }}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--cn-text)" }}>
                      {node.isAISuggested && <Sparkles size={13} style={{ color: CN.red }} />}
                      {node.title}
                    </p>
                    {node.isAISuggested && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                        style={{ background: CN.red + "18", color: CN.red }}>AI</span>
                    )}
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--cn-muted)" }}>{node.description}</p>
                  {prereqTitles.length > 0
                    ? <p className="text-xs flex items-center gap-1" style={{ color: CN.blue }}>
                        <CheckCircle size={11} /> Requires: {prereqTitles.join(", ")}
                      </p>
                    : <p className="text-xs flex items-center gap-1" style={{ color: "var(--cn-muted)" }}>
                        <Circle size={11} /> Starting node — no prerequisites
                      </p>}
                </div>
              );
            })}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

      <button onClick={() => navigate("/prof/dashboard")}
        className="flex items-center gap-1.5 text-sm font-medium mb-6"
        style={{ color: "var(--cn-muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = CN.blue)}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cn-muted)")}>
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--cn-text)" }}>{course.title}</h1>
        {course.description && <p className="text-sm" style={{ color: "var(--cn-muted)" }}>{course.description}</p>}
      </div>

      <div className="flex gap-1 mb-6 rounded-2xl p-1.5"
        style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>
        <TabBtn label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabBtn label={`Students (${students.length})`} active={tab === "students"} onClick={() => setTab("students")} />
        <TabBtn label={`Nodes (${nodes.length})`} active={tab === "nodes"} onClick={() => setTab("nodes")} />
      </div>

      {renderTab()}
    </div>
  );
}