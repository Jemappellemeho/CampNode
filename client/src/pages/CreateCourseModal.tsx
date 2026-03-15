import { useState } from 'react';
import axios from 'axios';
import { X, Search, BookOpen, ChevronRight } from 'lucide-react';

export default function CreateCourseModal({ isOpen, onClose, onCreated }: any) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ title: '', description: '', topics: [] as any[] });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);

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

  const saveCourse = async () => {
    const token = localStorage.getItem('token');
    const courseRes = await axios.post('http://localhost:3000/api/courses', 
      { title: data.title, description: data.description },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    for (const topic of data.topics) {
      await axios.post(
        'http://localhost:3000/api/topics',
        {
            name: topic.label,
            courseId: courseRes.data.course.id,
            wikidataId: topic.id,
        },
        {
            headers: { Authorization: `Bearer ${token}` }
        }
    );
    }
    onCreated();
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
                  </span>
                ))}
              </div>

              <button onClick={saveCourse} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-all">
                Finish & Create
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}