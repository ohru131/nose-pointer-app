import React, { useEffect, useState, useRef } from 'react';
import { useNosePointer } from '@/hooks/useNosePointer';
import { usePointerFSM } from '@/hooks/usePointerFSM';
import CameraOverlay from './CameraOverlay';
import { useLogCapture, LogDisplay } from './LogDisplay';

type ViewType = 'home' | 'want' | 'help' | 'chat';

interface ButtonConfig {
    id: string;
    label: string;
    icon?: string;
    action: string; // 'navigate:xxx' or 'say:xxx' or 'back'
    styleType: 'hero' | 'grid'; // 'hero' for main menu, 'grid' for items
    color?: string;
}

// データ定義
const SCREEN_CONFIG: Record<ViewType, { title?: string; icon?: string; buttons: ButtonConfig[] }> = {
    home: {
        buttons: [
            { id: 'btn-want', label: 'ほしい', icon: '🎁', action: 'navigate:want', styleType: 'hero' },
            { id: 'btn-help', label: 'たすけて', icon: '🆘', action: 'navigate:help', styleType: 'hero' },
            { id: 'btn-chat', label: '雑談', icon: '💬', action: 'navigate:chat', styleType: 'hero' },
        ]
    },
    want: {
        title: 'ほしいもの',
        icon: '🎁',
        buttons: [
            { id: 'w-water', label: '水', action: 'say:水がほしい', styleType: 'grid' },
            { id: 'w-food', label: 'ご飯', action: 'say:ご飯がほしい', styleType: 'grid' },
            { id: 'w-toilet', label: 'トイレ', action: 'say:トイレに行きたい', styleType: 'grid' },
            { id: 'w-meds', label: '薬', action: 'say:薬を飲みたい', styleType: 'grid' },
            { id: 'w-back', label: '戻る', icon: '↩️', action: 'back', styleType: 'grid' },
        ]
    },
    help: {
        title: 'たすけて',
        icon: '🆘',
        buttons: [
            { id: 'h-pain', label: '痛い', action: 'say:痛い', styleType: 'grid' },
            { id: 'h-sick', label: '気分が悪い', action: 'say:気分が悪い', styleType: 'grid' },
            { id: 'h-move', label: '動けない', action: 'say:動けない', styleType: 'grid' },
            { id: 'h-talk', label: '話しかけて', action: 'say:話しかけて', styleType: 'grid' },
            { id: 'h-back', label: '戻る', icon: '↩️', action: 'back', styleType: 'grid' },
        ]
    },
    chat: {
        title: '雑談',
        icon: '💬',
        buttons: [
            { id: 'c-weather', label: '天気', action: 'say:天気の話し', styleType: 'grid' },
            { id: 'c-news', label: 'ニュース', action: 'say:ニュースの話し', styleType: 'grid' },
            { id: 'c-family', label: '家族', action: 'say:家族の話し', styleType: 'grid' },
            { id: 'c-back', label: '戻る', icon: '↩️', action: 'back', styleType: 'grid' },
        ]
    }
};

