// CoursePlayer is the student view for reading course topics.
// Layout: fixed sidebar on the left (topics list + language switcher),

import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function CoursePlayer() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState<any>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  // Stores the sanitized Wikipedia HTML for the currently selected topic
  const [content, setContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [articleLang, setArticleLang] = useState<"en" | "de">("en");

  // Load course on mount — also auto-opens the first topic
  useEffect(() => {
    loadCourse();
  }, [courseId]);

  const loadCourse = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`http://localhost:3000/api/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourse(res.data);

      // Automatically open the first topic so the page is never empty on load
      if (res.data.topics?.length > 0) {
        handleTopicClick(res.data.topics[0].id, "en");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch Wikipedia article HTML for a topic.
  // Called when the student clicks a topic or switches language.
  const handleTopicClick = async (topicId: string, lang: string) => {
    setActiveTopicId(topicId);
    setLoadingContent(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `http://localhost:3000/api/topics/${topicId}/content?lang=${lang}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setContent(res.data.content);
    } catch (err) {
      console.error(err);
      setContent("<p>Error loading content.</p>");
    } finally {
      setLoadingContent(false);
    }
  };

  // Switch article language and immediately reload the active topic in the new language
  const switchLang = (lang: "en" | "de") => {
    setArticleLang(lang);
    if (activeTopicId) handleTopicClick(activeTopicId, lang);
  };

  if (!course) {
    return (
      <div className="flex justify-center items-center py-32 text-gray-500 dark:text-gray-400 font-medium">
        Loading course...
      </div>
    );
  }

  const topics = course.topics || [];

  // Find the active topic object for rendering its title and description
  const activeTopic = topics.find((t: any) => t.id === activeTopicId);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">

      {/* SIDEBAR */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">

        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => navigate("/dashboard")}
            className="group flex items-center gap-2 text-sm font-semibold mb-5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>

          <h1 className="text-lg font-extrabold dark:text-white leading-tight">
            {course.title}
          </h1>
          {course.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{course.description}</p>
          )}
        </div>

        {/* Language switcher — switching re-fetches the active topic in the new language */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            {(["en", "de"] as const).map((l) => (
              <button
                key={l}
                onClick={() => switchLang(l)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  articleLang === l
                    ? "bg-white dark:bg-gray-700 shadow-sm text-blue-600"
                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Topic list — active topic is highlighted in blue */}
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">
            Topics ({topics.length})
          </p>
          {topics.length === 0 ? (
            <p className="text-sm text-gray-400 px-2">No topics yet.</p>
          ) : (
            topics.map((t: any) => (
              <button
                key={t.id}
                onClick={() => handleTopicClick(t.id, articleLang)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTopicId === t.id
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <BookOpen size={14} className="flex-shrink-0" />
                <span className="truncate">{t.name}</span>
              </button>
            ))
          )}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">

          {/* Topic title and description shown above the article */}
          {activeTopic && (
            <div className="mb-6">
              <h2 className="text-3xl font-extrabold dark:text-white tracking-tight">
                {activeTopic.name}
              </h2>
              {activeTopic.description && (
                <p className="text-gray-500 mt-1">{activeTopic.description}</p>
              )}
            </div>
          )}

          {/* Article card — renders sanitized Wikipedia HTML via dangerouslySetInnerHTML.
              Styles for the HTML content are defined in index.css under .wikipedia-article-content */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
            {loadingContent ? (
              <div className="flex items-center gap-3 text-blue-500 py-10 justify-center">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Loading article...</span>
              </div>
            ) : (
              <div
                className="wikipedia-article-content"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}