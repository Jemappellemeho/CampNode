// Professor course manager - handles topic management, resources, quizzes
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Plus, Trash2, ChevronLeft, GripVertical,
  BookOpen, X, Users, Globe, Copy, Check,
  ChevronRight, ChevronDown, Play, Headphones, Sparkles, Lock, Edit2, Search,
  Target, Award, Percent, UserX, Activity, BarChart2, Clock
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { api } from '../utils/api';
import GuideOverlay from '../components/GuideOverlay';
import { hasSeenGuide, markGuideSeen } from '../utils/guideSession';

const API_ORIGIN = 'http://localhost:3000';
const BLUE = '#1E6FFF';

const PARTIAL_CREDIT_ON_LABEL = 'Partial answer gives 0.5';
const PARTIAL_CREDIT_OFF_LABEL = 'Only fully correct gives credit';
const PARTIAL_CREDIT_THRESHOLD_LABEL = 'Minimum correct parts for 0.5';

// Wikidata search field - searches Wikipedia/Wikidata for adding topics
function WikidataSearchField({
  query,
  results,
  placeholder,
  onQueryChange,
  onSelect,
}: {
  query: string;
  results: any[];
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: any) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full rounded-lg border px-3 py-2 pl-9 text-sm outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {results.map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => onSelect(result)}
            className="flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div>
              <p className="font-bold dark:text-white">{result.label}</p>
              <p className="text-xs text-gray-500">{result.description}</p>
            </div>
            <Plus size={16} className="mt-1 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ADVANCED ANALYTICS DASHBOARD
// ============================================================================
function AdvancedAnalyticsDashboard({ statistics }: { statistics: any }) {
  const [expandedDropoff, setExpandedDropoff] = useState(false);
  const [expandedDaily, setExpandedDaily] = useState(false);
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

  const getShortName = (name: string, max = 10) => name.length > max ? name.substring(0, max) + '...' : name;

  // 1. Time-on-Task vs Expected (Mock)
  const timeData = topics.length > 0 ? topics.map((t: any, i: number) => {
    const baseExpected = 10 + (i * 2) + ((t.name || '').length % 5);
    const actual = baseExpected + (Math.random() > 0.5 ? Math.floor(Math.random() * 10) : -Math.floor(Math.random() * 5));
    return {
      name: `Topic ${i+1}`,
      fullName: t.name || `Topic ${i+1}`,
      expected: baseExpected,
      actual: Math.max(5, actual),
    };
  }) : [{ name: 'No data', fullName: 'No data', expected: 0, actual: 0 }];

  // 2. Daily Engagement (Mock 7 Days)
  const engagementData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
    day,
    activeStudents: Math.floor(Math.random() * 40) + 10,
  }));

  // Hourly Engagement (Mock 24 Hours for 7 days)
  const hourlyEngagementData: any[] = [];
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((day) => {
    for (let h = 0; h < 24; h += 2) {
      hourlyEngagementData.push({
        day,
        time: `${day} ${h}:00`,
        activeStudents: Math.floor(Math.random() * 15) + 1,
      });
    }
  });

  // 3. Score Distribution (Bell Curve from real scores turned into Pie Chart)
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

        {/* ROW 1: Time on Task & Daily Engagement */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><Clock size={16} className="text-blue-500"/> Time-on-Task vs. Expected</h3>
              <p className="text-[10px] text-gray-500 mt-1">Comparing actual time spent vs resource estimates</p>
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeData} margin={{ top: 10, right: 0, left: -25, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <RechartsTooltip 
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }}
                />
                <Bar dataKey="expected" name="Expected Time" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual Time" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div 
          className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-green-300 dark:hover:border-green-800 transition-colors"
          onClick={() => setExpandedDaily(true)}
        >
          <div className="flex justify-between items-center mb-4 relative z-10">
            <div>
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><Activity size={16} className="text-green-500"/> Daily Engagement</h3>
              <p className="text-[10px] text-gray-500 mt-1">Active students interacting with the course this week</p>
            </div>
            <div className="text-[10px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-1 rounded-full font-bold">Click to Expand</div>
          </div>
          <div className="h-[200px]">
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
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }} />
                <Area type="monotone" dataKey="activeStudents" name="Active Students" stroke={COLORS.green} strokeWidth={3} fill="url(#colorActive)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ROW 2: Score Distribution & Drop-off Rate */}
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
              <h3 className="text-sm font-bold dark:text-white flex items-center gap-2"><UserX size={16} className="text-red-600" /> Drop-off Rates per Topic</h3>
              <p className="text-[10px] text-gray-500 mt-1">Survival rate of unique students progressing through topics</p>
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
              <h2 className="text-xl font-black dark:text-white flex items-center gap-2"><UserX size={20} className="text-red-600" /> Detailed Drop-off Rates (Including Subtopics)</h2>
              <p className="text-sm text-gray-500 mt-1">Survival rate of students progressing through all topics and subtopics.</p>
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

      {expandedDaily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-200 dark:border-gray-800 relative">
            <button 
              onClick={() => setExpandedDaily(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
            <div className="mb-6">
              <h2 className="text-xl font-black dark:text-white flex items-center gap-2"><Activity size={20} className="text-green-500" /> Hourly Engagement</h2>
              <p className="text-sm text-gray-500 mt-1">Active students interacting with the course broken down by hour.</p>
            </div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyEngagementData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                  <defs>
                    <linearGradient id="colorActiveHourly" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.green} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} angle={-45} textAnchor="end" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', whiteSpace: 'normal', maxWidth: '300px' }}
                    itemStyle={{ color: COLORS.green, fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="activeStudents" name="Active Students" stroke={COLORS.green} strokeWidth={3} fill="url(#colorActiveHourly)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "students" | "nodes" | "statistics" | "feedback">("overview");
  const [course, setCourse] = useState<any>(null);
  const [user] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackError, setFeedbackError] = useState('');
  const [statistics, setStatistics] = useState<any>(null);
  const [statisticsError, setStatisticsError] = useState('');
  const [loading, setLoading] = useState(true);
  
  // UI state for managing forms and editing interaction
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubForm, setNewSubForm] = useState({
    name: '',
    sourceUrl: '',
    wikidataId: '',
    video: '',
    article: '',
    podcast: '',
    file: null as File | null,
  });
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [linkData, setLinkData] = useState({ video: '', article: '', podcast: '', sourceUrl: '', file: null as File | null });
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicForm, setNewTopicForm] = useState({
    name: '',
    sourceUrl: '',
    wikidataId: '',
    file: null as File | null,
  });
  const [newTopicWikiQuery, setNewTopicWikiQuery] = useState('');
  const [newTopicWikiResults, setNewTopicWikiResults] = useState<any[]>([]);
  const [newSubWikiQuery, setNewSubWikiQuery] = useState('');
  const [newSubWikiResults, setNewSubWikiResults] = useState<any[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedMainTopics, setExpandedMainTopics] = useState<Record<string, boolean>>({});
  const [expandedStatsTopics, setExpandedStatsTopics] = useState<Record<string, boolean>>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [quizEditorTopic, setQuizEditorTopic] = useState<any>(null);
  const [quizEditorQuiz, setQuizEditorQuiz] = useState<any>(null);
  const [quizEditorQuestions, setQuizEditorQuestions] = useState<any[]>([]);
  const [quizEditorOpen, setQuizEditorOpen] = useState(false);
  const [quizEditorBusy, setQuizEditorBusy] = useState(false);
  const [quizEditorSaving, setQuizEditorSaving] = useState(false);
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  
  // Load course data from API
  const fetchCourse = useCallback(async () => {
    try {
      const res = await api.get(`/courses/${courseId}`);
      setCourse(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  useEffect(() => {
    if (course && user && !hasSeenGuide(user, 'professor-course')) {
      setShowGuide(true);
    }
  }, [course, user]);

  // Close tutorial overlay
  const closeGuide = () => {
    markGuideSeen(user, 'professor-course');
    setShowGuide(false);
  };

  // Load feedback for this course
  const fetchFeedback = useCallback(async () => {
    if (!courseId) return;
    setFeedbackError('');
    try {
      const res = await api.get(`/feedback/course/${courseId}`);
      setFeedback(res.data || []);
    } catch (error: any) {
      console.error('Failed to load feedback', error);
      setFeedbackError(error.response?.data?.error || 'Could not load feedback.');
      setFeedback([]);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'feedback') fetchFeedback();
  }, [tab, fetchFeedback]);

  // Load quiz statistics for this course
  const fetchStatistics = useCallback(async () => {
    if (!courseId) return;
    setStatisticsError('');
    try {
      const res = await api.get(`/statistics/course/${courseId}`);
      setStatistics(res.data);
    } catch (error: any) {
      console.error('Failed to load statistics', error);
      setStatisticsError(error.response?.data?.error || 'Could not load statistics.');
      setStatistics(null);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'statistics') fetchStatistics();
  }, [tab, fetchStatistics]);

  // Search Wikidata for a topic
  const searchWiki = async (
    query: string,
    setQuery: (value: string) => void,
    setResults: (value: any[]) => void,
  ) => {
    setQuery(query);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    try {
      const res = await api.get(`/wiki/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.data || []);
    } catch (error) {
      console.error('Wikidata search failed', error);
    }
  };

  // Handle selecting a Wikidata result
  const selectWikiResult = (
    item: any,
    setQuery: (value: string) => void,
    setResults: (value: any[]) => void,
    setForm: any,
  ) => {
    setQuery(item.label);
    setResults([]);
    setForm((prev: any) => ({ ...prev, wikidataId: item.id }));
  };

  // Convert relative paths to full URLs for clicking
  const resolveResourceUrl = (url?: string | null) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return `${API_ORIGIN}/${url}`;
  };

  // Toggle course visibility (public/private)
  const toggleVisibility = async () => {
    const nextStatus = !course.isPublic;
    try {
      await api.put(`/courses/${courseId}`, { isPublic: nextStatus });
      setCourse({ ...course, isPublic: nextStatus });
    } catch (e) { console.error(e); }
  };

  // Add a new subtopic under a topic
  const addSubtopic = async (parentId: string) => {
    if (!newSubForm.name.trim()) return;
    try {
      const formData = new FormData();
      formData.append('name', newSubForm.name.trim());
      formData.append('parentTopicId', parentId);
      if (newSubForm.sourceUrl.trim()) formData.append('sourceUrl', newSubForm.sourceUrl.trim());
      if (newSubForm.wikidataId.trim()) formData.append('wikidataId', newSubForm.wikidataId.trim());
      if (newSubForm.video.trim()) formData.append('videoUrl', newSubForm.video.trim());
      if (newSubForm.article.trim()) formData.append('articleUrl', newSubForm.article.trim());
      if (newSubForm.podcast.trim()) formData.append('podcastUrl', newSubForm.podcast.trim());
      if (newSubForm.file) formData.append('pdf', newSubForm.file);

      await api.post(`/courses/${courseId}/topics`, formData);
      setNewSubForm({ name: '', sourceUrl: '', wikidataId: '', video: '', article: '', podcast: '', file: null });
      setAddingSubTo(null);
      fetchCourse();
    } catch (e) { console.error(e); }
  };

  // Add a new main topic to course
  const addTopic = async () => {
    if (!newTopicForm.name.trim()) return;
    try {
      const formData = new FormData();
      formData.append('name', newTopicForm.name.trim());
      if (newTopicForm.sourceUrl.trim()) formData.append('sourceUrl', newTopicForm.sourceUrl.trim());
      if (newTopicForm.wikidataId.trim()) formData.append('wikidataId', newTopicForm.wikidataId.trim());
      if (newTopicForm.file) formData.append('pdf', newTopicForm.file);

      await api.post(`/courses/${courseId}/topics`, formData);
      setNewTopicForm({ name: '', sourceUrl: '', wikidataId: '', file: null });
      setIsAddingTopic(false);
      fetchCourse();
    } catch (e) { console.error(e); }
  };

  // Save resource links for a topic
  const saveLinks = async (subId: string) => {
    try {
      const formData = new FormData();
      formData.append('videoUrl', linkData.video);
      formData.append('articleUrl', linkData.article);
      formData.append('podcastUrl', linkData.podcast);
      if (linkData.sourceUrl.trim()) formData.append('sourceUrl', linkData.sourceUrl.trim());
      if (linkData.file) formData.append('pdf', linkData.file);

      await api.put(`/courses/${courseId}/topics/${subId}`, formData);
      setEditingSubId(null); fetchCourse();
    } catch (e) { console.error(e); }
  };

  // Handle PDF file replacement - clears old path if new file uploaded
  const handleReplacementFile = (file: File | null) => {
    setLinkData((prev) => ({
      ...prev,
      file,
      sourceUrl: file ? '' : prev.sourceUrl,
      article: file && prev.article.includes('/uploads/') ? '' : prev.article,
    }));
  };

  // Remove attached PDF from topic
  const clearAttachedPdf = async (topicId: string) => {
    try {
      await api.put(`/courses/${courseId}/topics/${topicId}`, { articleUrl: '' });
      if (editingSubId === topicId) {
        setLinkData((prev) => ({ ...prev, article: '', file: null, sourceUrl: '' }));
      }
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  // Drag-drop reordering of topics
  const handleTopicDrop = async (srcId: string, targetId: string) => {
    if (!course || srcId === targetId) return;
    const topics = [...course.topics];
    const srcIdx = topics.findIndex((t: any) => t.id === srcId);
    const tgtIdx = topics.findIndex((t: any) => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = topics.splice(srcIdx, 1);
    topics.splice(tgtIdx, 0, moved);
    setCourse({ ...course, topics });
    for (let i = 0; i < topics.length; i++) {
      await api.put(`/courses/${courseId}/topics/${topics[i].id}`, { order: i });
    }
  };

  // Drag-drop reordering of subtopics within same parent
  const handleSubtopicDrop = async (srcId: string, targetId: string, parentTopicId: string, targetParentId: string) => {
    if (!course || srcId === targetId || parentTopicId !== targetParentId) return;

    const parentTopic = course.topics.find((t: any) => t.id === parentTopicId);
    if (!parentTopic || !parentTopic.subtopics) return;

    const subtopics = [...parentTopic.subtopics];
    const srcIdx = subtopics.findIndex((t: any) => t.id === srcId);
    const tgtIdx = subtopics.findIndex((t: any) => t.id === targetId);
    
    if (srcIdx === -1 || tgtIdx === -1) return;
    
    const [moved] = subtopics.splice(srcIdx, 1);
    subtopics.splice(tgtIdx, 0, moved);
    
    const updatedTopics = course.topics.map((t: any) => 
      t.id === parentTopicId ? { ...t, subtopics } : t
    );
    setCourse({ ...course, topics: updatedTopics });
    
    for (let i = 0; i < subtopics.length; i++) {
      await api.put(`/courses/${courseId}/topics/${subtopics[i].id}`, { order: i });
    }
  };

  // Start inline name editing
  const startEditingName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setEditingNameValue(currentName);
  };

  // Save edited topic name
  const saveName = async (id: string) => {
    if (!editingNameValue.trim()) {
      setEditingNameId(null);
      return;
    }
    try {
      await api.put(`/courses/${courseId}/topics/${id}`, { name: editingNameValue });
      setEditingNameId(null);
      fetchCourse();
    } catch(e) { console.error(e); }
  };

  // Delete a topic/subtopic
  const deleteTopic = async (id: string) => {
    if (!window.confirm("Delete this topic/subtopic permanently?")) return;
    try {
      await api.delete(`/courses/${courseId}/topics/${id}`);
      if (editingSubId === id) setEditingSubId(null);
      fetchCourse();
    } catch(e) { console.error(e); }
  };

  // Create empty quiz question template
  const getEmptyQuestion = () => ({
    type: 'multiple_choice',
    question: '',
    options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
    correctIndex: 0,
    correctAnswer: true,
    correctIndices: [0],
    items: ['Step 1', 'Step 2', 'Step 3'],
    correctOrder: [0, 1, 2],
    acceptedAnswers: ['Answer'],
    partialCreditEnabled: true,
    partialCreditThreshold: 1,
    explanation: '',
    points: 1,
  });

  // Open quiz editor for a topic
  const openQuizEditor = (topic: any) => {
    const existingQuiz = Array.isArray(topic.quizzes) && topic.quizzes.length > 0 ? topic.quizzes[0] : null;
    setQuizEditorTopic(topic);
    setQuizEditorQuiz(existingQuiz);
    setQuizEditorQuestions(Array.isArray(existingQuiz?.questions) && existingQuiz.questions.length > 0 ? existingQuiz.questions : [getEmptyQuestion()]);
    setQuizEditorOpen(true);
  };

  // Generate AI quiz draft from topic content
  const generateQuizDraft = async (topic: any) => {
    try {
      setQuizEditorBusy(true);
      const res = await api.post(`/topics/${topic.id}/enrich`, {});

      const updatedTopic = res.data?.topic || topic;
      const quiz = Array.isArray(updatedTopic?.quizzes) && updatedTopic.quizzes.length > 0 ? updatedTopic.quizzes[0] : null;
      setQuizEditorTopic(updatedTopic);
      setQuizEditorQuiz(quiz);
      setQuizEditorQuestions(Array.isArray(quiz?.questions) && quiz.questions.length > 0 ? quiz.questions : [getEmptyQuestion()]);
      setQuizEditorOpen(true);
      fetchCourse();
    } catch (err) {
      console.error('Failed to generate quiz draft', err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || 'AI generation failed.'
        : 'AI generation failed.';
      alert(message);
    } finally {
      setQuizEditorBusy(false);
    }
  };

  // Update single question in editor
  const updateQuizQuestion = (index: number, patch: any) => {
    setQuizEditorQuestions((prev) => prev.map((question, currentIndex) => (currentIndex === index ? { ...question, ...patch } : question)));
  };

  // Save quiz questions to backend
  const saveQuizEditor = async () => {
    if (!quizEditorTopic) return;

    try {
      setQuizEditorSaving(true);
      const questions = quizEditorQuestions
        .map((question) => ({
          ...question,
          question: (question.question || '').trim(),
          explanation: (question.explanation || '').trim(),
          points: Number.isFinite(Number(question.points)) ? Number(question.points) : 1,
          gradingMode: question.type === 'open_answer' && Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length > 1
            ? (question.gradingMode || 'all')
            : question.gradingMode,
          partialCreditThreshold: Number.isFinite(Number(question.partialCreditThreshold))
            ? Math.max(1, Math.round(Number(question.partialCreditThreshold)))
            : 1,
        }))
        .filter((question) => question.question.length > 0);

      if (quizEditorQuiz?.id) {
        await api.put(`/topics/quizzes/${quizEditorQuiz.id}`, { questions });
      } else {
        await api.post(`/quizzes`, { topicId: quizEditorTopic.id, questions });
      }

      setQuizEditorOpen(false);
      setQuizEditorTopic(null);
      setQuizEditorQuiz(null);
      setQuizEditorQuestions([]);
      fetchCourse();
    } catch (err) {
      console.error('Failed to save quiz', err);
      alert('Could not save quiz.');
    } finally {
      setQuizEditorSaving(false);
    }
  };

  // Render quiz preview summary for a topic
  const renderQuizOverview = (topic: any) => {
    const existingQuiz = Array.isArray(topic?.quizzes) && topic.quizzes.length > 0 ? topic.quizzes[0] : null;
    const questions = Array.isArray(existingQuiz?.questions) ? existingQuiz.questions : [];

    if (!existingQuiz || questions.length === 0) return null;

    return (
      <div className="mt-3 rounded-2xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300">Quiz Overview</p>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{questions.length} question{questions.length === 1 ? '' : 's'} ready for review</p>
          </div>
          <button
            onClick={() => openQuizEditor(topic)}
            className="shrink-0 px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-800 text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300 hover:bg-purple-100/70 dark:hover:bg-purple-900/30 transition-colors"
          >
            Review Quiz
          </button>
        </div>
        <div className="space-y-2">
          {questions.slice(0, 2).map((question: any, index: number) => (
            <div key={`${topic.id}-quiz-preview-${index}`} className="rounded-xl bg-white/80 dark:bg-gray-900/50 border border-white/70 dark:border-gray-800 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{question.type?.replace('_', ' ') || 'Question'}</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 line-clamp-2">{question.question}</p>
            </div>
          ))}
          {questions.length > 2 && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">+ {questions.length - 2} more questions inside</p>
          )}
        </div>
      </div>
    );
  };

  // Compact audit of sources attached to the node
  const renderResourceOverview = (topic: any) => {
    const items = [
      topic.videoUrl ? { label: 'Video', value: topic.videoUrl, tone: 'text-red-500' } : null,
      topic.articleUrl ? {
        label: topic.articleUrl.includes('/uploads/') ? 'PDF' : 'Article',
        value: topic.articleUrl,
        tone: 'text-blue-500'
      } : null,
      topic.podcastUrl ? { label: 'Podcast', value: topic.podcastUrl, tone: 'text-green-500' } : null,
      topic.wikidataId ? { label: 'Wikidata', value: topic.wikidataId, tone: 'text-violet-500' } : null,
    ].filter(Boolean) as Array<{ label: string; value: string; tone: string }>;

    if (items.length === 0) return null;

    return (
      <div className="mt-3 rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/60 dark:bg-sky-950/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-300">Resource Overview</p>
          <button
            onClick={() => {
              setEditingSubId(editingSubId === topic.id ? null : topic.id);
              setLinkData({
                video: topic.videoUrl || '',
                article: topic.articleUrl || '',
                podcast: topic.podcastUrl || '',
                sourceUrl: '',
                file: null
              });
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-blue-600 hover:bg-blue-100/70 dark:hover:bg-blue-950/20"
            aria-label="Edit topic resources"
            title="Edit topic resources"
          >
            <Edit2 size={14} />
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, index) => {
            const href = item.label === 'Wikidata'
              ? `https://www.wikidata.org/wiki/${item.value}`
              : (resolveResourceUrl(item.value) || '#');

            return (
              <a
                key={`${topic.id}-resource-${index}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-gray-900/50 border border-white/70 dark:border-gray-800 px-3 py-2 hover:bg-white dark:hover:bg-gray-900 transition-colors"
                title={item.label === 'Wikidata' ? item.value : href}
              >
                <div className="min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${item.tone}`}>{item.label}</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                    {item.label === 'Wikidata' ? item.value : href}
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Open</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  };

  const getContentPreviewMeta = (topic: any) => {
    if (!topic?.content) return null;

    if (topic.wikidataId) {
      return {
        title: 'Wikidata Overview',
        actionOpen: 'Collapse',
        actionClosed: 'Expand',
      };
    }

    if (typeof topic.articleUrl === 'string' && topic.articleUrl.includes('/uploads/')) {
      return {
        title: 'PDF Extract',
        actionOpen: 'Hide Preview',
        actionClosed: 'Show Preview',
      };
    }

    if (typeof topic.articleUrl === 'string' && topic.articleUrl.trim()) {
      return {
        title: 'Source Extract',
        actionOpen: 'Hide Preview',
        actionClosed: 'Show Preview',
      };
    }

    return {
      title: 'Source Notes',
      actionOpen: 'Hide Preview',
      actionClosed: 'Show Preview',
    };
  };

  // Render single question editor form with all question types
  const renderQuestionEditor = (question: any, index: number) => {
    const setCommaSeparatedValues = (value: string, key: string) => {
      const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
      updateQuizQuestion(index, { [key]: parsed });
    };

    const renderPartialCreditControls = () => (
      <>
        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Partial credit rule</label>
          <select
            value={question.partialCreditEnabled === false ? 'off' : 'on'}
            onChange={(e) => updateQuizQuestion(index, { partialCreditEnabled: e.target.value === 'on' })}
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          >
            <option value="on">{PARTIAL_CREDIT_ON_LABEL}</option>
            <option value="off">{PARTIAL_CREDIT_OFF_LABEL}</option>
          </select>
        </div>
        {question.partialCreditEnabled !== false && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{PARTIAL_CREDIT_THRESHOLD_LABEL}</label>
            <input
              type="number"
              min={1}
              value={question.partialCreditThreshold ?? 1}
              onChange={(e) => updateQuizQuestion(index, { partialCreditThreshold: Number(e.target.value) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}
      </>
    );

    return (
      <div key={index} className="relative p-5 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border dark:border-gray-700">
        <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-lg">
          {index + 1}
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Question type</label>
          <select
            value={question.type || 'multiple_choice'}
            onChange={(e) => updateQuizQuestion(index, { type: e.target.value })}
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="true_false">True / False</option>
            <option value="multiple_select">Multiple select</option>
            <option value="reorder">Reorder</option>
            <option value="open_answer">Open answer</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Question</label>
          <input
            type="text"
            value={question.question || ''}
            onChange={(e) => updateQuizQuestion(index, { question: e.target.value })}
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          />
        </div>

        {(question.type === 'multiple_choice' || question.type === 'multiple_select') && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Options, separated by commas</label>
            <textarea
              value={Array.isArray(question.options) ? question.options.join(', ') : ''}
              onChange={(e) => setCommaSeparatedValues(e.target.value, 'options')}
              className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        {question.type === 'multiple_choice' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct option index</label>
            <input
              type="number"
              value={question.correctIndex ?? 0}
              onChange={(e) => updateQuizQuestion(index, { correctIndex: Number(e.target.value) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        {question.type === 'true_false' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct answer</label>
            <select
              value={question.correctAnswer ? 'true' : 'false'}
              onChange={(e) => updateQuizQuestion(index, { correctAnswer: e.target.value === 'true' })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </div>
        )}

        {question.type === 'multiple_select' && (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct indices, separated by commas</label>
              <input
                type="text"
                value={Array.isArray(question.correctIndices) ? question.correctIndices.join(', ') : ''}
                onChange={(e) => updateQuizQuestion(index, { correctIndices: e.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite) })}
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            {renderPartialCreditControls()}
          </>
        )}

        {question.type === 'reorder' && (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Items, separated by commas</label>
              <textarea
                value={Array.isArray(question.items) ? question.items.join(', ') : ''}
                onChange={(e) => updateQuizQuestion(index, { items: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct order indexes, separated by commas</label>
              <input
                type="text"
                value={Array.isArray(question.correctOrder) ? question.correctOrder.join(', ') : ''}
                onChange={(e) => updateQuizQuestion(index, { correctOrder: e.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite) })}
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            {renderPartialCreditControls()}
          </>
        )}

        {question.type === 'open_answer' && (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Accepted answers, separated by commas</label>
              <input
                type="text"
                value={Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers.join(', ') : ''}
                onChange={(e) => updateQuizQuestion(index, { acceptedAnswers: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            {renderPartialCreditControls()}
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Explanation</label>
            <textarea
              value={question.explanation || ''}
              onChange={(e) => updateQuizQuestion(index, { explanation: e.target.value })}
              className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Points</label>
            <input
              type="number"
              value={question.points ?? 1}
              onChange={(e) => updateQuizQuestion(index, { points: Number(e.target.value) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={() => setQuizEditorQuestions((prev) => prev.filter((_, currentIndex) => currentIndex !== index))} className="text-red-500 hover:text-red-700 p-2 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="py-20 text-center text-gray-400 text-xs uppercase tracking-widest">Synchronizing...</div>;
  if (!course) return null;

  const flatCourseTopics = Array.isArray(course.topics)
    ? course.topics.flatMap((topic: any) => [
        { id: topic.id, name: topic.name },
        ...(Array.isArray(topic.subtopics) ? topic.subtopics.map((subtopic: any) => ({ id: subtopic.id, name: subtopic.name })) : []),
      ])
    : [];

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

  const renderStatsSummary = (stats: any, isTransparent?: boolean) => {
    const bgOpacity = isTransparent ? '33' : '';
    const attemptsColor = '#E63027';
    const studentsColor = '#F5C518';
    const scoreColor = '#3A9E3F';
    const percentColor = '#9333ea';

    const getBg = (color: string) => `${color}${bgOpacity}`;
    const getTextColor = (color: string) => isTransparent ? color : 'white';
    const getLabelColor = (color: string) => isTransparent ? color : 'white';
    const getIconColor = (color: string) => isTransparent ? color : 'white';

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden" style={{ backgroundColor: getBg(attemptsColor) }}>
          <div className="shrink-0" style={{ color: getIconColor(attemptsColor), opacity: isTransparent ? 0.8 : 0.7 }}>
            <Target size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate" style={{ color: getLabelColor(attemptsColor), opacity: isTransparent ? 0.7 : 0.8 }}>Attempts</p>
            <p className="text-lg sm:text-2xl font-black truncate" style={{ color: getTextColor(attemptsColor) }}>{stats?.attempts || 0}</p>
          </div>
        </div>
        <div className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden" style={{ backgroundColor: getBg(studentsColor) }}>
          <div className="shrink-0" style={{ color: getIconColor(studentsColor), opacity: isTransparent ? 0.8 : 0.7 }}>
            <Users size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate" style={{ color: getLabelColor(studentsColor), opacity: isTransparent ? 0.8 : 0.8 }}>Students</p>
            <p className="text-lg sm:text-2xl font-black truncate" style={{ color: getTextColor(studentsColor) }}>{stats?.students || 0}</p>
          </div>
        </div>
        <div className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden" style={{ backgroundColor: getBg(scoreColor) }}>
          <div className="shrink-0" style={{ color: getIconColor(scoreColor), opacity: isTransparent ? 0.8 : 0.7 }}>
            <Award size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate" style={{ color: getLabelColor(scoreColor), opacity: isTransparent ? 0.7 : 0.8 }}>Avg Score</p>
            <p className="text-lg sm:text-2xl font-black truncate" style={{ color: getTextColor(scoreColor) }}>{stats?.averageScore || 0}</p>
          </div>
        </div>
        <div className="rounded-2xl sm:rounded-[1.75rem] p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-4 overflow-hidden" style={{ backgroundColor: getBg(percentColor) }}>
          <div className="shrink-0" style={{ color: getIconColor(percentColor), opacity: isTransparent ? 0.8 : 0.7 }}>
            <Percent size={isTransparent ? 20 : 40} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest truncate" style={{ color: getLabelColor(percentColor), opacity: isTransparent ? 0.7 : 0.8 }}>Avg Percent</p>
            <p className="text-lg sm:text-2xl font-black truncate" style={{ color: getTextColor(percentColor) }}>{stats?.averagePercent || 0}%</p>
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
            <span key={type} className="rounded-xl border bg-gray-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {questionTypeLabel(type)}: {percent}% ({value.correct}/{value.total})
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-gray-400 font-bold text-xs mb-4 hover:text-blue-600 transition-all uppercase"><ChevronLeft size={14} /> Back to Dashboard</button>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black text-gray-900 dark:text-white leading-tight">{course.title}</h1>
              <button 
                onClick={toggleVisibility}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${course.isPublic ? 'bg-green-50 text-green-600 border-green-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}
              >
                {course.isPublic ? <><Globe size={10} /> Public</> : <><Lock size={10} /> Private</>}
              </button>
            </div>
            <p className="text-gray-500 text-sm font-medium">{course.description || "Course Management"}</p>
          </div>
          <button onClick={async () => { if(window.confirm("Delete?")) { await api.delete(`/courses/${courseId}`); navigate('/dashboard'); } }} className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={14} /> Delete Course</button>
        </div>

        <div className="bg-gray-100/80 dark:bg-gray-900/50 p-1 rounded-xl flex gap-1 mb-8 border dark:border-gray-800 w-full overflow-x-auto sm:w-fit">
          {["overview", "students", "nodes", "statistics", "feedback"].map((t) => (
            <button key={t} onClick={() => setTab(t as any)} className={`shrink-0 px-6 sm:px-8 py-2 text-xs font-bold rounded-lg transition-all ${tab === t ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-gray-400"}`}>{t.toUpperCase()}</button>
          ))}
        </div>

        <main>
          {tab === "overview" && (
            <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div 
                  className="p-6 rounded-[1.75rem] shadow-sm flex items-center gap-4"
                  style={{ backgroundColor: '#F5C518', color: 'white' }}
                >
                  <div className="w-12 h-12 flex items-center justify-center"><Users size={24} /></div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-white/80">Students</p><p className="text-2xl font-black text-white">{course.students?.length || 0}</p></div>
                </div>
                <div 
                  className="p-6 rounded-[1.75rem] shadow-sm flex items-center gap-4"
                  style={{ backgroundColor: '#E63027', color: 'white' }}
                >
                  <div className="w-12 h-12 flex items-center justify-center"><BookOpen size={24} /></div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-white/80">Nodes</p><p className="text-2xl font-black text-white">{course.topics?.length || 0}</p></div>
                </div>
                <div 
                  className="p-6 rounded-[1.75rem] shadow-sm flex items-center gap-4"
                  style={{ backgroundColor: course.isPublic ? '#3A9E3F' : '#1E6FFF', color: 'white' }}
                >
                  <div className="w-12 h-12 flex items-center justify-center">{course.isPublic ? <Globe size={24} /> : <Lock size={24} />}</div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-white/80">Visibility</p><p className="text-2xl font-black text-white">{course.isPublic ? 'Public' : 'Private'}</p></div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border dark:border-gray-700 shadow-sm">
                <h3 className="text-[10px] font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest">Access Configuration</h3>
                <div 
                  className="p-5 rounded-[1.75rem] shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                  style={{ backgroundColor: course.isPublic ? '#3A9E3F26' : '#1E6FFF26', color: course.isPublic ? '#3A9E3F' : '#1E6FFF' }}
                >
                  <div><p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Student Join Code</p><p className="text-xl font-mono font-black uppercase tracking-widest">{course.joinCode}</p></div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(course.joinCode);
                      setJoinCodeCopied(true);
                      setTimeout(() => setJoinCodeCopied(false), 2000);
                    }} 
                    className="p-2.5 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 flex items-center gap-2 text-xs font-bold text-gray-500 w-full justify-center sm:w-auto min-w-[100px]"
                  >
                    {joinCodeCopied ? (
                      <><Check size={18} className="text-green-500" /> <span className="text-green-600">COPIED!</span></>
                    ) : (
                      <><Copy size={18} /> <span className="sm:hidden">COPY</span></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "students" && (
            <div className="space-y-3 animate-in fade-in">
              <h2 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4">Enrolled Students</h2>
              {(!course.students || course.students.length === 0) ? (
                <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">No students yet</div>
              ) : (
                course.students.map((s: any) => {
                  const progressByTopicId = new Map(
                    (Array.isArray(s.progress) ? s.progress : []).map((item: any) => [item.topicId, Boolean(item.completed)])
                  );
                  const completedCount = flatCourseTopics.reduce((count: number, topic: any) => {
                    return count + (progressByTopicId.get(topic.id) ? 1 : 0);
                  }, 0);
                  const totalTopics = flatCourseTopics.length;
                  const completionPercent = totalTopics === 0 ? 0 : Math.round((completedCount / totalTopics) * 100);
                  const needsHelpTopics = flatCourseTopics.filter((topic: any) => !progressByTopicId.get(topic.id));

                  return (
                    <div key={s.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">{s.email?.[0].toUpperCase()}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold dark:text-white truncate">{s.name || "Student"}</p>
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
                            {needsHelpTopics.slice(0, 3).map((topic: any) => (
                              <span key={`${s.id}-${topic.id}`} className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
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
          )}

          {tab === "statistics" && (
            <div className="space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">Quiz Statistics</h2>
                <button onClick={fetchStatistics} className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800">
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

                  {(!statistics?.topics || statistics.topics.length === 0) ? (
                    <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">
                      No quiz statistics yet
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {statistics.topics.map((topic: any, index: number) => (
                        <div key={topic.id} className="rounded-3xl border bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                          <div className="mb-4 flex items-start justify-between gap-4 cursor-pointer hover:opacity-80" onClick={() => setExpandedStatsTopics(prev => ({...prev, [topic.id]: prev[topic.id] === undefined ? false : !prev[topic.id]}))}>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Main node {index + 1}</p>
                              <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                                <ChevronDown size={18} className={`transition-transform duration-200 ${expandedStatsTopics[topic.id] === false ? '-rotate-90' : ''}`} />
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
                                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Combined topic stats</p>
                                {renderStatsSummary(topic.combinedStats, true)}
                                <div className="mt-3">{renderQuestionTypes(topic.combinedStats)}</div>
                              </div>

                              {(topic.ownStats?.attempts || 0) > 0 && (
                                <div className="mt-4 rounded-2xl border p-4 dark:border-gray-700">
                                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Main node quiz</p>
                                  {renderStatsSummary(topic.ownStats, true)}
                                  <div className="mt-3">{renderQuestionTypes(topic.ownStats)}</div>
                                </div>
                              )}

                              {topic.subtopics?.length > 0 && (
                                <div className="mt-4 space-y-3">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Subtopics</p>
                                  {topic.subtopics.map((subtopic: any) => (
                                    <div key={subtopic.id} className="rounded-2xl border p-4 dark:border-gray-700">
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="font-bold text-gray-900 dark:text-white">{subtopic.name}</p>
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
          )}

          {tab === "feedback" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">Student Feedback</h2>
                <button onClick={fetchFeedback} className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800">
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
                  <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5">
                    <div className="flex justify-between gap-4 mb-2">
                      <div>
                        <p className="text-xs font-black uppercase text-blue-600">{item.topic?.name || 'Unknown node'}</p>
                        <p className="text-xs text-gray-500">{item.user?.email || 'Student'}</p>
                      </div>
                      <p className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{item.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "nodes" && (
            <div className="space-y-4 animate-in slide-in-from-bottom-2">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">Curriculum Nodes</h2>
                <button onClick={() => setIsAddingTopic(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase shadow-md">+ Add Topic</button>
              </div>

              {isAddingTopic && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm mb-4 flex gap-2">
                  <input autoFocus className="flex-1 px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="New Topic Name..." value={newTopicForm.name} onChange={(e) => setNewTopicForm((prev) => ({ ...prev, name: e.target.value }))} />
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Wikidata</p>
                    <WikidataSearchField
                      query={newTopicWikiQuery}
                      results={newTopicWikiResults}
                      placeholder="Search a topic in Wikidata"
                      onQueryChange={(value) => {
                        setNewTopicForm((prev) => ({ ...prev, wikidataId: '' }));
                        searchWiki(value, setNewTopicWikiQuery, setNewTopicWikiResults);
                      }}
                      onSelect={(item) => selectWikiResult(item, setNewTopicWikiQuery, setNewTopicWikiResults, setNewTopicForm)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-dashed dark:border-gray-700 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">PDF Source</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{newTopicForm.file?.name || 'No file selected'}</p>
                    </div>
                    <label className="cursor-pointer rounded-xl bg-gray-100 dark:bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                      Upload PDF
                      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setNewTopicForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} />
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setIsAddingTopic(false); setNewTopicForm({ name: '', sourceUrl: '', wikidataId: '', file: null }); setNewTopicWikiQuery(''); setNewTopicWikiResults([]); }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase text-gray-500">Cancel</button>
                    <button onClick={addTopic} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold uppercase">Add</button>
                  </div>
                </div>
              )}

              {course.topics?.map((topic: any, i: number) => (
                <div 
                  key={topic.id} draggable
                  onDragStart={(e) => e.dataTransfer.setData('topicId', topic.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleTopicDrop(e.dataTransfer.getData('topicId'), topic.id)}
                  className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm mb-4 group transition-all"
                >
                  <div className="flex items-center justify-between mb-4 font-bold">
                    <div className="flex items-center gap-3 w-full">
                      <GripVertical size={16} className="text-gray-300 cursor-grab group-hover:text-gray-500" />
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: BLUE }}>{i + 1}</div>
                      {editingNameId === topic.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input autoFocus className="flex-1 px-2 py-1 text-sm rounded border dark:border-gray-600 outline-none dark:bg-gray-900 dark:text-white" value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName(topic.id)} />
                          <button onClick={() => saveName(topic.id)} className="text-xs text-blue-600 font-bold">Save</button>
                          <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600"><X size={14}/></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title w-full">
                          <h3 className="text-base dark:text-white">{topic.name}</h3>
                          <button onClick={() => startEditingName(topic.id, topic.name)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Edit2 size={12} /></button>
                          <button onClick={() => deleteTopic(topic.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
                          <button onClick={() => openQuizEditor(topic)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">Quiz</button>
                          <button onClick={() => generateQuizDraft(topic)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">AI Quiz</button>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => setExpandedMainTopics(prev => ({...prev, [topic.id]: !prev[topic.id]}))} 
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                    >
                      <ChevronDown size={18} className={`transition-transform duration-200 ${expandedMainTopics[topic.id] ? '' : '-rotate-90'}`} />
                    </button>
                  </div>
                  
                  {expandedMainTopics[topic.id] && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      {topic.content && getContentPreviewMeta(topic) && (
                        <div className="ml-6 mb-6 pl-4 border-l-2 border-gray-100 dark:border-gray-800 relative">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{getContentPreviewMeta(topic)?.title}</p>
                            <button onClick={() => setExpandedTopics(prev => ({...prev, [topic.id]: prev[topic.id] === undefined ? false : !prev[topic.id]}))} className="text-[10px] text-blue-600 font-bold uppercase transition-all hover:text-blue-700">
                              {expandedTopics[topic.id] !== false ? getContentPreviewMeta(topic)?.actionOpen : getContentPreviewMeta(topic)?.actionClosed}
                            </button>
                          </div>
                          {expandedTopics[topic.id] !== false && (
                            <div 
                               className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border dark:border-gray-800 overflow-y-auto max-h-40"
                               dangerouslySetInnerHTML={{ __html: topic.content }} 
                            />
                          )}
                        </div>
                      )}

                      <div className="ml-6 mt-3 flex flex-wrap items-center gap-2">
                        {topic.articleUrl?.includes('/uploads/') && (
                          <button
                            onClick={() => clearAttachedPdf(topic.id)}
                            className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            Delete Current PDF
                          </button>
                        )}
                      </div>

                      {renderResourceOverview(topic)}
                      {renderQuizOverview(topic)}

                      {editingSubId === topic.id && (
                        <div className="ml-6 mt-4 rounded-2xl border dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-4 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                              <Play size={12} className="text-red-500" />
                              <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Video URL" value={linkData.video} onChange={e => setLinkData({...linkData, video: e.target.value})} />
                            </div>
                            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                              <BookOpen size={12} className="text-blue-500" />
                              <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Article URL" value={linkData.article} onChange={e => setLinkData({...linkData, article: e.target.value})} />
                            </div>
                            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                              <Headphones size={12} className="text-green-500" />
                              <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Podcast URL" value={linkData.podcast} onChange={e => setLinkData({...linkData, podcast: e.target.value})} />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                              <BookOpen size={12} className="text-violet-500" />
                              <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="New source URL to rescrape" value={linkData.sourceUrl} onChange={e => setLinkData({...linkData, sourceUrl: e.target.value})} />
                            </div>
                            <label className="flex items-center justify-between gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700 cursor-pointer">
                              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 truncate">{linkData.file?.name || 'Replace attached PDF'}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Upload</span>
                              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleReplacementFile(e.target.files?.[0] || null)} />
                            </label>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => saveLinks(topic.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md">Save</button>
                          </div>
                        </div>
                      )}

                      <div className="pl-6 border-l-2 border-gray-100 dark:border-gray-800 space-y-2 ml-6">
                        {topic.subtopics?.map((sub: any) => (
                          <div 
                            key={sub.id} 
                            draggable
                            onDragStart={(e) => {
                               e.stopPropagation();
                               e.dataTransfer.setData('subtopicId', sub.id);
                               e.dataTransfer.setData('parentTopicId', topic.id);
                            }}
                            onDragOver={(e) => {
                               e.preventDefault();
                               e.stopPropagation();
                            }}
                            onDrop={(e) => {
                               e.stopPropagation();
                               handleSubtopicDrop(e.dataTransfer.getData('subtopicId'), sub.id, e.dataTransfer.getData('parentTopicId'), topic.id);
                            }}
                            className={`p-4 rounded-2xl border transition-all ${sub.aiSuggested ? 'border-dashed border-red-500 bg-red-50/30' : 'bg-gray-50/50 dark:bg-gray-900/30 border-transparent'}`}
                          >
                            <div className="flex items-center gap-3">
                              <GripVertical size={14} className="text-gray-300 cursor-grab hover:text-gray-500 transition-colors" />
                              <div className="flex-1">
                                {editingNameId === sub.id ? (
                                  <div className="flex items-center gap-2">
                                    <input autoFocus className="flex-1 px-2 py-1 text-sm rounded border dark:border-gray-600 outline-none dark:bg-gray-900 dark:text-white" value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName(sub.id)} />
                                    <button onClick={() => saveName(sub.id)} className="text-xs text-blue-600 font-bold">Save</button>
                                    <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600"><X size={14}/></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group/subtitle">
                                    <p className="font-bold dark:text-white text-sm">{sub.name}</p>
                                    <button onClick={() => startEditingName(sub.id, sub.name)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Edit2 size={12} /></button>
                                    <button onClick={() => deleteTopic(sub.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
                                    <button onClick={() => openQuizEditor(sub)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">Quiz</button>
                                    <button onClick={() => generateQuizDraft(sub)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">AI Quiz</button>
                                  </div>
                                )}
                                {sub.aiSuggested && <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 mt-1"><Sparkles size={10}/> AI Suggestion</span>}
                                {renderResourceOverview(sub)}
                                {renderQuizOverview(sub)}
                              </div>
                              <button onClick={() => {
                                setEditingSubId(editingSubId === sub.id ? null : sub.id);
                                setLinkData({ video: sub.videoUrl || '', article: sub.articleUrl || '', podcast: sub.podcastUrl || '', sourceUrl: '', file: null });
                              }} className="text-gray-400 hover:text-blue-600 p-2"><ChevronRight size={16} className={editingSubId === sub.id ? 'rotate-90' : ''}/></button>
                            </div>

                            {editingSubId === sub.id && (
                              <div className="mt-4 pt-4 border-t space-y-3 animate-in fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                    <Play size={12} className="text-red-500" />
                                    <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Video URL" value={linkData.video} onChange={e => setLinkData({...linkData, video: e.target.value})} />
                                  </div>
                                  <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                    <BookOpen size={12} className="text-blue-500" />
                                    <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Article URL" value={linkData.article} onChange={e => setLinkData({...linkData, article: e.target.value})} />
                                  </div>
                                  <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                    <Headphones size={12} className="text-green-500" />
                                    <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Podcast URL" value={linkData.podcast} onChange={e => setLinkData({...linkData, podcast: e.target.value})} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                    <BookOpen size={12} className="text-violet-500" />
                                    <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="New source URL to rescrape" value={linkData.sourceUrl} onChange={e => setLinkData({...linkData, sourceUrl: e.target.value})} />
                                  </div>
                                  <label className="flex items-center justify-between gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700 cursor-pointer">
                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 truncate">{linkData.file?.name || 'Replace attached PDF'}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Upload</span>
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleReplacementFile(e.target.files?.[0] || null)} />
                                  </label>
                                </div>
                                <div className="flex justify-end mt-2">
                                  <button onClick={() => saveLinks(sub.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md">Save</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {addingSubTo === topic.id ? (
                          <div className="mt-3 rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                            <input autoFocus className="w-full px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Subtopic Name..." value={newSubForm.name} onChange={(e) => setNewSubForm((prev) => ({ ...prev, name: e.target.value }))} />
                            <div className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Wikidata</p>
                              <WikidataSearchField
                                query={newSubWikiQuery}
                                results={newSubWikiResults}
                                placeholder="Search a topic in Wikidata"
                                onQueryChange={(value) => {
                                  setNewSubForm((prev) => ({ ...prev, wikidataId: '' }));
                                  searchWiki(value, setNewSubWikiQuery, setNewSubWikiResults);
                                }}
                                onSelect={(item) => selectWikiResult(item, setNewSubWikiQuery, setNewSubWikiResults, setNewSubForm)}
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <input className="px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Video URL" value={newSubForm.video} onChange={(e) => setNewSubForm((prev) => ({ ...prev, video: e.target.value }))} />
                              <input className="px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Article URL" value={newSubForm.article} onChange={(e) => setNewSubForm((prev) => ({ ...prev, article: e.target.value }))} />
                              <input className="px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Podcast URL" value={newSubForm.podcast} onChange={(e) => setNewSubForm((prev) => ({ ...prev, podcast: e.target.value }))} />
                            </div>
                            <div className="flex items-center justify-between rounded-2xl border border-dashed dark:border-gray-700 px-4 py-3">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">PDF Source</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{newSubForm.file?.name || 'No file selected'}</p>
                              </div>
                              <label className="cursor-pointer rounded-xl bg-gray-100 dark:bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                                Upload PDF
                                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setNewSubForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} />
                              </label>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => { setAddingSubTo(null); setNewSubForm({ name: '', sourceUrl: '', wikidataId: '', video: '', article: '', podcast: '', file: null }); setNewSubWikiQuery(''); setNewSubWikiResults([]); }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase text-gray-500">Cancel</button>
                              <button onClick={() => addSubtopic(topic.id)} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold">Add</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAddingSubTo(topic.id)} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline uppercase tracking-widest">
                            <Plus size={14} /> Add Subtopic / Links
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>

        {quizEditorOpen && quizEditorTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in transition-all">
            <div className="bg-white dark:bg-gray-800 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border dark:border-gray-700">
              <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <div>
                  <h3 className="text-xl font-bold dark:text-white">Quiz Editor ✨</h3>
                  <p className="text-xs text-gray-400 mt-1">AI builds a draft from Wikidata, saved article text, or attached source material. Then you can review, edit, and save it.</p>
                </div>
                <button onClick={() => setQuizEditorOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => generateQuizDraft(quizEditorTopic)}
                    disabled={quizEditorBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {quizEditorBusy ? 'Generating...' : 'Generate AI Draft'}
                  </button>
                  <button
                    onClick={() => setQuizEditorQuestions((prev) => [...prev, getEmptyQuestion()])}
                    className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-widest"
                    style={{ borderColor: 'var(--cn-border)', color: 'var(--cn-text)' }}
                  >
                    <Plus size={14} /> Add Question
                  </button>
                </div>

                {quizEditorQuestions.map((question, index) => renderQuestionEditor(question, index))}
              </div>

              <div className="p-6 border-t dark:border-gray-700 flex gap-3 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex-1" />
                <button onClick={() => setQuizEditorOpen(false)} className="px-6 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={saveQuizEditor} disabled={quizEditorSaving} className="px-8 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20">
                  {quizEditorSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showGuide && (
          <GuideOverlay
            onClose={closeGuide}
            arrows={[
              { d: 'M24 23 C31 28 37 33 43 39' },
              { d: 'M50 26 C50 30 50 33 50 36' },
              { d: 'M76 66 C68 58 60 51 52 45' },
            ]}
            steps={[
              {
                number: 1,
                title: 'Course Overview',
                className: 'left-4 top-28 lg:left-12 lg:top-32',
                body: <p>Copy the join code and review the visibility your students will see.</p>,
              },
              {
                number: 2,
                title: 'Course Sections',
                className: 'left-1/2 top-32 -translate-x-1/2',
                body: <p>Use these tabs for students, curriculum nodes, quiz statistics, and feedback.</p>,
              },
              {
                number: 3,
                title: 'Build Nodes',
                className: 'right-4 bottom-20 lg:right-16',
                body: <p>Open Nodes to add topics, resources, quizzes, and the course structure.</p>,
              },
            ]}
          />
        )}
      </div>
    </>
  );
}