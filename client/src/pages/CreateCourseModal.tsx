import { useState } from 'react';
import axios from 'axios';
import { X, Search, BookOpen, ChevronRight } from 'lucide-react';

export default function CreateCourseModal({ isOpen, onClose, onCreated }: any) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ title: '', description: '', topics: [] as any[] });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const searchWiki = async (q: string) => {
    setSearch(q);
    if (q.length > 2) {
      const res = await axios.get(`http://localhost:3000/api/wiki/search?q=${q}`);
      setResults(res.data);
    }
  };

  const addTopic = (topic: any) => {
    if (!data.topics.find((t: any) => t.id === topic.id)) {
      setData({ ...data, topics: [...data.topics, topic] });
    }
    setResults([]);
    setSearch('');
  };

  const removeTopic = (topicId: string) => {
    setData({ ...data, topics: data.topics.filter((t: any) => t.id !== topicId) });
  };

    const saveCourse = async () => {
    if (loading) return; // Verhindert Doppelklicks
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      // 1. Kurs erstellen
      const courseRes = await axios.post('http://localhost:3000/api/courses', 
        { title: data.title, description: data.description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // 2. Themen einzeln speichern
      for (const topic of data.topics) {
        await axios.post(
          'http://localhost:3000/api/topics',
          {
              name: topic.label,
              courseId: courseRes.data.course.id,
              wikidataId: topic.id,
              description: topic.description || ""
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      onCreated(); // Modal schließen und Dashboard aktualisieren
    } catch (err: any) {
      console.error("Fehler beim Erstellen:", err);
      alert("Fehler beim Erstellen: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border dark:border-gray-800">
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
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input className="w-full pl-10 pr-4 py-3 rounded-xl border dark:border-gray-700 dark:bg-gray-800 dark:text-white" 
                  placeholder="Search Wikidata..." value={search} onChange={e => searchWiki(e.target.value)} />
              </div>
              
              <div className="max-h-40 overflow-y-auto space-y-2">
                {results.map(r => (
                  <button key={r.id} onClick={() => addTopic(r)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300">
                    <span className="font-semibold">{r.label}</span>
                    <p className="text-xs text-gray-500">{r.description}</p>
                  </button>
                ))}
              </div>

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}