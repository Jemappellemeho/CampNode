import {
  Plus, Search,
} from 'lucide-react';

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

export default WikidataSearchField;
