// =============================================================
// FILE LOCATION: client/src/pages/CourseManager.tsx
// REPLACE existing file entirely
// Header handled by Layout.tsx — no header here
// AI nodes = red border (matches playground)
// =============================================================

import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  ArrowLeft, Users, BookOpen,
  Copy, Check, Globe, Trash2,
  Plus, Search, X } from "lucide-react";

// Color constants for consistent UI styling
const CN = {
  blue: "#1E6FFF",
  blueDark: "#1557CC",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

// A simple button to copy text to clipboard with a visual feedback state
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="p-1 hover:bg-gray-100 rounded transition-colors">
      {copied ? <Check size={14} style={{ color: CN.green }} /> : <Copy size={14} className="text-gray-400" />}
    </button>
  );
}

// Reusable tab button — active tab gets a blue background, inactive stays transparent
function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="px-4 py-2.5 text-sm font-bold rounded-xl transition-all flex-1 md:flex-none"
      style={{ 
        background: active ? CN.blue : "transparent", 
        color: active ? "white" : "#6B7280" 
      }}
    >
      {label}
    </button>
  );
}

// Inline topic search + add panel, shown inside the Nodes tab
function AddTopicPanel({ courseId, onTopicAdded }: { courseId: string; onTopicAdded: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
 
  // Search Wikidata as the user types — debounced by character count
  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length > 2) {
      const res = await axios.get(`http://localhost:3000/api/wiki/search?q=${q}`);
      setResults(res.data);
    } else {
      setResults([]);
    }
  };
 
  // POST a new topic linked to the current course, then notify the parent to refresh
  const handleAdd = async (topic: any) => {
    setAdding(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:3000/api/topics",
        {
          name: topic.label,
          description: topic.description || "",
          courseId,
          wikidataId: topic.id,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSearch("");
      setResults([]);
      onTopicAdded(); // trigger parent to re-fetch the course
    } catch (err) {
      console.error("Failed to add topic", err);
    } finally {
      setAdding(false);
    }
  };
 
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5 shadow-sm">
      <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Add New Topic</p>
 
      {/* Wikidata search input */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-3 text-gray-400" size={16} />
        <input
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border dark:border-gray-700 dark:bg-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search Wikidata (e.g. 'Photosynthesis')..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => { setSearch(""); setResults([]); }}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        )}
      </div>
 
      {/* Search results dropdown */}
      {results.length > 0 && (
        <div className="border dark:border-gray-700 rounded-xl overflow-hidden divide-y dark:divide-gray-700">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleAdd(r)}
              disabled={adding}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-start gap-3"
            >
              <Plus size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
              <div>
                <p className="font-semibold text-sm dark:text-white">{r.label}</p>
                <p className="text-xs text-gray-500 line-clamp-1">{r.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// CourseManager is the professor view for a single course.
// It has three tabs: Overview (stats + join code), Students, and Nodes (topics + Wikipedia articles).
export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  
  // UI State
  const [tab, setTab] = useState<"overview" | "students" | "nodes">("overview");
  const [articleLang, setArticleLang] = useState<"en" | "de">("en");
  
  // Data State
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Stores fetched Wikipedia HTML per topic id to avoid re-fetching on tab switch
  const [topicContentById, setTopicContentById] = useState<Record<string, string>>({});
  const [loadingTopicId, setLoadingTopicId] = useState<string | null>(null);
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);
  
  // Fetch Wikipedia article for a single topic.
  // Defined with useCallback to maintain reference stability-
  // this prevents the nodes useEffect from re-running unnecessarily.
  const loadTopicContent = useCallback(async (topicId: string, lang: string) => {
    try {
      setLoadingTopicId(topicId);
      const token = localStorage.getItem("token");
      
      const res = await axios.get(
        `http://localhost:3000/api/topics/${topicId}/content?lang=${lang}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setTopicContentById((prev) => ({ 
        ...prev, 
        [topicId]: res.data.content || "No content found for this language." 
      }));
    } catch (err) {
      console.error("Failed to load topic content", err);
      setTopicContentById((prev) => ({ ...prev, [topicId]: "Error loading article." }));
    } finally {
      setLoadingTopicId(null);
    }
  }, []);

  // Fetch course data — called on mount and after adding/deleting a topic
  const fetchCourse = useCallback(async () => {
    try {
      setLoading(true);
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
  }, [courseId]);
 
  useEffect(() => {
    if (courseId) fetchCourse();
  }, [courseId, fetchCourse]);

  // Trigger Wikipedia content loading when the Nodes tab becomes active or the language changes.
  useEffect(() => {
    const nodes = course?.topics || [];
    if (tab === "nodes" && nodes.length > 0) {
      nodes.forEach((node: any) => {
        // load content only if we haven't already fetched it for this topic and language
        if (!topicContentById[node.id]) {
          loadTopicContent(node.id, articleLang);
        }
      });
    }
    // IMPORTANT: topicContentById is NOT in dependencies to avoid re-triggering
  }, [tab, articleLang, course?.topics, loadTopicContent]);

  // Delete a topic after confirmation — refreshes the course after
  const handleDeleteTopic = async (topicId: string, topicName: string) => {
    if (!window.confirm(`Delete topic "${topicName}"? This cannot be undone.`)) return;
    setDeletingTopicId(topicId);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:3000/api/topics/${topicId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Remove cached content for this topic and refresh the course
      setTopicContentById((prev) => {
        const next = { ...prev };
        delete next[topicId];
        return next;
      });
      await fetchCourse();
    } catch (err) {
      console.error("Failed to delete topic", err);
      alert("Failed to delete topic.");
    } finally {
      setDeletingTopicId(null);
    }
  }; 
  if (loading) {
    return <div className="text-center py-32 text-gray-500 font-medium">Loading course details...</div>;
  }
 
  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-gray-500">Course not found or access denied.</p>
        <button onClick={() => navigate("/dashboard")} className="text-blue-600 font-bold hover:underline">
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  // DATA MAPPING: Prepare variables for rendering
  const students = course.students || []; 
  const nodes = course.topics || [];

  // Delete course and redirect to dashboard.
  // Topics are detached (courseId set to null) but not deleted — quizzes are preserved for reuse.
  const handleDeleteCourse = async () => {
    if (!window.confirm(`Are you sure you want to delete "${course.title}"? This cannot be undone.`)) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:3000/api/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to delete course", err);
      alert("Failed to delete course.");
    }
  };

  // Helper function to render the content of the currently selected tab.
  const renderTabContent = () => {
    switch (tab) {
      case "overview":
        return (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Students", value: students.length, icon: Users },
                { label: "Nodes", value: nodes.length, icon: BookOpen },
                { label: "Visibility", value: course.isPublic ? "Public" : "Private", icon: Globe },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-600">
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold dark:text-white">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Join code section — professors share this with students to enroll */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold mb-4 dark:text-white uppercase tracking-wider">Access Configuration</h3>
              <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500">Student Join Code</p>
                  <p className="text-lg font-mono font-bold text-blue-600 uppercase">{course.joinCode}</p>
                </div>
                <CopyBtn text={course.joinCode} />
              </div>
            </div>
          </div>
        );

      case "students":
        return (
          <div className="flex flex-col gap-3 animate-in fade-in">
            <p className="text-sm text-gray-500 mb-2">{students.length} students enrolled</p>
            {students.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-2xl border-2 border-dashed text-gray-400">
                No students joined yet.
              </div>
            ) : (
              students.map((s: any) => (
                <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <p className="font-semibold dark:text-gray-200">{s.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        );

      case "nodes":
        return (
          <div className="flex flex-col gap-4 animate-in fade-in">
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700">
              <p className="text-sm font-medium text-gray-500">{nodes.length} topics defined</p>
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
                {(['en', 'de'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => { setTopicContentById({}); setArticleLang(l); }}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${articleLang === l ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-400'}`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Add topic panel — always visible at the top of the nodes tab */}
            <AddTopicPanel
              courseId={courseId!}
              onTopicAdded={() => {
                // Clear cached content so the new topic gets fetched on next render
                setTopicContentById({});
                fetchCourse();
              }}
            />
            
            {/* Topic cards */}
            {nodes.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400">
                No topics yet — use the panel above to add your first one.
              </div>
            ) : (
              nodes.map((node: any) => (
                <div key={node.id} className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-bold dark:text-white">{node.name}</h4>
                      <p className="text-sm text-gray-500 mt-1">{node.description || "No description provided."}</p>
                    </div>
 
                    {/* Delete topic button */}
                    <button
                      onClick={() => handleDeleteTopic(node.id, node.name)}
                      disabled={deletingTopicId === node.id}
                      className="flex-shrink-0 ml-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                      {deletingTopicId === node.id ? "Deleting..." : "Remove"}
                    </button>
                  </div>
 
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-gray-400 uppercase">Wikipedia Content</span>
                      {loadingTopicId === node.id && (
                        <span className="text-xs text-blue-500 animate-pulse italic">Fetching...</span>
                      )}
                    </div>
 
                    <div
                      className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed max-h-60 overflow-y-auto pr-2 custom-scrollbar wikipedia-article-content"
                      dangerouslySetInnerHTML={{
                        __html: topicContentById[node.id] || "Loading article..."
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        );
      default: return null;
    }
  };
 
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Top Navigation */}
      <button 
        onClick={() => navigate("/dashboard")} 
        className="group flex items-center gap-2 text-sm font-semibold mb-8 text-gray-400 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
        Back to Dashboard
      </button>

      {/* Course Header */}
      <div className="mb-10 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-extrabold dark:text-white mb-2 tracking-tight">{course.title}</h1>
          <p className="text-lg text-gray-500 max-w-2xl">{course.description || "Add a description to help students understand this course."}</p>
        </div>
        <button
          onClick={handleDeleteCourse}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-500 border border-red-200 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 size={16} /> Delete Course
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-8 rounded-2xl p-1.5 bg-gray-100/50 dark:bg-gray-900/50 border dark:border-gray-700 overflow-x-auto">
        <TabBtn label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabBtn label={`Students (${students.length})`} active={tab === "students"} onClick={() => setTab("students")} />
        <TabBtn label={`Nodes (${nodes.length})`} active={tab === "nodes"} onClick={() => setTab("nodes")} />
      </div>

      {/* Main Tab Content */}
      <main className="min-h-[400px]">
        {renderTabContent()}
      </main>
    </div>
  );
}