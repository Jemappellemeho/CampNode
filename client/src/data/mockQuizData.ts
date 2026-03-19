// =============================================================
// FILE LOCATION: client/src/data/mockQuizData.ts
//
// WHAT THIS IS:
// Fake quiz data for building the UI before Gemini is ready.
// When Anastasia's quiz generation is done, this gets replaced
// with a real fetch() call to GET /api/quizzes/:topicId
//
// QUESTION TYPES SUPPORTED:
// - multiple_choice   → pick exactly one answer
// - multiple_select   → pick all that apply
// - true_false        → true or false
// - reorder           → drag items into correct order
// - open_answer       → type a free text / math answer
// =============================================================

export type QuestionType =
  | "multiple_choice"
  | "multiple_select"
  | "true_false"
  | "reorder"
  | "open_answer";

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  question: string;
  explanation: string; // shown after answering
  points: number;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: "multiple_choice";
  options: string[];
  correctIndex: number;
}

export interface MultipleSelectQuestion extends BaseQuestion {
  type: "multiple_select";
  options: string[];
  correctIndices: number[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: "true_false";
  correctAnswer: boolean;
}

export interface ReorderQuestion extends BaseQuestion {
  type: "reorder";
  items: string[];
  correctOrder: number[]; // indices in correct order
}

export interface OpenAnswerQuestion extends BaseQuestion {
  type: "open_answer";
  acceptedAnswers: string[]; // lowercase, trimmed
  hint?: string;
}

export type Question =
  | MultipleChoiceQuestion
  | MultipleSelectQuestion
  | TrueFalseQuestion
  | ReorderQuestion
  | OpenAnswerQuestion;

export interface Quiz {
  id: string;
  topicId: string;
  topicTitle: string;
  passingScore: number; // percentage needed to pass e.g. 70
  questions: Question[];
}

// ---- MOCK QUIZ: Binary Search Trees ----
export const MOCK_QUIZ: Quiz = {
  id: "quiz-bst-001",
  topicId: "node-3",
  topicTitle: "Binary Search Trees",
  passingScore: 70,
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      question: "What is the time complexity of searching in a balanced Binary Search Tree?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
      correctIndex: 1,
      explanation: "In a balanced BST, each comparison eliminates half the remaining nodes, giving O(log n) search time.",
      points: 10,
    },
    {
      id: "q2",
      type: "true_false",
      question: "In a Binary Search Tree, all nodes in the left subtree are greater than the root node.",
      correctAnswer: false,
      explanation: "False — in a BST, left subtree nodes are SMALLER than the root, right subtree nodes are GREATER.",
      points: 10,
    },
    {
      id: "q3",
      type: "multiple_select",
      question: "Which of the following are valid BST traversal methods? (Select all that apply)",
      options: ["In-order", "Pre-order", "Diagonal-order", "Post-order", "Level-order"],
      correctIndices: [0, 1, 3, 4],
      explanation: "In-order, Pre-order, Post-order and Level-order are all valid traversals. Diagonal-order is not a standard BST traversal.",
      points: 15,
    },
    {
      id: "q4",
      type: "reorder",
      question: "Put these BST operations in order from fastest to slowest in the WORST case:",
      items: ["Search", "Insert", "Delete", "Find minimum"],
      correctOrder: [3, 0, 1, 2],
      explanation: "Find minimum is O(h), search is O(h), insert is O(h), delete is most complex as it requires restructuring.",
      points: 15,
    },
    {
      id: "q5",
      type: "open_answer",
      question: "What is the height of a complete BST with 7 nodes?",
      acceptedAnswers: ["2", "two", "2 levels", "height 2"],
      hint: "Think about how many levels a perfect binary tree with 7 nodes would have (root is level 0)",
      explanation: "A complete BST with 7 nodes has height 2: root at level 0, 2 nodes at level 1, 4 nodes at level 2.",
      points: 20,
    },
    {
      id: "q6",
      type: "multiple_choice",
      question: "What happens when you delete a node with TWO children from a BST?",
      options: [
        "The node is simply removed",
        "It is replaced by its in-order successor or predecessor",
        "The entire subtree is deleted",
        "The tree becomes unbalanced automatically"
      ],
      correctIndex: 1,
      explanation: "When deleting a node with two children, we replace it with either its in-order successor (smallest in right subtree) or in-order predecessor (largest in left subtree).",
      points: 10,
    },
    {
      id: "q7",
      type: "true_false",
      question: "An AVL tree is a self-balancing Binary Search Tree.",
      correctAnswer: true,
      explanation: "True — AVL trees automatically rebalance after insertions and deletions to maintain O(log n) operations.",
      points: 10,
    },
  ],
};