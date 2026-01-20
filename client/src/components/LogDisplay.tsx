import React, { useEffect, useRef, useState } from 'react';

interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

export function useLogCapture() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);
  const isMountedRef = useRef(true);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    // console.log をオーバーライド
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const addLog = (level: 'log' | 'warn' | 'error' | 'info', args: any[]) => {
      // 無限ループ防止：既に更新中なら処理をスキップ
      if (isUpdatingRef.current) {
        return;
      }

      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      const entry: LogEntry = {
        timestamp: Date.now(),
        level,
        message,
      };
      
      logsRef.current.push(entry);
      if (logsRef.current.length > 50) {
        logsRef.current.shift();
      }
      
      if (isMountedRef.current) {
        isUpdatingRef.current = true;
        setLogs([...logsRef.current]);
        // 次のレンダリング後に更新フラグをリセット
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    };

    console.log = (...args) => {
      addLog('log', args);
      originalLog(...args);
    };

    console.warn = (...args) => {
      addLog('warn', args);
      originalWarn(...args);
    };

    console.error = (...args) => {
      addLog('error', args);
      originalError(...args);
    };

    console.info = (...args) => {
      addLog('info', args);
      originalInfo(...args);
    };

    return () => {
      isMountedRef.current = false;
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, []);

  return logs;
}

interface LogDisplayProps {
  logs: LogEntry[];
  maxHeight?: number;
}

export function LogDisplay({ logs, maxHeight = 200 }: LogDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: '8px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '11px',
        lineHeight: '1.4',
      }}
    >
      {logs.length === 0 ? (
        <div style={{ color: '#666' }}>ログなし</div>
      ) : (
        logs.map((log, index) => (
          <div
            key={index}
            style={{
              color:
                log.level === 'error'
                  ? '#f48771'
                  : log.level === 'warn'
                    ? '#dcdcaa'
                    : log.level === 'info'
                      ? '#4ec9b0'
                      : '#d4d4d4',
              marginBottom: '2px',
            }}
          >
            <span style={{ color: '#858585' }}>
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>{' '}
            {log.message}
          </div>
        ))
      )}
    </div>
  );
}
