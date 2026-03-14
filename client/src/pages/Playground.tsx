// =============================================================
// FILE LOCATION: client/src/pages/Playground.tsx
// REPLACE existing file entirely
// =============================================================

import { useState } from 'react';
import NodeDetailPanel from '../components/NodeDetailPanel';

type Status = 'completed' | 'current' | 'locked';

interface SubSubnode {
  id: number;
  title: string;
  status: Status;
}

interface Subnode {
  id: number;
  title: string;
  type: 'prof' | 'ai';
  status: Status;
  subsubnodes?: SubSubnode[];
  resources?: Array<{
    type: 'video' | 'article' | 'podcast' | 'quiz';
    title: string;
    duration: string;
  }>;
}

interface MainTopic {
  id: number;
  title: string;
  description: string;
  status: Status;
  subnodes: Subnode[];
  progress?: { completed: number; total: number };
}

const KOTLIN_UNI_PATH: MainTopic[] = [
  {
    id: 1,
    title: "1. JVM Architecture",
    description: "Understanding the Java Virtual Machine: how Kotlin code is compiled into bytecode, how the JVM executes it, and runtime optimization.",
    status: "completed",
    progress: { completed: 3, total: 3 },
    subnodes: [
      { 
        id: 101, 
        title: "Bytecode", 
        type: "prof", 
        status: "completed",
        subsubnodes: [
          { id: 1011, title: "Instructions", status: "completed" },
          { id: 1012, title: "Stack Operations", status: "completed" }
        ],
        resources: [
          { type: 'video', title: 'JVM Bytecode Explained', duration: '10 min' },
          { type: 'article', title: 'Understanding Bytecode', duration: '8 min read' },
          { type: 'quiz', title: 'Bytecode Quiz', duration: '8 questions' }
        ]
      },
      { id: 102, title: "Classloader", type: "prof", status: "completed" },
      { id: 103, title: "JIT Compiler", type: "ai", status: "completed" }
    ]
  },
  {
    id: 2,
    title: "2. Logic & Control",
    description: "Master functional programming in Kotlin: lambdas, higher-order functions, inline functions for performance optimization.",
    status: "current",
    progress: { completed: 1, total: 4 },
    subnodes: [
      { 
        id: 201, 
        title: "Lambdas", 
        type: "prof", 
        status: "completed",
        resources: [
          { type: 'video', title: 'Lambda Functions in Kotlin', duration: '12 min' },
          { type: 'article', title: 'Functional Programming with Lambdas', duration: '10 min read' },
          { type: 'quiz', title: 'Lambdas Quiz', duration: '10 questions' }
        ]
      },
      { id: 202, title: "High-Order", type: "prof", status: "current" },
      { id: 203, title: "Inline Fun", type: "ai", status: "locked" },
      { id: 204, title: "Reification", type: "ai", status: "locked" }
    ]
  },
  {
    id: 3,
    title: "3. OOP Concepts",
    description: "Object-oriented programming fundamentals: classes, inheritance hierarchies, and polymorphism for flexible, reusable code.",
    status: "locked",
    progress: { completed: 0, total: 3 },
    subnodes: [
      { id: 301, title: "Classes", type: "prof", status: "locked" },
      { id: 302, title: "Inheritance", type: "prof", status: "locked" },
      { id: 303, title: "Polymorphism", type: "ai", status: "locked" }
    ]
  }
];

