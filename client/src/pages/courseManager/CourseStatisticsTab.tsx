import { useState } from 'react';
import { ChevronDown, Target, Users, Award, Percent } from 'lucide-react';
import AdvancedAnalyticsDashboard from './AdvancedAnalyticsDashboard';

interface CourseStatisticsTabProps {
  statistics: any;
  statisticsError: string;
  onRefresh: () => void;
}

const questionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    multiple_choice: 'Multiple choice',
    true_false: 'True / False',
    multiple_select: 'Multiple select',
    reorder: 'Reorder',
    open_answer: 'Open answer',
    unknown: 'Unknown',
  };
  return labels[type] || type.replace(/_/g, ' ');
};

export default function CourseStatisticsTab({
  statistics,
  statisticsError,
  onRefresh,
}: CourseStatisticsTabProps) {
  const [expandedStatsTopics, setExpandedStatsTopics] = useState<Record<string, boolean>>({});

  const renderStatsSummary = (stats: any, isTransparent?: boolean) => {
    const bgOpacity = isTransparent ? '33' : '';
    const attemptsColor = '#E63027';
    const studentsColor = '#F5C518';
    const scoreColor = '#3A9E3F';
    const percentColor = '#9333ea';

    const getBg = (color: string) => `${color}${bgOpacity}`;
    const getTextColor = (color: string) => (isTransparent ? color : 'white');
    const getLabelColor = (color: string) => (isTransparent ? color : 'white');
    const getIconColor = (color: string) => (isTransparent ? color : 'white');

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div
          className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden"
          style={{ backgroundColor: getBg(attemptsColor) }}
        >
          <div
            className="shrink-0"
            style={{ color: getIconColor(attemptsColor), opacity: isTransparent ? 0.8 : 0.7 }}
          >
            <Target size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate"
              style={{ color: getLabelColor(attemptsColor), opacity: isTransparent ? 0.7 : 0.8 }}
            >
              Attempts
            </p>
            <p
              className="text-lg sm:text-2xl font-black truncate"
              style={{ color: getTextColor(attemptsColor) }}
            >
              {stats?.attempts || 0}
            </p>
          </div>
        </div>
        <div
          className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden"
          style={{ backgroundColor: getBg(studentsColor) }}
        >
          <div
            className="shrink-0"
            style={{ color: getIconColor(studentsColor), opacity: isTransparent ? 0.8 : 0.7 }}
          >
            <Users size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate"
              style={{ color: getLabelColor(studentsColor), opacity: 0.8 }}
            >
              Students
            </p>
            <p
              className="text-lg sm:text-2xl font-black truncate"
              style={{ color: getTextColor(studentsColor) }}
            >
              {stats?.students || 0}
            </p>
          </div>
        </div>
        <div
          className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden"
          style={{ backgroundColor: getBg(scoreColor) }}
        >
          <div
            className="shrink-0"
            style={{ color: getIconColor(scoreColor), opacity: isTransparent ? 0.8 : 0.7 }}
          >
            <Award size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate"
              style={{ color: getLabelColor(scoreColor), opacity: isTransparent ? 0.7 : 0.8 }}
            >
              Avg Score
            </p>
            <p
              className="text-lg sm:text-2xl font-black truncate"
              style={{ color: getTextColor(scoreColor) }}
            >
              {stats?.averageScore || 0}
            </p>
          </div>
        </div>
        <div
          className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden"
          style={{ backgroundColor: getBg(percentColor) }}
        >
          <div
            className="shrink-0"
            style={{ color: getIconColor(percentColor), opacity: isTransparent ? 0.8 : 0.7 }}
          >
            <Percent size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate"
              style={{ color: getLabelColor(percentColor), opacity: isTransparent ? 0.7 : 0.8 }}
            >
              Avg Percent
            </p>
            <p
              className="text-lg sm:text-2xl font-black truncate"
              style={{ color: getTextColor(percentColor) }}
            >
              {stats?.averagePercent || 0}%
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderQuestionTypes = (stats: any) => {
    const entries = Object.entries(stats?.questionTypes || {});
    if (entries.length === 0) {
      return <p className="text-xs font-bold text-gray-400">No question-type data yet</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {entries.map(([type, value]: any) => {
          const percent = value.total > 0 ? Math.round((value.correct / value.total) * 100) : 0;
          return (
            <span
              key={type}
              className="rounded-xl border bg-gray-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {questionTypeLabel(type)}: {percent}% ({value.correct}/{value.total})
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">
          Quiz Statistics
        </h2>
        <button
          onClick={onRefresh}
          className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      {statisticsError ? (
        <div className="p-6 rounded-3xl border border-red-200 bg-red-50 text-sm font-bold text-red-600">
          {statisticsError}
        </div>
      ) : (
        <>
          {renderStatsSummary(statistics?.overallStats)}

          <AdvancedAnalyticsDashboard statistics={statistics} />

          {!statistics?.topics || statistics.topics.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">
              No quiz statistics yet
            </div>
          ) : (
            <div className="space-y-4">
              {statistics.topics.map((topic: any, index: number) => (
                <div
                  key={topic.id}
                  className="rounded-3xl border bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <div
                    className="mb-4 flex items-start justify-between gap-4 cursor-pointer hover:opacity-80"
                    onClick={() =>
                      setExpandedStatsTopics((prev) => ({
                        ...prev,
                        [topic.id]: prev[topic.id] === undefined ? false : !prev[topic.id],
                      }))
                    }
                  >
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                        Main node {index + 1}
                      </p>
                      <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <ChevronDown
                          size={18}
                          className={`transition-transform duration-200 ${
                            expandedStatsTopics[topic.id] === false ? '-rotate-90' : ''
                          }`}
                        />
                        {topic.name}
                      </h3>
                    </div>
                    <span className="rounded-xl bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-600">
                      {topic.combinedStats?.attempts || 0} attempts
                    </span>
                  </div>

                  {expandedStatsTopics[topic.id] !== false && (
                    <>
                      <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                          Combined topic stats
                        </p>
                        {renderStatsSummary(topic.combinedStats, true)}
                        <div className="mt-3">{renderQuestionTypes(topic.combinedStats)}</div>
                      </div>

                      {(topic.ownStats?.attempts || 0) > 0 && (
                        <div className="mt-4 rounded-2xl border p-4 dark:border-gray-700">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Main node quiz
                          </p>
                          {renderStatsSummary(topic.ownStats, true)}
                          <div className="mt-3">{renderQuestionTypes(topic.ownStats)}</div>
                        </div>
                      )}

                      {topic.subtopics?.length > 0 && (
                        <div className="mt-4 space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Subtopics
                          </p>
                          {topic.subtopics.map((subtopic: any) => (
                            <div
                              key={subtopic.id}
                              className="rounded-2xl border p-4 dark:border-gray-700"
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="font-bold text-gray-900 dark:text-white">
                                  {subtopic.name}
                                </p>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                  {subtopic.stats?.attempts || 0} attempts
                                </span>
                              </div>
                              {renderStatsSummary(subtopic.stats, true)}
                              <div className="mt-3">{renderQuestionTypes(subtopic.stats)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}