export const UnifiedSelectionScreen: React.FC = () => {
    // MediaPipe & Pointer Tracking (Persistent)
    const { videoRef, pointerPosition, gestureState, isInitialized, error, debugInfo, sensitivity, setSensitivity } = useNosePointer();

    // FSM (Shared Logic)
    const { fsmContext, registerButton, unregisterButton, updatePointerPosition, handleGesture, resetConfirm } = usePointerFSM();

    const logs = useLogCapture();
    const [currentView, setCurrentView] = useState<ViewType>('home');
    const [confirmedAction, setConfirmedAction] = useState<string | null>(null);
    const [clickFlash, setClickFlash] = useState(false);
    const [showInitInfo, setShowInitInfo] = useState(true);
    
    // ボタンRef管理
    const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    // 現在の画面設定
    const config = SCREEN_CONFIG[currentView];

    // レイアウト更新（ボタン登録）
    const updateButtons = () => {
        Object.entries(buttonRefs.current).forEach(([id, el]) => {
            if (el && document.body.contains(el)) {
                const rect = el.getBoundingClientRect();
                registerButton(id, {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                    id,
                });
            } else {
                unregisterButton(id);
            }
        });
    };

    // 画面切り替え時やリサイズ時にボタンを更新
    useEffect(() => {
        const timer = setTimeout(updateButtons, 50);
        return () => clearTimeout(timer);
    }, [currentView]);

    // 定期的な位置補正 (Resizeなど)
    useEffect(() => {
        window.addEventListener('resize', updateButtons);
        const intervalId = setInterval(updateButtons, 1000);
        return () => {
            window.removeEventListener('resize', updateButtons);
            clearInterval(intervalId);
        };
    }, []);

    // ポインタ位置更新
    useEffect(() => {
        if (isInitialized && pointerPosition.isTracking) {
            updatePointerPosition(pointerPosition.x, pointerPosition.y);
        }
    }, [pointerPosition, isInitialized, updatePointerPosition]);

    // ジェスチャ連携
    useEffect(() => {
        if (gestureState.direction !== 'none') {
            handleGesture(gestureState.direction, gestureState.distance);
        }
    }, [gestureState, handleGesture]);

    // アクション実行
    useEffect(() => {
        if (fsmContext.state === 'confirm' && fsmContext.confirmedButtonId) {
            const btnId = fsmContext.confirmedButtonId;
            setConfirmedAction(btnId);
            setClickFlash(true);
            setTimeout(() => setClickFlash(false), 300);

            // アクションの特定
            const targetBtn = config.buttons.find(b => b.id === btnId);

            const timer = setTimeout(() => {
                if (targetBtn) {
                    const [type, payload] = targetBtn.action.split(':');

                    if (targetBtn.action === 'back') {
                        setCurrentView('home');
                    } else if (type === 'navigate') {
                        setCurrentView(payload as ViewType);
                    } else if (type === 'say') {
                        const utterance = new SpeechSynthesisUtterance(payload);
                        utterance.lang = 'ja-JP';
                        window.speechSynthesis.speak(utterance);
                    }
                }
                resetConfirm();
                setConfirmedAction(null);
            }, 500); // 0.5秒後に実行（視覚フィードバック用）

            return () => clearTimeout(timer);
        }
    }, [fsmContext.state, fsmContext.confirmedButtonId, config.buttons, resetConfirm]);

    // 初期化メッセージの自動消去
    useEffect(() => {
        if (isInitialized && showInitInfo) {
            const timer = setTimeout(() => setShowInitInfo(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isInitialized, showInitInfo]);

    return (
        <div className="relative w-full h-screen bg-slate-50 overflow-hidden font-sans select-none">
            {/* カメラ映像レイヤー */}
            <CameraOverlay 
                videoRef={videoRef} 
                isInitialized={isInitialized} 
                pointerPosition={pointerPosition}
                debugInfo={debugInfo}
                sensitivity={sensitivity}
                setSensitivity={setSensitivity}
            />

            {/* UIレイヤー */}
            <div className="absolute inset-0 z-10 flex flex-col p-4 pointer-events-none">
                {/* ヘッダー */}
                <div className="flex justify-between items-center mb-4 pointer-events-auto">
                    <div className="bg-white/90 backdrop-blur px-6 py-3 rounded-2xl shadow-sm border border-slate-200">
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                            {config.icon && <span className="text-3xl">{config.icon}</span>}
                            {config.title || 'メニュー'}
                        </h1>
                    </div>
                    
                    {/* 状態インジケーター */}
                    <div className={`px-4 py-2 rounded-full text-sm font-bold transition-colors duration-300 ${
                        fsmContext.state === 'confirm' ? 'bg-blue-500 text-white' :
                        fsmContext.state === 'ready_to_confirm' ? 'bg-blue-500 text-white animate-pulse' :
                        fsmContext.state === 'hover_inner' ? 'bg-green-500 text-white' :
                        fsmContext.state === 'hover_outer' ? 'bg-yellow-500 text-white' :
                        'bg-slate-200 text-slate-500'
                    }`}>
                        {fsmContext.state === 'confirm' ? '決定！' :
                         fsmContext.state === 'ready_to_confirm' ? '下に動かして決定！' :
                         fsmContext.state === 'hover_inner' ? 'チャージ中...' :
                         fsmContext.state === 'hover_outer' ? '準備中...' : '待機中'}
                    </div>
                </div>

                {/* メインコンテンツエリア */}
                <div className="flex-1 grid grid-cols-12 gap-6 p-2">
                    {config.buttons.map((btn) => {
                        const isHovered = fsmContext.activeButtonId === btn.id;
                        const isConfirmed = confirmedAction === btn.id;
                        
                        // 状態判定
                        const isOuter = isHovered && fsmContext.state === 'hover_outer';
                        const isInner = isHovered && fsmContext.state === 'hover_inner';
                        const isReady = isHovered && fsmContext.state === 'ready_to_confirm';
                        
                        // スタイル分岐
                        const isHero = btn.styleType === 'hero';
                        const colSpan = isHero ? 'col-span-4' : 'col-span-4'; // グリッドレイアウト調整
                        
                        // プログレスバーの計算
                        const progress = isHovered ? fsmContext.progress : 0;

                        return (
                            <div key={btn.id} className={`${colSpan} relative group pointer-events-auto`}>
                                <button
                                    ref={(el) => { buttonRefs.current[btn.id] = el; }}
                                    className={`
                                        w-full h-full rounded-3xl border-4 transition-all duration-200 relative overflow-hidden
                                        flex flex-col items-center justify-center gap-4
                                        ${isConfirmed ? 'scale-95 border-blue-500 bg-blue-50' : 
                                          isReady ? 'scale-105 border-blue-500 bg-blue-50 shadow-xl z-20 ring-4 ring-blue-200' :
                                          isInner ? 'scale-105 border-green-500 bg-green-50 shadow-xl z-20' : 
                                          isOuter ? 'scale-100 border-yellow-400 bg-yellow-50 shadow-lg z-20' :
                                          'border-slate-200 bg-white shadow-md hover:border-slate-300'}
                                    `}
                                >
                                    {/* 背景プログレス（下から上に溜まる） */}
                                    <div 
                                        className={`absolute bottom-0 left-0 w-full transition-all duration-75 ease-linear ${
                                            isReady ? 'bg-blue-200/50' : 'bg-green-200/50'
                                        }`}
                                        style={{ height: `${progress}%` }}
                                    />

                                    {/* アイコン */}
                                    {btn.icon && (
                                        <span className={`text-6xl transition-transform duration-300 ${isHovered ? 'scale-110' : ''}`}>
                                            {btn.icon}
                                        </span>
                                    )}
                                    
                                    {/* ラベル */}
                                    <span className={`text-3xl font-bold ${
                                        isReady ? 'text-blue-800' :
                                        isInner ? 'text-green-800' :
                                        isOuter ? 'text-yellow-800' :
                                        'text-slate-700'
                                    }`}>
                                        {btn.label}
                                    </span>

                                    {/* ガイドメッセージ */}
                                    {isOuter && (
                                        <span className="absolute bottom-4 text-sm font-bold text-yellow-600">
                                            中央を見てチャージ
                                        </span>
                                    )}
                                    {isInner && (
                                        <span className="absolute bottom-4 text-sm font-bold text-green-600">
                                            チャージ中...
                                        </span>
                                    )}
                                    {isReady && (
                                        <span className="absolute bottom-4 text-lg font-bold text-blue-600 animate-bounce">
                                            ⬇️ 下に動かして決定
                                        </span>
                                    )}
                                </button>
                                
                                {/* 円形プログレスインジケーター（ボタン右上に表示） */}
                                {isHovered && (
                                    <div className="absolute -top-4 -right-4 w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center z-30">
                                        <svg className="w-12 h-12 transform -rotate-90">
                                            <circle
                                                cx="24"
                                                cy="24"
                                                r="20"
                                                stroke="#e2e8f0"
                                                strokeWidth="4"
                                                fill="none"
                                            />
                                            <circle
                                                cx="24"
                                                cy="24"
                                                r="20"
                                                stroke={isReady ? '#3b82f6' : isInner ? '#22c55e' : '#eab308'}
                                                strokeWidth="4"
                                                fill="none"
                                                strokeDasharray={126}
                                                strokeDashoffset={126 - (126 * progress) / 100}
                                                className="transition-all duration-75 ease-linear"
                                            />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 全画面フラッシュ（決定時） */}
            {clickFlash && (
                <div className="absolute inset-0 bg-white/50 z-50 animate-ping pointer-events-none" />
            )}

            {/* 初期化ローディング */}
            {!isInitialized && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white">
                    <div className="text-6xl mb-8 animate-bounce">⏳</div>
                    <h2 className="text-3xl font-bold text-slate-800 mb-4">初期化中...</h2>
                    <p className="text-slate-500">MediaPipeを読み込んでいます</p>
                    <p className="text-slate-400 text-sm mt-2">初回起動時は数秒かかる場合があります</p>
                    {/* ログ表示（デバッグ用） */}
                    <div className="mt-8 w-2/3 max-h-48 overflow-y-auto bg-slate-100 p-4 rounded text-xs font-mono text-slate-600">
                        {logs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* エラー表示 */}
            {error && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-50 p-8 text-center">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-red-600 mb-2">エラーが発生しました</h2>
                    <p className="text-red-800 mb-6">{error}</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition-colors"
                    >
                        再読み込み
                    </button>
                </div>
            )}
        </div>
    );
};
