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

  // buttonBoundsをRefに変更して再レンダリングと依存関係のループを防止
  const buttonBoundsRef = useRef<Map<string, ButtonBounds>>(new Map());
  
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastGestureTimeRef = useRef<number>(Date.now());

  // 直近のホバー情報を記録（グレース期間用）
  const lastHoveredRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });

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
            // 既に確定状態なら更新しない
            if ((prev.state as string) === 'confirm' && prev.confirmedButtonId === foundButton!.parentId) {
              return prev;
            }
            return {
              ...prev,
              state: 'confirm',
              confirmedButtonId: foundButton!.parentId || null, // 親ボタンIDを確定IDとする
              activeButtonId: foundButton!.id,
              hoveredButtonId: foundButton!.parentId || null,
            };
          }

          // 通常ボタンにホバー開始
          // 既に同じボタンをホバー中なら更新しない
          if (prev.state === 'hover' && prev.hoveredButtonId === foundButton!.id && prev.activeButtonId === foundButton!.id) {
            return prev;
          }

          // 猶予期間中に元のボタンに戻ってきた場合
          if (prev.state === 'hover' && prev.hoveredButtonId === foundButton!.id && prev.activeButtonId === null) {
             if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
             return {
                 ...prev,
                 activeButtonId: foundButton!.id,
                 // state, hoveredButtonId, hoverStartTimeは維持
             };
          }

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
          // ホバーから外れた場合の処理（Grace Periodの実装）
          // 確定ボタンが表示されている場合、親ボタンから外れても少しの間はhoveredButtonIdを維持する
          
          // 既に猶予期間中なら何もしない（タイマーはuseEffectで管理するか、ここでセットするか）
          // ここではシンプルに、stateはidleにするが、hoveredButtonIdは即座に消さないアプローチを試みる。
          // しかし、stateがidleになるとUnifiedSelectionScreen側で確定ボタンが消える実装になっている。
          // したがって、stateを'hover'のまま維持しつつ、activeButtonIdだけnullにするのが良いかもしれない。
          // あるいは、新しいstate 'grace' を導入する。
          
          // 今回は state: 'hover' を維持し、activeButtonIdをnullにする。
          // そして、一定時間後に本当に何もなければidleにするタイマーをセットする。
          
          if (prev.state === 'hover' && prev.hoveredButtonId) {
             // 既にactiveButtonIdがnullなら（猶予期間中なら）、stateを更新しない
             if (prev.activeButtonId === null) {
               return prev;
             }

             // 猶予タイマーを開始
             if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
             
             hoverTimerRef.current = setTimeout(() => {
                 setFsmContext(current => {
                     // まだボタン外ならリセット
                     if (current.activeButtonId === null) {
                         return {
                             ...current,
                             state: 'idle',
                             hoveredButtonId: null,
                             hoverStartTime: null,
                             confirmedButtonId: null
                         };
                     }
                     return current;
                 });
             }, 1000); // 1秒の猶予
             
             return {
                 ...prev,
                 activeButtonId: null, // ボタン上ではない
                 // state: 'hover', // stateはhoverのまま（確定ボタンを表示し続けるため）
                 // hoveredButtonId: prev.hoveredButtonId // 維持
             };
          }

          return {
            ...prev,
            state: 'idle',
            activeButtonId: null,
            hoveredButtonId: null,
            hoverStartTime: null,
          };
        });
      }
    },
    [isPointerInButton]
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
