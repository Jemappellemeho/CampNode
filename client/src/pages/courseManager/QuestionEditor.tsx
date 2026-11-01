import { Trash2 } from 'lucide-react';
import { PARTIAL_CREDIT_ON_LABEL, PARTIAL_CREDIT_OFF_LABEL, PARTIAL_CREDIT_THRESHOLD_LABEL } from './courseManagerConstants';

// Render single question editor form with all question types
function QuestionEditor({ question, index, updateQuizQuestion, onDeleteQuestion }: {
  question: any;
  index: number;
  updateQuizQuestion: (index: number, patch: any) => void;
  onDeleteQuestion: (index: number) => void;
}) {
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
          <button onClick={() => onDeleteQuestion(index)} className="text-red-500 hover:text-red-700 p-2 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
}

export default QuestionEditor;
