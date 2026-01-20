import { useState, useCallback, useEffect, useRef } from 'react';

export type FSMState = 'idle' | 'hover_outer' | 'hover_inner' | 'ready_to_confirm' | 'confirm';

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

const CHARGE_TIME_MS = 1000; // 1.0秒でチャージ完了

export function usePointerFSM() {
  const [fsmContext, setFsmContext] = useState<FSMContext>({
    state: 'idle',
    activeButtonId: null,
    hoverStartTime: null,
    confirmedButtonId: null,
    progress: 0,
  });

  const buttonBoundsRef = useRef<Map<string, ButtonBounds>>(new Map());
  const chargeTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  // ポインタ位置がボタン内かどうか、および中央エリアかどうかを判定
  const checkPointerArea = useCallback(
    (pointerX: number, pointerY: number, bounds: ButtonBounds): 'none' | 'outer' | 'inner' => {
      if (
        pointerX < bounds.x ||
        pointerX > bounds.x + bounds.width ||
        pointerY < bounds.y ||
        pointerY > bounds.y + bounds.height
      ) {
        return 'none';
      }

      // 中央80%の判定
      const marginX = bounds.width * 0.1; // 左右10%ずつ
      const marginY = bounds.height * 0.1; // 上下10%ずつ

      if (
        pointerX >= bounds.x + marginX &&
        pointerX <= bounds.x + bounds.width - marginX &&
        pointerY >= bounds.y + marginY &&
        pointerY <= bounds.y + bounds.height - marginY
      ) {
        return 'inner';
      }

      return 'outer';
    },
    []
  );

  // タイマーとプログレスのクリア
  const clearTimers = useCallback(() => {
    if (chargeTimerRef.current) {
      clearTimeout(chargeTimerRef.current);
      chargeTimerRef.current = null;
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
      let area: 'none' | 'outer' | 'inner' = 'none';

      buttonBoundsRef.current.forEach((bounds) => {
        const check = checkPointerArea(pointerX, pointerY, bounds);
        if (check !== 'none') {
          foundButton = bounds;
          area = check;
        }
      });

      if (foundButton) {
        const btnId = (foundButton as ButtonBounds).id;

        setFsmContext((prev) => {
          // 既に確定済みなら何もしない（リセット待ち）
          if (prev.state === 'confirm') return prev;

          // 状態が変わらない場合は更新しない（無限ループ防止）
          if (prev.activeButtonId === btnId) {
            if (prev.state === 'ready_to_confirm') return prev; // チャージ完了後は維持
            
            if (area === 'inner' && prev.state === 'hover_inner') return prev; // チャージ中はプログレス更新のみ
            if (area === 'outer' && prev.state === 'hover_outer') return prev; // 外周ホバー継続
          }

          // 新しいボタン、またはエリア移動
          
          // 外周エリアの場合
          if (area === 'outer') {
            clearTimers();
            return {
              state: 'hover_outer',
              activeButtonId: btnId,
              hoverStartTime: null,
              confirmedButtonId: null,
              progress: 0,
            };
          }

          // 中央エリアの場合（チャージ開始）
          if (area === 'inner') {
            // 既にチャージ中なら何もしない
            if (prev.state === 'hover_inner' && prev.activeButtonId === btnId) return prev;
            
            // 既にチャージ完了なら維持
            if (prev.state === 'ready_to_confirm' && prev.activeButtonId === btnId) return prev;

            clearTimers();
            const startTime = Date.now();

            // チャージ完了タイマー
            chargeTimerRef.current = setTimeout(() => {
              setFsmContext((current) => {
                if (current.activeButtonId === btnId && current.state === 'hover_inner') {
                  clearTimers();
                  return {
                    ...current,
                    state: 'ready_to_confirm',
                    progress: 100,
                  };
                }
                return current;
              });
            }, CHARGE_TIME_MS);

            // プログレス更新用インターバル
            progressIntervalRef.current = setInterval(() => {
              setFsmContext((current) => {
                if (current.activeButtonId !== btnId || current.state !== 'hover_inner') {
                  return current;
                }
                const elapsed = Date.now() - startTime;
                const newProgress = Math.min(100, (elapsed / CHARGE_TIME_MS) * 100);
                
                // プログレスが変わらない場合は更新しない
                if (current.progress === newProgress) return current;

                return {
                  ...current,
                  progress: newProgress,
                };
              });
            }, 50);

            return {
              state: 'hover_inner',
              activeButtonId: btnId,
              hoverStartTime: startTime,
              confirmedButtonId: null,
              progress: 0,
            };
          }

          return prev;
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
    [checkPointerArea, clearTimers]
  );

  // ジェスチャ処理（下向きで確定）
  const handleGesture = useCallback((direction: 'up' | 'down' | 'none', distance: number) => {
    if (direction === 'down') {
      setFsmContext((prev) => {
        if (prev.state === 'ready_to_confirm' && prev.activeButtonId) {
          return {
            ...prev,
            state: 'confirm',
            confirmedButtonId: prev.activeButtonId,
          };
        }
        return prev;
      });
    }
  }, []);

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
    handleGesture,
    resetConfirm,
  };
}
