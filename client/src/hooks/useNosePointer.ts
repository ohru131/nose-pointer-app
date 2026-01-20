import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export interface PointerPosition {
  x: number;
  y: number;
  confidence: number;
  isTracking: boolean;
}

export interface GestureState {
  direction: 'none' | 'up' | 'down';
  distance: number;
  duration: number;
}

const NOSE_LANDMARK_INDEX = 1; // MediaPipeの鼻ランドマークインデックス

export function useNosePointer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [pointerPosition, setPointerPosition] = useState<PointerPosition>({
    x: 0,
    y: 0,
    confidence: 0,
    isTracking: false,
  });

  const [gestureState, setGestureState] = useState<GestureState>({
    direction: 'none',
    distance: 0,
    duration: 0,
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, string>>({});
  const [sensitivity, setSensitivity] = useState(2.0);

  // 前フレームの鼻位置を追跡（ジェスチャ検出用）
  const prevNosePosRef = useRef<{ x: number; y: number } | null>(null);
  const gestureStartTimeRef = useRef<number | null>(null);
  const gestureStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // MediaPipeの初期化
  const initializeFaceLandmarker = useCallback(async () => {
    try {
      console.log('🔧 Initializing MediaPipe FaceLandmarker...');
      setDebugInfo((prev) => ({ ...prev, status: 'Initializing MediaPipe...' }));

      // 公式CDNパスを使用
      const wasmPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

      console.log(`📦 Loading WASM from: ${wasmPath}`);
      setDebugInfo((prev) => ({ ...prev, wasmPath }));

      const filesetResolver = await FilesetResolver.forVisionTasks(wasmPath);
      console.log('✅ FilesetResolver created');
      setDebugInfo((prev) => ({ ...prev, filesetResolver: 'Created' }));

      console.log('🤖 Creating FaceLandmarker...');
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      faceLandmarkerRef.current = landmarker;
      console.log('✅ MediaPipe FaceLandmarker initialized successfully');
      setDebugInfo((prev) => ({ ...prev, status: 'MediaPipe Ready' }));
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize MediaPipe';
      console.error('❌ MediaPipe initialization error:', err);
      setDebugInfo((prev) => ({ ...prev, error: message }));
      setError(`MediaPipeの初期化に失敗しました: ${message}`);
    }
  }, []);

  // ビデオストリームの開始
  const startVideoStream = useCallback(async () => {
    try {
      console.log('📹 Requesting camera access...');
      setDebugInfo((prev) => ({ ...prev, camera: 'Requesting...' }));

      // スマートフォン対応：複数のカメラ設定を試す
      const constraints = [
        // 第1優先：フロントカメラ（スマートフォン）
        { video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        // 第2優先：フロントカメラ（必須）
        { video: { facingMode: 'user' } },
        // 第3優先：デフォルトカメラ
        { video: true },
      ];

      let stream: MediaStream | null = null;
      let lastError: Error | null = null;

      for (const constraint of constraints) {
        try {
          console.log('🎥 Trying constraint:', constraint);
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          console.log('✅ Camera access granted with constraint:', constraint);
          setDebugInfo((prev) => ({ ...prev, camera: 'Connected' }));
          break;
        } catch (err) {
          lastError = err as Error;
          console.warn('⚠️ Constraint failed, trying next...', err);
        }
      }

      if (!stream) {
        throw lastError || new Error('No camera constraints worked');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // 音声を無効化

        // ビデオ再生の準備完了を待つ
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('✅ Video playback started');
              console.log(`📐 Video dimensions: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
              setDebugInfo((prev) => ({
                ...prev,
                camera: 'Playing',
                videoDimensions: `${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`,
              }));
            })
            .catch((err) => {
              console.error('❌ Video playback error:', err);
              setDebugInfo((prev) => ({ ...prev, camera: `Error: ${err.message}` }));
            });
        }

        // メタデータ読み込み時のハンドラ
        videoRef.current.onloadedmetadata = () => {
          console.log('✅ Video metadata loaded');
          console.log(`📐 Video dimensions: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
          setDebugInfo((prev) => ({
            ...prev,
            videoDimensions: `${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`,
          }));
        };

        // エラーハンドラ
        videoRef.current.onerror = (err) => {
          console.error('❌ Video error:', err);
          setDebugInfo((prev) => ({ ...prev, camera: 'Video Error' }));
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      console.error('❌ Camera access error:', err);
      setDebugInfo((prev) => ({ ...prev, camera: `Error: ${message}` }));
      setError(`カメラアクセスエラー: ${message}`);
    }
  }, []);

  // ジェスチャの検出と分類
  const detectGesture = useCallback(
    (currentPos: { x: number; y: number }, screenHeight: number) => {
      const now = Date.now();

      if (!prevNosePosRef.current) {
        prevNosePosRef.current = currentPos;
        gestureStartTimeRef.current = now;
        gestureStartPosRef.current = currentPos;
        return;
      }

      const deltaY = currentPos.y - prevNosePosRef.current.y;
      const totalDeltaY = currentPos.y - (gestureStartPosRef.current?.y || currentPos.y);
      const duration = now - (gestureStartTimeRef.current || now);
      const distancePercent = Math.abs(totalDeltaY) / screenHeight;

      let direction: 'none' | 'up' | 'down' = 'none';

      // 下方向ジェスチャ（確定操作）：下方向に画面高の5～8%移動
      if (deltaY > 5 && totalDeltaY > screenHeight * 0.05) {
        direction = 'down';
      }
      // 上方向ジェスチャ（キャンセル操作）：上方向に一定距離移動
      else if (deltaY < -5 && totalDeltaY < -screenHeight * 0.05) {
        direction = 'up';
      }

      setGestureState({
        direction,
        distance: distancePercent,
        duration,
      });

      prevNosePosRef.current = currentPos;
    },
    [setGestureState]
  );

  // フレーム処理（鼻トラッキング）
  const processFrame = () => {
    // 現在の状態を参照するためのRef
    const currentPointerPosition = pointerPosition;
    const currentDebugInfo = debugInfo;
    if (!videoRef.current || !faceLandmarkerRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // ビデオの準備状態を確認
    const readyState = videoRef.current.readyState;
    if (readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      setDebugInfo((prev) => ({
        ...prev,
        videoReady: `${readyState}/4 (waiting for HAVE_ENOUGH_DATA)`,
      }));
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      setDebugInfo((prev) => ({ ...prev, videoReady: 'Ready' }));

      const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, Date.now());

      if (results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const noseLandmark = landmarks[NOSE_LANDMARK_INDEX];

        if (noseLandmark) {
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;

          // ビデオ座標をスクリーン座標に変換
          // ユーザーの要望により、カメラが鏡表示になっているのに合わせて動きを左右反転させる
          // 感度調整を追加: 中心(0.5)からの偏差を増幅する
          const centeredX = 1 - noseLandmark.x - 0.5;
          const centeredY = noseLandmark.y - 0.5;

          const rawScreenX = (centeredX * sensitivity + 0.5) * screenWidth;
          const rawScreenY = (centeredY * sensitivity + 0.5) * screenHeight;

          // スムージング処理 (Exponential Moving Average)
          // アルファ値: 小さいほど滑らかだが遅延が増える (0.1 ~ 0.5 推奨)
          const alpha = 0.3;

          let smoothedX = rawScreenX;
          let smoothedY = rawScreenY;

          if (pointerPosition.isTracking) {
            smoothedX = alpha * rawScreenX + (1 - alpha) * pointerPosition.x;
            smoothedY = alpha * rawScreenY + (1 - alpha) * pointerPosition.y;
          }

          // 信頼度は検出できた時点で1.0とする（Z座標は深度なので信頼度ではない）
          const confidence = 1.0;

          setPointerPosition({
            x: smoothedX,
            y: smoothedY,
            confidence,
            isTracking: true,
          });

          // ジェスチャ検出
          detectGesture({ x: smoothedX, y: smoothedY }, screenHeight);
        }
      } else {
        setPointerPosition((prev) => ({ ...prev, isTracking: false }));
      }
    } catch (err) {
      console.error('❌ Frame processing error:', err);
      setDebugInfo((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  };

  // 初期化と開始
  useEffect(() => {
    console.log('🚀 useNosePointer mounted');

    // ビデオ要素を作成（DOMに追加しない、MediaPipeの内部処理用）
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.style.display = 'none'; // 非表示
      videoRef.current = video;
    }

    initializeFaceLandmarker();
    startVideoStream();

    return () => {
      console.log('🛑 useNosePointer unmounted');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // フレーム処理の開始
  useEffect(() => {
    if (!isInitialized) return;
    
    console.log('▶️ Starting frame processing');
    
    const startProcessing = () => {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };
    
    startProcessing();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isInitialized]);

  // ジェスチャのリセット
  const resetGesture = useCallback(() => {
    setGestureState({
      direction: 'none',
      distance: 0,
      duration: 0,
    });
    prevNosePosRef.current = null;
    gestureStartTimeRef.current = null;
    gestureStartPosRef.current = null;
  }, []);

  return {
    videoRef,
    canvasRef,
    pointerPosition,
    gestureState,
    isInitialized,
    error,
    resetGesture,
    debugInfo,
    sensitivity,
    setSensitivity,
  };
}
