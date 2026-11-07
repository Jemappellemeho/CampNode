import { useState } from 'react';
import { Users, BookOpen, Globe, Lock, Copy, Check } from 'lucide-react';
import { API_ORIGIN } from './courseManagerConstants';

export function OverviewTab({ course }: { course: any }) {
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="p-6 rounded-[1.75rem] shadow-sm flex items-center gap-4"
          style={{ backgroundColor: '#F5C518', color: 'white' }}
        >
          <div className="w-12 h-12 flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Students</p>
            <p className="text-2xl font-black text-white">{course.students?.length || 0}</p>
          </div>
        </div>
        <div
          className="p-6 rounded-[1.75rem] shadow-sm flex items-center gap-4"
          style={{ backgroundColor: '#E63027', color: 'white' }}
        >
          <div className="w-12 h-12 flex items-center justify-center">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Nodes</p>
            <p className="text-2xl font-black text-white">{course.topics?.length || 0}</p>
          </div>
        </div>
        <div
          className="p-6 rounded-[1.75rem] shadow-sm flex items-center gap-4"
          style={{ backgroundColor: course.isPublic ? '#3A9E3F' : '#1E6FFF', color: 'white' }}
        >
          <div className="w-12 h-12 flex items-center justify-center">
            {course.isPublic ? <Globe size={24} /> : <Lock size={24} />}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">
              Visibility
            </p>
            <p className="text-2xl font-black text-white">
              {course.isPublic ? 'Public' : 'Private'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border dark:border-gray-700 shadow-sm">
        <h3 className="text-[10px] font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest">
          Access Configuration
        </h3>
        <div
          className="p-5 rounded-[1.75rem] shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          style={{
            backgroundColor: course.isPublic ? '#3A9E3F26' : '#1E6FFF26',
            color: course.isPublic ? '#3A9E3F' : '#1E6FFF',
          }}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">
              Student Join Code
            </p>
            <p className="text-xl font-mono font-black uppercase tracking-widest">
              {course.joinCode}
            </p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(course.joinCode);
              setJoinCodeCopied(true);
              setTimeout(() => setJoinCodeCopied(false), 2000);
            }}
            className="p-2.5 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 flex items-center gap-2 text-xs font-bold text-gray-500 w-full justify-center sm:w-auto min-w-[100px]"
          >
            {joinCodeCopied ? (
              <>
                <Check size={18} className="text-green-500" />{' '}
                <span className="text-green-600">COPIED!</span>
              </>
            ) : (
              <>
                <Copy size={18} /> <span className="sm:hidden">COPY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudentsTab({
  course,
  flatCourseTopics,
}: {
  course: any;
  flatCourseTopics: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-3 animate-in fade-in">
      <h2 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4">
        Enrolled Students
      </h2>
      {!course.students || course.students.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">
          No students yet
        </div>
      ) : (
        course.students.map((s: any) => {
          const progressByTopicId = new Map(
            (Array.isArray(s.progress) ? s.progress : []).map((item: any) => [
              item.topicId,
              Boolean(item.completed),
            ])
          );
          const completedCount = flatCourseTopics.reduce(
            (count, topic) => count + (progressByTopicId.get(topic.id) ? 1 : 0),
            0
          );
          const totalTopics = flatCourseTopics.length;
          const completionPercent =
            totalTopics === 0 ? 0 : Math.round((completedCount / totalTopics) * 100);
          const needsHelpTopics = flatCourseTopics.filter(
            (topic) => !progressByTopicId.get(topic.id)
          );

          return (
            <div
              key={s.id}
              className="p-4 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 shrink-0 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">
                  {s.email?.[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold dark:text-white truncate">
                    {s.name || 'Student'}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">{s.email}</p>
                </div>
              </div>
              <div className="w-full sm:w-auto sm:text-right sm:min-w-[220px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Progress</p>
                <p className="text-sm font-black text-blue-600">{completionPercent}%</p>
                <div className="mt-1 h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${completionPercent}%`, background: '#F5C518' }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {`${completedCount}/${totalTopics} topics completed`}
                </p>
                {needsHelpTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap sm:justify-end gap-1">
                    {needsHelpTopics.slice(0, 3).map((topic) => (
                      <span
                        key={`${s.id}-${topic.id}`}
                        className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md"
                      >
                        {topic.name} ?
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function FeedbackTab({
  feedback,
  feedbackError,
  onRefresh,
}: {
  feedback: any[];
  feedbackError: string;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">
          Student Feedback
        </h2>
        <button
          onClick={onRefresh}
          className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>
      {feedbackError ? (
        <div className="p-6 rounded-3xl border border-red-200 bg-red-50 text-sm font-bold text-red-600">
          {feedbackError}
        </div>
      ) : feedback.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">
          No feedback yet
        </div>
      ) : (
        feedback.map((item) => (
          <div
            key={item.id}
            className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5"
          >
            <div className="flex justify-between gap-4 mb-2">
              <div>
                <p className="text-xs font-black uppercase text-blue-600">
                  {item.topic?.name || 'Unknown node'}
                </p>
                <p className="text-xs text-gray-500">{item.user?.email || 'Student'}</p>
              </div>
              <p className="text-[10px] text-gray-400">
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200">{item.content}</p>
          </div>
        ))
      )}
    </div>
  );
}

export const resolveResourceUrl = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return `${API_ORIGIN}/${url}`;
};

export const getContentPreviewMeta = (topic: any) => {
  if (!topic?.content) return null;
  if (topic.wikidataId) {
    return { title: 'Wikidata Overview', actionOpen: 'Collapse', actionClosed: 'Expand' };
  }
  if (typeof topic.articleUrl === 'string' && topic.articleUrl.includes('/uploads/')) {
    return { title: 'PDF Extract', actionOpen: 'Hide Preview', actionClosed: 'Show Preview' };
  }
  if (typeof topic.articleUrl === 'string' && topic.articleUrl.trim()) {
    return { title: 'Source Extract', actionOpen: 'Hide Preview', actionClosed: 'Show Preview' };
  }
  return { title: 'Source Notes', actionOpen: 'Hide Preview', actionClosed: 'Show Preview' };
};