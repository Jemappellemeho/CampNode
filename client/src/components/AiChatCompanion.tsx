import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, BookOpen, Bot, User, Loader2 } from "lucide-react";
import axios from "axios";

// ─── Type Declarations ────────────────────────────────────────────────────────
interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  sources?: string[];
}

interface MainTopic {
  id: string;
  title: string;
  description: string;
  subnodes: any[];
}

interface AiChatCompanionProps {
  courseId: string;
  courseTitle: string;
  topics: MainTopic[];
}

export default function AiChatCompanion({ courseId, courseTitle, topics }: AiChatCompanionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize companion with welcome message & smart suggested questions
  useEffect(() => {
    if (!courseId) return;

    // Reset messages for the new course
    const welcomeText = `Hallo! Ich bin dein KI-Lernbegleiter für den Kurs "${courseTitle}". Frag mich gerne alles über die Kursinhalte, und ich suche die passenden Antworten aus den bereitgestellten Materialien heraus!`;
    setMessages([
      {
        id: "welcome",
        sender: "ai",
        text: welcomeText,
      },
    ]);

    // Build dynamic suggestions based on active topics
    const suggestions: string[] = [];
    if (topics && topics.length > 0) {
      // Pick first two parent topic titles
      topics.slice(0, 2).forEach((topic) => {
        // Strip numbers from beginning if present (e.g. "1. Einführung" -> "Einführung")
        const cleanTitle = topic.title.replace(/^\d+\.\s*/, "");
        suggestions.push(`Kannst du mir "${cleanTitle}" genauer erklären?`);
      });

      // Pick one subnode if available
      const subnode = topics.flatMap(t => t.subnodes || [])[0];
      if (subnode) {
        suggestions.push(`Was sind die wichtigsten Kernpunkte zu "${subnode.title}"?`);
      }
    }

    // Default fallbacks if suggestions are sparse
    if (suggestions.length < 2) {
      suggestions.push("Was sind die Kernkonzepte dieses Kurses?");
      suggestions.push("Gib mir eine kurze Zusammenfassung des Materials.");
    }
    
    setSuggestedQuestions(suggestions.slice(0, 3));
  }, [courseId, courseTitle, topics]);

  // Smooth scroll to the newest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Send query function
  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    // Add student's query to message list
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:3000/api/ai/ask",
        {
          course_id: courseId,
          question: trimmed,
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      // Handle successful RAG response
      const aiResponse = res.data;
      const aiMsg: Message = {
        id: Math.random().toString(),
        sender: "ai",
        text: aiResponse.answer || "Entschuldigung, darauf konnte ich keine Antwort finden.",
        sources: Array.isArray(aiResponse.sources) ? aiResponse.sources : [],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      console.error("AI service error:", error);
      const errorMsg: Message = {
        id: Math.random().toString(),
        sender: "ai",
        text: "Es gab leider ein Problem beim Verbinden mit dem KI-Service. Bitte stelle sicher, dass der AI-Service läuft.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  return (
    <>
      {/* FLOATING ACTION BUTTON */}
      <div className="fixed bottom-6 right-6 z-[99] flex flex-col items-end">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="relative group h-14 w-14 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(30,111,255,0.4)] transition-all bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white overflow-hidden"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          aria-label="AI Study Companion"
        >
          {/* Pulsing halo ring */}
          <span className="absolute -inset-1 rounded-full bg-blue-500/20 animate-ping opacity-75 group-hover:opacity-100 duration-1000" />
          
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <X size={24} />
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center"
              >
                <Sparkles size={24} className="animate-pulse" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* CHAT OVERLAY DRAWER */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop blur behind drawer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-[90] bg-black/10 dark:bg-black/30 backdrop-blur-[2px]"
            />

            {/* Premium Chat Sidebar Panel */}
            <motion.div
              initial={{ x: "100%", opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 z-[95] w-full max-w-[440px] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.15)] border-l backdrop-blur-xl bg-white/80 dark:bg-slate-900/85 border-slate-200/50 dark:border-slate-800/50"
            >
              {/* HEADER */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-950/20">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-600/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <Bot size={22} className="animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 text-[15px]">
                      CampNode AI
                      <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Ready to assist" />
                    </h3>
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                      {courseTitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* MESSAGES AREA */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-[85%] ${
                      msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                    }`}
                  >
                    {/* Icon indicator */}
                    <div
                      className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                        msg.sender === "user"
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {msg.sender === "user" ? <User size={13} /> : <Bot size={13} />}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          msg.sender === "user"
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none"
                            : "bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-tl-none"
                        }`}
                      >
                        {/* Render simple text format nicely */}
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>

                      {/* Source Citations Container */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5 pl-1">
                          {msg.sources.map((src, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40"
                            >
                              <BookOpen size={10} />
                              {src}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Shimmering Pulsing Loading Bubble */}
                {isLoading && (
                  <div className="flex gap-3 max-w-[85%] mr-auto">
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 flex-shrink-0 flex items-center justify-center text-slate-400">
                      <Bot size={13} />
                    </div>
                    <div className="bg-white/90 dark:bg-slate-800/90 rounded-2xl rounded-tl-none px-4 py-3 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-1.5 h-[42px] min-w-[70px] justify-center">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" />
                    </div>
                  </div>
                )}
                
                {/* Scroll Target */}
                <div ref={scrollRef} />
              </div>

              {/* DYNAMIC CHIPS / SUGGESTIONS & INPUT ZONE */}
              <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-950/20 backdrop-blur-md">
                {/* Suggested prompt chips (Only visible when user hasn't sent custom queries yet) */}
                {messages.length === 1 && !isLoading && (
                  <div className="mb-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Sparkles size={11} className="text-blue-500" />
                      Suggested starting points:
                    </p>
                    <div className="flex flex-col gap-2">
                      {suggestedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(q)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200/50 dark:border-slate-800/50 hover:border-blue-200/60 dark:hover:border-blue-900/40 transition-all shadow-sm"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TEXT INPUT FORM */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all overflow-hidden">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Stelle eine Frage zum Kurs..."
                      rows={1}
                      className="w-full bg-transparent max-h-[120px] resize-none outline-none border-none pl-3 pr-10 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 scrollbar-none"
                      style={{ height: "auto" }}
                    />
                  </div>
                  <button
                    disabled={!input.trim() || isLoading}
                    onClick={() => handleSend(input)}
                    className="h-10 w-10 flex-shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all"
                    title="Send query"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
