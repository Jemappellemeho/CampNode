// CreateCourseModal is a two-step modal for professors:
// Step 1— enter course title and description
// Step 2— search Wikidata and select topics to attach to the course

import { useState } from 'react';
import axios from 'axios';
import { X, Search, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CreateCourseModal({ isOpen, onClose}: any) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ title: '', description: '', isPublic: true, topics: [] as any[] });

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

  // Add a topic to the selection list, ignoring duplicates, and fetch DBpedia subtopics
  const addTopic = async (topic: any) => {
    if (!data.topics.find((t: any) => t.id === topic.id)) {
      const newTopic = { ...topic, subtopicsMap: {}, loadingSubtopics: true, allSubtopics: [] };
      setData((prev) => ({ ...prev, topics: [...prev.topics, newTopic] }));
      setResults([]);
      setSearch('');

      // Fetch DBpedia suggestions
      try {
        const res = await axios.get(`http://localhost:3000/api/wiki/suggestions/${topic.id}?lang=${language}`);
        setData((prev) => {
          const map: any = {};
          // Select first 3 by default to save time
          res.data.forEach((s: any, i: number) => { map[s.uri] = i < 3; });
          const updatedTopics = prev.topics.map(t => 
            t.id === topic.id ? { ...t, loadingSubtopics: false, allSubtopics: res.data, subtopicsMap: map } : t
          );
          return { ...prev, topics: updatedTopics };
        });
      } catch (e) {
        setData((prev) => ({
          ...prev, topics: prev.topics.map(t => t.id === topic.id ? { ...t, loadingSubtopics: false } : t)
        }));
      }
    } else {
      setResults([]);
      setSearch('');
    }
  };

  // Remove a topic from the selection before saving
  const removeTopic = (topicId: string) => {
    setData({ ...data, topics: data.topics.filter((t: any) => t.id !== topicId) });
  };

  // Toggle a specific subtopic for a specific topic
  const toggleSubtopic = (topicId: string, subUri: string) => {
    setData((prev) => {
      const updatedTopics = prev.topics.map(t => {
        if (t.id === topicId) {
          return { ...t, subtopicsMap: { ...t.subtopicsMap, [subUri]: !t.subtopicsMap[subUri] } };
        }
        return t;
      });
      return { ...prev, topics: updatedTopics };
    });
  };


  // 1. POST /api/courses  — creates the course, returns the new courseId
  // 2. POST /api/topics   — creates one topic per selected Wikidata entry
  // After saving, redirects the professor directly to the course management page.
  const saveCourse = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      const courseRes = await axios.post('http://localhost:3000/api/courses', 
        { title: data.title, description: data.description, isPublic: data.isPublic },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const newCourseId = courseRes.data.course.id;

      for (let i = 0; i < data.topics.length; i++) {
        const topic = data.topics[i];
        console.log("Saving topic:", topic);
        const savedTopicRes = await axios.post('http://localhost:3000/api/courses/' + newCourseId + '/topics',
          {
            name: topic.label,
            description: topic.description || "",
            order: i,
            aiSuggested: false,
            wikidataId: topic.id
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Save selected subtopics
        const parentId = savedTopicRes.data.id;
        let subOrder = 0;
        for (const sub of topic.allSubtopics || []) {
          if (topic.subtopicsMap[sub.uri]) {
            await axios.post('http://localhost:3000/api/courses/' + newCourseId + '/topics',
              {
                name: sub.label,
                description: "",
                parentTopicId: parentId,
                order: subOrder++,
                aiSuggested: true // Mark DBpedia suggestions as AI
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        }
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

              {/* Public / Private toggle */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Visibility</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setData({...data, isPublic: true})}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${data.isPublic ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-400 dark:border-gray-600'}`}
                  >
                    🌐 Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setData({...data, isPublic: false})}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${!data.isPublic ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-400 dark:border-gray-600'}`}
                  >
                    🔒 Private
                  </button>
                </div>
              </div>

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

              {/* Selected topics shown with subtopics checklist */}
              <div className="flex flex-col gap-3 pt-2 max-h-60 overflow-y-auto">
                {data.topics.map((t: any) => (
                  <div key={t.id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-blue-700 dark:text-blue-300 font-bold flex items-center gap-2">
                        <BookOpen size={16} /> {t.label} 
                        {t.loadingSubtopics && <span className="text-[10px] text-gray-400 font-normal">Loading DBpedia...</span>}
                      </span>
                      <button onClick={() => removeTopic(t.id)} className="text-gray-400 hover:text-red-500">
                        <X size={16} />
                      </button>
                    </div>

                    {t.allSubtopics && t.allSubtopics.length > 0 && (
                      <div className="pl-6 border-l-2 border-gray-200 dark:border-gray-700 ml-2 space-y-1 mt-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">DBpedia Subtopics</p>
                        {t.allSubtopics.map((sub: any) => (
                           <label key={sub.uri} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:text-black dark:hover:text-white">
                             <input 
                               type="checkbox" 
                               className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                               checked={t.subtopicsMap[sub.uri] || false}
                               onChange={() => toggleSubtopic(t.id, sub.uri)}
                             />
                             {sub.label}
                           </label>
                        ))}
                      </div>
                    )}
                  </div>
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