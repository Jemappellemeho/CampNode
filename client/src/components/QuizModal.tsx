/**
 * Props interface for the QuizModal component.
 *
 * @interface QuizProps
 * @param quiz - Quiz data object containing questions and metadata
 * @param onClose - Callback to close the modal
 * @param onSuccess - Callback when quiz is completed (currently unused, reserved for future)
 */
interface QuizProps {
  quiz: { isOpen: boolean; questions: any[]; title: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Renders the appropriate input UI based on question type.
 * This is a display-only component for showing questions in the modal;
 * actual scoring happens in Quiz.tsx.
 *
 * Question types supported:
 * - true_false: Two buttons for True/False selection
 * - multiple_choice: Single-select options (radio-style)
 * - multiple_select: Multi-select options (checkbox-style)
 * - reorder: Drag-to-order list of items
 * - open_answer: Text input for typed answer
 *
 * @param question - Question object with type, options, hint, etc.
 * @returns React element with the appropriate input UI
 */
function renderQuestionContent(question: any) {
  const type = question?.type;

  // Type: true_false
  // Example: "Is Kotlin a statically typed language?" -> True / False buttons
  if (type === "true_false") {
    return (
      <div className="space-y-2">
        <button className="w-full text-left p-3 rounded-lg border hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors" style={{ color: 'var(--cn-text)', borderColor: 'var(--cn-border)' }}>True</button>
        <button className="w-full text-left p-3 rounded-lg border hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" style={{ color: 'var(--cn-text)', borderColor: 'var(--cn-border)' }}>False</button>
      </div>
    );
  }

  // Types: multiple_choice, multiple_select
  // multiple_choice: only one answer allowed
  // multiple_select: multiple answers allowed (checkboxes)
  if (type === "multiple_choice" || type === "multiple_select") {
    const options = Array.isArray(question.options) ? question.options : [];
    return (
      <div className="space-y-2">
        {options.map((option: string, idx: number) => (
          <button key={idx} className="w-full text-left p-3 rounded-lg border hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-sm break-words" style={{ color: 'var(--cn-text)', borderColor: 'var(--cn-border)' }}>
            {type === "multiple_select" ? `☐ ${option}` : option}
          </button>
        ))}
      </div>
    );
  }

  // Type: reorder
  // User drags items to arrange in correct order
  if (type === "reorder") {
    const items = Array.isArray(question.items) ? question.items : [];
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Arrange in correct order:</p>
        {items.map((item: string, idx: number) => (
          <div key={idx} className="flex items-center p-3 rounded-lg border bg-gray-50 dark:bg-gray-800" style={{ borderColor: 'var(--cn-border)' }}>
            <span className="text-gray-400 mr-3">⋮</span>
            <span className="text-sm break-words" style={{ color: 'var(--cn-text)' }}>{item}</span>
          </div>
        ))}
      </div>
    );
  }

  // Type: open_answer
  // User types a text answer
  if (type === "open_answer") {
    return (
      <div className="space-y-2">
        <input type="text" placeholder="Type your answer..." className="w-full p-3 rounded-lg border text-sm" style={{ color: 'var(--cn-text)', borderColor: 'var(--cn-border)' }} />
        {question.hint && <p className="text-xs text-gray-500">Hint: {question.hint}</p>}
      </div>
    );
  }

  return null;
}

// onSuccess stays in QuizProps (callers may pass it) but is intentionally not destructured here
// because it is currently unused — avoids a noUnusedLocals build error.
export default function QuizModal({ quiz, onClose }: QuizProps) {
  if (!quiz || !quiz.isOpen) return null;

  const validQuestions = Array.isArray(quiz.questions) ? quiz.questions.filter((q: any) => q && typeof q === 'object' && !q._source) : [];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full max-w-2xl p-8 rounded-3xl shadow-2xl animate-in zoom-in-95 border" style={{ borderColor: 'var(--cn-border)' }}>
        <h2 className="text-2xl font-black mb-6 text-blue-600">{quiz.title} - Knowledge Check</h2>
        <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-4">
          {validQuestions.map((q: any, i: number) => (
            <div key={i} className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0">
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Q{i + 1} • {q.type || 'question'}</p>
                <p className="text-base font-semibold leading-relaxed" style={{ color: 'var(--cn-text)' }}>{q.question}</p>
              </div>
              {renderQuestionContent(q)}
              {q.explanation && <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 italic">Context: {q.explanation.slice(0, 100)}...</div>}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-8 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">Close Quiz</button>
      </div>
    </div>
  );
}