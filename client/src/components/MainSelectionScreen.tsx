import React, { useEffect, useState } from 'react';
import { useNosePointer } from '@/hooks/useNosePointer';
import { usePointerFSM } from '@/hooks/usePointerFSM';
import { VirtualPointer } from './VirtualPointer';
import { PointerButton } from './PointerButton';
import CameraOverlay from './CameraOverlay';
import { useLogCapture, LogDisplay } from './LogDisplay';

interface MainSelectionScreenProps {
  onSelect?: (category: 'want' | 'help' | 'chat') => void;
}

export const MainSelectionScreen: React.FC<MainSelectionScreenProps> = ({ onSelect }) => {
  const { videoRef, pointerPosition, gestureState, isInitialized, error, resetGesture, debugInfo } = useNosePointer();
  const { fsmContext, registerButton, unregisterButton, updatePointerPosition, handleGesture, resetConfirm, resetCancel } = usePointerFSM();
  const logs = useLogCapture();

  const [confirmedAction, setConfirmedAction] = useState<string | null>(null);
  const [showInitInfo, setShowInitInfo] = useState(true);
  const [initStartTime] = useState(Date.now());

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
      />

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
        <PointerButton
          id="btn-want"
          label="ほしい"
          icon="🎁"
          state={fsmContext.state}
          isActive={fsmContext.activeButtonId === 'btn-want'}
          isConfirmed={confirmedAction === 'btn-want'}
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
        <PointerButton
          id="btn-help"
          label="たすけて"
          icon="🆘"
          state={fsmContext.state}
          isActive={fsmContext.activeButtonId === 'btn-help'}
          isConfirmed={confirmedAction === 'btn-help'}
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
        <PointerButton
          id="btn-chat"
          label="雑談"
          icon="💬"
          state={fsmContext.state}
          isActive={fsmContext.activeButtonId === 'btn-chat'}
          isConfirmed={confirmedAction === 'btn-chat'}
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
