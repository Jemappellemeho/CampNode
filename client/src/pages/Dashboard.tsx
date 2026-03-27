import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateCourseModal from './CreateCourseModal';
import { BookOpen, Users, Plus, Copy, Check, ChevronRight } from "lucide-react";

// JoinCodeBadge remains identical to your original
function JoinCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-mono transition-colors hover:bg-gray-200">
      {code} {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  
  // 1. IMPROVED STATE: Load user immediately and strictly
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const [courses, setCourses] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // 2. BULLETPROOF NAME LOGIC
  // If user.name is missing (common for students), use email prefix. 
  // If email is missing, use "Student" or "Professor" based on role.
  const displayName = user?.name || 
                      user?.email?.split('@')[0] || 
                      (user?.role === 'STUDENT' ? 'Student' : 'Professor');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchCourses();
    }
  }, [user, navigate]);

  const fetchCourses = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get('http://localhost:3000/api/courses/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourses(res.data);
    } catch (err: any) { 
      if (err.response?.status >= 400) {
        localStorage.clear();
        navigate('/login');
      }
    }
  };

  const handleJoinCourse = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post('http://localhost:3000/api/courses/join', 
        { joinCode }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setJoinCode('');
      fetchCourses();
      alert("Successfully enrolled!");
    } catch (err) { alert("Invalid join code or already enrolled."); }
  };

  if (!user) return null;

  return (
    <>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="flex justify-between items-center mb-8">
          <div>
            {/* FIXED: Using the new displayName variable */}
            <h1 className="text-3xl font-bold dark:text-white">Welcome, {displayName}</h1>
            <p className="text-gray-500">
              {user.role === 'PROFESSOR' ? 'Manage your teaching environment' : 'Continue your learning journey'}
            </p>
          </div>
          
          {user.role === 'PROFESSOR' && (
            <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all">
              <Plus size={20} /> Create Course
            </button>
          )}
        </div>

        {/* Student Enrollment UI */}
        {user.role === 'STUDENT' && (
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl mb-8 text-white flex flex-col md:flex-row items-center gap-4 shadow-lg">
            <div className="flex-1">
              <h3 className="text-lg font-bold">Join a New Course</h3>
              <p className="opacity-80 text-sm">Enter the invitation code from your teacher.</p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <input 
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Ex: WEB-1192"
                className="px-4 py-2 rounded-xl text-gray-900 outline-none w-full md:w-48"
              />
              <button onClick={handleJoinCourse} className="bg-white text-blue-600 px-6 py-2 rounded-xl font-bold hover:bg-gray-100 transition-all">
                Join
              </button>
            </div>
          </div>
        )}

        {/* Courses Grid */}
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-700">
            <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
              <BookOpen size={40} className="text-blue-500" />
            </div>
            <h3 className="text-xl font-bold dark:text-white mb-2">No courses found</h3>
            <p className="text-gray-500 text-sm max-w-xs text-center mb-8">
              {user.role === 'PROFESSOR' 
                ? "Start your teaching journey by creating your first course." 
                : "You haven't joined any courses yet. Use a join code to get started."}
            </p>
            {user.role === 'PROFESSOR' && (
              <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all">
                  Create Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(course => (
              <div key={course.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-4 group hover:shadow-md transition-all">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-xl dark:text-white">{course.title}</h3>
                  {user.role === 'PROFESSOR' && <JoinCodeBadge code={course.joinCode} />}
                </div>
                
                <p className="text-gray-500 text-sm line-clamp-2">{course.description}</p>
                
                {user.role === 'PROFESSOR' && (
                  <div className="flex gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1.5" title="Students">
                      <Users size={16} className="text-blue-500" /> 
                      {course._count?.students ?? 0}
                    </span>
                    <span className="flex items-center gap-1.5" title="Topics">
                      <BookOpen size={16} className="text-indigo-500" />
                      {course._count?.topics ?? 0}
                    </span>
                  </div>
                )}

                <button
                  onClick={() =>
                    user.role === 'PROFESSOR'
                      ? navigate(`/prof/course/${course.id}`)
                      : navigate(`/playground/${course.id}`)
                  }
                  className="mt-auto w-full py-2 bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-400 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-100 transition-all"
                >
                  {user.role === 'PROFESSOR' ? 'Manage' : 'Open Course'} <ChevronRight size={16}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <CreateCourseModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onCreated={() => { setIsModalOpen(false); fetchCourses(); }} 
        />
      </div>
    </>
  );
}