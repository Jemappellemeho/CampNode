// CoursePlayer is the student view for reading course topics.
// Layout: fixed sidebar on the left (topics list + language switcher),

import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowLeft, BookOpen, Brain, RotateCcw, Trophy, FileText } from "lucide-react";

export default function CoursePlayer() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState<any>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  // Stores the sanitized Wikipedia HTML for the currently selected topic
  const [content, setContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [articleLang, setArticleLang] = useState<"en" | "de">("en");

  // --- QUIZ STATE ---
  const [activeQuiz, setActiveQuiz] = useState<any>(null); // The quiz object being played
  const [quizMode, setQuizMode] = useState(false);        // Are we currently in the quiz view?
  const [currentIdx, setCurrentIdx] = useState(0);        // Progress through questions
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string | null>>({});
  const [quizFinished, setQuizFinished] = useState(false);

  // --- PROF. STOFF STATE ---
  // 'wiki' = Wikipedia view, 'stoff' = Professor uploaded material view
  const [contentView, setContentView] = useState<"wiki" | "stoff">("wiki");

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
    setContentView("wiki"); // always reset to wiki view when switching topics
    setQuizMode(false);
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

  // Startet das Quiz für das aktuelle Thema
  const startQuiz = (quiz: any) => {
    setActiveQuiz(quiz);
    setQuizMode(true);
    setCurrentIdx(0);
    setStudentAnswers({});
    setQuizFinished(false);
  };

  // Verarbeitet die Antwort des Studenten
  const handleAnswer = (answer: string) => {
    const newAnswers = { ...studentAnswers, [currentIdx]: answer };
    setStudentAnswers(newAnswers);

    // Automatisch zur nächsten Frage nach kurzer Verzögerung (softer Übergang)
    if (currentIdx < activeQuiz.questions.length - 1) {
      setTimeout(() => setCurrentIdx(currentIdx + 1), 600);
    } else {
      setTimeout(() => setQuizFinished(true), 800);
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
              <div key={t.id}>
                {/* Main topic button */}
                <button
                  onClick={() => handleTopicClick(t.id, articleLang)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                    activeTopicId === t.id && contentView === "wiki"
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <BookOpen size={14} className="flex-shrink-0" />
                  <span className="truncate">{t.name}</span>
                </button>

                {/* Prof. Stoff sub-item — only shows if uploaded material (content) exists */}
                {t.content && (
                  <button
                    onClick={() => { setActiveTopicId(t.id); setContentView("stoff"); setQuizMode(false); }}
                    className={`w-full text-left pl-8 pr-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 mt-0.5 ${
                      activeTopicId === t.id && contentView === "stoff"
                        ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                        : "text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10"
                    }`}
                  >
                    <FileText size={12} className="flex-shrink-0" />
                    <span>Prof. Stoff</span>
                  </button>
                )}
              </div>
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
              <div className="flex items-center justify-between mt-1">
                {activeTopic.description && (
                  <p className="text-gray-500">{activeTopic.description}</p>
                )}
                
                {/* Zeige den "Quiz starten" Button nur, wenn das Thema ein Quiz hat */}
                {activeTopic.quizzes?.length > 0 && !quizMode && (
                  <button 
                    onClick={() => startQuiz(activeTopic.quizzes[0])}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20 animate-bounce"
                  >
                    <Brain size={18} /> Quiz starten
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Article card — renders sanitized Wikipedia HTML via dangerouslySetInnerHTML.
              Styles for the HTML content are defined in index.css under .wikipedia-article-content */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm min-h-[400px]">
            {loadingContent ? (
              <div className="flex items-center gap-3 text-blue-500 py-10 justify-center">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Loading article...</span>
              </div>
            ) : quizMode && activeQuiz ? (
              /* --- QUIZ PLAYER VIEW --- */
              <div className="animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col">
                {!quizFinished ? (
                  <>
                    <div className="flex justify-between items-center mb-10">
                      <div className="flex flex-col gap-1">
                         <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">Wissenstest</span>
                         <h3 className="text-xl font-bold dark:text-white">Frage {currentIdx + 1} von {activeQuiz.questions.length}</h3>
                      </div>
                      <button 
                        onClick={() => setQuizMode(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold transition-colors"
                      >
                        Abbrechen
                      </button>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl mb-8 border dark:border-gray-700">
                      <p className="text-lg font-medium dark:text-gray-200">{activeQuiz.questions[currentIdx].question}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {activeQuiz.questions[currentIdx].options.map((option: string, i: number) => {
                        const isSelected = studentAnswers[currentIdx] === option;
                        return (
                          <button
                            key={i}
                            onClick={() => handleAnswer(option)}
                            disabled={!!studentAnswers[currentIdx]} // Verhindert Mehrfachklicks
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all font-semibold flex items-center justify-between group ${
                              isSelected 
                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' 
                                : 'border-gray-100 dark:border-gray-800 hover:border-purple-200 dark:hover:border-purple-800 dark:text-gray-300'
                            }`}
                          >
                            <span>{option}</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-200 dark:border-gray-700'
                            }`}>
                              {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-auto pt-10">
                      <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-600 transition-all duration-500"
                          style={{ width: `${((currentIdx + 1) / activeQuiz.questions.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* --- QUIZ RESULT SCREEN --- */
                  <div className="text-center py-10 animate-in slide-in-from-bottom-5 duration-500 flex flex-col items-center flex-1 justify-center">
                    <div className="w-20 h-20 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center justify-center mb-6">
                      <Trophy size={40} />
                    </div>
                    <h2 className="text-3xl font-extrabold dark:text-white mb-2">Quiz beendet!</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
                      Super gemacht! Hier ist dein Ergebnis für das Thema <b>{activeTopic.name}</b>.
                    </p>

                    <div className="flex gap-4 mb-10 w-full max-w-md">
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border dark:border-gray-700">
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Score</p>
                        <p className="text-4xl font-black text-purple-600">
                          {activeQuiz.questions.filter((q: any, i: number) => studentAnswers[i] === q.answer).length} / {activeQuiz.questions.length}
                        </p>
                      </div>
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border dark:border-gray-700">
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Genauigkeit</p>
                        <p className="text-4xl font-black text-green-500">
                          {Math.round((activeQuiz.questions.filter((q: any, i: number) => studentAnswers[i] === q.answer).length / activeQuiz.questions.length) * 100)}%
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 w-full max-w-md">
                      <button 
                        onClick={() => setQuizMode(false)}
                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 dark:text-white font-bold rounded-xl hover:bg-gray-200 transition-all"
                      >
                        Zurück zum Inhalt
                      </button>
                      <button 
                        onClick={() => startQuiz(activeQuiz)}
                        className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 transition-all"
                      >
                        <RotateCcw size={18} /> Nochmal versuchen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : contentView === "stoff" && activeTopic ? (
              /* --- PROF. STOFF VIEW --- */
              <div className="animate-in fade-in duration-500">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b dark:border-gray-800">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg flex items-center justify-center">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wider">Prof. Stoff</p>
                    <p className="text-sm font-bold dark:text-white">{activeTopic.name}</p>
                  </div>
                </div>
                {activeTopic.content ? (
                  <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 border dark:border-gray-700">
                    {/* If content has both wiki + professor material, show only the professor part */}
                    {activeTopic.content.includes("--- Ergänzendes Material ---")
                      ? activeTopic.content.split("--- Ergänzendes Material ---").slice(1).join("\n\n--- Ergänzendes Material ---\n\n").trim()
                      : activeTopic.content}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm italic">Kein Prof. Stoff für dieses Thema hochgeladen.</p>
                )}
              </div>
            ) : (
              /* --- ARTICLE VIEW --- */
              <div
                className="wikipedia-article-content animate-in fade-in duration-500"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}