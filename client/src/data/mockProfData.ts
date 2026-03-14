// mockProfData.ts
//  When the APIs
// are ready, you delete this file and replace the imports
// in each page with real fetch() calls. One swap = done. 🎉
// -----------------------------------------------------------

export interface Course {
  id: string;
  title: string;
  description: string;
  joinCode: string;
  isPublic: boolean;
  studentCount: number;
  nodeCount: number;
  createdAt: string;
  avgCompletion: number; // 0–100 percent
}

export interface Student {
  id: string;
  name: string;
  email: string;
  completedNodes: number;
  totalNodes: number;
  lastActive: string;
  confusionFlags: number;
}

export const MOCK_PROFESSOR = {
  name: "Dr. Elena Vasquez",
  email: "e.vasquez@uni.edu",
  avatarInitials: "EV",
};

export const MOCK_COURSES: Course[] = [
  {
    id: "course-1",
    title: "Introduction to Algorithms",
    description: "Sorting, searching, complexity analysis and graph traversal fundamentals.",
    joinCode: "ALGO-4821",
    isPublic: false,
    studentCount: 34,
    nodeCount: 12,
    createdAt: "2025-09-01",
    avgCompletion: 68,
  },
  {
    id: "course-2",
    title: "Database Systems",
    description: "Relational models, SQL, normalization, transactions and NoSQL basics.",
    joinCode: "DB-7703",
    isPublic: true,
    studentCount: 51,
    nodeCount: 9,
    createdAt: "2025-09-15",
    avgCompletion: 42,
  },
  {
    id: "course-3",
    title: "Web Development Fundamentals",
    description: "HTML, CSS, JavaScript, REST APIs and basic React.",
    joinCode: "WEB-1192",
    isPublic: true,
    studentCount: 78,
    nodeCount: 15,
    createdAt: "2025-10-01",
    avgCompletion: 81,
  },
];

export const MOCK_STUDENTS_COURSE_1: Student[] = [
  { id: "s1", name: "Alex Müller", email: "alex@uni.edu", completedNodes: 8, totalNodes: 12, lastActive: "2 hours ago", confusionFlags: 0 },
  { id: "s2", name: "Priya Sharma", email: "priya@uni.edu", completedNodes: 12, totalNodes: 12, lastActive: "1 day ago", confusionFlags: 1 },
  { id: "s3", name: "Jonas Weber", email: "jonas@uni.edu", completedNodes: 3, totalNodes: 12, lastActive: "5 days ago", confusionFlags: 3 },
  { id: "s4", name: "Chloe Bernard", email: "chloe@uni.edu", completedNodes: 10, totalNodes: 12, lastActive: "3 hours ago", confusionFlags: 0 },
];
export interface TopicNode {
  id: string;
  title: string;
  description: string;
  isAISuggested: boolean;
  accepted: boolean;
  prerequisiteIds: string[];
}
export const MOCK_NODES_COURSE_1: TopicNode[] = [
  {
    id: "node-1",
    title: "Big O Notation",
    description: "Time and space complexity analysis",
    isAISuggested: false,
    accepted: true,
    prerequisiteIds: [],
  },
  {
    id: "node-2",
    title: "Arrays & Linked Lists",
    description: "Linear data structures and their trade-offs",
    isAISuggested: false,
    accepted: true,
    prerequisiteIds: ["node-1"],
  },
  {
    id: "node-3",
    title: "Binary Search",
    description: "Efficient search on sorted arrays",
    isAISuggested: false,
    accepted: true,
    prerequisiteIds: ["node-2"],
  },
  {
    id: "node-4",
    title: "Recursion",
    description: "Base cases, call stacks, recursive thinking",
    isAISuggested: true,
    accepted: true,
    prerequisiteIds: ["node-1"],
  },
  {
    id: "node-5",
    title: "Merge Sort",
    description: "Divide and conquer sorting algorithm",
    isAISuggested: false,
    accepted: true,
    prerequisiteIds: ["node-3", "node-4"],
  },
];