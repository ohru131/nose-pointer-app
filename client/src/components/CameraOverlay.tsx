import React, { useEffect, useRef } from 'react';
import { PointerPosition } from '@/hooks/useNosePointer';

interface CameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  pointerPosition: PointerPosition;
  isInitialized: boolean;
  isHovering?: boolean;
}

/**
 * CameraOverlay Component
 * 
 * カメラ映像をリアルタイムで表示し、鼻ポインタを可視化します。
 * - 鏡のように左右反転したカメラ映像を表示
 * - 薄い色でオーバーレイ
 * - 鼻周辺をクロップして表示
 * - 鼻ポインタを明確に表示
 */
export default function CameraOverlay({
  videoRef,
  pointerPosition,
  isInitialized,
  isHovering = false,
}: CameraOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // キャンバスに映像を描画
  useEffect(() => {
    isMountedRef.current = true;

    const drawFrame = () => {
      if (!isMountedRef.current) return;

      try {
        if (
          !canvasRef.current ||
          !videoRef.current ||
          videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA
        ) {
          animationFrameRef.current = requestAnimationFrame(drawFrame);
          return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame(drawFrame);
          return;
        }

        const video = videoRef.current;

        // キャンバスサイズをウィンドウサイズに合わせる
        if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
        }

        // 背景をクリア（半透明）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // ビデオを左右反転して描画（鏡のように）
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);

        // ビデオの縦横比を保ったまま、キャンバス全体に拡大
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvas.width / canvas.height;

        let drawWidth = canvas.width;
        let drawHeight = canvas.height;

        if (videoAspect > canvasAspect) {
          drawHeight = canvas.width / videoAspect;
        } else {
          drawWidth = canvas.height * videoAspect;
        }

        const x = (canvas.width - drawWidth) / 2;
        const y = (canvas.height - drawHeight) / 2;

        ctx.drawImage(video, x, y, drawWidth, drawHeight);
        ctx.restore();
      } catch (error) {
        console.error('Canvas drawing error:', error);
      }

      if (isMountedRef.current) {
        animationFrameRef.current = requestAnimationFrame(drawFrame);
      }
    };

    if (isInitialized && videoRef.current) {
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    }

    return () => {
      isMountedRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isInitialized, videoRef]);



  return (
    <div
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}
    >
      {/* フルスクリーンカメラオーバーレイ */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.2,
          mixBlendMode: 'screen',
        }}
      />

      {/* シンプルなポインタ（赤い丸） */}
      <div
        style={{
          position: 'fixed',
          left: `${pointerPosition.x - 12}px`,
          top: `${pointerPosition.y - 12}px`,
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.9)', // 赤色
          border: '2px solid white',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          zIndex: 9999, // 最前面に表示
        }}
      />

      {/* 確定アクションガイド（ホバー時のみ表示） - オレンジに変更 */}
      {isHovering && (
        <div
          style={{
            position: 'fixed',
            left: `${pointerPosition.x}px`,
            top: `${pointerPosition.y + 30}px`,
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(249, 115, 22, 0.9)', // オレンジ (orange-500)
            color: 'white',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: 9999, // 最前面に表示
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>確定</span>
          <span style={{ fontSize: '20px', fontWeight: '900' }}>↓</span>
        </div>
      )}
      {/* トラッキング状態インジケーター */}
      {isInitialized && !pointerPosition.isTracking && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#dc2626',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 9998,
          }}
        >
          🔴 鼻が検出されていません
        </div>
      )}

      {isInitialized && pointerPosition.isTracking && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#16a34a',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 9998,
          }}
        >
          🟢 トラッキング中
        </div>
      )}
    </div>
  );
}
