import React, { useEffect, useRef } from 'react';
import { FSMState } from '@/hooks/usePointerFSM';

interface PointerButtonProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  state: FSMState;
  isActive: boolean;
  isConfirmed: boolean;
  onRegister: (id: string, bounds: DOMRect) => void;
  onUnregister: (id: string) => void;
  onClick?: () => void;
}

/**
 * ポインタ対応ボタンコンポーネント
 * 
 * 状態に応じた視覚フィードバック：
 * - idle: 通常状態（白背景）
 * - hover: ホバー状態（背景色変化 + 拡大アニメーション）
 * - confirm: 確定状態（スケール + 色変化）
 * - cancel: キャンセル状態（フェードアウト）
 */
export const PointerButton: React.FC<PointerButtonProps> = ({
  id,
  label,
  icon,
  state,
  isActive,
  isConfirmed,
  onRegister,
  onUnregister,
  onClick,
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // ボタン境界の登録
  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      onRegister(id, rect);

      // リサイズ時の再登録
      const handleResize = () => {
        if (buttonRef.current) {
          const newRect = buttonRef.current.getBoundingClientRect();
          onRegister(id, newRect);
        }
      };

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        onUnregister(id);
      };
    }
  }, [id, onRegister, onUnregister]);

  // 状態に応じたスタイルを計算
  const getStateStyles = () => {
    switch (state) {
      case 'hover':
        if (isActive) {
          return {
            transform: 'scale(1.1)',
            backgroundColor: 'rgb(59, 130, 246)',
            color: 'white',
            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)',
          };
        }
        break;
      case 'confirm':
        if (isConfirmed) {
          return {
            transform: 'scale(0.95)',
            backgroundColor: 'rgb(34, 197, 94)',
            color: 'white',
            boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.2)',
          };
        }
        break;
      case 'cancel':
        return {
          opacity: 0.5,
        };
    }

    // idle状態
    return {
      backgroundColor: 'white',
      color: 'rgb(55, 65, 81)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    };
  };

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      style={{
        padding: '24px 32px',
        fontSize: '24px',
        fontWeight: '600',
        border: 'none',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '140px',
        ...getStateStyles(),
      }}
      className="pointer-button"
    >
      {icon && <span style={{ fontSize: '40px' }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
};
