import { Play, BookOpen, Headphones, Lock } from 'lucide-react';

interface TopicSettingsPanelProps {
  topic: any;
  course: any;
  linkData: { video: string; article: string; podcast: string; sourceUrl: string; file: File | null };
  setLinkData: React.Dispatch<React.SetStateAction<{ video: string; article: string; podcast: string; sourceUrl: string; file: File | null }>>;
  prereqSelection: string[];
  setPrereqSelection: React.Dispatch<React.SetStateAction<string[]>>;
  handleReplacementFile: (file: File | null) => void;
  saveTopicSettings: (topicId: string) => void;
}

export default function TopicSettingsPanel({ topic, course, linkData, setLinkData, prereqSelection, setPrereqSelection, handleReplacementFile, saveTopicSettings }: TopicSettingsPanelProps) {
  return (
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

                          {/* F3: Prerequisites — which other topics must be learned before this one */}
                          <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                              <Lock size={11} className="text-amber-500" /> Prerequisites (must be learned first)
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {(course.topics || []).filter((other: any) => other.id !== topic.id).map((other: any) => {
                                const checked = prereqSelection.includes(other.id);
                                return (
                                  <button
                                    key={other.id}
                                    type="button"
                                    onClick={() => setPrereqSelection(checked ? prereqSelection.filter((id) => id !== other.id) : [...prereqSelection, other.id])}
                                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${checked ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'}`}
                                  >
                                    {other.name}
                                  </button>
                                );
                              })}
                              {(course.topics || []).filter((other: any) => other.id !== topic.id).length === 0 && (
                                <span className="text-[10px] text-gray-400">Add more topics to set prerequisites.</span>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button onClick={() => saveTopicSettings(topic.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md">Save</button>
                          </div>
                        </div>
  );
}
