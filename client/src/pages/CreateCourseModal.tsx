// CreateCourseModal is a two-step modal for professors:
// Step 1— enter course title and description
// Step 2— search Wikidata and select topics to attach to the course

import { useState } from 'react';
import axios from 'axios';
import { X, Search, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CreateCourseModal({ isOpen, onClose, onCreated }: any) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ title: '', description: '', topics: [] as any[] });

  // Language preference stored here but currently only used as UI context —
  // the actual article language is chosen at read time via ?lang= query param
  const [language, setLanguage] = useState<'en' | 'de'>('en');
   
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Waits for more than 2 characters to avoid unnecessary API calls.
  const searchWiki = async (q: string) => {
    setSearch(q);
    if (q.length > 2) {
      const res = await axios.get(`http://localhost:3000/api/wiki/search?q=${q}`);
      setResults(res.data);
    }
  };

  // Add a topic to the selection list, ignoring duplicates.
  const addTopic = (topic: any) => {
    if (!data.topics.find((t: any) => t.id === topic.id)) {
      setData({ ...data, topics: [...data.topics, topic] });
    }
    setResults([]);
    setSearch('');
  };

  // Remove a topic from the selection before saving
  const removeTopic = (topicId: string) => {
    setData({ ...data, topics: data.topics.filter((t: any) => t.id !== topicId) });
  };


  // 1. POST /api/courses  — creates the course, returns the new courseId
  // 2. POST /api/topics   — creates one topic per selected Wikidata entry
  // After saving, redirects the professor directly to the course management page.
  const saveCourse = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      const courseRes = await axios.post('http://localhost:3000/api/courses', 
        { title: data.title, description: data.description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const newCourseId = courseRes.data.course.id;

      for (const topic of data.topics) {
        console.log("Saving topic:", topic);
        await axios.post('http://localhost:3000/api/topics',
          {
            name: topic.label,
            courseId: newCourseId,
            wikidataId: topic.id,
            description: topic.description || "",
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      navigate(`/prof/course/${newCourseId}`); 
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Don't render anything when the modal is closed
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border dark:border-gray-800">
        
        {/* Modal header — title changes based on current step */}
        <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-bold dark:text-white">
            {step === 1 ? "Create New Course" : "Add Topics"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full dark:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {step === 1 ? (
            // Step 1: Course title and description
            <div className="space-y-4">
              <input className="w-full px-4 py-3 rounded-xl border dark:border-gray-700 dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="Course Title" onChange={e => setData({...data, title: e.target.value})} />
              <textarea className="w-full px-4 py-3 rounded-xl border dark:border-gray-700 dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="What will students learn?" onChange={e => setData({...data, description: e.target.value})} />
              <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all">
                Next Step
              </button>
            </div>
          ) : (

            // Step 2: Wikidata topic search and selection
            <div className="space-y-4">
              {/* Search input with icon */}
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input className="w-full pl-10 pr-4 py-3 rounded-xl border dark:border-gray-700 dark:bg-gray-800 dark:text-white" 
                  placeholder="Search Wikidata..." value={search} onChange={e => searchWiki(e.target.value)} />
              </div>

              {/* Language preference for the course — informational only at this stage */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${language === 'en' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 dark:text-gray-200'}`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('de')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${language === 'de' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 dark:text-gray-200'}`}
                >
                  German
                </button>
              </div>
              
              {/* Wikidata search results dropdown */}
              <div className="max-h-40 overflow-y-auto space-y-2">
                {results.map(r => (
                  <button key={r.id} onClick={() => addTopic(r)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300">
                    <span className="font-semibold">{r.label}</span>
                    <p className="text-xs text-gray-500">{r.description}</p>
                  </button>
                ))}
              </div>

              {/* Selected topics shown as removable pills */}
              <div className="flex flex-wrap gap-2 pt-2">
                {data.topics.map((t: any) => (
                  <span key={t.id} className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                    <BookOpen size={12} /> {t.label}
                    <button onClick={() => removeTopic(t.id)} className="ml-1 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>

              <button 
                onClick={saveCourse} 
                disabled={loading}
                className={`w-full py-3 rounded-xl font-bold transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
              >
                {loading ? "Creating..." : "Finish & Create"}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Selected language controls which full Wikipedia article version gets stored for each topic.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}