import React, { useEffect, useRef, useState } from 'react';

interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

export function useLogCapture() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    // console.log をオーバーライド
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'log',
        message,
      };
      
      logsRef.current.push(entry);
      if (logsRef.current.length > 50) {
        logsRef.current.shift();
      }
      setLogs([...logsRef.current]);
      originalLog(...args);
    };

    console.warn = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'warn',
        message,
      };
      
      logsRef.current.push(entry);
      if (logsRef.current.length > 50) {
        logsRef.current.shift();
      }
      setLogs([...logsRef.current]);
      originalWarn(...args);
    };

    console.error = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'error',
        message,
      };
      
      logsRef.current.push(entry);
      if (logsRef.current.length > 50) {
        logsRef.current.shift();
      }
      setLogs([...logsRef.current]);
      originalError(...args);
    };

    console.info = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message,
      };
      
      logsRef.current.push(entry);
      if (logsRef.current.length > 50) {
        logsRef.current.shift();
      }
      setLogs([...logsRef.current]);
      originalInfo(...args);
    };

    return () => {
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
