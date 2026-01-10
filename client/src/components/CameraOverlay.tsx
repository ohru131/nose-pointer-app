import React, { useEffect, useRef } from 'react';
import { PointerPosition } from '@/hooks/useNosePointer';

interface CameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  pointerPosition: PointerPosition;
  isInitialized: boolean;
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

  // 鼻周辺のクロップ領域を計算
  const getCropRegion = () => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const cropWidth = screenWidth * 0.3;
    const cropHeight = screenHeight * 0.4;

    const cropX = Math.max(0, Math.min(pointerPosition.x - cropWidth / 2, screenWidth - cropWidth));
    const cropY = Math.max(0, Math.min(pointerPosition.y - cropHeight / 2, screenHeight - cropHeight));

    return { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
  };

  const cropRegion = getCropRegion();

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

      {/* 鼻周辺のクロップ表示 */}
      {isInitialized && pointerPosition.isTracking && videoRef.current && (
        <div
          style={{
            position: 'fixed',
            left: `${cropRegion.x}px`,
            top: `${cropRegion.y}px`,
            width: `${cropRegion.width}px`,
            height: `${cropRegion.height}px`,
            border: '2px solid rgb(59, 130, 246)',
            opacity: 0.4,
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        />
      )}

      {/* 鼻ポインタ表示 */}
      {isInitialized && pointerPosition.isTracking && (
        <>
          {/* 外側の円（信頼度に応じた色） */}
          <div
            style={{
              position: 'fixed',
              left: `${pointerPosition.x - 20}px`,
              top: `${pointerPosition.y - 20}px`,
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: `2px solid ${
                pointerPosition.confidence > 0.8
                  ? '#22c55e'
                  : pointerPosition.confidence > 0.6
                    ? '#3b82f6'
                    : '#ef4444'
              }`,
              backgroundColor:
                pointerPosition.confidence > 0.8
                  ? 'rgba(34, 197, 94, 0.15)'
                  : pointerPosition.confidence > 0.6
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
              boxShadow:
                pointerPosition.confidence > 0.8
                  ? '0 0 15px rgba(34, 197, 94, 0.6)'
                  : pointerPosition.confidence > 0.6
                    ? '0 0 15px rgba(59, 130, 246, 0.6)'
                    : '0 0 15px rgba(239, 68, 68, 0.6)',
              zIndex: 20,
              transition: 'all 0.1s ease-out',
            }}
          />

          {/* 内側のドット（鼻の正確な位置） */}
          <div
            style={{
              position: 'fixed',
              left: `${pointerPosition.x - 8}px`,
              top: `${pointerPosition.y - 8}px`,
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor:
                pointerPosition.confidence > 0.8
                  ? '#22c55e'
                  : pointerPosition.confidence > 0.6
                    ? '#3b82f6'
                    : '#ef4444',
              boxShadow: '0 0 10px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.3)',
              zIndex: 21,
            }}
          />

          {/* 十字カーソル */}
          <div
            style={{
              position: 'fixed',
              left: `${pointerPosition.x}px`,
              top: `${pointerPosition.y - 15}px`,
              width: '1px',
              height: '30px',
              backgroundColor:
                pointerPosition.confidence > 0.8
                  ? 'rgba(34, 197, 94, 0.6)'
                  : pointerPosition.confidence > 0.6
                    ? 'rgba(59, 130, 246, 0.6)'
                    : 'rgba(239, 68, 68, 0.6)',
              zIndex: 19,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: `${pointerPosition.x - 15}px`,
              top: `${pointerPosition.y}px`,
              width: '30px',
              height: '1px',
              backgroundColor:
                pointerPosition.confidence > 0.8
                  ? 'rgba(34, 197, 94, 0.6)'
                  : pointerPosition.confidence > 0.6
                    ? 'rgba(59, 130, 246, 0.6)'
                    : 'rgba(239, 68, 68, 0.6)',
              zIndex: 19,
            }}
          />

          {/* 信頼度インジケーター */}
          <div
            style={{
              position: 'fixed',
              left: `${pointerPosition.x + 30}px`,
              top: `${pointerPosition.y - 12}px`,
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              zIndex: 20,
              whiteSpace: 'nowrap',
            }}
          >
            {Math.round(pointerPosition.confidence * 100)}%
          </div>
        </>
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
