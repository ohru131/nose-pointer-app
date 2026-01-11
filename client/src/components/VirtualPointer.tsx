import React from 'react';
import { PointerPosition } from '@/hooks/useNosePointer';

interface VirtualPointerProps {
  position: PointerPosition;
  isVisible?: boolean;
}

/**
 * 仮想ポインタコンポーネント
 * MediaPipeから取得した鼻の座標を画面上に表示
 * 
 * デザイン: 
 * - 外側の円：トラッキング状態を示す（信頼度に応じた色）
 * - 内側の点：正確な鼻位置
 * - 信頼度が低い場合は透明度を低下させる
 */
export const VirtualPointer: React.FC<VirtualPointerProps> = ({
  position,
  isVisible = true,
}) => {
  if (!isVisible || !position.isTracking) {
    return null;
  }

  const { x, y, confidence } = position;
  const opacity = Math.max(0.3, confidence);

  // 信頼度に応じた色を決定
  const getColor = () => {
    if (confidence > 0.8) return 'rgb(34, 197, 94)'; // 緑：高信頼度
    if (confidence > 0.6) return 'rgb(59, 130, 246)'; // 青：中信頼度
    return 'rgb(239, 68, 68)'; // 赤：低信頼度
  };

  return (
    <>
      {/* 外側の円（トラッキング状態表示） */}
      <div
        style={{
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          width: '32px',
          height: '32px',
          transform: 'translate(-50%, -50%)',
          border: `2px solid ${getColor()}`,
          borderRadius: '50%',
          opacity,
          pointerEvents: 'none',
          zIndex: 9999,
          transition: 'opacity 0.1s ease-out',
        }}
      />
      {/* 内側の点（正確な位置） */}
      <div
        style={{
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          width: '8px',
          height: '8px',
          transform: 'translate(-50%, -50%)',
          backgroundColor: getColor(),
          borderRadius: '50%',
          opacity,
          pointerEvents: 'none',
          zIndex: 10000,
          transition: 'opacity 0.1s ease-out',
        }}
      />
    </>
  );
};
