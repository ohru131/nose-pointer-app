import { useState, useCallback, useEffect, useRef } from 'react';

export type FSMState = 'idle' | 'hover' | 'confirm' | 'cancel';

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
}

const HOVER_THRESHOLD_MS = 300; // ホバー状態から確定までの静止時間
const CANCEL_ZONE_HEIGHT = 80; // 画面下部のキャンセルゾーンの高さ

export function usePointerFSM() {
  const [fsmContext, setFsmContext] = useState<FSMContext>({
    state: 'idle',
    activeButtonId: null,
    hoverStartTime: null,
    confirmedButtonId: null,
  });

  const [buttonBounds, setButtonBounds] = useState<Map<string, ButtonBounds>>(new Map());
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastGestureTimeRef = useRef<number>(Date.now());

  // 直近のホバー情報を記録（グレース期間用）
  const lastHoveredRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });

  // ボタン境界の登録
  const registerButton = useCallback((id: string, bounds: ButtonBounds) => {
    setButtonBounds((prev) => new Map(prev).set(id, bounds));
  }, []);

  // ボタン境界の解除
  const unregisterButton = useCallback((id: string) => {
    setButtonBounds((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
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

  // ポインタがキャンセルゾーン内かどうかを判定
  const isPointerInCancelZone = useCallback((pointerY: number): boolean => {
    const screenHeight = window.innerHeight;
    return pointerY >= screenHeight - CANCEL_ZONE_HEIGHT;
  }, []);

  // ポインタ位置の更新と状態遷移
  const updatePointerPosition = useCallback(
    (pointerX: number, pointerY: number) => {
      lastGestureTimeRef.current = Date.now();

      // 状態が 'confirm' の場合は、リセットされるまで状態遷移しない (連打防止 & 緑色固定バグ修正)
      // setFsmContextのコールバック内で現在のstateを確認する必要があるが、
      // ここでは簡易的に参照できないため、setFsmContext内でガードするか、
      // そもそも FSMContext を ref で持つ設計にするのが理想。
      // ただし、今回はuseEffect側で state を監視して制御しているため、
      // ここでブロックするよりも setFsmContext の update function 内で check する。

      // キャンセルゾーン判定
      if (isPointerInCancelZone(pointerY)) {
        setFsmContext((prev) => {
          // 確定中はキャンセルゾーン移動も無視するか、あるいはキャンセル許可するか。
          // ここでは「確定後は遷移まで操作不能」とする
          if (prev.state === 'confirm') return prev;

          return {
            ...prev,
            state: 'cancel',
            activeButtonId: null,
          };
        });
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        return;
      }

      // ボタン内判定
      let foundButton: ButtonBounds | null = null;
      buttonBounds.forEach((bounds) => {
        if (isPointerInButton(pointerX, pointerY, bounds)) {
          foundButton = bounds;
        }
      })

      if (foundButton) {
        // ボタンにホバー中
        setFsmContext((prev) => {
          if (prev.state === 'confirm') return prev; // 確定中は無視

          if (prev.activeButtonId === foundButton!.id) {
            return prev; // 同じボタンでホバー継続
          }

          // 新しいボタンにホバー開始
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

          // ホバー状態に遷移
          const hoverStartTime = Date.now();
          // ここでreturnして更新
          return {
            ...prev,
            state: 'hover',
            activeButtonId: foundButton!.id,
            hoverStartTime,
            confirmedButtonId: null // 念のためリセット
          };
        });
      } else {
        // ボタン外
        setFsmContext((prev) => {
          if (prev.state === 'confirm') return prev; // 確定中は無視

          if (prev.state !== 'idle') {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            // ホバー終了時間を記録
            lastHoveredRef.current = { id: prev.activeButtonId, time: Date.now() };
          }
          return {
            ...prev,
            state: 'idle',
            activeButtonId: null,
            hoverStartTime: null,
          };
        });
      }
    },
    [buttonBounds, isPointerInButton, isPointerInCancelZone]
  );

  // ジェスチャによる状態遷移
  const handleGesture = useCallback(
    (direction: 'up' | 'down' | 'none', distance: number) => {
      if (direction === 'none') return;

      setFsmContext((prev) => {
        if (direction === 'down') {
          // 1. ホバー中の確定
          if (prev.state === 'hover' && prev.activeButtonId) {
            return {
              ...prev,
              state: 'confirm',
              confirmedButtonId: prev.activeButtonId,
            };
          }

          // 2. グレース期間（ホバーから外れてすぐ）の確定
          // 「うなずく」動作でポインタがボタンから外れてしまう問題への対策
          if (prev.state === 'idle' && lastHoveredRef.current.id && Date.now() - lastHoveredRef.current.time < 500) {
            return {
              ...prev,
              state: 'confirm',
              confirmedButtonId: lastHoveredRef.current.id,
            };
          }
        }

        if (direction === 'up') {
          // 上方向ジェスチャ
          if (distance > 0.15) {
            // 大きく上方向 → ホームに戻る
            return {
              state: 'idle',
              activeButtonId: null,
              hoverStartTime: null,
              confirmedButtonId: null,
            };
          } else {
            // 小さく上方向 → キャンセル
            return {
              ...prev,
              state: 'cancel',
              activeButtonId: null,
            };
          }
        }

        return prev;
      });
    },
    []
  );

  // 確定状態をリセット
  const resetConfirm = useCallback(() => {
    setFsmContext((prev) => ({
      ...prev,
      state: 'idle',
      confirmedButtonId: null,
    }));
  }, []);

  // キャンセル状態をリセット
  const resetCancel = useCallback(() => {
    setFsmContext((prev) => ({
      ...prev,
      state: 'idle',
    }));
  }, []);

  // 無操作時の自動復帰（10～15秒）
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      const inactiveTime = now - lastGestureTimeRef.current;

      if (inactiveTime > 12000) {
        // 12秒無操作
        setFsmContext({
          state: 'idle',
          activeButtonId: null,
          hoverStartTime: null,
          confirmedButtonId: null,
        });
      }
    };

    inactivityTimerRef.current = setInterval(checkInactivity, 1000);

    return () => {
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
  }, []);

  return {
    fsmContext,
    registerButton,
    unregisterButton,
    updatePointerPosition,
    handleGesture,
    resetConfirm,
    resetCancel,
  };
}
