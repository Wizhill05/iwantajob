'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import type { ActiveProcess, LogEntry, LogLevel } from '@/lib/types';

interface ActivityContextType {
  activeProcesses: ActiveProcess[];
  logs: LogEntry[];
  startProcess: (
    type: 'scrape' | 'parse',
    provider: 'indeed' | 'linkedin' | 'wellfound',
    params?: Record<string, any>
  ) => string;
  updateProcess: (id: string, updates: Partial<ActiveProcess>) => void;
  finishProcess: (
    id: string,
    status: 'completed' | 'failed',
    message?: string
  ) => void;
  addLog: (
    level: LogLevel,
    source: string,
    message: string,
    durationMs?: number,
    details?: any
  ) => void;
  clearLogs: () => void;
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

const MAX_LOGS = 100;

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activeProcesses, setActiveProcesses] = useState<ActiveProcess[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const activeProcessesRef = useRef<ActiveProcess[]>([]);
  activeProcessesRef.current = activeProcesses;

  const addLog = useCallback(
    (
      level: LogLevel,
      source: string,
      message: string,
      durationMs?: number,
      details?: any
    ) => {
      const newEntry: LogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date().toISOString(),
        level,
        source,
        message,
        durationMs,
        details,
      };

      setLogs((prev) => [newEntry, ...prev.slice(0, MAX_LOGS - 1)]);
    },
    []
  );

  const startProcess = useCallback(
    (
      type: 'scrape' | 'parse',
      provider: 'indeed' | 'linkedin' | 'wellfound',
      params?: Record<string, any>
    ): string => {
      const id = `proc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newProcess: ActiveProcess = {
        id,
        type,
        provider,
        startTime: Date.now(),
        status: 'running',
        params,
      };

      setActiveProcesses((prev) => [newProcess, ...prev]);

      const action = type === 'scrape' ? 'Scrape started' : 'Parsing started';
      addLog(
        type === 'scrape' ? 'SCRAPE' : 'PARSE',
        provider,
        `${action} with params: ${params ? JSON.stringify(params) : 'default'}`,
        undefined,
        params
      );

      return id;
    },
    [addLog]
  );

  const updateProcess = useCallback((id: string, updates: Partial<ActiveProcess>) => {
    setActiveProcesses((prev) =>
      prev.map((proc) => (proc.id === id ? { ...proc, ...updates } : proc))
    );
  }, []);

  const finishProcess = useCallback(
    (id: string, status: 'completed' | 'failed', message?: string) => {
      const proc = activeProcessesRef.current.find((p) => p.id === id);
      if (proc) {
        const duration = Date.now() - proc.startTime;
        const level: LogLevel = status === 'completed' ? 'INFO' : 'ERROR';
        addLog(
          level,
          proc.provider,
          `${proc.type.toUpperCase()} ${status}: ${message || (status === 'completed' ? 'Finished successfully' : 'Failed')}`,
          duration
        );
      }

      setActiveProcesses((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status, message } : p))
      );
    },
    [addLog]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <ActivityContext.Provider
      value={{
        activeProcesses,
        logs,
        startProcess,
        updateProcess,
        finishProcess,
        addLog,
        clearLogs,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity(): ActivityContextType {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return context;
}
