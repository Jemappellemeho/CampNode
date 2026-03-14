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

const MOCK_AI_SUGGESTIONS: Record<string, string[]> = {
  algorithms: ["Big O Notation", "Recursion Basics", "Dynamic Programming"],
  sorting: ["Merge Sort", "Quick Sort", "Heap Sort"],
  graphs: ["BFS & DFS", "Dijkstra's Algorithm", "Topological Sort"],
  databases: ["ACID Properties", "Index Structures", "Query Optimization"],
  default: ["Fundamentals Overview", "Practice Problems", "Common Pitfalls"],
};

function getAISuggestions(topics: string[]): string[] {
  const all: string[] = [];
  topics.forEach((t) => {
    const key = Object.keys(MOCK_AI_SUGGESTIONS).find((k) => t.toLowerCase().includes(k));
    all.push(...(key ? MOCK_AI_SUGGESTIONS[key] : MOCK_AI_SUGGESTIONS.default));
  });
  return [...new Set(all)].slice(0, 5);
}

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
  const [formData, setFormData] = useState<FormData>({
    title: "", description: "", isPublic: false, topics: [], prerequisites: {},
  });

  const genId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

  const fetchAI = () => {
    setAiLoading(true);
    setTimeout(() => {
      const suggestions = getAISuggestions(formData.topics.map((t) => t.title));
      setFormData({
        ...formData,
        topics: [...formData.topics, ...suggestions.map((s) => ({
          id: genId(), title: s, isAISuggested: true, accepted: false,
        }))],
      });
      setAiLoading(false);
      setAiDone(true);
    }, 1500);
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

  const accepted = formData.topics.filter((t) => t.accepted);
  const canNext = step === 1 ? formData.title.trim().length > 0 : step === 2 ? accepted.length >= 1 : true;

  const inputStyle = {
    background: "var(--cn-bg)",
    color: "var(--cn-text)",
    border: "2px solid var(--cn-border)",
  };

  const renderStep = () => {
    switch (step) {

      case 1:
        return (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--cn-text)" }}>Course basics</h2>
              <p className="text-sm" style={{ color: "var(--cn-muted)" }}>Give your course a name and decide who can find it.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" style={{ color: "var(--cn-text)" }}>
                Course Title <span style={{ color: CN.red }}>*</span>
              </label>
              <input type="text" placeholder="e.g. Introduction to Algorithms"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = CN.blue)}
                onBlur={(e) => (e.target.style.borderColor = "var(--cn-border)")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" style={{ color: "var(--cn-text)" }}>Description</label>
              <textarea rows={3} placeholder="What will students learn?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = CN.blue)}
                onBlur={(e) => (e.target.style.borderColor = "var(--cn-border)")} />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold" style={{ color: "var(--cn-text)" }}>Visibility</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { pub: false, icon: Lock, title: "Private", sub: "Join by code only" },
                  { pub: true, icon: Globe, title: "Public", sub: "Discoverable by anyone" },
                ].map(({ pub, icon: Icon, title, sub }) => (
                  <button key={String(pub)} onClick={() => setFormData({ ...formData, isPublic: pub })}
                    className="flex items-center gap-3 p-4 rounded-xl text-left transition-all"
                    style={{
                      border: `2px solid ${formData.isPublic === pub ? (pub ? CN.green : CN.blue) : "var(--cn-border)"}`,
                      background: formData.isPublic === pub ? (pub ? CN.green + "0F" : CN.blue + "0F") : "transparent",
                    }}>
                    <Icon size={20} style={{ color: formData.isPublic === pub ? (pub ? CN.green : CN.blue) : "var(--cn-muted)" }} />
                    <div>
                      <p className="text-sm font-bold"
                        style={{ color: formData.isPublic === pub ? (pub ? CN.green : CN.blue) : "var(--cn-text)" }}>
                        {title}
                      </p>
                      <p className="text-xs" style={{ color: "var(--cn-muted)" }}>{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--cn-text)" }}>Add topics</h2>
              <p className="text-sm" style={{ color: "var(--cn-muted)" }}>Add main topics, then get AI subtopic suggestions. You decide what stays.</p>
            </div>

            <div className="flex gap-2">
              <input type="text" placeholder="e.g. Binary Search Trees"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTopic()}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = CN.blue)}
                onBlur={(e) => (e.target.style.borderColor = "var(--cn-border)")} />
              <button onClick={addTopic}
                className="flex items-center gap-1.5 px-4 py-2.5 text-white text-sm font-bold rounded-xl"
                style={{ background: CN.blue }}>
                <Plus size={16} /> Add
              </button>
            </div>

            {formData.topics.length === 0 && (
              <div className="text-center py-8 rounded-2xl" style={{ border: `2px dashed var(--cn-border)` }}>
                <BookOpen size={28} className="mx-auto mb-2" style={{ color: "var(--cn-muted)" }} />
                <p className="text-sm" style={{ color: "var(--cn-muted)" }}>Add your first topic above</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {/* Manual topics — blue left border */}
              {formData.topics.filter((t) => !t.isAISuggested).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)", borderLeft: `4px solid ${CN.blue}` }}>
                  <span className="text-sm font-semibold" style={{ color: "var(--cn-text)" }}>{t.title}</span>
                  <button onClick={() => removeTopic(t.id)}><X size={16} style={{ color: "var(--cn-muted)" }} /></button>
                </div>
              ))}

              {/* Pending AI suggestions — RED left border (AI = red like playground) */}
              {formData.topics.filter((t) => t.isAISuggested && !t.accepted).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: CN.red }}>
                    <Sparkles size={12} /> AI Suggestions — accept or reject:
                  </p>
                  {formData.topics.filter((t) => t.isAISuggested && !t.accepted).map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-xl px-4 py-3 mb-2"
                      style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)", borderLeft: `4px solid ${CN.red}` }}>
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} style={{ color: CN.red }} />
                        <span className="text-sm font-medium" style={{ color: "var(--cn-text)" }}>{t.title}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => acceptSuggestion(t.id)}
                          className="text-xs font-bold px-2 py-1 rounded-lg"
                          style={{ color: CN.green, background: CN.green + "18" }}>
                          ✓ Accept
                        </button>
                        <button onClick={() => removeTopic(t.id)}
                          className="text-xs font-bold px-2 py-1 rounded-lg"
                          style={{ color: CN.red, background: CN.red + "18" }}>
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Accepted AI suggestions — RED left border, red AI badge */}
              {formData.topics.filter((t) => t.isAISuggested && t.accepted).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)", borderLeft: `4px solid ${CN.red}` }}>
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} style={{ color: CN.red }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--cn-text)" }}>{t.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{ background: CN.red + "18", color: CN.red }}>AI</span>
                  </div>
                  <button onClick={() => removeTopic(t.id)}><X size={16} style={{ color: "var(--cn-muted)" }} /></button>
                </div>
              ))}
            </div>

            {/* AI suggestions button — red dashed border */}
            {formData.topics.filter((t) => !t.isAISuggested).length >= 1 && !aiDone && (
              <button onClick={fetchAI} disabled={aiLoading}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-colors"
                style={{ border: `2px dashed ${CN.red}`, color: "var(--cn-text)", background: "transparent" }}>
                {aiLoading
                  ? <><div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: CN.red }} /> Generating...</>
                  : <><Sparkles size={16} style={{ color: CN.red }} /> Get AI subtopic suggestions</>}
              </button>
            )}
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--cn-text)" }}>Set prerequisites</h2>
              <p className="text-sm" style={{ color: "var(--cn-muted)" }}>Which topics must be completed before each one? These become the edges in the knowledge graph.</p>
            </div>

            <div className="flex items-start gap-2 rounded-xl px-4 py-3"
              style={{ background: CN.blue + "0F", border: `1px solid ${CN.blue}33` }}>
              <Info size={15} style={{ color: CN.blue, flexShrink: 0, marginTop: 2 }} />
              <p className="text-xs" style={{ color: CN.blue }}>
                Leave empty = available from the start. Avoid circular dependencies!
              </p>
            </div>

            {accepted.length < 2
              ? <div className="text-center py-8 rounded-2xl" style={{ border: `2px dashed var(--cn-border)` }}>
                  <p className="text-sm" style={{ color: "var(--cn-muted)" }}>Add at least 2 topics first</p>
                </div>
              : accepted.map((topic) => {
                  const prereqs = formData.prerequisites[topic.id] || [];
                  return (
                    <div key={topic.id} className="rounded-2xl p-4"
                      style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>
                      <p className="text-sm font-bold mb-3" style={{ color: "var(--cn-text)" }}>{topic.title}</p>
                      <p className="text-xs mb-2" style={{ color: "var(--cn-muted)" }}>Requires:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {accepted.filter((t) => t.id !== topic.id).map((prereq) => {
                          const sel = prereqs.includes(prereq.id);
                          return (
                            <button key={prereq.id} onClick={() => togglePrereq(topic.id, prereq.id)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all"
                              style={{
                                border: `1px solid ${sel ? CN.blue : "var(--cn-border)"}`,
                                background: sel ? CN.blue + "0F" : "var(--cn-bg)",
                                color: sel ? CN.blue : "var(--cn-muted)",
                              }}>
                              <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                                style={{ background: sel ? CN.blue : "transparent", border: sel ? "none" : "1px solid var(--cn-border)" }}>
                                {sel && <Check size={10} color="white" />}
                              </div>
                              {prereq.title}
                            </button>
                          );
                        })}
                      </div>
                      {prereqs.length === 0 && <p className="text-xs mt-2 italic" style={{ color: "var(--cn-muted)" }}>No prerequisites — starting node</p>}
                    </div>
                  );
                })}
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--cn-text)" }}>Review your course</h2>
              <p className="text-sm" style={{ color: "var(--cn-muted)" }}>Everything look good? Hit Create and your join code will be generated automatically.</p>
            </div>

            <div className="rounded-2xl p-5 flex flex-col gap-4"
              style={{ background: "var(--cn-card)", border: `2px solid ${CN.blue}` }}>
              <div>
                <p className="text-xs mb-1" style={{ color: "var(--cn-muted)" }}>Course Title</p>
                <p className="text-base font-bold" style={{ color: "var(--cn-text)" }}>{formData.title || "Untitled"}</p>
              </div>
              {formData.description && (
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--cn-muted)" }}>Description</p>
                  <p className="text-sm" style={{ color: "var(--cn-text)" }}>{formData.description}</p>
                </div>
              )}
              <div className="flex gap-6">
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--cn-muted)" }}>Visibility</p>
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                    style={formData.isPublic
                      ? { background: CN.green + "18", color: CN.green }
                      : { background: "var(--cn-bg)", color: "var(--cn-muted)", border: "1px solid var(--cn-border)" }}>
                    {formData.isPublic ? <Globe size={11} /> : <Lock size={11} />}
                    {formData.isPublic ? "Public" : "Private"}
                  </span>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--cn-muted)" }}>Topics</p>
                  <p className="text-lg font-bold" style={{ color: CN.blue }}>{accepted.length}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2" style={{ color: "var(--cn-text)" }}>Topics ({accepted.length})</p>
              <div className="flex flex-col gap-2">
                {accepted.map((t) => {
                  const prereqs = formData.prerequisites[t.id] || [];
                  return (
                    <div key={t.id} className="flex items-start rounded-xl px-4 py-3"
                      style={{ background: "var(--cn-bg)", borderLeft: `3px solid ${t.isAISuggested ? CN.red : CN.blue}` }}>
                      <div>
                        <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--cn-text)" }}>
                          {t.isAISuggested && <Sparkles size={12} style={{ color: CN.red }} />}
                          {t.title}
                          {t.isAISuggested && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                              style={{ background: CN.red + "18", color: CN.red }}>AI</span>
                          )}
                        </p>
                        {prereqs.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--cn-muted)" }}>
                            Requires: {prereqs.map((id) => accepted.find((a) => a.id === id)?.title).filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

      <button onClick={() => navigate("/prof/dashboard")}
        className="flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors"
        style={{ color: "var(--cn-muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = CN.blue)}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cn-muted)")}>
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--cn-text)" }}>Create New Course</h1>

      <StepIndicator currentStep={step} />

      <div className="rounded-2xl border p-6 shadow-sm mb-6"
        style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
        {renderStep()}
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep(step - 1)} disabled={step === 1}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl disabled:opacity-40"
          style={{ color: "var(--cn-text)", border: "1px solid var(--cn-border)" }}>
          <ArrowLeft size={16} /> Back
        </button>
        {step < 4
          ? <button onClick={() => setStep(step + 1)} disabled={!canNext}
              className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-40"
              style={{ background: CN.blue }}>
              Next <ArrowRight size={16} />
            </button>
          : <button onClick={() => navigate("/prof/dashboard")}
              className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl"
              style={{ background: CN.green }}>
              <Check size={16} /> Create Course
            </button>}
      </div>

    </div>
  );
}