export default function Playground() {
  const [activeId, setActiveId] = useState<number | null>(2);
  const [isSyllabusOpen, setSyllabusOpen] = useState(false);
  const [selectedSubnode, setSelectedSubnode] = useState<any>(null);

  const totalCompleted = KOTLIN_UNI_PATH.reduce((sum, topic) => 
    sum + (topic.progress?.completed || 0), 0
  );
  const totalNodes = KOTLIN_UNI_PATH.reduce((sum, topic) => 
    sum + (topic.progress?.total || 0), 0
  );
  const overallProgress = Math.round((totalCompleted / totalNodes) * 100);

  return (
    <div className="min-h-screen font-sans transition-colors" style={{ background: "var(--cn-page)" }}>

      {/* SYLLABUS BUTTON ROW */}
      <div
        className="sticky top-16 sm:top-20 z-40 flex justify-between items-center px-3 sm:px-6 py-2 border-b"
        style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}
      >
        {/* Progress pill — left side */}
        <div
          className="flex items-center gap-2 px-2 py-1 rounded-lg"
          style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}
        >
          <span className="text-xs font-semibold" style={{ color: "var(--cn-text)" }}>
            {overallProgress}%
          </span>
          <div
            className="w-16 h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--cn-border)" }}
          >
            {/* Yellow progress bar */}
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${overallProgress}%`, background: "#F5C518" }}
            />
          </div>
        </div>

        {/* Syllabus button — right side, blue like all prof/student actions */}
        <button
          onClick={() => setSyllabusOpen(true)}
          className="font-bold text-xs sm:text-sm px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-md active:scale-95 transition-all text-white"
          style={{ background: "#1E6FFF" }}
        >
          SYLLABUS
        </button>
      </div>

      {/* MAIN CONTENT */}
      <main className="pb-16 sm:pb-24 flex flex-col items-center px-3 sm:px-4 pt-6">
        <h1
          className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 text-center"
          style={{ color: "var(--cn-text)" }}
        >
          Kotlin Programming
        </h1>
        <p
          className="mb-6 sm:mb-8 text-xs sm:text-sm md:text-base text-center"
          style={{ color: "var(--cn-muted)" }}
        >
          CS 101: Your Learning Journey
        </p>

        {KOTLIN_UNI_PATH.map((node, index) => (
          <div key={node.id} className="flex flex-col items-center w-full max-w-5xl">
            
            {/* MAIN TOPIC HEXAGON  */}
            <div className="relative z-20">
              <button
                onClick={() => setActiveId(activeId === node.id ? null : node.id)}
                style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
                className={`w-28 h-24 sm:w-32 sm:h-28 md:w-36 md:h-32 lg:w-40 lg:h-36 flex flex-col items-center justify-center p-2 sm:p-3 text-center transition-all duration-300 shadow-xl
                  bg-green-500 dark:bg-green-600
                  ${activeId === node.id 
                    ? 'scale-110 ring-2 sm:ring-4 ring-yellow-400 brightness-100' 
                    : 'scale-100 hover:scale-105 brightness-75'}
                `}
              >
                <span className="text-white font-black text-[10px] sm:text-xs md:text-sm uppercase leading-tight">
                  {node.title}
                </span>
                {node.progress && (
                  <span className="text-white text-[9px] sm:text-[10px] mt-0.5 sm:mt-1">
                    {node.progress.completed}/{node.progress.total}
                  </span>
                )}
                <span className="text-white text-xs sm:text-sm mt-0.5 sm:mt-1">
                  {activeId === node.id ? '▼' : '▶'}
                </span>
              </button>
            </div>

            {/* CONNECTION LINE — yellow  */}
            {activeId === node.id && node.subnodes.length > 0 && (
              <div
                className="w-0.5 sm:w-1 h-6 sm:h-8 md:h-10 z-10"
                style={{ background: "#F5C518" }}
              />
            )}

            {/* SUBTOPICS */}
            {activeId === node.id && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-4 sm:gap-6 md:gap-8 my-4 sm:my-6 px-2 sm:px-4 max-w-4xl">
                {node.subnodes.map((sub) => (
                  <div key={sub.id} className="flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-300">
                    
                    <div className="relative flex flex-col items-center">
                      {/* Subtopic diamond */}
                      <button 
                        onClick={() => {
                          if (sub.resources) {
                            setSelectedSubnode({
                              name: sub.title,
                              color: sub.type === 'ai' ? 'red' : 'blue',
                              resources: sub.resources
                            });
                          } else {
                            alert(`Subtopic: ${sub.title}\n(Resources coming soon)`);
                          }
                        }}
                        className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rotate-45 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg md:shadow-xl transition-all hover:scale-110
                        ${sub.type === 'ai' 
                          ? 'bg-red-500 dark:bg-red-600' 
                          : 'bg-blue-500 dark:bg-blue-600'}
                      `}>
                        <span className="-rotate-45 text-white font-black text-[10px] sm:text-xs md:text-sm text-center px-1 sm:px-2 leading-tight">
                          {sub.title}
                        </span>
                      </button>

                      {/* Resource icons box — now uses CSS vars to match prof pages */}
                      <div
                        className="mt-2 sm:mt-3 md:mt-4 flex gap-1 sm:gap-1.5 md:gap-2 p-1.5 sm:p-2 md:p-3 rounded-lg md:rounded-xl shadow-sm md:shadow-md"
                        style={{
                          background: "var(--cn-card)",
                          border: "1px solid var(--cn-border)",
                        }}
                      >
                        <button 
                          className="text-sm sm:text-base md:text-lg lg:text-xl hover:scale-125 transition-transform" 
                          title="Video"
                          onClick={(e) => { e.stopPropagation(); alert('Video resource'); }}
                        >📺</button>
                        <button 
                          className="text-sm sm:text-base md:text-lg lg:text-xl hover:scale-125 transition-transform" 
                          title="Article"
                          onClick={(e) => { e.stopPropagation(); alert('Article resource'); }}
                        >📖</button>
                        <button 
                          className="text-sm sm:text-base md:text-lg lg:text-xl hover:scale-125 transition-transform" 
                          title="Podcast"
                          onClick={(e) => { e.stopPropagation(); alert('Podcast resource'); }}
                        >🎧</button>
                        <button 
                          className="text-sm sm:text-base md:text-lg lg:text-xl font-bold hover:scale-125 transition-transform" 
                          title="Quiz - Skip if you pass!"
                          style={{ color: "#E63027" }}
                          onClick={(e) => { e.stopPropagation(); alert('Take quiz to skip this topic!'); }}
                        >Q</button>
                      </div>

                      {/* AI badge */}
                      {sub.type === 'ai' && (
                        <div
                          className="mt-1.5 sm:mt-2 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "#E6302718", color: "#E63027" }}
                        >
                          AI suggested
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BRIDGE TO NEXT TOPIC — yellow faded, matches connector */}
            {index < KOTLIN_UNI_PATH.length - 1 && (
              <div
                className="w-0.5 sm:w-1 h-10 sm:h-14 md:h-16 my-4 sm:my-6 rounded-full"
                style={{ background: "#F5C51850" }}
              />
            )}
          </div>
        ))}
      </main>

      {/* SYLLABUS DRAWER — restyled to match prof pages */}
      {isSyllabusOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setSyllabusOpen(false)} 
          />
          <div
            className="relative w-full sm:w-96 h-full p-4 sm:p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto"
            style={{ background: "var(--cn-card)", borderLeft: "1px solid var(--cn-border)" }}
          >
            <h2
              className="font-black text-xl sm:text-2xl mb-4 sm:mb-6 uppercase"
              style={{ color: "var(--cn-text)" }}
            >
              Course Syllabus
            </h2>

            {/* Overall progress — yellow bar, matches rest of app */}
            <div
              className="mb-6 sm:mb-8 p-3 sm:p-4 rounded-xl"
              style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}
            >
              <p
                className="text-xs sm:text-sm font-semibold mb-2"
                style={{ color: "var(--cn-muted)" }}
              >
                Overall Progress
              </p>
              <div className="flex items-center gap-2 sm:gap-3">
                <div
                  className="flex-1 h-2 sm:h-3 rounded-full overflow-hidden"
                  style={{ background: "var(--cn-border)" }}
                >
                  <div
                    className="h-full transition-all rounded-full"
                    style={{ width: `${overallProgress}%`, background: "#F5C518" }}
                  />
                </div>
                <span
                  className="text-base sm:text-lg font-bold"
                  style={{ color: "var(--cn-text)" }}
                >
                  {overallProgress}%
                </span>
              </div>
            </div>

            {/* Topic list */}
            <div className="space-y-5 sm:space-y-6">
              {KOTLIN_UNI_PATH.map(p => (
                <div
                  key={p.id}
                  className="pb-4 sm:pb-6 border-b"
                  style={{ borderColor: "var(--cn-border)" }}
                >
                  <button
                    onClick={() => { setActiveId(p.id); setSyllabusOpen(false); }}
                    className="text-xs sm:text-sm uppercase transition-all w-full text-left mb-2 font-bold"
                    style={{ color: activeId === p.id ? "#3A9E3F" : "#1E6FFF" }}
                  >
                    {p.title}
                    {p.progress && (
                      <span className="ml-2 text-[10px] opacity-75">
                        ({p.progress.completed}/{p.progress.total})
                      </span>
                    )}
                  </button>

                  <p
                    className="text-[10px] sm:text-xs mb-3 leading-relaxed"
                    style={{ color: "var(--cn-muted)" }}
                  >
                    {p.description}
                  </p>

                  <div
                    className="pl-3 sm:pl-4 border-l-2 space-y-2"
                    style={{ borderColor: "var(--cn-border)" }}
                  >
                    {p.subnodes.map(s => (
                      <div key={s.id}>
                        <div className="flex items-center gap-1.5">
                          {s.status === 'completed' && <span className="text-xs" style={{ color: "#3A9E3F" }}>✓</span>}
                          {s.status === 'current' && <span className="text-xs" style={{ color: "#1E6FFF" }}>→</span>}
                          {s.status === 'locked' && <span className="text-xs" style={{ color: "var(--cn-muted)" }}>🔒</span>}
                          <span
                            className="text-xs sm:text-sm font-bold"
                            style={{ color: s.type === 'ai' ? "#E63027" : "#1E6FFF" }}
                          >
                            {s.title}
                          </span>
                        </div>
                        
                        {s.subsubnodes && s.subsubnodes.length > 0 && (
                          <div className="ml-5 mt-1 space-y-0.5">
                            {s.subsubnodes.map(ss => (
                              <p
                                key={ss.id}
                                className="text-[9px] sm:text-[10px] flex items-center gap-1"
                                style={{ color: "var(--cn-muted)" }}
                              >
                                {ss.status === 'completed' && <span style={{ color: "#3A9E3F" }}>•</span>}
                                {ss.status === 'current' && <span style={{ color: "#1E6FFF" }}>•</span>}
                                {ss.status === 'locked' && <span style={{ color: "var(--cn-muted)" }}>•</span>}
                                {ss.title}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend — matches prof page card style */}
            <div
              className="mt-6 sm:mt-8 p-3 sm:p-4 rounded-xl space-y-2 text-xs sm:text-sm"
              style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}
            >
              <p className="font-bold mb-2" style={{ color: "var(--cn-text)" }}>Legend:</p>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded shrink-0"></div>
                <span className="text-[10px] sm:text-xs" style={{ color: "var(--cn-muted)" }}>Main topics</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded shrink-0" style={{ background: "#1E6FFF" }}></div>
                <span className="text-[10px] sm:text-xs" style={{ color: "var(--cn-muted)" }}>Prof-chosen subtopics</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded shrink-0" style={{ background: "#E63027" }}></div>
                <span className="text-[10px] sm:text-xs" style={{ color: "var(--cn-muted)" }}>AI-suggested</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resource Panel */}
      {selectedSubnode && (
        <NodeDetailPanel
          isOpen={!!selectedSubnode}
          onClose={() => setSelectedSubnode(null)}
          nodeName={selectedSubnode.name}
          nodeColor={selectedSubnode.color}
          resources={selectedSubnode.resources}
        />
      )}
    </div>
  );
}