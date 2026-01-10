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
 * 鼻周辺を拡大表示し、鼻の動きをボタン操作にマッピング
 * - 鼻周辺を画面サイズで切り取り
 * - フルスクリーンに拡大表示（左右反転）
 * - 鼻ポインタを画面中央に表示
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

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (videoWidth === 0 || videoHeight === 0) {
          animationFrameRef.current = requestAnimationFrame(drawFrame);
          return;
        }

        // 鼻周辺のクロップ領域を計算（ビデオ座標系）
        const cropWidthPercent = 0.3; // ビデオ幅の30%
        const cropHeightPercent = 0.4; // ビデオ高さの40%
        
        const cropWidth = videoWidth * cropWidthPercent;
        const cropHeight = videoHeight * cropHeightPercent;

        // ポインタ位置をビデオ座標系に変換
        const noseXVideo = (pointerPosition.x / window.innerWidth) * videoWidth;
        const noseYVideo = (pointerPosition.y / window.innerHeight) * videoHeight;

        // クロップ領域の左上座標（鼻を中心に）
        let cropX = noseXVideo - cropWidth / 2;
        let cropY = noseYVideo - cropHeight / 2;

        // 画面外に出ないようにクリップ
        cropX = Math.max(0, Math.min(cropX, videoWidth - cropWidth));
        cropY = Math.max(0, Math.min(cropY, videoHeight - cropHeight));

        // 背景をクリア
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 鼻周辺を拡大表示（左右反転）
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        
        ctx.drawImage(
          video,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        
        ctx.restore();

        // 薄い半透明オーバーレイ
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 鼻ポインタを画面中央に描画（拡大表示なので中央が鼻）
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // ポインタの色（信頼度に応じた色）
        const confidence = pointerPosition.confidence;
        let pointerColor = 'rgb(255, 0, 0)'; // 赤（低信頼度）
        let pointerColorAlpha = 'rgba(255, 0, 0, 0.8)';
        
        if (confidence > 0.7) {
          pointerColor = 'rgb(0, 255, 0)'; // 緑（高信頼度）
          pointerColorAlpha = 'rgba(0, 255, 0, 0.8)';
        } else if (confidence > 0.5) {
          pointerColor = 'rgb(0, 150, 255)'; // 青（中信頼度）
          pointerColorAlpha = 'rgba(0, 150, 255, 0.8)';
        }

        // 外円（大）
        ctx.fillStyle = pointerColorAlpha;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 35, 0, Math.PI * 2);
        ctx.fill();

        // 内円（中）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 25, 0, Math.PI * 2);
        ctx.fill();

        // コア（小）
        ctx.fillStyle = pointerColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
        ctx.fill();

        // 十字カーソル（横）
        ctx.strokeStyle = pointerColorAlpha;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX - 50, centerY);
        ctx.lineTo(centerX + 50, centerY);
        ctx.stroke();

        // 十字カーソル（縦）
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 50);
        ctx.lineTo(centerX, centerY + 50);
        ctx.stroke();

        // トラッキング状態の表示
        const statusText = pointerPosition.isTracking ? '✓ 鼻を検出中' : '✗ 鼻が見つかりません';
        const statusColor = pointerPosition.isTracking ? '#00ff00' : '#ff0000';
        
        ctx.fillStyle = statusColor;
        ctx.font = 'bold 28px Arial';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(statusText, 20, 50);

        // 信頼度の表示
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`信頼度: ${(confidence * 100).toFixed(0)}%`, 20, 90);

        // ジェスチャ状態の表示
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('下に移動 → 確定 / 上に移動 → キャンセル', 20, canvas.height - 30);

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
  }, [isInitialized, videoRef, pointerPosition]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    />
  );
}
