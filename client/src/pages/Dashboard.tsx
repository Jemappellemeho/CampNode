import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateCourseModal from './CreateCourseModal';
import { api } from '../utils/api';
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Flame,
  Globe,
  GraduationCap,
  LayoutList,
  Lock,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import GuideOverlay from '../components/GuideOverlay';
import { hasSeenGuide, markGuideSeen } from '../utils/guideSession';
import { getLearningActivityStats } from '../utils/learningTime';

function JoinCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-black tracking-wide text-gray-800 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100"
    >
      {copied ? (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-300">
          <Check size={14} /> Copied
        </span>
      ) : (
        <>
          <span>{code}</span>
          <Copy size={14} className="text-gray-400" />
        </>
      )}
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const [courses, setCourses] = useState<any[]>([]);
  const [courseProgress, setCourseProgress] = useState<Record<string, { completed: number; total: number; percent: number }>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [leavingCourseId, setLeavingCourseId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [learningActivity, setLearningActivity] = useState({ streak: 0, todayMinutes: 0 });

  const displayName =
    user?.name ||
    user?.email?.split('@')[0] ||
    (user?.role === 'STUDENT' ? 'Student' : 'Professor');

  const isProfessor = user?.role === 'PROFESSOR';

  const fetchCourses = async () => {
    try {
      const res = await api.get('/courses/me');
      const nextCourses = res.data;
      setCourses(nextCourses);

      if (user?.role === 'STUDENT') {
        try {
          const progressRes = await api.get('/progress');
          const completedByCourse = progressRes.data.reduce((acc: Record<string, number>, item: any) => {
            const courseId = item.topic?.courseId;
            if (courseId && item.completed) acc[courseId] = (acc[courseId] || 0) + 1;
            return acc;
          }, {});

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

          setCourseProgress(nextProgress);
        } catch {
          setCourseProgress({});
        }
      } else {
        setCourseProgress({});
      }
    } catch (err: any) {
      if (err.response?.status >= 400) {
        localStorage.removeItem('user');
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchCourses();
    }
  }, [user, navigate]);

  useEffect(() => {
    if (user && !hasSeenGuide(user, 'dashboard')) {
      setShowGuide(true);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'STUDENT') {
      setLearningActivity(getLearningActivityStats(user.id));
    }
  }, [user]);

  const closeGuide = () => {
    markGuideSeen(user, 'dashboard');
    setShowGuide(false);
  };

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

  const handleLeavePublicCourse = async (courseId: string) => {
    setLeavingCourseId(courseId);
    try {
      await api.post(`/courses/${courseId}/leave-public`, {});
      fetchCourses();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not leave this public course.');
    } finally {
      setLeavingCourseId(null);
    }
  };

  const filteredCourses = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return courses;
    return courses.filter((course) => {
      return [course.title, course.description, course.joinCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [courses, searchQuery]);

  const totalStudents = courses.reduce((sum, course) => sum + (course._count?.students ?? 0), 0);
  const totalTopics = courses.reduce((sum, course) => sum + (course._count?.topics ?? 0), 0);
  const publicCourses = courses.filter((course) => course.isPublic).length;
  const primaryCourse = courses[0];
  const completedTopics = Object.values(courseProgress).reduce((sum, progress) => sum + progress.completed, 0);
  const activePercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  if (!user) return null;

  const openPrimaryCourse = () => {
    if (!primaryCourse) return;
    closeGuide();
    navigate(isProfessor ? `/prof/course/${primaryCourse.id}` : `/playground/${primaryCourse.id}`);
  };

  const renderCourseStatus = (course: any) => (
    course.isPublic ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-green-600 dark:bg-green-900/30 dark:text-green-300">
        <Globe size={12} /> Public
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
        <Lock size={12} /> Private
      </span>
    )
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-gray-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} - CampNode
          </p>
          <h1 className="text-3xl font-black leading-tight text-gray-950 dark:text-white sm:text-5xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 text-sm font-medium text-gray-500 sm:text-base">
            {isProfessor ? 'Manage your teaching environment' : 'Continue your learning journey'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative min-w-0 flex-1 lg:w-80">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search courses..."
              className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 text-sm font-semibold text-gray-800 outline-none shadow-sm transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-blue-950"
            />
          </div>
          <button
            onClick={() => {
              closeGuide();
              navigate('/courses/public');
            }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-5 text-sm font-black text-blue-600 shadow-sm transition hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700"
          >
            <Globe size={18} /> Public Courses
          </button>
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

      <section className="mb-5 rounded-[2rem] bg-[#101936] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.32em] text-yellow-300">
              {isProfessor ? 'Teaching Command Center' : 'Continue Learning'}
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70">
                {courses.length} {courses.length === 1 ? 'course' : 'courses'}
              </span>
              <span className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-200">
                {isProfessor ? `${totalTopics} nodes` : 'In progress'}
              </span>
            </div>
            <h2 className="max-w-2xl text-3xl font-black leading-tight sm:text-4xl">
              {primaryCourse
                ? primaryCourse.title
                : isProfessor
                  ? 'Build your next course'
                  : 'Join your first course'}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
              {primaryCourse?.description ||
                (isProfessor
                  ? 'Create courses, organize nodes, manage students, and keep resources in one place.'
                  : 'Use a join code from your teacher or browse public courses to start learning.')}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {primaryCourse ? (
                <button
                  onClick={openPrimaryCourse}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-yellow-400/20 transition hover:bg-yellow-300"
                >
                  {isProfessor ? 'Manage Course' : 'Resume Course'} <ChevronRight size={18} />
                </button>
              ) : isProfessor ? (
                <button
                  onClick={() => {
                    closeGuide();
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-yellow-400/20 transition hover:bg-yellow-300"
                >
                  Create Course <ChevronRight size={18} />
                </button>
              ) : null}
              <button
                onClick={() => {
                  closeGuide();
                  navigate('/courses/public');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                <LayoutList size={17} /> Browse Public
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="mb-4 text-[10px] font-black uppercase tracking-[0.28em] text-white/50">
              {isProfessor ? 'Snapshot' : 'Up next'}
            </p>
            <div className="mb-5 flex items-center justify-center">
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-[12px] border-white/10 border-t-blue-400 border-r-green-400">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-yellow-400 text-sm font-black uppercase tracking-widest text-slate-950">
                  {isProfessor ? 'Teach' : 'Learn'}
                </div>
              </div>
            </div>
            <p className="text-lg font-black">
              {isProfessor ? `${totalStudents} enrolled students` : primaryCourse ? 'Open your learning map' : 'No active course yet'}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {isProfessor ? `${publicCourses} public courses` : primaryCourse ? 'Classic and Retro modes are ready.' : 'Join a course to unlock progress.'}
            </p>
          </div>
        </div>
      </section>

      {user.role === 'STUDENT' && (
        <section className="mb-5 rounded-[1.75rem] border border-blue-100 bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white shadow-lg shadow-blue-600/15 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/60">Join a New Course</p>
              <h3 className="mt-1 text-xl font-black">Enter an invitation code from your teacher.</h3>
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

      <section className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-400">{isProfessor ? 'Courses' : 'Streak'}</p>
            <Flame size={18} className="text-orange-500" />
          </div>
          <p className="text-4xl font-black text-gray-950 dark:text-white">{isProfessor ? courses.length : learningActivity.streak}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">{isProfessor ? 'created or managed' : learningActivity.streak === 1 ? 'day streak' : 'days streak'}</p>
        </div>
        <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-400">{isProfessor ? 'Students' : 'Focus'}</p>
            {isProfessor ? <Users size={18} className="text-blue-500" /> : <Zap size={18} className="text-yellow-500" />}
          </div>
          <p className="text-4xl font-black text-gray-950 dark:text-white">{isProfessor ? totalStudents : learningActivity.todayMinutes}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">{isProfessor ? 'total enrollments' : 'resource minutes today'}</p>
        </div>
        <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-400">{isProfessor ? 'Nodes' : 'Progress'}</p>
            {isProfessor ? <BookOpen size={18} className="text-green-500" /> : <Trophy size={18} className="text-green-500" />}
          </div>
          <p className="text-4xl font-black text-gray-950 dark:text-white">{isProfessor ? totalTopics : `${activePercent}%`}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${isProfessor ? Math.min(100, totalTopics * 8) : activePercent}%` }} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
        <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-500">My Courses</p>
              <h2 className="mt-1 text-xl font-black text-gray-950 dark:text-white">
                {filteredCourses.length} shown - {courses.length} total
              </h2>
            </div>
            <button
              onClick={() => {
                closeGuide();
                navigate('/courses/public');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-100 px-4 py-2 text-sm font-black text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100"
            >
              Browse public <Globe size={15} />
            </button>
          </div>

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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((course) => {
                const progress = courseProgress[course.id]?.percent ?? 0;
                return (
                  <div
                    key={course.id}
                    className="flex min-h-[14rem] flex-col rounded-3xl border border-gray-200 bg-gray-50/70 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:border-gray-700 dark:bg-gray-900/40 dark:hover:bg-gray-900"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`h-12 w-12 shrink-0 rounded-2xl ${course.isPublic ? 'bg-green-100' : 'bg-blue-100'} flex items-center justify-center`}>
                          <GraduationCap size={22} className={course.isPublic ? 'text-green-600' : 'text-blue-600'} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-base font-black leading-tight text-gray-950 dark:text-white">{course.title}</h3>
                          <div className="mt-2">{renderCourseStatus(course)}</div>
                        </div>
                      </div>
                    </div>

                    <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-500">
                      {course.description || 'No description yet.'}
                    </p>

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
                          <JoinCodeBadge code={course.joinCode} />
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-gray-500">
                          <span>Course progress</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}

                    <div className={`mt-auto gap-2 ${isProfessor ? 'flex' : course.isPublic ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem]' : 'grid grid-cols-2'}`}>
                      {isProfessor ? (
                        <button
                          onClick={() => {
                            closeGuide();
                            navigate(`/prof/course/${course.id}`);
                          }}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                        >
                          Manage Course <ChevronRight size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              closeGuide();
                              navigate(`/playground/${course.id}`);
                            }}
                            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-black transition ${
                              course.isPublic
                                ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}
                          >
                            Classic <ChevronRight size={16} />
                          </button>
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
                            Retro <ChevronRight size={16} />
                          </button>
                        </>
                      )}
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

        <aside className="rounded-[1.75rem] bg-gradient-to-br from-[#172044] via-[#1f2457] to-[#5b193a] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
              <Sparkles size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200">AI Companion</p>
              <h3 className="text-lg font-black">Suggested for you</h3>
            </div>
          </div>
          <p className="text-lg font-black leading-7">
            {isProfessor
              ? 'Keep your course structure fresh with clear nodes and resources.'
              : primaryCourse
                ? `Ready to continue ${primaryCourse.title}?`
                : 'Join a course and your study suggestions will appear here.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(isProfessor ? ['Review nodes', 'Check feedback', 'Update resources'] : ['Open syllabus', 'Review quiz', 'Ask a question']).map((label) => (
              <span key={label} className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/75">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="flex items-center gap-3 text-sm text-white/50">
              <Sparkles size={16} />
              <span className="flex-1">Open a course to use the study assistant...</span>
              <BarChart3 size={16} className="text-yellow-300" />
            </div>
          </div>
        </aside>
      </section>

      <CreateCourseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => {
          setIsModalOpen(false);
          fetchCourses();
        }}
      />

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
