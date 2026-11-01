import { Play, BookOpen, Headphones } from 'lucide-react';

interface SubtopicSettingsPanelProps {
  sub: any;
  linkData: { video: string; article: string; podcast: string; sourceUrl: string; file: File | null };
  setLinkData: React.Dispatch<React.SetStateAction<{ video: string; article: string; podcast: string; sourceUrl: string; file: File | null }>>;
  handleReplacementFile: (file: File | null) => void;
  saveLinks: (subId: string) => void;
}

export default function SubtopicSettingsPanel({ sub, linkData, setLinkData, handleReplacementFile, saveLinks }: SubtopicSettingsPanelProps) {
  return (
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
  );
}
