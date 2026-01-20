import React, { useRef } from 'react';

interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

export function useLogCapture() {
  // ログキャプチャ機能を無効化（無限ループ防止）
  // 空の配列を返す
  return [];
}

interface LogDisplayProps {
  logs: LogEntry[];
  maxHeight?: number;
}

export function LogDisplay({ logs, maxHeight = 200 }: LogDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
