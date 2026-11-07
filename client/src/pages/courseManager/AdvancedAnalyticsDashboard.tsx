import { useState } from 'react';
import {
  X, UserX, Activity, BarChart2, Clock
} from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

// ============================================================================
// ADVANCED ANALYTICS DASHBOARD
// ============================================================================
function AdvancedAnalyticsDashboard({ statistics }: { statistics: any }) {
  const [expandedDropoff, setExpandedDropoff] = useState(false);
  const topics = statistics?.topics || [];
  
  const COLORS = {
    blue: "#1E6FFF",
    red: "#E63027",
    green: "#3A9E3F",
    yellow: "#F5C518",
    purple: "#9333ea",
  };

  const LIGHT_COLORS = {
    red: "#FCA5A5",
    yellow: "#FDE047",
    purple: "#D8B4FE",
    blue: "#93C5FD",
    green: "#86EFAC",
  };

  // Time-on-Task: REAL data now. `expected` = sum of the topic's resource minute estimates,
  // `actual` = average minutes students actually spent on the topic (from tracked activity).
  const timeData = Array.isArray(statistics?.timeOnTask) && statistics.timeOnTask.length > 0
    ? statistics.timeOnTask.map((t: any, i: number) => ({
        name: `Topic ${i + 1}`,
        fullName: t.name || `Topic ${i + 1}`,
        expected: Number(t.expected) || 0,
        actual: Number(t.actual) || 0,
      }))
    : [{ name: 'No data', fullName: 'No data yet', expected: 0, actual: 0 }];

  // Daily Engagement: REAL distinct active students per day (last 7 days).
  const engagementData = Array.isArray(statistics?.dailyEngagement) && statistics.dailyEngagement.length > 0
    ? statistics.dailyEngagement.map((d: any) => ({ day: d.day, activeStudents: Number(d.activeStudents) || 0 }))
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({ day, activeStudents: 0 }));

  // 1. Score Distribution (Bell Curve from real scores turned into Pie Chart)
  const allScores = statistics?.overallStats?.scores || [];
  const scoreDistRaw = [0, 0, 0, 0, 0];
  allScores.forEach((score: number) => {
    if (score <= 20) scoreDistRaw[0]++;
    else if (score <= 40) scoreDistRaw[1]++;
    else if (score <= 60) scoreDistRaw[2]++;
    else if (score <= 80) scoreDistRaw[3]++;
    else scoreDistRaw[4]++;
  });

  const totalScores = allScores.length || 1;
  const scoreDist = [
    { range: '0-20%', count: scoreDistRaw[0], value: Math.round((scoreDistRaw[0] / totalScores) * 100), color: LIGHT_COLORS.red },
    { range: '21-40%', count: scoreDistRaw[1], value: Math.round((scoreDistRaw[1] / totalScores) * 100), color: LIGHT_COLORS.yellow },
    { range: '41-60%', count: scoreDistRaw[2], value: Math.round((scoreDistRaw[2] / totalScores) * 100), color: LIGHT_COLORS.purple },
    { range: '61-80%', count: scoreDistRaw[3], value: Math.round((scoreDistRaw[3] / totalScores) * 100), color: LIGHT_COLORS.blue },
    { range: '81-100%', count: scoreDistRaw[4], value: Math.round((scoreDistRaw[4] / totalScores) * 100), color: LIGHT_COLORS.green },
  ].filter(d => d.count > 0);

  if (scoreDist.length === 0) {
    scoreDist.push({ range: 'No data', count: 1, value: 100, color: '#E5E7EB' });
  }

  // 4. Drop-off Rates (Students completed per topic)
  const churnData = topics.length > 0 ? topics.map((t: any, i: number) => {
    return {
      name: `Topic ${i+1}`,
      fullName: t.name || `Topic ${i+1}`,
      survivalRate: t.combinedStats?.students || 0,
    };
  }) : [{ name: 'No data', fullName: 'No data', survivalRate: 0 }];

  const churnDataDetailed: any[] = [];
  if (topics.length > 0) {
    topics.forEach((t: any, i: number) => {
      churnDataDetailed.push({
        name: `Topic ${i+1}`,
        fullName: t.name || `Topic ${i+1}`,
        survivalRate: t.combinedStats?.students || 0,
        isSubtopic: false,
      });
      if (t.subtopics && t.subtopics.length > 0) {
        t.subtopics.forEach((st: any, j: number) => {
          churnDataDetailed.push({
            name: `T${i+1}:S${j+1}`,
            fullName: `${t.name || `Topic ${i+1}`} > ${st.name || `Subtopic ${j+1}`}`,
            survivalRate: st.combinedStats?.students || t.combinedStats?.students || 0,
            isSubtopic: true,
          });
        });
      }
    });
  } else {
    churnDataDetailed.push({ name: 'No data', fullName: 'No data', survivalRate: 0, isSubtopic: false });
  }

  return (
    <div className="space-y-4 mt-6 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Activity size={20} className="text-blue-600" />
        <h2 className="text-lg font-black dark:text-white">Advanced Analytics & Behavior Tracking</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ROW 1: Time-on-Task & Daily Engagement (REAL tracked data) */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><Clock size={16} className="text-blue-500"/> Time-on-Task vs. Expected</h3>
              <p className="text-[10px] text-gray-500 mt-1">Avg. minutes students actually spent vs. resource estimates</p>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeData} margin={{ top: 10, right: 0, left: -25, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <RechartsTooltip
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }}
                />
                <Bar dataKey="expected" name="Expected (min)" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual (min)" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><Activity size={16} className="text-green-500"/> Daily Engagement</h3>
              <p className="text-[10px] text-gray-500 mt-1">Distinct active students per day (last 7 days)</p>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={engagementData} margin={{ top: 10, right: 0, left: -25, bottom: 25 }}>
                <defs>
                  <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }} />
                <Area type="monotone" dataKey="activeStudents" name="Active Students" stroke={COLORS.green} strokeWidth={3} fill="url(#colorActive)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ROW 2: Score Distribution & Drop-off Rate (both use real statistics data) */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><BarChart2 size={16} className="text-purple-500"/> Score Distribution</h3>
              <p className="text-[10px] text-gray-500 mt-1">Proportion of grades across the cohort</p>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 10, right: 0, left: 0, bottom: 25 }}>
                <Pie
                  data={scoreDist}
                  cx="50%"
                  cy="45%"
                  outerRadius={55}
                  dataKey="value"
                  nameKey="range"
                  stroke="none"
                  label={({ value }) => `${value}%`}
                  labelLine={false}
                >
                  {scoreDist.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={_entry.color} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                <RechartsTooltip 
                  formatter={(value, name, props) => [`${value}% (${props.payload.count} students)`, name]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div 
          className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-red-300 dark:hover:border-red-800 transition-colors"
          onClick={() => setExpandedDropoff(true)}
        >
          <div className="flex justify-between items-center mb-4 relative z-10">
            <div>
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><UserX size={16} className="text-red-600" /> Quiz Drop-off Rates</h3>
              <p className="text-[10px] text-gray-500 mt-1">Survival rate of unique students progressing through quizzes</p>
            </div>
            <div className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-full font-bold">Click to Expand</div>
          </div>
          <div className="h-[240px] relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={churnData} margin={{ top: 10, right: 10, left: -25, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} angle={-45} textAnchor="end" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <RechartsTooltip 
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }}
                  itemStyle={{ color: COLORS.red, fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="survivalRate" name="Students" stroke={COLORS.red} strokeWidth={4} activeDot={{ r: 8, fill: COLORS.red, stroke: '#fff', strokeWidth: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {expandedDropoff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-200 dark:border-gray-800 relative">
            <button 
              onClick={() => setExpandedDropoff(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
            <div className="mb-6">
              <h2 className="text-xl font-black dark:text-white flex items-center gap-2"><UserX size={20} className="text-red-600" /> Detailed Drop-off Rates (Including Quizzes)</h2>
              <p className="text-sm text-gray-500 mt-1">Survival rate of students progressing through all quizzes</p>
            </div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={churnDataDetailed} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} angle={-45} textAnchor="end" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                  <RechartsTooltip 
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }}
                    itemStyle={{ color: COLORS.red, fontWeight: 'bold' }}
                  />
                  <Line type="stepAfter" dataKey="survivalRate" name="Students" stroke={COLORS.red} strokeWidth={4} activeDot={{ r: 8, fill: COLORS.red, stroke: '#fff', strokeWidth: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdvancedAnalyticsDashboard;
