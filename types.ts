
export interface ProcessedFile {
  name: string;
  content: string;
  originalName?: string;
}

export type TabId = 'process' | 'replace' | 'global' | 'split' | 'fix' | 'preview' | 'sync_h1';

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface HierarchySkip {
  h1: boolean;
  h2: boolean;
  h3: boolean;
}
