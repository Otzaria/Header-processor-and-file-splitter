import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { 
  Wrench, Search, Globe, Scissors, Scale, Eye, 
  Upload, Folder, Trash2, Download, FileText, 
  CheckCircle, AlertCircle, ChevronRight, Menu,
  Settings, ListCheck, ArrowLeft, Play, Undo2, Filter, Type
} from 'lucide-react';
import { ProcessedFile, TabId, LogEntry, HierarchySkip } from './types';

interface HeaderInstruction {
  id: string;
  originalText: string;
  shouldSplit: boolean;
  addAuthor: boolean;
  addBook: boolean;
  matchStart?: number;
  matchEnd?: number;
}

type SplitMethod = 'tag' | 'header_text' | 'text_pattern';

const App: React.FC = () => {
  const [loadedFiles, setLoadedFiles] = useState<ProcessedFile[]>([]);
  const [history, setHistory] = useState<ProcessedFile[][]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('process');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Form States
  const [mergeSrc, setMergeSrc] = useState('h4');
  const [mergeTarget, setMergeTarget] = useState('h5');
  const [mergeExclude, setMergeExclude] = useState('');
  
  // Split States
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('tag');
  const [splitTag, setSplitTag] = useState('h2');
  const [splitPattern, setSplitPattern] = useState('');
  const [splitBookName, setSplitBookName] = useState('');
  const [splitAuthor, setSplitAuthor] = useState('');
  const [splitExclude, setSplitExclude] = useState('');
  
  // Split Review State
  const [splitStep, setSplitStep] = useState<'setup' | 'review'>('setup');
  const [headerInstructions, setHeaderInstructions] = useState<HeaderInstruction[]>([]);

  const [repScope, setRepScope] = useState('all');
  const [repFind, setRepFind] = useState('');
  const [repWith, setRepWith] = useState('');

  const [globalFind, setGlobalFind] = useState('');
  const [globalReplace, setGlobalReplace] = useState('');

  const [hierSkip, setHierSkip] = useState<HierarchySkip>({ h1: false, h2: false, h3: false });
  const [previewIdx, setPreviewIdx] = useState(0);
  const [debouncedContent, setDebouncedContent] = useState('');

  const currentFileContent = loadedFiles[previewIdx]?.content;

  // Debounce content updates for header scanning to keep typing smooth
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(currentFileContent || '');
    }, 500);
    return () => clearTimeout(timer);
  }, [currentFileContent]);

  const previewHeaders = React.useMemo(() => {
    if (!debouncedContent) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(debouncedContent, 'text/html');
    const nodes = Array.from(doc.querySelectorAll('h1, h2, h3, h4'));
    
    const htmlCounts: Record<string, number> = {};
    return nodes.map(h => {
      const html = h.outerHTML;
      const count = htmlCounts[html] || 0;
      htmlCounts[html] = count + 1;
      return {
        tagName: h.tagName,
        textContent: h.textContent || '',
        outerHTML: html,
        occurrenceIndex: count
      };
    });
  }, [debouncedContent]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }, ...prev].slice(0, 50));
  };

  const pushToHistory = () => {
    setHistory(prev => [loadedFiles, ...prev].slice(0, 20));
  };

  const undo = () => {
    if (history.length === 0) return;
    const previousState = history[0];
    setHistory(prev => prev.slice(1));
    setLoadedFiles(previousState);
    addLog("פעולה אחרונה בוטלה. הקבצים הוחזרו למצב קודם.", 'info');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    pushToHistory();
    const newFiles: ProcessedFile[] = [];
    const names: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const content = await f.text();
      const cleanFileName = f.name.replace(/\.[^/.]+$/, "");
      newFiles.push({ 
        name: cleanFileName, 
        content: content,
        originalName: f.name
      });
      names.push(cleanFileName);
    }
    setLoadedFiles(prev => [...prev, ...newFiles]);
    addLog(`נטענו ${files.length} קבצים: ${names.join(', ')}`, 'success');
  };

  const handleContentChange = (newContent: string) => {
    const nextFiles = [...loadedFiles];
    if (nextFiles[previewIdx]) {
      nextFiles[previewIdx] = { ...nextFiles[previewIdx], content: newContent };
      setLoadedFiles(nextFiles);
    }
  };

  const handleNameChange = (newName: string) => {
    const nextFiles = [...loadedFiles];
    if (nextFiles[previewIdx]) {
      nextFiles[previewIdx] = { ...nextFiles[previewIdx], name: newName };
      setLoadedFiles(nextFiles);
    }
  };

  const scrollToHeader = useCallback((headerHtml: string, occurrenceIndex: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const text = textarea.value;
    
    // Find the Nth occurrence of the exact header HTML
    let index = -1;
    let currentPos = 0;
    for (let i = 0; i <= occurrenceIndex; i++) {
      index = text.indexOf(headerHtml, currentPos);
      if (index === -1) break;
      currentPos = index + 1;
    }
    
    if (index !== -1) {
      // Use a more efficient way to measure position if possible, 
      // but for textarea with wrapping, mirror div is the most reliable.
      // We optimize by only copying essential styles and using a single measurement.
      const style = window.getComputedStyle(textarea);
      const mirror = document.createElement('div');
      
      const propsToCopy = [
        'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
        'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom',
        'borderLeftWidth', 'borderRightWidth', 'boxSizing',
        'wordBreak', 'letterSpacing', 'textTransform', 'direction'
      ];
      
      propsToCopy.forEach(prop => {
        (mirror.style as any)[prop] = (style as any)[prop];
      });
      
      mirror.style.position = 'absolute';
      mirror.style.visibility = 'hidden';
      mirror.style.top = '0';
      mirror.style.left = '-9999px';
      mirror.style.width = textarea.clientWidth + 'px';
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.wordWrap = 'break-word';

      // To improve performance for very large files, we could theoretically 
      // only render the portion of text that matters, but that breaks wrapping.
      // So we just set it once.
      mirror.textContent = text.substring(0, index);
      const marker = document.createElement('span');
      marker.textContent = '\u200b'; 
      mirror.appendChild(marker);

      document.body.appendChild(mirror);
      const topPos = marker.offsetTop;
      document.body.removeChild(mirror);

      // Use 'auto' instead of 'smooth' for immediate response as requested
      textarea.scrollTo({
        top: topPos - 20,
        behavior: 'auto'
      });

      // Visual feedback: focus and set cursor at the start of the header
      // Use setTimeout to ensure focus doesn't interrupt the scroll or get lost in re-renders
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(index, index);
      }, 0);
    }
  }, [previewIdx]);

  const checkEx = (text: string, exStr: string) => {
    if (!exStr || !exStr.trim()) return false;
    const words = exStr.split(',').map(w => w.trim().toLowerCase()).filter(w => w);
    return words.some(w => text.toLowerCase().includes(w));
  };

  const cleanName = (n: string, i: number) => {
    return n.replace(/[\\/:*?"<>|]/g, "").substring(0, 80) || `file_${i}`;
  };

  const applyMerge = () => {
    pushToHistory();
    let totalMerged = 0;
    
    const nextFiles = loadedFiles.map(f => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(f.content, 'text/html');
      let currentSourceText = "";
      let toDel: Element[] = [];
      
      doc.body.querySelectorAll('*').forEach(el => {
        const tagName = el.tagName.toLowerCase();
        if (tagName === mergeSrc) {
          currentSourceText = el.textContent?.trim() || "";
          toDel.push(el);
        } else if (tagName === mergeTarget) {
          if (currentSourceText && !checkEx(el.textContent || "", mergeExclude)) {
            el.innerHTML = `${currentSourceText} ${el.innerHTML}`;
            totalMerged++;
          }
        }
      });
      
      toDel.forEach(el => {
        const next = el.nextSibling;
        if (next && next.nodeType === 3 && !next.textContent?.trim()) {
           next.remove();
        }
        el.remove();
      });
      
      return { ...f, content: doc.body.innerHTML };
    });

    setLoadedFiles(nextFiles);
    addLog(`חיבור כותרות בוצע. סה"כ חוברו ${totalMerged} כותרות מקור (${mergeSrc}) ליעדים (${mergeTarget}).`, 'success');
  };

  const applyGlobalReplace = () => {
    if (!globalFind) return;
    pushToHistory();
    const regex = new RegExp(globalFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let totalReplacements = 0;
    let filesAffected = 0;

    const nextFiles = loadedFiles.map(f => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(f.content, 'text/html');
      let changedInFile = false;
      
      doc.body.querySelectorAll('*').forEach(el => {
        if (el.children.length === 0 && el.textContent?.trim() !== "") {
          const matches = el.innerHTML.match(regex);
          if (matches) {
            totalReplacements += matches.length;
            el.innerHTML = el.innerHTML.replace(regex, globalReplace);
            changedInFile = true;
          }
        }
      });
      if (changedInFile) filesAffected++;
      return { ...f, content: doc.body.innerHTML };
    });

    setLoadedFiles(nextFiles);
    addLog(`החלפה גלובלית בוצעה. הוחלפו ${totalReplacements} מופעים ב-${filesAffected} קבצים.`, 'success');
  };

  const scanHeadersForSplit = () => {
    if (loadedFiles.length === 0) {
      addLog("אין קבצים טעונים לסריקה", "error");
      return;
    }
    const instructions: HeaderInstruction[] = [];

    if (splitMethod === 'tag' || splitMethod === 'header_text') {
      loadedFiles.forEach((f, fIdx) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(f.content, 'text/html');
        doc.body.querySelectorAll(splitTag).forEach((el, elIdx) => {
          const text = el.textContent?.trim() || "";
          const passesExclude = !checkEx(text, splitExclude);
          const matchesPattern = splitMethod === 'header_text' ? text.includes(splitPattern) : true;

          if (passesExclude && matchesPattern) {
            instructions.push({
              id: `${fIdx}-${elIdx}`,
              originalText: text,
              shouldSplit: true,
              addAuthor: !!splitAuthor,
              addBook: !!splitBookName
            });
          }
        });
      });
    } else if (splitMethod === 'text_pattern' && splitPattern) {
      loadedFiles.forEach((f, fIdx) => {
        const regex = new RegExp(splitPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let match;
        let matchCount = 0;
        while ((match = regex.exec(f.content)) !== null) {
          const context = f.content.substring(Math.max(0, match.index - 20), Math.min(f.content.length, match.index + 20));
          instructions.push({
            id: `${fIdx}-${matchCount}`,
            originalText: context.trim() || `מופע ${matchCount + 1}`,
            shouldSplit: true,
            addAuthor: !!splitAuthor,
            addBook: !!splitBookName,
            matchStart: match.index,
            matchEnd: regex.lastIndex
          });
          matchCount++;
        }
      });
    }

    setHeaderInstructions(instructions);
    setSplitStep('review');
    addLog(`נסרקו ${instructions.length} נקודות חיתוך פוטנציאליות בכל הקבצים הטעונים.`, 'info');
  };

  const applySplit = () => {
    pushToHistory();
    let newFiles: ProcessedFile[] = [];
    let originalFilesAffected = 0;

    if (splitMethod === 'tag' || splitMethod === 'header_text') {
      loadedFiles.forEach((f, fIdx) => {
        const parts = f.content.split(new RegExp(`(<${splitTag}[^>]*>.*?</${splitTag}>)`, 'gi'));
        let currentContent = "";
        let currentTitle = f.name;
        let idx = 0;
        let splitCountForThisFile = 0;
        
        parts.forEach(part => {
          const isHeader = part.toLowerCase().startsWith(`<${splitTag}`);
          if (isHeader) {
            const text = part.replace(/<[^>]*>/g, '').trim();
            const instruction = headerInstructions.find(ins => ins.id.startsWith(`${fIdx}-`) && ins.originalText === text);
            
            if (instruction && instruction.shouldSplit) {
              if (currentContent.trim()) {
                newFiles.push({ name: cleanName(currentTitle, idx), content: currentContent.trim() });
                splitCountForThisFile++;
              }
              const finalTitle = (instruction.addBook ? splitBookName + " " : "") + (text || f.name);
              currentTitle = finalTitle;
              const headerMatch = part.match(/<h[1-6][^>]*>/i);
              const openTag = headerMatch ? headerMatch[0] : `<${splitTag}>`;
              const closeTag = `</${splitTag}>`;
              currentContent = `${openTag}${instruction.addBook ? splitBookName + " " : ""}${text}${closeTag}`;
              if (instruction.addAuthor) {
                currentContent += `\n<p>${splitAuthor}</p>`;
              }
              idx++;
            } else {
              currentContent += part;
            }
          } else { 
            currentContent += part; 
          }
        });
        if (currentContent.trim()) {
          newFiles.push({ name: cleanName(currentTitle, idx), content: currentContent.trim() });
          splitCountForThisFile++;
        }
        if (splitCountForThisFile > 1) originalFilesAffected++;
      });
    } else {
      loadedFiles.forEach((f, fIdx) => {
        const fileInstructions = headerInstructions.filter(ins => ins.id.startsWith(`${fIdx}-`) && ins.shouldSplit);
        if (fileInstructions.length === 0) {
          newFiles.push(f);
          return;
        }

        originalFilesAffected++;
        const sortedInstructions = [...fileInstructions].sort((a, b) => (a.matchStart || 0) - (b.matchStart || 0));
        
        let lastPos = 0;
        sortedInstructions.forEach((ins, idx) => {
          const chunk = f.content.substring(lastPos, ins.matchStart);
          if (chunk.trim() || idx > 0) {
             newFiles.push({ name: cleanName(`${f.name}_${idx}`, idx), content: chunk.trim() });
          }
          lastPos = ins.matchStart || 0;
        });
        
        const finalChunk = f.content.substring(lastPos);
        if (finalChunk.trim()) {
          newFiles.push({ name: cleanName(`${f.name}_last`, sortedInstructions.length), content: finalChunk.trim() });
        }
      });
    }

    const totalCreated = newFiles.length;
    setLoadedFiles(newFiles);
    setSplitStep('setup');
    addLog(`חיתוך הושלם. נוצרו ${totalCreated} קבצים חדשים מתוך ${originalFilesAffected} קבצי מקור שחולקו.`, 'success');
  };

  const applyReplaceHeaders = () => {
    if (!repFind) return;
    pushToHistory();
    const regex = new RegExp(repFind, 'g');
    let totalUpdated = 0;
    
    const nextFiles = loadedFiles.map(f => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(f.content, 'text/html');
      const selector = repScope === 'all' ? 'h1,h2,h3,h4,h5,h6' : repScope;
      doc.body.querySelectorAll(selector).forEach(el => {
        if (regex.test(el.innerHTML)) {
          el.innerHTML = el.innerHTML.replace(regex, repWith);
          totalUpdated++;
        }
      });
      return { ...f, content: doc.body.innerHTML };
    });

    setLoadedFiles(nextFiles);
    addLog(`החלפה בכותרות הושלמה. עודכנו ${totalUpdated} כותרות בטווח ${repScope}.`, 'success');
  };

  const applyFixHierarchy = () => {
    pushToHistory();
    const skipTags = Object.entries(hierSkip).filter(([_, v]) => v).map(([k]) => k);
    let totalFilesNormalized = 0;

    const nextFiles = loadedFiles.map(f => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(f.content, 'text/html');
      const headers = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      
      let found: string[] = [];
      headers.forEach(h => {
        const tag = h.tagName.toLowerCase();
        if(!skipTags.includes(tag)) found.push(tag);
      });
      
      found = [...new Set(found)].sort();
      const map: Record<string, string> = {};
      found.forEach((t, i) => map[t] = 'h' + (i + 1));
      
      let changedInThisFile = false;
      headers.forEach(h => {
        const oldTag = h.tagName.toLowerCase();
        if(map[oldTag] && map[oldTag] !== oldTag) {
          const newHeader = doc.createElement(map[oldTag]);
          newHeader.innerHTML = h.innerHTML;
          h.replaceWith(newHeader);
          changedInThisFile = true;
        }
      });
      if (changedInThisFile) totalFilesNormalized++;
      return { ...f, content: doc.body.innerHTML };
    });

    setLoadedFiles(nextFiles);
    addLog(`נירמול היררכיה בוצע ב-${totalFilesNormalized} קבצים. רמות שהוחרגו: ${skipTags.length > 0 ? skipTags.join(', ') : 'ללא'}.`, 'success');
  };

  const downloadAll = async () => {
    if (loadedFiles.length === 0) return;
    const zip = new JSZip();
    loadedFiles.forEach(f => {
      zip.file(`${f.name}.txt`, f.content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Otzaria_Output_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`הורדה החלה: קובץ ZIP מכיל ${loadedFiles.length} קבצים.`, 'success');
  };

  const NavButton = ({ id, icon: Icon, label }: { id: TabId, icon: any, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-right ${
        activeTab === id 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 translate-x-1' 
          : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      <Icon size={18} />
      <span className="font-semibold text-sm">{label}</span>
    </button>
  );

  const bulkUpdateInstructions = (field: keyof HeaderInstruction, value: boolean) => {
    setHeaderInstructions(prev => prev.map(ins => ({ ...ins, [field]: value })));
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <input 
        ref={folderInputRef} 
        type="file" 
        {...({ webkitdirectory: "", directory: "" } as any)} 
        multiple 
        className="hidden" 
        onChange={(e) => handleFiles(e.target.files)} 
      />

      <aside className={`bg-white border-l border-slate-200 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Wrench size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">מעבד קבצים מתקדם</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavButton id="process" icon={Wrench} label="חיבור כותרות" />
          <NavButton id="replace" icon={Search} label="החלפה בכותרות" />
          <NavButton id="global" icon={Globe} label="החלפה גלובלית" />
          <NavButton id="split" icon={Scissors} label="חיתוך מסמך" />
          <NavButton id="fix" icon={Scale} label="נירמול היררכיה" />
          <NavButton id="preview" icon={Eye} label="תצוגה מקדימה" />
        </nav>

        <div className="p-4 border-t border-slate-100">
           <div className="text-xs text-slate-400 text-center">v2 - Corrected Log Counting</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
              <FileText size={14} />
              <span>{loadedFiles.length} קבצים</span>
            </div>
          </div>
          
          <div className="flex gap-2">
             <button 
                onClick={undo}
                disabled={history.length === 0}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-bold border ${
                  history.length === 0 
                  ? 'text-slate-300 border-slate-100 cursor-not-allowed' 
                  : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                title="בטל פעולה אחרונה"
              >
                <Undo2 size={16} />
                בטל
              </button>
             <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-sm font-bold"
              >
                <FileText size={16} />
                טען קבצים
              </button>
              <button 
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-sm font-bold"
              >
                <Folder size={16} />
                טען תיקייה
              </button>
             <button 
                onClick={() => {
                  if (loadedFiles.length === 0) return;
                  pushToHistory();
                  setLoadedFiles([]);
                  setHeaderInstructions([]);
                  setSplitStep('setup');
                  addLog("כל הקבצים וההגדרות נוקו.", "info");
                }}
                className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-bold mr-2"
              >
                <Trash2 size={16} />
                נקה הכל
              </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 pb-32">
          <div className="space-y-6">
            {activeTab === 'process' && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                  <Wrench className="text-blue-500" /> חיבור כותרות
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">מקור:</label>
                    <select value={mergeSrc} onChange={e => setMergeSrc(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                      {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(h => <option key={h} value={h}>{h.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">יעד:</label>
                    <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                      {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(h => <option key={h} value={h}>{h.toUpperCase()}</option>)}
                    </select>
                  </div>
                </div>
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl mb-6">
                  <label className="block text-sm font-bold text-orange-800 mb-2">החרג יעד המכיל (פסיק להפרדה):</label>
                  <input 
                    type="text" 
                    value={mergeExclude}
                    onChange={e => setMergeExclude(e.target.value)}
                    placeholder="מילה1, מילה2..." 
                    className="w-full p-3 bg-white border border-orange-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <button onClick={applyMerge} className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg">בצע חיבור</button>
              </div>
            )}

            {activeTab === 'replace' && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                  <Search className="text-blue-500" /> החלפה בכותרות
                </h3>
                <div className="grid grid-cols-1 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">החל על:</label>
                    <select value={repScope} onChange={e => setRepScope(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl">
                      <option value="all">כל הכותרות</option>
                      {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(h => <option key={h} value={h}>{h.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">חפש (Regex תומך):</label>
                      <input type="text" value={repFind} onChange={e => setRepFind(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">החלף ב:</label>
                      <input type="text" value={repWith} onChange={e => setRepWith(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl" />
                    </div>
                  </div>
                </div>
                <button onClick={applyReplaceHeaders} className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg">בצע החלפה</button>
              </div>
            )}

            {activeTab === 'global' && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                  <Globe className="text-blue-500" /> החלפה גלובלית בטקסט
                </h3>
                <div className="space-y-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">חפש טקסט:</label>
                    <textarea value={globalFind} onChange={e => setGlobalFind(e.target.value)} rows={3} className="w-full p-4 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">החלף בטקסט:</label>
                    <textarea value={globalReplace} onChange={e => setGlobalReplace(e.target.value)} rows={3} className="w-full p-4 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <button onClick={applyGlobalReplace} className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg">בצע החלפה גלובלית</button>
              </div>
            )}

            {activeTab === 'split' && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Scissors className="text-blue-500" /> חיתוך מסמך לקבצים נפרדים
                  </h3>
                  {splitStep === 'review' && (
                    <button 
                      onClick={() => setSplitStep('setup')}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-bold"
                    >
                      <ArrowLeft size={16} /> חזרה להגדרות
                    </button>
                  )}
                </div>

                {splitStep === 'setup' ? (
                  <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">שיטת חיתוך:</label>
                        <select 
                          value={splitMethod} 
                          onChange={e => setSplitMethod(e.target.value as SplitMethod)} 
                          className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="tag">לפי תגית כותרת בלבד</option>
                          <option value="header_text">לפי כותרת המכילה מילה</option>
                          <option value="text_pattern">בכל פעם שמופיע טקסט</option>
                        </select>
                      </div>
                      
                      {splitMethod !== 'text_pattern' && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">תגית כותרת:</label>
                          <select value={splitTag} onChange={e => setSplitTag(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                            {['h1', 'h2', 'h3', 'h4'].map(h => <option key={h} value={h}>{h.toUpperCase()}</option>)}
                          </select>
                        </div>
                      )}

                      {splitMethod !== 'tag' && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">
                            {splitMethod === 'header_text' ? 'מילה לחיפוש בתוך הכותרת:' : 'טקסט/ביטוי לחיתוך (בכל הופעה):'}
                          </label>
                          <input 
                            type="text" 
                            value={splitPattern} 
                            onChange={e => setSplitPattern(e.target.value)} 
                            placeholder={splitMethod === 'header_text' ? 'לדוגמה: "פרק"' : 'לדוגמה: "###"'}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">שם המחבר להוספה:</label>
                        <input type="text" value={splitAuthor} onChange={e => setSplitAuthor(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">שם הספר להוספה (בתחילת שם הקובץ):</label>
                        <input type="text" value={splitBookName} onChange={e => setSplitBookName(e.target.value)} placeholder="לדוגמה: יד דוד על..." className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                        <AlertCircle size={14} /> סנן והחרג אם מכיל...
                      </label>
                      <input 
                        type="text" 
                        value={splitExclude} 
                        onChange={e => setSplitExclude(e.target.value)} 
                        placeholder="לדוגמה: נספח, הקדמה, ביבליוגרפיה..."
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                      />
                    </div>

                    <button 
                      onClick={scanHeadersForSplit}
                      disabled={loadedFiles.length === 0}
                      className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <ListCheck size={20} /> סרוק ובחר נקודות חיתוך
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in slide-in-from-left duration-300">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
                      <table className="w-full text-right text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-600">
                            <th className="pb-3 pr-2">נקודת חיתוך</th>
                            <th className="pb-3 text-center">
                              <div>בצע חיתוך?</div>
                              <div className="flex justify-center gap-2 mt-1">
                                <button onClick={() => bulkUpdateInstructions('shouldSplit', true)} className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded hover:bg-blue-200">הכל</button>
                                <button onClick={() => bulkUpdateInstructions('shouldSplit', false)} className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded hover:bg-slate-300">ללא</button>
                              </div>
                            </th>
                            <th className="pb-3 text-center">
                              <div>הוסף מחבר?</div>
                              <div className="flex justify-center gap-2 mt-1">
                                <button onClick={() => bulkUpdateInstructions('addAuthor', true)} className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded hover:bg-blue-200">הכל</button>
                                <button onClick={() => bulkUpdateInstructions('addAuthor', false)} className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded hover:bg-slate-300">ללא</button>
                              </div>
                            </th>
                            <th className="pb-3 text-center">
                              <div>הוסף ספר?</div>
                              <div className="flex justify-center gap-2 mt-1">
                                <button onClick={() => bulkUpdateInstructions('addBook', true)} className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded hover:bg-blue-200">הכל</button>
                                <button onClick={() => bulkUpdateInstructions('addBook', false)} className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded hover:bg-slate-300">ללא</button>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {headerInstructions.map((ins, i) => (
                            <tr key={ins.id} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-3 pr-2 font-medium max-w-[300px] truncate" title={ins.originalText}>
                                <div className="flex items-center gap-2">
                                  {splitMethod === 'text_pattern' ? <Type size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-blue-400" />}
                                  {ins.originalText}
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={ins.shouldSplit} 
                                  onChange={e => {
                                    const newIns = [...headerInstructions];
                                    newIns[i].shouldSplit = e.target.checked;
                                    setHeaderInstructions(newIns);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={ins.addAuthor} 
                                  onChange={e => {
                                    const newIns = [...headerInstructions];
                                    newIns[i].addAuthor = e.target.checked;
                                    setHeaderInstructions(newIns);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={ins.addBook} 
                                  onChange={e => {
                                    const newIns = [...headerInstructions];
                                    newIns[i].addBook = e.target.checked;
                                    setHeaderInstructions(newIns);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button 
                      onClick={applySplit}
                      className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Play size={20} /> בצע חיתוך סופי לפי הבחירה
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'fix' && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                  <Scale className="text-blue-500" /> נירמול היררכיה
                </h3>
                <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl mb-6">
                  <span className="text-sm font-bold text-blue-800 block mb-4">דלג רמות:</span>
                  <div className="flex gap-6">
                    {['h1', 'h2', 'h3'].map(h => (
                      <label key={h} className="flex items-center gap-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={hierSkip[h as keyof HierarchySkip]} 
                          onChange={e => setHierSkip(prev => ({ ...prev, [h]: e.target.checked }))}
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                        />
                        <span className="font-bold text-slate-700 group-hover:text-blue-600 uppercase">{h}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-blue-600 font-medium">* הנירמול יסדר מחדש את כל הכותרות הנותרות לרצף לוגי (h1, h2, h3...)</p>
                  <p className="mt-2 text-xs text-red-600 font-medium">** שים לב הדילוג נועד לצורך הוספת כותרות ידנית בקובץ הסופי אין לדלג על כותרות!</p>
                </div>
                <button onClick={applyFixHierarchy} className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg">בצע נירמול</button>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300 flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Eye className="text-blue-500" /> תצוגה מקדימה ועריכה
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="text-xs font-bold text-slate-500">שם קובץ:</span>
                      <input 
                        type="text"
                        value={loadedFiles[previewIdx]?.name || ''}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onFocus={() => pushToHistory()}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 w-48"
                      />
                    </div>
                    <label className="text-sm font-bold text-slate-600">בחר קובץ:</label>
                    <select 
                      value={previewIdx} 
                      onChange={e => setPreviewIdx(Number(e.target.value))}
                      className="p-3 border border-slate-200 rounded-xl text-sm min-w-[200px] outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {loadedFiles.length === 0 ? (
                        <option>אין קבצים טעונים</option>
                      ) : (
                        loadedFiles.map((f, i) => <option key={i} value={i}>{f.name}</option>)
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex gap-6 flex-1 min-h-0">
                  {/* סרגל ניווט כותרות */}
                  <aside className="w-64 border border-slate-200 rounded-xl bg-slate-50 overflow-y-auto p-4 flex flex-col gap-1 shrink-0">
                    <div className="text-xs font-bold text-slate-400 mb-2 border-b border-slate-200 pb-2">ניווט כותרות</div>
                    {previewHeaders.length > 0 ? previewHeaders.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => scrollToHeader(h.outerHTML, h.occurrenceIndex)}
                        className={`text-right text-[11px] p-1.5 rounded hover:bg-white transition-all border-r-2 ${
                          h.tagName === 'H1' ? 'font-bold border-blue-500 bg-blue-50/50' : 
                          h.tagName === 'H2' ? 'mr-2 border-blue-300' : 
                          'mr-4 border-slate-200'
                        }`}
                      >
                        {h.textContent}
                      </button>
                    )) : <div className="text-xs text-slate-400 italic">לא נמצאו כותרות</div>}
                  </aside>

                  {/* אזור העריכה */}
                  <div className="flex-1 relative min-h-0 h-full">
                    <textarea
                      ref={textareaRef}
                      value={loadedFiles[previewIdx]?.content || ''}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onFocus={() => pushToHistory()}
                      className="w-full h-full bg-slate-50 p-6 rounded-2xl border border-slate-200 font-mono text-sm leading-relaxed text-slate-700 outline-none focus:ring-2 focus:ring-blue-400 resize-none overflow-auto"
                      dir="rtl"
                      placeholder="אין תוכן להצגה או עריכה"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="bg-white border-t border-slate-200 px-8 py-6 flex items-center gap-8 fixed bottom-0 left-0 right-0 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]" style={{ right: isSidebarOpen ? '288px' : '0' }}>
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 h-20 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-slate-400 text-xs mt-2 italic">ממתין לפעולות...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`text-xs mb-1 flex items-center gap-2 ${
                  log.type === 'success' ? 'text-green-600' : 
                  log.type === 'error' ? 'text-red-600' : 'text-slate-500'
                }`}>
                  <span className="font-mono text-[10px] opacity-60">[{log.timestamp}]</span>
                  <span className="font-medium">{log.message}</span>
                </div>
              ))
            )}
          </div>
          
          <button 
            disabled={loadedFiles.length === 0}
            onClick={downloadAll}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-white transition-all shadow-xl shadow-blue-200 ${
              loadedFiles.length === 0 ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95'
            }`}
          >
            <Download size={22} />
            הורד הכל ב-ZIP
          </button>
        </footer>
      </main>
    </div>
  );
};

export default App;
