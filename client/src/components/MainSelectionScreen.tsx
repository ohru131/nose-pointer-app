import React, { useEffect, useState, useRef } from 'react';
import { useNosePointer } from '@/hooks/useNosePointer';
import { usePointerFSM } from '@/hooks/usePointerFSM';
import CameraOverlay from './CameraOverlay';
import { useLogCapture, LogDisplay } from './LogDisplay';

interface MainSelectionScreenProps {
  onSelect?: (category: 'want' | 'help' | 'chat') => void;
}

export const MainSelectionScreen: React.FC<MainSelectionScreenProps> = ({ onSelect }) => {
  const { videoRef, pointerPosition, gestureState, isInitialized, error, resetGesture, debugInfo, sensitivity, setSensitivity } = useNosePointer();
  const { fsmContext, registerButton, unregisterButton, updatePointerPosition, handleGesture, resetConfirm, resetCancel } = usePointerFSM();
  const logs = useLogCapture();

  const [confirmedAction, setConfirmedAction] = useState<string | null>(null);
  const [clickFlash, setClickFlash] = useState(false);
  const [showInitInfo, setShowInitInfo] = useState(true);
  const [initStartTime] = useState(Date.now());

  // ボタンのrefを保存
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({
    'btn-want': null,
    'btn-help': null,
    'btn-chat': null,
  });

  // ボタン境界の登録と更新
  useEffect(() => {
    const updateButtons = () => {
      Object.entries(buttonRefs.current).forEach(([id, el]) => {
        if (el) {
          const rect = el.getBoundingClientRect();
          // スクロール量も考慮（getBoundingClientRectはビューポート相対だが、ポインタ比較もビューポート相対で統一中）
          // ただし、ポインタ計算が window.innerWidth/Height を使用しているため、
          // スクロールがない前提か、もしくはポインタ座標がクライアント座標系である必要がある。
          // useNosePointerは画面全体に対する割合で計算しているため、クライアント座標系（fixed position相当）
          // したがって getBoundingClientRect (ビューポート基準) で正しい。
          registerButton(id, {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            id,
          });
        }
      });
    };

    // 初回実行
    updateButtons();

    // 遅延実行（レイアウト安定化待ち）
    const timeoutId = setTimeout(updateButtons, 500);

    // リサイズ監視
    window.addEventListener('resize', updateButtons);

    // 定期監視（1秒ごと - 万が一のレイアウトずれに対応）
    const intervalId = setInterval(updateButtons, 1000);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateButtons);
      clearInterval(intervalId);
    };
  }, [registerButton]);

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
      setClickFlash(true);
      setTimeout(() => setClickFlash(false), 300);

      const timer = setTimeout(() => {
        const categoryMap: Record<string, 'want' | 'help' | 'chat'> = {
          'btn-want': 'want',
          'btn-help': 'help',
          'btn-chat': 'chat',
        };

        const category = fsmContext.confirmedButtonId ? categoryMap[fsmContext.confirmedButtonId] : undefined;
        if (category && onSelect) {
          onSelect(category);
        }

        resetConfirm();
        setConfirmedAction(null);
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [fsmContext, onSelect, resetConfirm]);

  // キャンセル処理
  useEffect(() => {
    if (fsmContext.state === 'cancel') {
      resetCancel();
    }
  }, [fsmContext.state, resetCancel]);

  // 初期化完了後、3秒後に情報画面を非表示にする
  useEffect(() => {
    if (isInitialized && !error) {
      const timer = setTimeout(() => {
        setShowInitInfo(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, error]);

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <h2 style={{ color: '#dc2626', fontSize: '24px', marginBottom: '16px' }}>⚠️ エラーが発生しました</h2>
        <p style={{ color: '#666', marginBottom: '12px', maxWidth: '600px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '14px' }}>{error}</p>
        <p style={{ color: '#666', fontSize: '14px', maxWidth: '600px', marginBottom: '20px' }}>
          ブラウザの設定でカメラへのアクセスを許可してください。<br />
          ページをリロードして再度試してください。
        </p>

        <div style={{ width: '100%', maxWidth: '800px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'left' }}>📊 デバッグ情報:</h3>
          <div style={{ backgroundColor: '#f0f0f0', padding: '12px', borderRadius: '8px', textAlign: 'left', fontSize: '12px', color: '#333', fontFamily: 'monospace' }}>
            {Object.entries(debugInfo).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '4px' }}>{key}: {String(value)}</div>
            ))}
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: '800px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'left' }}>📋 ログ:</h3>
          <LogDisplay logs={logs} maxHeight={300} />
        </div>
      </div>
    );
  }

  if (!isInitialized || showInitInfo) {
    const elapsedTime = Date.now() - initStartTime;

    return (
      <div style={{ padding: '20px', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '12px', fontWeight: 'bold' }}>⏳ 初期化中...</h2>
        <p style={{ color: '#666', marginBottom: '8px', fontSize: '16px' }}>MediaPipeを読み込んでいます</p>
        <div style={{ marginBottom: '20px', fontSize: '12px', color: '#999' }}>
          初回起動時は数秒かかる場合があります
          {isInitialized && <div>✅ 初期化完了（{elapsedTime}ms）</div>}
        </div>

        <div style={{ width: '100%', maxWidth: '800px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'left' }}>📊 初期化状況:</h3>
          <div style={{ backgroundColor: '#f0f0f0', padding: '12px', borderRadius: '8px', textAlign: 'left', fontSize: '12px', color: '#333', fontFamily: 'monospace' }}>
            {Object.entries(debugInfo).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#0066cc', fontWeight: 'bold' }}>{key}:</span> {String(value)}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: '800px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'left' }}>📋 ログ:</h3>
          <LogDisplay logs={logs} maxHeight={300} />
        </div>
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
      {/* カメラオーバーレイ */}
      <CameraOverlay
        videoRef={videoRef}
        pointerPosition={pointerPosition}
        isInitialized={isInitialized}
        isHovering={fsmContext.state === 'hover'}
      />

      {/* クリック時のフラッシュエフェクト */}
      {clickFlash && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* タイトル */}
      <h1
        style={{
          fontSize: '32px',
          fontWeight: '700',
          marginBottom: '60px',
          color: '#1e293b',
          textAlign: 'center',
        }}
      >
        今、何を伝えたいですか？
      </h1>

      {/* 感度調整スライダー */}
      <div style={{ position: 'fixed', top: '20px', left: '20px', zIndex: 50, backgroundColor: 'rgba(255, 255, 255, 0.9)', padding: '16px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>
          🖱️ 感度調整: {sensitivity.toFixed(1)}
        </label>
        <input
          type="range"
          min="1.0"
          max="10.0"
          step="0.5"
          value={sensitivity}
          onChange={(e) => setSensitivity(parseFloat(e.target.value))}
          style={{ width: '200px', cursor: 'pointer' }}
        />
      </div>

      {/* ボタングループ */}
      <div
        style={{
          display: 'flex',
          gap: '40px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '80px',
        }}
      >
        {/* ほしい ボタン */}
        <button
          ref={(el) => {
            if (el) {
              buttonRefs.current['btn-want'] = el;
            }
          }}
          style={{
            padding: '40px 50px', // サイズアップ
            fontSize: '32px',     // サイズアップ
            fontWeight: '700',
            border: fsmContext.activeButtonId === 'btn-want' && fsmContext.state === 'hover' ? '6px solid #fbbf24' : '2px solid transparent', // ホバー時に極太の黄色枠
            borderRadius: '24px', // 丸みを増やす
            cursor: 'pointer',
            transition: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            minWidth: '220px', // 幅アップ
            backgroundColor: fsmContext.activeButtonId === 'btn-want' && fsmContext.state === 'hover' ? 'rgb(37, 99, 235)' : confirmedAction === 'btn-want' ? 'rgb(34, 197, 94)' : 'rgb(219, 234, 254)', // デフォルト色を濃く
            color: fsmContext.activeButtonId === 'btn-want' && fsmContext.state === 'hover' ? 'white' : 'rgb(30, 58, 138)', // テキスト色も調整
            transform: fsmContext.activeButtonId === 'btn-want' && fsmContext.state === 'hover' ? 'scale(1.15) translateY(-10px)' : confirmedAction === 'btn-want' ? 'scale(0.95)' : 'scale(1)',
            boxShadow: fsmContext.activeButtonId === 'btn-want' && fsmContext.state === 'hover' ? '0 0 0 4px rgba(251, 191, 36, 0.5), 0 20px 40px rgba(37, 99, 235, 0.5)' : '0 10px 20px rgba(37, 99, 235, 0.15)', // 影を強化＋グロー効果
          }}
        >
          <span style={{ fontSize: '64px' }}>🎁</span>
          <span>ほしい</span>
        </button>

        {/* たすけて ボタン */}
        <button
          ref={(el) => {
            if (el) {
              buttonRefs.current['btn-help'] = el;
            }
          }}
          style={{
            padding: '40px 50px',
            fontSize: '32px',
            fontWeight: '700',
            border: fsmContext.activeButtonId === 'btn-help' && fsmContext.state === 'hover' ? '6px solid #fbbf24' : '2px solid transparent',
            borderRadius: '24px',
            cursor: 'pointer',
            transition: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            minWidth: '220px',
            backgroundColor: fsmContext.activeButtonId === 'btn-help' && fsmContext.state === 'hover' ? 'rgb(37, 99, 235)' : confirmedAction === 'btn-help' ? 'rgb(34, 197, 94)' : 'rgb(219, 234, 254)',
            color: fsmContext.activeButtonId === 'btn-help' && fsmContext.state === 'hover' ? 'white' : 'rgb(30, 58, 138)',
            transform: fsmContext.activeButtonId === 'btn-help' && fsmContext.state === 'hover' ? 'scale(1.15) translateY(-10px)' : confirmedAction === 'btn-help' ? 'scale(0.95)' : 'scale(1)',
            boxShadow: fsmContext.activeButtonId === 'btn-help' && fsmContext.state === 'hover' ? '0 0 0 4px rgba(251, 191, 36, 0.5), 0 20px 40px rgba(37, 99, 235, 0.5)' : '0 10px 20px rgba(37, 99, 235, 0.15)',
          }}
        >
          <span style={{ fontSize: '64px' }}>🆘</span>
          <span>たすけて</span>
        </button>

        {/* 雑談 ボタン */}
        <button
          ref={(el) => {
            if (el) {
              buttonRefs.current['btn-chat'] = el;
            }
          }}
          style={{
            padding: '40px 50px',
            fontSize: '32px',
            fontWeight: '700',
            border: fsmContext.activeButtonId === 'btn-chat' && fsmContext.state === 'hover' ? '6px solid #fbbf24' : '2px solid transparent',
            borderRadius: '24px',
            cursor: 'pointer',
            transition: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            minWidth: '220px',
            backgroundColor: fsmContext.activeButtonId === 'btn-chat' && fsmContext.state === 'hover' ? 'rgb(37, 99, 235)' : confirmedAction === 'btn-chat' ? 'rgb(34, 197, 94)' : 'rgb(219, 234, 254)',
            color: fsmContext.activeButtonId === 'btn-chat' && fsmContext.state === 'hover' ? 'white' : 'rgb(30, 58, 138)',
            transform: fsmContext.activeButtonId === 'btn-chat' && fsmContext.state === 'hover' ? 'scale(1.15) translateY(-10px)' : confirmedAction === 'btn-chat' ? 'scale(0.95)' : 'scale(1)',
            boxShadow: fsmContext.activeButtonId === 'btn-chat' && fsmContext.state === 'hover' ? '0 0 0 4px rgba(251, 191, 36, 0.5), 0 20px 40px rgba(37, 99, 235, 0.5)' : '0 10px 20px rgba(37, 99, 235, 0.15)',
          }}
        >
          <span style={{ fontSize: '64px' }}>💬</span>
          <span>雑談</span>
        </button>
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
        ↑ ここでキャンセル
      </div>

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
          <div>State: {fsmContext.state}</div>
          <div>Active: {fsmContext.activeButtonId}</div>
          <div>Gesture: {gestureState.direction}</div>
          <div>Pos: ({Math.round(pointerPosition.x)}, {Math.round(pointerPosition.y)})</div>
          <div>Conf: {(pointerPosition.confidence * 100).toFixed(0)}%</div>
          <div>Tracking: {pointerPosition.isTracking ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
};
