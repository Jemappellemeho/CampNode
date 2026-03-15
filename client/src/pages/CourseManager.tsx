// =============================================================
// FILE LOCATION: client/src/pages/CourseManager.tsx
// REPLACE existing file entirely
// Header handled by Layout.tsx — no header here
// AI nodes = red border (matches playground)
// =============================================================

import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import {
  ArrowLeft, Users, BookOpen, TrendingUp, AlertTriangle,
  Copy, Check, Globe, Lock, Sparkles, Clock,
  CheckCircle, Circle, Flag,
} from "lucide-react";

// Color constants for consistent styling
const CN = {
  blue: "#1E6FFF",
  blueDark: "#1557CC",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

// --- Helper Components ---

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

// --- Main Component ---

export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "students" | "nodes">("overview");
  
  // State for the actual course data from the backend
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch course details by ID
  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`http://localhost:3000/api/courses/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCourse(res.data);
      } catch (err) {
        console.error("Failed to fetch course", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourse();
  }, [courseId]);

  if (loading) return <div className="text-center py-32 text-gray-500">Loading course details...</div>;

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

  // Data mapping from database structure
  const students = course.students || []; 
  const nodes = course.topics || [];
  
  // Example metrics calculations based on real data
  const totalStudents = students.length;
  const totalNodes = nodes.length;

  const renderTab = () => {
    switch (tab) {
      case "overview":
        return (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Students", value: totalStudents, icon: Users },
                { label: "Nodes", value: totalNodes, icon: BookOpen },
                { label: "Visibility", value: course.isPublic ? "Public" : "Private", icon: Globe },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border p-4 flex items-center gap-3 shadow-sm"
                  style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: CN.blue + "18", color: CN.blue }}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--cn-muted)" }}>{label}</p>
                    <p className="text-lg font-bold" style={{ color: "var(--cn-text)" }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-5" style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>
              <p className="text-sm font-bold mb-3" style={{ color: "var(--cn-text)" }}>Course Info</p>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "var(--cn-muted)" }}>Join Code</span>
                  <div className="flex items-center gap-2 font-mono text-sm font-bold" style={{ color: "var(--cn-text)" }}>
                    {course.joinCode}<CopyBtn text={course.joinCode} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "students":
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "var(--cn-muted)" }}>{students.length} enrolled students</p>
            {students.map((s: any) => (
              <div key={s.id} className="rounded-2xl border p-4 shadow-sm" style={{ background: "var(--cn-card)" }}>
                <p className="font-bold">{s.email}</p>
              </div>
            ))}
          </div>
        );

      case "nodes":
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "var(--cn-muted)" }}>{nodes.length} topics in this course</p>
            {nodes.map((node: any) => (
              <div key={node.id} className="rounded-2xl border p-4 shadow-sm" style={{ background: "var(--cn-card)" }}>
                <p className="font-bold">{node.name}</p>
                <p className="text-xs text-gray-500">{node.description || "No description"}</p>
              </div>
            ))}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => navigate("/prof/dashboard")} className="flex items-center gap-1.5 text-sm font-medium mb-6 text-gray-500 hover:text-blue-600">
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="text-sm text-gray-500">{course.description}</p>
      </div>

      <div className="flex gap-1 mb-6 rounded-2xl p-1.5 bg-gray-50 border">
        <TabBtn label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabBtn label={`Students (${students.length})`} active={tab === "students"} onClick={() => setTab("students")} />
        <TabBtn label={`Nodes (${nodes.length})`} active={tab === "nodes"} onClick={() => setTab("nodes")} />
      </div>

      {renderTab()}
    </div>
  );
}