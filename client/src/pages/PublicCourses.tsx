import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Users, Globe } from "lucide-react";
import { api } from "../utils/api";

interface PublicCourse {
  id: string;
  title: string;
  description?: string | null;
  joinCode: string;
  isPublic: boolean;
  joined: boolean;
  instructor?: {
    id: string;
    email: string;
    role: string;
  };
  _count?: {
    students: number;
    topics: number;
  };
}

export default function PublicCourses() {
  const navigate = useNavigate();
  const [user] = useState<any>(() => {
    const saved = localStorage.getItem("user");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchPublicCourses();
  }, [user, navigate]);

  const fetchPublicCourses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/courses/public');
      setCourses(res.data || []);
    } catch (error: any) {
      if (error.response?.status >= 400) {
        localStorage.removeItem('user');
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinPublicCourse = async (courseId: string) => {
    setJoiningId(courseId);
    try {
      await api.post(`/courses/${courseId}/join-public`, {});
      await fetchPublicCourses();
      navigate("/dashboard");
    } catch (error: any) {
      alert(error.response?.data?.error || "Could not join this public course.");
    } finally {
      setJoiningId(null);
    }
  };

  const openCourse = (course: PublicCourse) => {
    const isOwner = user?.role === "PROFESSOR" && course.instructor?.id === user?.id;
    if (isOwner) {
      navigate(`/prof/course/${course.id}`);
      return;
    }
    navigate(`/playground/${course.id}`);
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-8 rounded-[28px] border border-blue-100 bg-white/95 p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600">Course Discovery</p>
            <h1 className="mt-2 text-3xl font-black text-gray-900 dark:text-white">Public Courses</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              Explore public courses created by teachers, see who created them, and join in one click.
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 transition-all hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Back To Dashboard
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[28px] border border-dashed border-blue-100 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Loading public courses...
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-blue-100 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/30">
            <Globe size={28} />
          </div>
          <h2 className="mt-4 text-xl font-black text-gray-900 dark:text-white">No public courses yet</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
            Public courses will appear here as soon as teachers publish them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const creatorName = course.instructor?.email?.split("@")[0] || "Teacher";
            const isOwner = user?.role === "PROFESSOR" && course.instructor?.id === user?.id;

            return (
              <article
                key={course.id}
                className="flex h-[395px] flex-col rounded-[24px] border border-blue-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Public Course</p>
                    <h2 className="mt-2 text-xl font-black text-gray-900 dark:text-white">{course.title}</h2>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                    {course.joined ? "Joined" : "Open"}
                  </span>
                </div>

                <div className="mt-4 h-[92px] overflow-y-auto pr-1 text-sm text-gray-500 dark:text-gray-300">
                  {course.description || "This course is public and ready for new learners."}
                </div>

                <div className="mt-5 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Created By</p>
                  <p className="mt-1 text-sm font-bold text-gray-700 dark:text-gray-200">{creatorName}</p>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Course Snapshot</p>
                  <div className="mt-2 flex gap-4 text-sm text-gray-500 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <Users size={15} className="text-blue-500" />
                      {course._count?.students ?? 0}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BookOpen size={15} className="text-blue-500" />
                      {course._count?.topics ?? 0}
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-6">
                  {course.joined ? (
                    <button
                      onClick={() => openCourse(course)}
                      className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition-all hover:bg-blue-700"
                    >
                      Open Course
                    </button>
                  ) : user.role === "STUDENT" ? (
                    <button
                      onClick={() => handleJoinPublicCourse(course.id)}
                      disabled={joiningId === course.id}
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {joiningId === course.id ? "Joining..." : "Join Course"}
                    </button>
                  ) : isOwner ? (
                    <button
                      onClick={() => openCourse(course)}
                      className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition-all hover:bg-blue-700"
                    >
                      Manage Course
                    </button>
                  ) : (
                    <button
                      onClick={() => openCourse(course)}
                      className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-600 transition-all hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-900/20 dark:text-blue-300"
                    >
                      Open Course
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
