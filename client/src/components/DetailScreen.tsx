import React, { useEffect, useState } from 'react';
import { useNosePointer } from '@/hooks/useNosePointer';
import { usePointerFSM } from '@/hooks/usePointerFSM';
import { VirtualPointer } from './VirtualPointer';
import { PointerButton } from './PointerButton';

interface DetailScreenProps {
  category: 'want' | 'help' | 'chat';
  onBack?: () => void;
}

const categoryConfig = {
  want: {
    title: 'ほしいもの',
    items: ['水', 'ご飯', 'トイレ', '薬'],
    icon: '🎁',
  },
  help: {
    title: 'たすけて',
    items: ['痛い', '気分が悪い', '動けない', '話しかけて'],
    icon: '🆘',
  },
  chat: {
    title: '雑談',
    items: ['天気', 'ニュース', '家族', '思い出'],
    icon: '💬',
  },
};

/**
 * 詳細選択画面
 * 選択されたカテゴリ内の詳細オプションを表示
 */
export const DetailScreen: React.FC<DetailScreenProps> = ({ category, onBack }) => {
  const { pointerPosition, gestureState, isInitialized, error, resetGesture } = useNosePointer();
  const { fsmContext, registerButton, unregisterButton, updatePointerPosition, handleGesture, resetConfirm, resetCancel } = usePointerFSM();

  const [confirmedAction, setConfirmedAction] = useState<string | null>(null);
  const config = categoryConfig[category];

  // ポインタ位置の更新
  useEffect(() => {
    if (isInitialized && pointerPosition.isTracking) {
      updatePointerPosition(pointerPosition.x, pointerPosition.y);
    }
  }, [pointerPosition, isInitialized, updatePointerPosition]);

  // ジェスチャの処理
  useEffect(() => {
    if (gestureState.direction !== 'none') {
      handleGesture(gestureState.direction, gestureState.distance);
      resetGesture();
    }
  }, [gestureState, handleGesture, resetGesture]);

  // 確定アクションの処理
  useEffect(() => {
    if (fsmContext.state === 'confirm' && fsmContext.confirmedButtonId) {
      setConfirmedAction(fsmContext.confirmedButtonId);

      const timer = setTimeout(() => {
        const selectedItem = config.items.find((_, idx) => `item-${idx}` === fsmContext.confirmedButtonId);
        if (selectedItem) {
          console.log('Selected:', selectedItem);
          // ここで選択されたアイテムに応じた処理を実行
        }
        resetConfirm();
        setConfirmedAction(null);
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [fsmContext, resetConfirm, config.items]);

  // キャンセル処理（戻る）
  useEffect(() => {
    if (fsmContext.state === 'cancel') {
      resetCancel();
      if (onBack) {
        onBack();
      }
    }
  }, [fsmContext.state, resetCancel, onBack]);

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>
        <h2>エラーが発生しました</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>初期化中...</h2>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        padding: '40px 20px',
        position: 'relative',
      }}
    >
      {/* タイトル */}
      <h1
        style={{
          fontSize: '32px',
          fontWeight: '700',
          marginBottom: '20px',
          color: '#1e293b',
          textAlign: 'center',
        }}
      >
        {config.icon} {config.title}
      </h1>

      <p
        style={{
          fontSize: '16px',
          color: '#64748b',
          marginBottom: '60px',
          textAlign: 'center',
        }}
      >
        上方向で戻る
      </p>

      {/* アイテムグリッド */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '30px',
          marginBottom: '80px',
          maxWidth: '600px',
        }}
      >
        {config.items.map((item, idx) => (
          <PointerButton
            key={idx}
            id={`item-${idx}`}
            label={item}
            state={fsmContext.state}
            isActive={fsmContext.activeButtonId === `item-${idx}`}
            isConfirmed={confirmedAction === `item-${idx}`}
            onRegister={(id, rect) =>
              registerButton(id, {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                id,
              })
            }
            onUnregister={unregisterButton}
          />
        ))}
      </div>

      {/* 戻るゾーン */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '80px',
          backgroundColor: 'rgba(100, 116, 139, 0.1)',
          borderTop: '2px dashed rgb(100, 116, 139)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          color: 'rgb(100, 116, 139)',
          pointerEvents: 'none',
        }}
      >
        ↑ ここで戻る
      </div>

      {/* 仮想ポインタ */}
      <VirtualPointer position={pointerPosition} />

      {/* デバッグ情報 */}
      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            maxWidth: '300px',
            zIndex: 9998,
          }}
        >
          <div>Category: {category}</div>
          <div>State: {fsmContext.state}</div>
          <div>Active: {fsmContext.activeButtonId}</div>
          <div>Gesture: {gestureState.direction}</div>
        </div>
      )}
    </div>
  );
};
