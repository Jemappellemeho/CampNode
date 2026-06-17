import { useState } from 'react';
import { X, Search, BookOpen, Plus, FileText, Globe, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

interface TopicDraft {
  clientId: string;
  mode: 'wikidata' | 'manual';
  label: string;
  description?: string;
  wikidataId?: string;
  sourceUrl?: string;
  file?: File | null;
}

function makeClientId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CreateCourseModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  
  // Step 1: Basic info (Title, description, public/private)
  // Step 2: Adding topics and sources
  const [step, setStep] = useState(1);
  const [course, setCourse] = useState({ title: '', description: '', isPublic: true });
  
  // 'wikidata' lets them search Wikipedia-style databases. 'manual' lets them upload a PDF or paste a link.
  const [searchMode, setSearchMode] = useState<'wikidata' | 'manual'>('wikidata');
  
  // State for the Wikidata search bar
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  
  // The final list of topics the user has chosen to include in their course
  const [topics, setTopics] = useState<TopicDraft[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State for manual topic entry
  const [manualTopic, setManualTopic] = useState({ name: '', description: '', sourceUrl: '' });
  const [manualFile, setManualFile] = useState<File | null>(null);
  const wikidataLanguage = 'en';

  if (!isOpen) return null;

  // ============================================================================
  // WIKIDATA SEARCH LOGIC
  // ============================================================================
  // Sends a request to our backend to search the Wikidata database for topics
  const searchWiki = async (query: string) => {
    setSearch(query);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    try {
      const res = await api.get(`/wiki/search?q=${query}`);
      setResults(res.data || []);
    } catch (error) {
      console.error('Wikidata search failed', error);
    }
  };

  // Adds a clicked Wikidata result into the user's list of chosen topics
  const addWikidataTopic = (item: any) => {
    setTopics((prev) => {
      // Don't add it twice if they already clicked it
      if (prev.some((topic) => topic.wikidataId === item.id)) return prev;
      return [
        ...prev,
        {
          clientId: makeClientId(),
          mode: 'wikidata',
          label: item.label,
          description: item.description || '',
          wikidataId: item.id,
        },
      ];
    });
    // Clear the search bar after adding
    setSearch('');
    setResults([]);
  };

  // ============================================================================
  // MANUAL UPLOAD LOGIC
  // ============================================================================
  // Adds a custom topic (with a PDF or URL) into the user's list of chosen topics
  const addManualTopic = () => {
    if (!manualTopic.name.trim()) return;

    setTopics((prev) => [
      ...prev,
      {
        clientId: makeClientId(),
        mode: 'manual',
        label: manualTopic.name.trim(),
        description: manualTopic.description.trim(),
        sourceUrl: manualTopic.sourceUrl.trim(),
        file: manualFile,
      },
    ]);

    // Reset the manual entry form
    setManualTopic({ name: '', description: '', sourceUrl: '' });
    setManualFile(null);
  };

  // Removes a topic from the list if the user clicks the "X"
  const removeTopic = (clientId: string) => {
    setTopics((prev) => prev.filter((topic) => topic.clientId !== clientId));
  };

  // ============================================================================
  // SAVE / CREATE COURSE
  // ============================================================================
  // This sends everything to the backend to actually create the course and its nodes.
  const saveCourse = async () => {
    if (!course.title.trim()) {
      alert('Enter a course title.');
      return;
    }

    if (topics.length === 0) {
      alert('Add at least one topic or source.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create the empty course shell first
      const courseRes = await api.post('/courses', {
        title: course.title.trim(),
        description: course.description.trim(),
        isPublic: course.isPublic,
      });

      const newCourseId = courseRes.data.course?.id || courseRes.data.id;

      // 2. Add each topic to the new course, one by one
      for (let index = 0; index < topics.length; index += 1) {
        const topic = topics[index];

        if (topic.mode === 'wikidata') {
          // If it's a Wikidata topic, just send the ID and the backend will fetch the data
          await api.post(`/courses/${newCourseId}/topics`, {
            name: topic.label,
            description: topic.description || '',
            wikidataId: topic.wikidataId,
            order: index,
            language: wikidataLanguage,
          });
          continue;
        }

        // If it's a manual upload, we have to send it as a FormData object so the PDF file goes through
        const formData = new FormData();
        formData.append('name', topic.label);
        formData.append('description', topic.description || '');
        formData.append('order', String(index));
        if (topic.sourceUrl) formData.append('sourceUrl', topic.sourceUrl);
        if (topic.file) formData.append('pdf', topic.file);

        // Content-Type header is not needed — axios sets it automatically for FormData
        await api.post(`/courses/${newCourseId}/topics`, formData);
      }

      // 3. Close the modal and take the user to their shiny new course dashboard
      onCreated?.();
      navigate(`/prof/course/${newCourseId}`);
    } catch (error: any) {
      console.error('Create course failed', error);
      alert(error.response?.data?.error || 'Could not create course.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // MAIN RENDER (THE SCREEN UI)
  // ============================================================================
  return (
    // The dark transparent background behind the modal
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      
      {/* The white modal box itself */}
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b px-6 py-5 dark:border-gray-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Teacher Mode</p>
            <h2 className="text-2xl font-black dark:text-white">
              {step === 1 ? 'Create Course' : 'Add Topics And Sources'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {/* -------------------------------------------------------------------------
              STEP 1: Basic Course Info (Title, Public/Private, Description)
          ------------------------------------------------------------------------- */}
          {step === 1 ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Course Title Input */}
                <input
                  value={course.title}
                  onChange={(e) => setCourse((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Course title"
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                
                {/* Public / Private Toggle Buttons */}
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setCourse((prev) => ({ ...prev, isPublic: true }))}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-all ${course.isPublic ? 'bg-white text-green-600 shadow-sm dark:bg-gray-700' : 'text-gray-500'}`}
                  >
                    <span className="inline-flex items-center gap-2"><Globe size={16} /> Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCourse((prev) => ({ ...prev, isPublic: false }))}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 ${!course.isPublic ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700' : 'text-gray-500'}`}
                  >
                    <Lock size={16} /> Private
                  </button>
                </div>
              </div>

              {/* Course Description Textarea */}
              <textarea
                value={course.description}
                onChange={(e) => setCourse((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What should students learn in this course?"
                className="min-h-32 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            </div>
            
          // -------------------------------------------------------------------------
          //    STEP 2: Add Topics (Wikidata Search or Manual Upload)
          // -------------------------------------------------------------------------
          ) : (
            <div className="space-y-6">
              
              {/* Header for Step 2 */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold dark:text-white">Course sources</p>
                  <p className="text-xs text-gray-500">Use Wikidata or upload your own material so Gemini can generate quizzes from real content.</p>
                </div>
                
                {/* Toggle between Wikidata search and Manual Upload */}
                <div className="flex rounded-2xl bg-gray-100 p-1 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setSearchMode('wikidata')}
                    className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${searchMode === 'wikidata' ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700' : 'text-gray-500'}`}
                  >
                    Wikidata
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode('manual')}
                    className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${searchMode === 'manual' ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700' : 'text-gray-500'}`}
                  >
                    URL / PDF
                  </button>
                </div>
              </div>

              {/* -------------------------------------------------------------------------
                  WIKIDATA SEARCH PANEL
              ------------------------------------------------------------------------- */}
              {searchMode === 'wikidata' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-3.5 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => searchWiki(e.target.value)}
                      placeholder="Search a topic in Wikidata"
                      className="w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>

                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {results.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => addWikidataTopic(result)}
                        className="flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        <div>
                          <p className="font-bold dark:text-white">{result.label}</p>
                          <p className="text-xs text-gray-500">{result.description}</p>
                        </div>
                        <Plus size={16} className="mt-1 text-blue-600" />
                      </button>
                    ))}
                  </div>
                </div>
                
              // -------------------------------------------------------------------------
              //    MANUAL UPLOAD PANEL (Paste URL or Upload PDF)
              // -------------------------------------------------------------------------
              ) : (
                <div className="rounded-3xl border p-5 dark:border-gray-700">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={manualTopic.name}
                      onChange={(e) => setManualTopic((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Topic name"
                      className="rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <input
                      value={manualTopic.description}
                      onChange={(e) => setManualTopic((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Short description"
                      className="rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                    <input
                      value={manualTopic.sourceUrl}
                      onChange={(e) => setManualTopic((prev) => ({ ...prev, sourceUrl: e.target.value }))}
                      placeholder="https://your-site-or-docs-page"
                      className="rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400">or</p>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-bold text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:hover:border-blue-500">
                      <FileText size={16} />
                      <span>{manualFile ? manualFile.name : 'Upload PDF'}</span>
                      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setManualFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={addManualTopic}
                      className="rounded-2xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-blue-700"
                    >
                      Add Source
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------------------
                  SELECTED TOPICS LIST (Shows everything the user has picked so far)
              ------------------------------------------------------------------------- */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">Selected Items</p>
                <div className="max-h-64 space-y-3 overflow-y-auto">
                  {topics.map((topic) => (
                    <div key={topic.clientId} className="rounded-2xl border p-4 dark:border-gray-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 font-bold dark:text-white">
                            <BookOpen size={16} className="text-blue-600" />
                            {topic.label}
                          </p>
                          {topic.description ? <p className="mt-1 text-xs text-gray-500">{topic.description}</p> : null}
                          <p className="mt-2 text-[11px] font-semibold text-gray-400">
                            {topic.mode === 'wikidata'
                              ? `Wikidata: ${topic.wikidataId}`
                              : topic.file
                                ? `PDF: ${topic.file.name}`
                                : topic.sourceUrl || 'Manual source'}
                          </p>
                        </div>
                        <button onClick={() => removeTopic(topic.clientId)} className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800">
                          <X size={16} />
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {/* -------------------------------------------------------------------------
                  FINAL ACTION BUTTONS (Back or Create Course)
              ------------------------------------------------------------------------- */}
              <div className="flex items-center justify-between gap-3 border-t pt-5 dark:border-gray-800">
                <button onClick={() => setStep(1)} className="rounded-2xl px-5 py-3 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
                  Back
                </button>
                <button
                  onClick={saveCourse}
                  disabled={loading}
                  className="rounded-2xl bg-green-600 px-6 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
