import React from 'react';
import {
  Plus, Trash2, GripVertical,
  X, ChevronRight, ChevronDown, Sparkles, Edit2,
} from 'lucide-react';
import WikidataSearchField from './WikidataSearchField';
import TopicSettingsPanel from './TopicSettingsPanel';
import SubtopicSettingsPanel from './SubtopicSettingsPanel';
import { cleanTitle } from '../../utils/cleanTitle'
import { violationText, type Violation } from '../../utils/prerequisiteViolations';

interface TopicCardProps {
  topic: any;
  i: number;
  course: any;
  editingNameId: string | null;
  editingNameValue: string;
  setEditingNameValue: React.Dispatch<React.SetStateAction<string>>;
  setEditingNameId: React.Dispatch<React.SetStateAction<string | null>>;
  saveName: (id: string) => void;
  startEditingName: (id: string, currentName: string) => void;
  deleteTopic: (id: string) => void;
  expandedMainTopics: Record<string, boolean>;
  setExpandedMainTopics: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedTopics: Record<string, boolean>;
  setExpandedTopics: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  editingSubId: string | null;
  setEditingSubId: React.Dispatch<React.SetStateAction<string | null>>;
  linkData: { video: string; article: string; podcast: string; sourceUrl: string; file: File | null };
  setLinkData: React.Dispatch<React.SetStateAction<{ video: string; article: string; podcast: string; sourceUrl: string; file: File | null }>>;
  prereqSelection: string[];
  setPrereqSelection: React.Dispatch<React.SetStateAction<string[]>>;
  addingSubTo: string | null;
  setAddingSubTo: React.Dispatch<React.SetStateAction<string | null>>;
  newSubForm: { name: string; sourceUrl: string; wikidataId: string; video: string; article: string; podcast: string; file: File | null };
  setNewSubForm: React.Dispatch<React.SetStateAction<{ name: string; sourceUrl: string; wikidataId: string; video: string; article: string; podcast: string; file: File | null }>>;
  newSubWikiQuery: string;
  newSubWikiResults: any[];
  suggestLoadingTopic: string | null;
  suggestionsByTopic: Record<string, any[]>;
  suggestErrorTopic: Record<string, string>;
  handleTopicDrop: (srcId: string, targetId: string) => void;
  handleSubtopicDrop: (srcId: string, targetId: string, targetParentId: string) => void;
  prereqBusy: boolean;
  onPrerequisiteToggle: (subtopicId: string, prerequisiteId: string, checked: boolean) => void;
  handleReplacementFile: (file: File | null) => void;
  saveTopicSettings: (topicId: string) => void;
  saveSubtopicLinks: (topicId: string) => void;
  clearAttachedPdf: (topicId: string) => void;
  renderQuizOverview: (topic: any, options?: { skipTest?: boolean }) => React.ReactNode;
  renderResourceOverview: (topic: any) => React.ReactNode;
  getContentPreviewMeta: (topic: any) => { title: string; actionOpen: string; actionClosed: string } | null;
  openQuizEditor: (topic: any, includeSubtopics?: boolean) => void;
  generateQuizDraft: (topic: any, includeSubtopics?: boolean) => void;
  loadSubtopicSuggestions: (topic: any) => void;
  acceptSuggestion: (topic: any, suggestion: any) => void;
  addSubtopic: (parentId: string) => void;
  searchWiki: (query: string, setQuery: (value: string) => void, setResults: (value: any[]) => void) => void;
  selectWikiResult: (item: any, setQuery: (value: string) => void, setResults: (value: any[]) => void, setForm: any) => void;
  setNewSubWikiQuery: (value: string) => void;
  setNewSubWikiResults: (value: any[]) => void;
    warnings: Violation[];
}

