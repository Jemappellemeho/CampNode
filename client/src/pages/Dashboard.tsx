import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateCourseModal from './CreateCourseModal';
import { api } from '../utils/api';
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Flame,
  Globe,
  GraduationCap,
  Lock,
  LogOut,
  Plus,
  Search,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import AiChatCompanion from '../components/AiChatCompanion';
import GuideOverlay from '../components/GuideOverlay';
import { hasSeenGuide, markGuideSeen } from '../utils/guideSession';
import { getLearningActivityStats } from '../utils/learningTime';

function JoinCodeBadge({ code, isPublic }: { code: string; isPublic: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black tracking-wide text-white transition-colors shadow-sm ${copied || isPublic ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1">
          <Check size={14} /> Copied
        </span>
      ) : (
        <>
          <span>{code}</span>
          <Copy size={14} className="opacity-80" />
        </>
      )}
    </button>
  );
}

const CN = {
  blue: "#1E6FFF",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

export default function Dashboard() {
  const navigate = useNavigate();

  // ============================================================================
  // USER STATE
  // ============================================================================
  // We grab the user from the browser's local storage so they stay logged in 
  // even if they refresh the page. If there is no user, they are redirected.
  const [user] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  // ============================================================================
  // APPLICATION STATE
  // ============================================================================
  // 'courses' holds the list of all courses the user is part of (as a student or professor).
  const [courses, setCourses] = useState<any[]>([]);
  
  // 'courseProgress' keeps track of how many topics the student has finished in each course.
  const [courseProgress, setCourseProgress] = useState<Record<string, { completed: number; total: number; percent: number }>>({});
  
  // Controls whether the "Create New Course" pop-up is visible on the screen.
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Stores the 8-character invite code a student types into the join box.
  const [joinCode, setJoinCode] = useState('');
  
  // Keeps track of which public course the student is currently trying to leave (shows a loading state).
  const [leavingCourseId, setLeavingCourseId] = useState<string | null>(null);
  
  // Controls the visibility of the visual "how-to" guide that points to different parts of the screen.
  const [showGuide, setShowGuide] = useState(false);
  
  // Holds the text the user types into the search bar to filter their courses.
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tracks how many consecutive days the student has studied (streak) and how many minutes they spent today.
  const [learningActivity, setLearningActivity] = useState({ streak: 0, todayMinutes: 0 });
  
  // Determines which course the AI chat companion at the bottom of the screen should focus on.
  const [aiCourseId, setAiCourseId] = useState('');

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================
  // Figure out what name to show at the top of the dashboard. We prefer their actual name, 
  // but fall back to the first part of their email, or just their role if all else fails.
  const displayName =
    user?.name ||
    user?.email?.split('@')[0] ||
    (user?.role === 'STUDENT' ? 'Student' : 'Professor');

  // A simple shortcut variable so we don't have to keep writing "user?.role === 'PROFESSOR'" everywhere.
  const isProfessor = user?.role === 'PROFESSOR';

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  // This is the main function that fetches all the data needed for the dashboard.
  // It reaches out to the server, grabs the courses, and if the user is a student, 
  // it also grabs their progress to see how far along they are.
  const fetchCourses = async () => {
    try {
      // Step 1: Ask the server for the courses belonging to this user
      const res = await api.get('/courses/me');
      const nextCourses = res.data;
      setCourses(nextCourses);

      // Step 2: If they are a student, we also need to know how many topics they've completed
      if (user?.role === 'STUDENT') {
        try {
          // Ask the server for the progress records
          const progressRes = await api.get('/progress');
          
          // Group the completed topics by their course ID.
          // This gives us an object like: { "courseId1": 5, "courseId2": 12 }
          const completedByCourse = progressRes.data.reduce((acc: Record<string, number>, item: any) => {
            const courseId = item.topic?.courseId;
            if (courseId && item.completed) acc[courseId] = (acc[courseId] || 0) + 1;
            return acc;
          }, {});

          // Now, loop through the courses and calculate the exact percentage completed for each one.
          const nextProgress = nextCourses.reduce((acc: Record<string, { completed: number; total: number; percent: number }>, course: any) => {
            const total = course._count?.topics ?? 0;
            const completed = Math.min(completedByCourse[course.id] || 0, total);
            acc[course.id] = {
              completed,
              total,
              percent: total > 0 ? Math.round((completed / total) * 100) : 0,
            };
            return acc;
          }, {});

          // Save the math we just did into the state variable so the screen can update
          setCourseProgress(nextProgress);
        } catch {
          // If the progress fails to load, just default to an empty object to avoid crashing
          setCourseProgress({});
        }
      } else {
        // Professors don't track progress, so they get an empty object
        setCourseProgress({});
      }
    } catch (err: any) {
      // If fetching the courses fails with a 400+ error, it likely means the user's 
      // login session expired. Kick them out to the login screen.
      if (err.response?.status >= 400) {
        localStorage.removeItem('user');
        navigate('/login');
      }
    }
  };

  // ============================================================================
  // SIDE EFFECTS (useEffect)
  // ============================================================================
  
  // Effect 1: Security check on load.
  // When the dashboard first opens, check if there is a logged-in user.
  // If not, redirect them. If yes, fetch their data.
  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchCourses();
    }
  }, [user, navigate]);

  // Effect 2: Onboarding Guide check.
  // We don't want to spam the user with tutorials. We check if they've seen the 
  // dashboard guide before. If they haven't, we show it to them.
  useEffect(() => {
    if (user && !hasSeenGuide(user, 'dashboard')) {
      setShowGuide(true);
    }
  }, [user]);

  // Effect 3: Learning Activity check.
  // If the user is a student, we calculate how many days in a row they've studied 
  // and how many minutes they've spent learning today.
  useEffect(() => {
    if (user?.role === 'STUDENT') {
      setLearningActivity(getLearningActivityStats(user.id));
    }
  }, [user]);

  // Effect 4: AI Chat setup.
  // The AI chat at the bottom needs to be attached to a specific course.
  // By default, we select the very first course in their list.
  useEffect(() => {
    if (!aiCourseId && courses.length > 0) {
      setAiCourseId(courses[0].id);
    }
  }, [aiCourseId, courses]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  // Closes the onboarding guide and marks it as seen so it doesn't bother them again.
  const closeGuide = () => {
    markGuideSeen(user, 'dashboard');
    setShowGuide(false);
  };

  // Enrolls the user in a course using a teacher's join code.
  // Sends the join code to the server, and if successful, refreshes the course list.
  const handleJoinCourse = async () => {
    try {
      await api.post('/courses/join', { joinCode });
      setJoinCode('');
      fetchCourses();
      alert('Successfully enrolled!');
    } catch (err) {
      alert('Invalid join code or already enrolled.');
    }
  };

  // Allows the user to leave a public course they previously joined.
  // We use `leavingCourseId` to show a spinning wheel or disable the button so they don't click it twice.
  const handleLeavePublicCourse = async (courseId: string) => {
    setLeavingCourseId(courseId);
    try {
      await api.post(`/courses/${courseId}/leave-public`, {});
      // Refresh the screen to show the course is gone
      fetchCourses();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not leave this public course.');
    } finally {
      setLeavingCourseId(null);
    }
  };

  // ============================================================================
  // SEARCH & FILTERING
  // ============================================================================
  
  // Filters the list of courses based on the user's search query.
  // We use `useMemo` so we don't recalculate this list on every single screen paint,
  // only when `courses` or `searchQuery` actually changes.
  const filteredCourses = useMemo(() => {
    // Strip empty spaces and make everything lowercase for easy matching
    const normalized = searchQuery.trim().toLowerCase();
    
    // If the search box is empty, just show everything
    if (!normalized) return courses;
    
    // Check if the title, description, or join code contains the search word
    return courses.filter((course) => {
      return [course.title, course.description, course.joinCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [courses, searchQuery]);

  // ============================================================================
  // SUMMARY STATISTICS FOR THE TOP BANNER
  // ============================================================================
  // Calculate the total number of students across all courses (Professors)
  const totalStudents = courses.reduce((sum, course) => sum + (course._count?.students ?? 0), 0);
  
  // Calculate the total number of topics across all courses
  const totalTopics = courses.reduce((sum, course) => sum + (course._count?.topics ?? 0), 0);
  
  // Calculate how many topics the student has finished in total
  const completedTopics = Object.values(courseProgress).reduce((sum, progress) => sum + progress.completed, 0);
  
  // What percentage of all available topics has the student completed?
  const activePercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
  
  // Find the exact course object that the AI chat should be talking about
  const aiCourse = courses.find((course) => course.id === aiCourseId) || courses[0];

  // If we haven't loaded the user yet, don't try to draw the screen, just show nothing (or a loader)
  if (!user) return null;

  // ============================================================================
  // HELPER RENDERS
  // ============================================================================
  
  // A tiny helper that draws the little green "Public" or blue "Private" badge on a course card.
  const renderCourseStatus = (course: any) => (
    course.isPublic ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-green-600 dark:bg-green-900/30 dark:text-green-300">
        <Globe size={13} /> Public
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
        <Lock size={13} /> Private
      </span>
    )
  );

  // ============================================================================
  // MAIN RENDER (THE SCREEN UI)
  // ============================================================================


  // ============================================================================
  // MAIN RENDER (THE SCREEN UI)
  // ============================================================================

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
      {/* -------------------------------------------------------------------------
          HEADER SECTION: Welcome message and search/create actions
      ------------------------------------------------------------------------- */}
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Side: Welcome Text */}
        <div>
          <p className="mb-2 text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-gray-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-black leading-tight text-gray-950 dark:text-white sm:text-5xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 text-sm font-medium text-gray-500 sm:text-base">
            {isProfessor ? 'Manage your teaching environment' : 'Continue your learning journey'}
          </p>
        </div>

        {/* Right Side: Search Bar and Buttons */}
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          {/* Search Input */}
          <div className="relative min-w-0 flex-1 lg:w-80">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search courses..."
              className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 text-sm font-semibold text-gray-800 outline-none shadow-sm transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-blue-950"
            />
          </div>
          
          {/* Browse Public Courses Button */}
          <button
            onClick={() => {
              closeGuide();
              navigate('/courses/public');
            }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-green-600 shadow-sm transition hover:bg-gray-50"
          >
            <Globe size={18} /> Public Courses
          </button>
          
          {/* Create Course Button (Only for Professors) */}
          {isProfessor && (
            <button
              onClick={() => {
                closeGuide();
                setIsModalOpen(true);
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <Plus size={18} /> Create Course
            </button>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------------------
          STUDENT ONLY: Join a Course Box
      ------------------------------------------------------------------------- */}
      {user.role === 'STUDENT' && (
        <section className="mb-5 rounded-[1.75rem] border border-blue-100 bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white shadow-lg shadow-blue-600/15 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-white/60">Join a New Course</p>
              <h3 className="mt-1 text-xl font-medium">Enter an invitation code from your teacher.</h3>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Ex: WEB-1192"
                className="h-12 min-w-0 rounded-2xl bg-white px-4 text-sm font-bold text-gray-900 outline-none sm:w-56"
              />
              <button
                onClick={handleJoinCourse}
                className="h-12 rounded-2xl bg-white px-6 text-sm font-black text-blue-600 transition hover:bg-gray-100"
              >
                Join
              </button>
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------------------
          TOP STATISTICS BANNER: 3 large colored boxes showing summary stats
      ------------------------------------------------------------------------- */}
      <section className={`mb-5 grid gap-4 ${isProfessor ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        
        {/* Box 1: Total Courses (Prof) OR Days Streak (Student) */}
        <div 
          className="rounded-[1.75rem] p-5 shadow-sm"
          style={{ backgroundColor: CN.green, color: 'white' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-white/80">{isProfessor ? 'Courses' : 'Streak'}</p>
            <Flame size={18} className="text-white" />
          </div>
          <p className="text-4xl font-black text-white">{isProfessor ? courses.length : learningActivity.streak}</p>
          <p className="mt-1 text-sm font-medium text-white/90">{isProfessor ? 'created or managed' : learningActivity.streak === 1 ? 'day streak' : 'days streak'}</p>
        </div>
        
        {/* Box 2: Total Students (Prof) OR Minutes Today (Student) */}
        <div 
          className="rounded-[1.75rem] p-5 shadow-sm"
          style={{ backgroundColor: isProfessor ? CN.yellow : CN.red, color: 'white' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-white/80">{isProfessor ? 'Students' : 'Focus'}</p>
            {isProfessor ? <Users size={18} className="text-white" /> : <Zap size={18} className="text-white" />}
          </div>
          <p className="text-4xl font-black text-white">{isProfessor ? totalStudents : learningActivity.todayMinutes}</p>
          <p className="mt-1 text-sm font-medium text-white/90">{isProfessor ? 'total enrollments' : 'resource minutes today'}</p>
        </div>
        
        {/* Box 3: Total Progress % (Student Only) */}
        {!isProfessor && (
          <div 
            className="rounded-[1.75rem] p-5 shadow-sm"
            style={{ backgroundColor: CN.yellow, color: 'white' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-white/80">Progress</p>
              <Trophy size={18} className="text-white" />
            </div>
            <p className="text-4xl font-black text-white">{activePercent}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white" style={{ width: `${activePercent}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------------------
          MY COURSES LIST: Grid of all courses the user is in
      ------------------------------------------------------------------------- */}
      <section>
        <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          {/* Header of the Course List */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-blue-500">My Courses</p>
              <h2 className="mt-1 text-xl font-black text-gray-950 dark:text-white">
                {filteredCourses.length} shown - {courses.length} total
              </h2>
            </div>
            {/* Another quick link to browse public courses */}
            <button
              onClick={() => {
                closeGuide();
                navigate('/courses/public');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-50 px-4 py-2 text-sm font-black text-green-600 transition hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-800/40"
            >
              Browse public <Globe size={15} />
            </button>
          </div>

          {/* Empty State: If no courses match the search, or they have no courses at all */}
          {filteredCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 py-14 text-center dark:border-gray-700">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
                <BookOpen size={34} className="text-blue-500" />
              </div>
              <h3 className="text-lg font-black text-gray-950 dark:text-white">No courses found</h3>
              <p className="mt-2 max-w-xs text-sm text-gray-500">
                {courses.length === 0
                  ? isProfessor
                    ? 'Start your teaching journey by creating your first course.'
                    : "You haven't joined any courses yet. Use a join code to get started."
                  : 'Try a different search term.'}
              </p>
              {isProfessor && courses.length === 0 && (
                <button
                  onClick={() => {
                    closeGuide();
                    setIsModalOpen(true);
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  <Plus size={18} /> Create Course
                </button>
              )}
            </div>
          ) : (
            
            /* The Actual Grid of Course Cards */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((course) => {
                const progress = courseProgress[course.id]?.percent ?? 0;
                return (
                  <div
                    key={course.id}
                    className="flex min-h-[14rem] flex-col rounded-3xl border border-gray-200 bg-gray-50/70 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:border-gray-700 dark:bg-gray-900/40 dark:hover:bg-gray-900"
                  >
                    {/* Course Card Header (Icon, Title, Public/Private Badge) */}
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${course.isPublic ? 'bg-green-600' : 'bg-blue-600'}`}>
                          <GraduationCap size={22} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-lg font-black leading-tight text-gray-950 dark:text-white">{course.title}</h3>
                          <div className="mt-2">{renderCourseStatus(course)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Course Description */}
                    <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-500">
                      {course.description || 'No description yet.'}
                    </p>

                    {/* Professor View: Shows Student count, Topic count, and the Join Code */}
                    {isProfessor ? (
                      <div className="mb-4 space-y-4">
                        <div className="flex gap-4 text-sm font-bold text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <Users size={16} className="text-blue-500" />
                            {course._count?.students ?? 0}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <BookOpen size={16} className="text-indigo-500" />
                            {course._count?.topics ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-start">
                          <JoinCodeBadge code={course.joinCode} isPublic={course.isPublic} />
                        </div>
                      </div>
                    ) : (
                      /* Student View: Shows a progress bar for this specific course */
                      <div className="mb-4">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-gray-500">
                          <span>Course progress</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div className={`h-full rounded-full ${course.isPublic ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Action Buttons at the bottom of the card */}
                    <div className={`mt-auto gap-2 ${isProfessor ? 'flex' : course.isPublic ? 'grid grid-cols-[minmax(0,1fr)_2.75rem]' : 'flex'}`}>
                      {isProfessor ? (
                        <button
                          onClick={() => {
                            closeGuide();
                            navigate(`/prof/course/${course.id}`);
                          }}
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition dark:text-white dark:shadow-md ${
                            course.isPublic
                              ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-600 dark:hover:bg-green-700'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-600 dark:hover:bg-blue-700'
                          }`}
                        >
                          Manage Course <ChevronRight size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              closeGuide();
                              navigate(`/retro/${course.id}`);
                            }}
                            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-black transition ${
                              course.isPublic
                                ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}
                          >
                            Continue <ChevronRight size={16} />
                          </button>
                        </>
                      )}
                      
                      {/* Leave Public Course Button (Small red button) */}
                      {user.role === 'STUDENT' && course.isPublic && (
                        <button
                          onClick={() => handleLeavePublicCourse(course.id)}
                          disabled={leavingCourseId === course.id}
                          className="inline-flex h-full w-11 items-center justify-center rounded-2xl border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/20"
                          title="Leave public course"
                        >
                          <LogOut size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------------------
          AI CHAT COMPANION (Floating at the bottom of the screen)
      ------------------------------------------------------------------------- */}
      {aiCourse && (
        <section className="mt-5">
          <AiChatCompanion
            courseId={aiCourse.id}
            courseTitle={aiCourse.title}
            topics={[]}
            variant="embedded"
            headerAction={
              /* If they have multiple courses, let them select which one the AI talks about */
              courses.length > 1 ? (
                <select
                  value={aiCourse.id}
                  onChange={(event) => setAiCourseId(event.target.value)}
                  className="h-11 w-full max-w-[240px] cursor-pointer appearance-none rounded-2xl border border-white/30 bg-white/10 px-4 text-sm font-black text-white outline-none transition hover:bg-white/20 focus:border-white focus:bg-white/20 focus:ring-2 focus:ring-white/20"
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id} className="text-gray-900 bg-white">
                      {course.title}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
        </section>
      )}

      {/* -------------------------------------------------------------------------
          MODALS & OVERLAYS
      ------------------------------------------------------------------------- */}
      <CreateCourseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => {
          setIsModalOpen(false);
          fetchCourses();
        }}
      />

      {/* The Visual Walkthrough Guide (Pointers for new users) */}
      {showGuide && (
        <GuideOverlay
          onClose={closeGuide}
          arrows={user.role === 'PROFESSOR'
            ? [
                { d: 'M72 18 C77 18 80 15 84 14' },
                { d: 'M55 31 C60 31 62 21 67 17' },
              ]
            : [
                { d: 'M34 30 C42 27 54 26 62 24' },
                { d: 'M68 18 C72 17 75 16 78 14' },
                { d: 'M36 67 C33 61 30 57 27 51' },
              ]}
          steps={user.role === 'PROFESSOR'
            ? [
                {
                  number: 1,
                  title: 'Create a Course',
                  className: 'right-4 top-32 lg:right-8 lg:top-40',
                  body: (
                    <>
                      <p>Start by creating your own course.</p>
                      <p>1. Enter a course name</p>
                      <p>2. Choose Public or Private</p>
                      <p>3. Add your course resources</p>
                    </>
                  ),
                },
                {
                  number: 2,
                  title: 'Public Courses',
                  className: 'left-1/2 top-36 -translate-x-1/2',
                  body: <p>Explore public courses created by other teachers.</p>,
                },
                {
                  number: 3,
                  title: 'Manage Course',
                  className: 'left-4 bottom-16 lg:left-16',
                  body: <p>Open a course card to manage students, nodes, quizzes, resources, and feedback.</p>,
                },
              ]
            : [
                {
                  number: 1,
                  title: 'Join a Course',
                  className: 'left-4 top-44 lg:left-16',
                  body: <p>Enter an invitation code from your teacher, then press Join.</p>,
                },
                {
                  number: 2,
                  title: 'Public Courses',
                  className: 'right-4 top-32 lg:right-24',
                  body: <p>Browse open courses that you can join without an invitation code.</p>,
                },
                {
                  number: 3,
                  title: 'Start Learning',
                  className: 'left-1/2 bottom-16 -translate-x-1/2',
                  body: <p>Use Classic or Retro Mode on a course card to open the learning map.</p>,
                },
              ]}
        />
      )}
    </div>
  );
}
