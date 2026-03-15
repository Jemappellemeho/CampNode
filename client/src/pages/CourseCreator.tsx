// =============================================================
// FILE LOCATION: client/src/pages/CourseCreator.tsx
// REPLACE existing file entirely
// Header handled by Layout.tsx — no header here
// AI suggestions are RED (matches playground node colors)
// =============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, Plus, X,
  Sparkles, Globe, Lock, BookOpen, Info,
} from "lucide-react";

// Color constants for consistent styling
const CN = {
  blue: "#1E6FFF",
  blueDark: "#1557CC",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

interface TopicInput {
  id: string;
  title: string;
  wikidataId?: string;
  isAISuggested: boolean;
  accepted: boolean;
}

interface FormData {
  title: string;
  description: string;
  isPublic: boolean;
  topics: TopicInput[];
  prerequisites: Record<string, string[]>;
}

// Visual step indicator component
function StepIndicator({ currentStep }: { currentStep: number }) {
  const labels = ["Basic Info", "Topics", "Prerequisites", "Review"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {labels.map((label, i) => {
        const num = i + 1;
        const done = num < currentStep;
        const active = num === currentStep;
        return (
          <div key={num} className="flex items-center gap-2 flex-1">
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-300"
                style={{
                  background: done || active ? CN.blue : "var(--cn-border)",
                  color: done || active ? "white" : "var(--cn-muted)",
                  boxShadow: active ? `0 0 0 4px ${CN.blue}22` : "none",
                }}>
                {done ? <Check size={14} /> : num}
              </div>
              <span className="hidden sm:block text-xs font-medium whitespace-nowrap"
                style={{ color: active ? CN.blue : "var(--cn-muted)" }}>
                {label}
              </span>
            </div>
            {i < 3 && (
              <div className="h-0.5 flex-1 mb-4 rounded-full transition-all duration-300"
                style={{ background: done ? CN.blue : "var(--cn-border)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CourseCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  
  // State to hold all course data across steps
  const [formData, setFormData] = useState<FormData>({
    title: "", description: "", isPublic: false, topics: [], prerequisites: {},
  });

  const genId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Manual topic addition
  const addTopic = () => {
    if (!newTopic.trim()) return;
    setFormData({ ...formData, topics: [...formData.topics, { id: genId(), title: newTopic.trim(), isAISuggested: false, accepted: true }] });
    setNewTopic("");
  };

  const removeTopic = (id: string) => {
    setFormData({
      ...formData,
      topics: formData.topics.filter((t) => t.id !== id),
      prerequisites: Object.fromEntries(
        Object.entries(formData.prerequisites)
          .filter(([k]) => k !== id)
          .map(([k, v]) => [k, (v as string[]).filter((p) => p !== id)])
      ),
    });
  };

  // Fetch AI topic suggestions from API
  const fetchAI = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`http://localhost:3000/api/wiki/search?q=${formData.topics[0]?.title || 'programming'}`);
      const data = await res.json();
      const suggestions = data.map((d: any) => ({
        id: genId(),
        title: d.label,
        wikidataId: d.id,
        isAISuggested: true,
        accepted: false,
      }));
      setFormData({ ...formData, topics: [...formData.topics, ...suggestions] });
      setAiDone(true);
    } catch (e) { console.error(e); }
    setAiLoading(false);
  };

  const acceptSuggestion = (id: string) =>
    setFormData({ ...formData, topics: formData.topics.map((t) => t.id === id ? { ...t, accepted: true } : t) });

  const togglePrereq = (topicId: string, prereqId: string) => {
    const cur = formData.prerequisites[topicId] || [];
    setFormData({
      ...formData,
      prerequisites: {
        ...formData.prerequisites,
        [topicId]: cur.includes(prereqId) ? cur.filter((p) => p !== prereqId) : [...cur, prereqId],
      },
    });
  };

  // Final submission logic: Save course then save all related topics
  const handleCreateCourse = async () => {
    try {
      const token = localStorage.getItem("token");
      
      const courseRes = await fetch(
        "http://localhost:3000/api/courses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
          }),
        }
      );

      if (!courseRes.ok) throw new Error("Course creation failed");

      const responseData = await courseRes.json();
      const courseId = responseData.course.id;

      // ✅ берем topics из formData
      const topics = formData.topics.filter(t => t.accepted);
      
      // Step 2: Loop through accepted topics and create them
      // Убедитесь, что отправляете именно "name", как ожидает ваш topicController
      for (const topic of topics) {
        await fetch("http://localhost:3000/api/topics", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: topic.title,
            description: "",
            courseId: courseId,
          }),
        });
      }

      
      // Step 3: Success redirect
      navigate("/prof/dashboard");

    } catch (err) {
      console.error(err);
      alert("Error creating course");
    }
  };

  const accepted = formData.topics.filter((t) => t.accepted);
  const canNext = step === 1 ? formData.title.trim().length > 0 : step === 2 ? accepted.length >= 1 : true;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => navigate("/prof/dashboard")} className="flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors" style={{ color: "var(--cn-muted)" }}>
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--cn-text)" }}>Create New Course</h1>
      <StepIndicator currentStep={step} />

      {/* Main container for form steps */}
      <div className="rounded-2xl border p-6 shadow-sm mb-6" style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <input type="text" placeholder="Course Title" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-3 rounded-xl border outline-none" style={{ background: "var(--cn-bg)" }} />
            <textarea placeholder="Description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-3 rounded-xl border outline-none" style={{ background: "var(--cn-bg)" }} />
          </div>
        )}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Review your course: {formData.title}</h2>
            <div className="p-4 rounded-xl border" style={{ background: CN.green + "05" }}>
              <p className="text-sm font-bold" style={{ color: CN.green }}>Ready to launch!</p>
              <p className="text-xs">Click "Create Course" to save everything.</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons: Back and Next/Submit */}
      <div className="flex justify-between">
        <button onClick={() => setStep(step - 1)} disabled={step === 1} className="px-5 py-2.5 rounded-xl border font-bold disabled:opacity-40">Back</button>
        {step < 4 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canNext} className="px-5 py-2.5 rounded-xl font-bold text-white" style={{ background: CN.blue }}>Next</button>
        ) : (
          <button onClick={handleCreateCourse} className="px-5 py-2.5 rounded-xl font-bold text-white" style={{ background: CN.green }}>
            <Check size={16} /> Create Course
          </button>
        )}
      </div>
    </div>
  );
}