export default function TopicCard({ topic, i, course, editingNameId, editingNameValue, setEditingNameValue, setEditingNameId, saveName, startEditingName, deleteTopic, expandedMainTopics, setExpandedMainTopics, expandedTopics, setExpandedTopics, editingSubId, setEditingSubId, linkData, setLinkData, prereqSelection, setPrereqSelection, addingSubTo, setAddingSubTo, newSubForm, setNewSubForm, newSubWikiQuery, newSubWikiResults, suggestLoadingTopic, suggestionsByTopic, suggestErrorTopic, handleTopicDrop, handleSubtopicDrop, prereqBusy, onPrerequisiteToggle, handleReplacementFile, saveTopicSettings, saveSubtopicLinks, clearAttachedPdf, renderQuizOverview, renderResourceOverview, getContentPreviewMeta, openQuizEditor, generateQuizDraft, loadSubtopicSuggestions, acceptSuggestion, addSubtopic, searchWiki, selectWikiResult, setNewSubWikiQuery, setNewSubWikiResults, warnings }: TopicCardProps) {
  const warnedIds = new Set(warnings.map((v) => v.itemId));
  const topicCollapsed = !expandedMainTopics[topic.id];
  const topicHasWarning = warnedIds.has(topic.id) || (topicCollapsed && (topic.subtopics || []).some((s: any) => warnedIds.has(s.id)));
  const warnTitle = (item: any) => {
    const itemWarnings = warnings.filter((violation) => violation.itemId === item.id);
    if (item.id === topic.id && topicCollapsed) {
      const affectedIds = new Set([topic.id, ...(topic.subtopics || []).map((sub: any) => sub.id)]);
      const hiddenWarnings = warnings.filter((violation) => affectedIds.has(violation.itemId));
      return `${hiddenWarnings.length} prerequisite violations:\n${hiddenWarnings.map(violationText).join('\n')}`;
    }
    return itemWarnings.map(violationText).join('\n');
  };
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('topicId', topic.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        handleTopicDrop(e.dataTransfer.getData('topicId'), topic.id);
      }}
      className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm mb-4 group transition-all"
    >
      <div className="flex items-center justify-between mb-4 font-bold">
        <div className="flex items-center gap-3 w-full">
          <GripVertical size={16} className="text-gray-300 cursor-grab group-hover:text-gray-500" />
          {editingNameId === topic.id ? (
            <div className="flex items-center gap-2 w-full">
              <input autoFocus className="flex-1 px-2 py-1 text-sm rounded border dark:border-gray-600 outline-none dark:bg-gray-900 dark:text-white" value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName(topic.id)} />
              <button onClick={() => saveName(topic.id)} className="text-xs text-blue-600 font-bold">Save</button>
              <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title w-full">
              <span className="shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
              <h3 className="text-base dark:text-white">{cleanTitle(topic.name)}</h3>
              {topicHasWarning && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-black shadow animate-pulse" title={topicCollapsed && !warnedIds.has(topic.id) ? 'A subtopic inside has a prerequisite that comes later' : warnTitle(topic)}>!</span>
              )}
              <button onClick={() => startEditingName(topic.id, topic.name)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Edit2 size={12} /></button>                       
              <button onClick={() => deleteTopic(topic.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
            </div>
          )}
        </div>
        <button onClick={() => setExpandedMainTopics(prev => ({ ...prev, [topic.id]: !prev[topic.id] }))}
          className="p-2 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
        >
          <ChevronDown size={18} className={`transition-transform duration-200 ${expandedMainTopics[topic.id] ? '' : '-rotate-90'}`} />
        </button>
      </div>

                  {expandedMainTopics[topic.id] && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      {renderQuizOverview(topic, { skipTest: true })}

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

                      {editingSubId === topic.id && (
                        <TopicSettingsPanel topic={topic} course={course} linkData={linkData} setLinkData={setLinkData} prereqSelection={prereqSelection} setPrereqSelection={setPrereqSelection} handleReplacementFile={handleReplacementFile} saveTopicSettings={saveTopicSettings} />
                      )}

                      <div className="pl-6 border-l-2 border-gray-100 dark:border-gray-800 space-y-2 ml-6">
                        {topic.subtopics?.map((sub: any, sIdx: number) => (
                          <div 
                            key={sub.id} 
                            draggable
                            onDragStart={(e) => {
                               e.stopPropagation();
                               e.dataTransfer.setData('subtopicId', sub.id);
                            }}
                            onDragOver={(e) => {
                               e.preventDefault();
                               e.stopPropagation();
                            }}
                            onDrop={(e) => {
                               e.stopPropagation();
                               handleSubtopicDrop(e.dataTransfer.getData('subtopicId'), sub.id, topic.id);
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
                                    <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600"><X size={14} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group/subtitle">
                                    <span className="shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400">{i + 1}.{sIdx + 1}</span>
                                    <p className="font-bold dark:text-white text-sm">{cleanTitle(sub.name)}</p>
                                    {warnedIds.has(sub.id) && (
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-black shadow animate-pulse" title={warnTitle(sub)}>!</span>
                                    )}
                                    <button onClick={() => startEditingName(sub.id, sub.name)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Edit2 size={12} /></button>                                   <button onClick={() => deleteTopic(sub.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
                                    <button onClick={() => openQuizEditor(sub)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">Quiz</button>
                                    <button onClick={() => generateQuizDraft(sub)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">AI Quiz</button>
                                  </div>
                                )}
                                {sub.aiSuggested && <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 mt-1"><Sparkles size={10} /> AI Suggestion</span>}
                                {renderResourceOverview(sub)}
                                {renderQuizOverview(sub)}
                              </div>
                              <button onClick={() => {
                                setEditingSubId(editingSubId === sub.id ? null : sub.id);
                                setLinkData({ video: sub.videoUrl || '', article: sub.articleUrl || '', podcast: sub.podcastUrl || '', sourceUrl: '', file: null });
                              }} className="text-gray-400 hover:text-blue-600 p-2"><ChevronRight size={16} className={editingSubId === sub.id ? 'rotate-90' : ''}/></button>
                            </div>

                            {editingSubId === sub.id && (
                              <SubtopicSettingsPanel sub={sub} course={course} linkData={linkData} setLinkData={setLinkData} prereqBusy={prereqBusy} onPrerequisiteToggle={onPrerequisiteToggle} handleReplacementFile={handleReplacementFile} saveTopicSettings={saveSubtopicLinks} />
                            )}
                          </div>
                        ))}
                        {/* #5: related concepts (Wikidata/DBpedia) → candidate subtopics for professor review */}
                        {topic.wikidataId && (
                          <div className="mt-3 rounded-2xl border border-dashed border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-1.5">
                                <Sparkles size={12} /> Suggested subtopics (Wikidata / DBpedia)
                              </p>
                              <button
                                onClick={() => loadSubtopicSuggestions(topic)}
                                disabled={suggestLoadingTopic === topic.id}
                                className="text-[10px] font-black uppercase tracking-widest text-red-600 hover:underline disabled:opacity-50"
                              >
                                {suggestLoadingTopic === topic.id ? 'Loading…' : (suggestionsByTopic[topic.id] ? 'Refresh' : 'Find related')}
                              </button>
                            </div>
                            {suggestErrorTopic[topic.id] && (
                              <p className="mt-2 text-[10px] text-gray-500">{suggestErrorTopic[topic.id]}</p>
                            )}
                            {(suggestionsByTopic[topic.id] || []).length > 0 && (
                              <>
                                <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">Click a concept to add it as a subtopic for review.</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(suggestionsByTopic[topic.id] || []).map((sug: any) => (
                                    <button
                                      key={sug.uri}
                                      onClick={() => acceptSuggestion(topic, sug)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-300 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                    >
                                      <Plus size={12} /> {sug.label}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
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
  );
}
