import { Plus, Trash2, X } from 'lucide-react';
import {
  PARTIAL_CREDIT_ON_LABEL,
  PARTIAL_CREDIT_OFF_LABEL,
  PARTIAL_CREDIT_THRESHOLD_LABEL,
} from './courseManagerConstants';

export const getEmptyQuestion = () => ({
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

interface QuizEditorModalProps {
  open: boolean;
  topic: any;
  includesSubtopics: boolean;
  busy: boolean;
  saving: boolean;
  questions: any[];
  setQuestions: React.Dispatch<React.SetStateAction<any[]>>;
  onClose: () => void;
  onSave: () => void;
  onGenerateDraft: (topic: any, includeSubtopics: boolean) => void;
}

export default function QuizEditorModal({
  open,
  topic,
  includesSubtopics,
  busy,
  saving,
  questions,
  setQuestions,
  onClose,
  onSave,
  onGenerateDraft,
}: QuizEditorModalProps) {
  if (!open || !topic) return null;

  const updateQuizQuestion = (index: number, patch: any) => {
    setQuestions((prev) =>
      prev.map((q, currentIndex) => (currentIndex === index ? { ...q, ...patch } : q))
    );
  };

  const renderQuestionEditor = (question: any, index: number) => {
    const setCommaSeparatedValues = (value: string, key: string) => {
      const parsed = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      updateQuizQuestion(index, { [key]: parsed });
    };

    const renderPartialCreditControls = () => (
      <>
        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
            Partial credit rule
          </label>
          <select
            value={question.partialCreditEnabled === false ? 'off' : 'on'}
            onChange={(e) =>
              updateQuizQuestion(index, { partialCreditEnabled: e.target.value === 'on' })
            }
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          >
            <option value="on">{PARTIAL_CREDIT_ON_LABEL}</option>
            <option value="off">{PARTIAL_CREDIT_OFF_LABEL}</option>
          </select>
        </div>
        {question.partialCreditEnabled !== false && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
              {PARTIAL_CREDIT_THRESHOLD_LABEL}
            </label>
            <input
              type="number"
              min={1}
              value={question.partialCreditThreshold ?? 1}
              onChange={(e) =>
                updateQuizQuestion(index, { partialCreditThreshold: Number(e.target.value) })
              }
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}
      </>
    );

    return (
      <div
        key={index}
        className="relative p-5 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border dark:border-gray-700"
      >
        <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-lg">
          {index + 1}
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
            Question type
          </label>
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
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
            Question
          </label>
          <input
            type="text"
            value={question.question || ''}
            onChange={(e) => updateQuizQuestion(index, { question: e.target.value })}
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          />
        </div>

        {(question.type === 'multiple_choice' || question.type === 'multiple_select') && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
              Options, separated by commas
            </label>
            <textarea
              value={Array.isArray(question.options) ? question.options.join(', ') : ''}
              onChange={(e) => setCommaSeparatedValues(e.target.value, 'options')}
              className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        {question.type === 'multiple_choice' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
              Correct option index
            </label>
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
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
              Correct answer
            </label>
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
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                Correct indices, separated by commas
              </label>
              <input
                type="text"
                value={
                  Array.isArray(question.correctIndices) ? question.correctIndices.join(', ') : ''
                }
                onChange={(e) =>
                  updateQuizQuestion(index, {
                    correctIndices: e.target.value
                      .split(',')
                      .map((item) => Number(item.trim()))
                      .filter(Number.isFinite),
                  })
                }
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            {renderPartialCreditControls()}
          </>
        )}

        {question.type === 'reorder' && (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                Items, separated by commas
              </label>
              <textarea
                value={Array.isArray(question.items) ? question.items.join(', ') : ''}
                onChange={(e) =>
                  updateQuizQuestion(index, {
                    items: e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                Correct order indexes, separated by commas
              </label>
              <input
                type="text"
                value={Array.isArray(question.correctOrder) ? question.correctOrder.join(', ') : ''}
                onChange={(e) =>
                  updateQuizQuestion(index, {
                    correctOrder: e.target.value
                      .split(',')
                      .map((item) => Number(item.trim()))
                      .filter(Number.isFinite),
                  })
                }
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            {renderPartialCreditControls()}
          </>
        )}

        {question.type === 'open_answer' && (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                Accepted answers, separated by commas
              </label>
              <input
                type="text"
                value={
                  Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers.join(', ') : ''
                }
                onChange={(e) =>
                  updateQuizQuestion(index, {
                    acceptedAnswers: e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            {renderPartialCreditControls()}
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
              Explanation
            </label>
            <textarea
              value={question.explanation || ''}
              onChange={(e) => updateQuizQuestion(index, { explanation: e.target.value })}
              className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
              Points
            </label>
            <input
              type="number"
              value={question.points ?? 1}
              onChange={(e) => updateQuizQuestion(index, { points: Number(e.target.value) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() =>
              setQuestions((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
            }
            className="text-red-500 hover:text-red-700 p-2 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in transition-all">
      <div className="bg-white dark:bg-gray-800 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border dark:border-gray-700">
        <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h3 className="text-xl font-bold dark:text-white">
              {includesSubtopics ? 'Skip Test Editor' : 'Quiz Editor'} ✨
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {includesSubtopics
                ? 'This test covers the main topic and all nested subtopics.'
                : 'AI builds a draft from the attached topic material.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onGenerateDraft(topic, includesSubtopics)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {busy ? 'Generating...' : 'Generate AI Draft'}
            </button>
            <button
              onClick={() => setQuestions((prev) => [...prev, getEmptyQuestion()])}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-widest"
              style={{ borderColor: 'var(--cn-border)', color: 'var(--cn-text)' }}
            >
              <Plus size={14} /> Add Question
            </button>
          </div>

          {questions.map((question, index) => renderQuestionEditor(question, index))}
        </div>

        <div className="p-6 border-t dark:border-gray-700 flex gap-3 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-8 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}