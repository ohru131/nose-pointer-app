import { useState, useCallback, useEffect, useRef } from 'react';

export type FSMState = 'idle' | 'hover' | 'confirm' | 'cancel';

export interface ButtonBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  isConfirmButton?: boolean; // 追加: 確定ボタン識別用
  parentId?: string; // 追加: 親ボタンID
}

export interface FSMContext {
  state: FSMState;
  activeButtonId: string | null;
  hoveredButtonId: string | null; // 追加: ホバー中のボタンID（activeButtonIdと区別）
  hoverStartTime: number | null;
  confirmedButtonId: string | null;
}

const HOVER_THRESHOLD_MS = 300; // ホバー状態から確定までの静止時間

export function usePointerFSM() {
  const [fsmContext, setFsmContext] = useState<FSMContext>({
    state: 'idle',
    activeButtonId: null,
    hoveredButtonId: null,
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

          // 確定ボタンに触れた場合
          if (foundButton!.isConfirmButton) {
            return {
              ...prev,
              state: 'confirm',
              confirmedButtonId: foundButton!.parentId || null, // 親ボタンIDを確定IDとする
              activeButtonId: foundButton!.id,
              hoveredButtonId: foundButton!.parentId || null,
            };
          }

          // 通常ボタンにホバー開始
          return {
            ...prev,
            state: 'hover',
            activeButtonId: foundButton!.id,
            hoveredButtonId: foundButton!.id, // ホバーIDを更新
            hoverStartTime,
            confirmedButtonId: null
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
          // ホバーから外れたが、確定ボタンへの移動を考慮して少し待つロジックが必要かもしれないが、
          // 今回は確定ボタンがボタンのすぐ下にあるため、移動中に一瞬idleになっても
          // すぐに確定ボタンの判定に入れば問題ない。
          // ただし、確定ボタン表示中に親ボタンから外れた場合、確定ボタンも消えてしまう可能性がある。
          // UnifiedSelectionScreen側で、hoveredButtonIdに基づいて確定ボタンを表示しているため、
          // ここでhoveredButtonIdを即座に消すと確定ボタンも消える。
          
          // 対策: 親ボタンから外れても、少しの間（グレース期間）はhoveredButtonIdを維持する？
          // または、確定ボタンの登録ロジックを見直す。
          
          // 今回はシンプルに、activeButtonIdはnullにするが、hoveredButtonIdは維持するアプローチをとる。
          // ただし、完全に外れた場合はhoveredButtonIdも消す必要がある。
          
          return {
            ...prev,
            state: 'idle',
            activeButtonId: null,
            // hoveredButtonId: null, // ここを消すと確定ボタンが消えるので、維持するか検討が必要
            // しかし、別のボタンに移った場合は更新される。
            // 何もないところに移動した場合のみ問題。
            hoveredButtonId: null, // 一旦消す（UI側でチラつき防止が必要なら別途対応）
            hoverStartTime: null,
          };
        });
      }
    },
    [buttonBounds, isPointerInButton]
  );

  // ジェスチャによる状態遷移
  const handleGesture = useCallback(
    (direction: 'up' | 'down' | 'none', distance: number) => {
      if (direction === 'none') return;

      setFsmContext((prev) => {
        if (direction === 'down') {
          // ジェスチャ確定は廃止されたため削除
          // if (prev.state === 'hover' && prev.activeButtonId) { ... }
          return prev;

          // ジェスチャ確定は廃止されたため削除
          // if (prev.state === 'idle' && lastHoveredRef.current.id ... ) { ... }
          return prev;
        }

        // 上方向ジェスチャも廃止
        // if (direction === 'up') { ... }
        return prev;

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
          hoveredButtonId: null,
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
