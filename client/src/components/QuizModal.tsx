import { X } from 'lucide-react';

interface QuizProps {
  quiz: { isOpen: boolean; questions: any[]; title: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuizModal({ quiz, onClose, onSuccess }: QuizProps) {
  if (!quiz || !quiz.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full max-w-xl p-8 rounded-3xl shadow-2xl animate-in zoom-in-95 border" style={{ borderColor: 'var(--cn-border)' }}>
        <h2 className="text-xl font-black mb-4 uppercase text-blue-600">{quiz.title} - Knowledge Check</h2>
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {quiz.questions.map((q: any, i: number) => (
            <div key={i} className="space-y-2 border-b border-gray-100 dark:border-gray-800 pb-4">
              <p className="font-bold text-sm" style={{ color: 'var(--cn-text)' }}>Q{i+1}: {q.question}</p>
              <div className="grid grid-cols-1 gap-2">
                {q.answers.map((ans: string, ai: number) => (
                  <button 
                    key={ai} 
                    onClick={() => {
                      if (ai === q.correct) {
                        onSuccess();
                        alert("Correct!");
                      } else {
                        alert("Try again!");
                      }
                    }} 
                    className="text-left p-3 rounded-lg border hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs transition-colors"
                    style={{ color: 'var(--cn-text)', borderColor: 'var(--cn-border)' }}
                  >
                    {ans}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-8 w-full py-3 bg-gray-100 dark:bg-gray-800 rounded-xl font-bold" style={{ color: 'var(--cn-text)' }}>Close Quiz</button>
      </div>
    </div>
  );
}