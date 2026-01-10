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

  // 前フレームの鼻位置を追跡（ジェスチャ検出用）
  const prevNosePosRef = useRef<{ x: number; y: number } | null>(null);
  const gestureStartTimeRef = useRef<number | null>(null);
  const gestureStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // MediaPipeの初期化
  const initializeFaceLandmarker = useCallback(async () => {
    try {
      console.log('Initializing MediaPipe FaceLandmarker...');
      
      // 公式CDNパスを使用
      const wasmPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
      
      console.log(`Loading WASM from: ${wasmPath}`);
      const filesetResolver = await FilesetResolver.forVisionTasks(wasmPath);

      console.log('Creating FaceLandmarker...');
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      faceLandmarkerRef.current = landmarker;
      console.log('MediaPipe FaceLandmarker initialized successfully');
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize MediaPipe';
      console.error('MediaPipe initialization error:', err);
      setError(`MediaPipeの初期化に失敗しました: ${message}`);
    }
  }, []);

  // ビデオストリームの開始
  const startVideoStream = useCallback(async () => {
    try {
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded, starting playback');
          videoRef.current?.play();
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      console.error('Camera access error:', err);
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
    []
  );

  // フレーム処理（鼻トラッキング）
  const processFrame = useCallback(() => {
    if (
      !videoRef.current ||
      !faceLandmarkerRef.current ||
      videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA
    ) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, Date.now());

      if (results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const noseLandmark = landmarks[NOSE_LANDMARK_INDEX];

        if (noseLandmark) {
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;

          // ビデオ座標をスクリーン座標に変換
          const screenX = noseLandmark.x * screenWidth;
          const screenY = noseLandmark.y * screenHeight;
          const confidence = noseLandmark.z || 0.5;

          setPointerPosition({
            x: screenX,
            y: screenY,
            confidence,
            isTracking: true,
          });

          // ジェスチャ検出
          detectGesture({ x: screenX, y: screenY }, screenHeight);
        }
      } else {
        setPointerPosition((prev) => ({ ...prev, isTracking: false }));
      }
    } catch (err) {
      console.error('Frame processing error:', err);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [detectGesture]);

  // 初期化と開始
  useEffect(() => {
    initializeFaceLandmarker();
    startVideoStream();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [initializeFaceLandmarker, startVideoStream]);

  // フレーム処理の開始
  useEffect(() => {
    if (isInitialized) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isInitialized, processFrame]);

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
  };
}
