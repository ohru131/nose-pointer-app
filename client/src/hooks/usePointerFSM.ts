import { useState, useCallback, useEffect, useRef } from 'react';

export type FSMState = 'idle' | 'hover' | 'confirm';

export interface ButtonBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
}

export interface FSMContext {
  state: FSMState;
  activeButtonId: string | null;
  hoverStartTime: number | null;
  confirmedButtonId: string | null;
  progress: number; // 0 to 100
}

const DWELL_TIME_MS = 1500; // 1.5秒滞留で決定

export function usePointerFSM() {
  const [fsmContext, setFsmContext] = useState<FSMContext>({
    state: 'idle',
    activeButtonId: null,
    hoverStartTime: null,
    confirmedButtonId: null,
    progress: 0,
  });

  const buttonBoundsRef = useRef<Map<string, ButtonBounds>>(new Map());
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastGestureTimeRef = useRef<number>(Date.now());

  // ボタン境界の登録
  const registerButton = useCallback((id: string, bounds: ButtonBounds) => {
    buttonBoundsRef.current.set(id, bounds);
  }, []);

  // ボタン境界の解除
  const unregisterButton = useCallback((id: string) => {
    buttonBoundsRef.current.delete(id);
  }, []);

  // ポインタ位置がボタン内かどうかを判定
  const isPointerInButton = useCallback(
    (pointerX: number, pointerY: number, bounds: ButtonBounds): boolean => {
      return (
        pointerX >= bounds.x &&
        pointerX <= bounds.x + bounds.width &&
        pointerY >= bounds.y &&
        pointerY <= bounds.y + bounds.height
      );
    },
    []
  );

  // タイマーとプログレスのクリア
  const clearTimers = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // ポインタ位置の更新と状態遷移
  const updatePointerPosition = useCallback(
    (pointerX: number, pointerY: number) => {
      lastGestureTimeRef.current = Date.now();

      // ボタン内判定
      let foundButton: ButtonBounds | null = null;
      buttonBoundsRef.current.forEach((bounds) => {
        if (isPointerInButton(pointerX, pointerY, bounds)) {
          foundButton = bounds;
        }
      });

      if (foundButton) {
        const btnId = (foundButton as ButtonBounds).id;

        setFsmContext((prev) => {
          // 既に確定済みなら何もしない（リセット待ち）
          if (prev.state === 'confirm') return prev;

          // 同じボタンにホバー継続中
          if (prev.activeButtonId === btnId) {
            return prev;
          }

          // 新しいボタンにホバー開始（または別のボタンから移動）
          clearTimers();

          const startTime = Date.now();

          // Dwell Timer開始
          dwellTimerRef.current = setTimeout(() => {
            setFsmContext((current) => {
              if (current.activeButtonId === btnId) {
                clearTimers();
                return {
                  ...current,
                  state: 'confirm',
                  confirmedButtonId: btnId,
                  progress: 100,
                };
              }
              return current;
            });
          }, DWELL_TIME_MS);

          // プログレス更新用インターバル
          progressIntervalRef.current = setInterval(() => {
            setFsmContext((current) => {
              if (current.activeButtonId !== btnId || current.state === 'confirm') {
                return current;
              }
              const elapsed = Date.now() - startTime;
              const newProgress = Math.min(100, (elapsed / DWELL_TIME_MS) * 100);
              return {
                ...current,
                progress: newProgress,
              };
            });
          }, 50); // 50msごとに更新

          return {
            state: 'hover',
            activeButtonId: btnId,
            hoverStartTime: startTime,
            confirmedButtonId: null,
            progress: 0,
          };
        });
      } else {
        // ボタン外
        setFsmContext((prev) => {
          if (prev.state === 'idle' && prev.activeButtonId === null) {
            return prev;
          }
          
          // 確定状態なら維持（リセット待ち）
          if (prev.state === 'confirm') return prev;

          clearTimers();
          return {
            state: 'idle',
            activeButtonId: null,
            hoverStartTime: null,
            confirmedButtonId: null,
            progress: 0,
          };
        });
      }
    },
    [isPointerInButton, clearTimers]
  );

  // 確定状態をリセット
  const resetConfirm = useCallback(() => {
    clearTimers();
    setFsmContext({
      state: 'idle',
      activeButtonId: null,
      hoverStartTime: null,
      confirmedButtonId: null,
      progress: 0,
    });
  }, [clearTimers]);

  // クリーンアップ
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return {
    fsmContext,
    registerButton,
    unregisterButton,
    updatePointerPosition,
    resetConfirm,
  };
}
