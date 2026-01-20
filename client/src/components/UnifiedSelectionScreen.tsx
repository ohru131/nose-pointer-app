import React, { useEffect, useState, useRef, useMemo } from 'react';
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
    const { videoRef, pointerPosition, gestureState, isInitialized, error, resetGesture, debugInfo, sensitivity, setSensitivity } = useNosePointer();

    // FSM (Shared Logic)
    const { fsmContext, registerButton, unregisterButton, updatePointerPosition, handleGesture, resetConfirm, resetCancel } = usePointerFSM();

    const logs = useLogCapture();
    const [currentView, setCurrentView] = useState<ViewType>('home');
    const [confirmedAction, setConfirmedAction] = useState<string | null>(null);
    const [clickFlash, setClickFlash] = useState(false);
    const [showInitInfo, setShowInitInfo] = useState(true);
    const [initStartTime] = useState(Date.now());
    
    // 確定ボタンの位置を固定するためのState
    const [confirmBtnPos, setConfirmBtnPos] = useState<{ id: string, x: number, y: number } | null>(null);

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

                // ホバー中のボタンに対して確定ボタンを登録
                if (fsmContext.state === 'hover' && fsmContext.hoveredButtonId === id) {
                    const confirmBtnId = `${id}-confirm`;
                    const confirmBtnWidth = 160;
                    const confirmBtnHeight = 80;
                    
                    // 既に位置が決まっている場合はそれを使う、なければポインタ位置から計算
                    let confirmBtnX, confirmBtnY;
                    
                    if (confirmBtnPos && confirmBtnPos.id === id) {
                        confirmBtnX = confirmBtnPos.x;
                        confirmBtnY = confirmBtnPos.y;
                    } else {
                        // 初回表示時：ポインタの少し下に表示
                        // ポインタ位置は useNosePointer から取得済み
                        if (pointerPosition.isTracking) {
                            confirmBtnX = pointerPosition.x - (confirmBtnWidth / 2);
                            confirmBtnY = pointerPosition.y + 50; // ポインタの50px下
                        } else {
                            // フォールバック：ボタンの下部中央
                            confirmBtnX = rect.left + (rect.width / 2) - (confirmBtnWidth / 2);
                            confirmBtnY = rect.bottom + 20;
                        }
                        
                        // 画面外にはみ出さないように調整
                        if (confirmBtnX < 0) confirmBtnX = 10;
                        if (confirmBtnX + confirmBtnWidth > window.innerWidth) confirmBtnX = window.innerWidth - confirmBtnWidth - 10;
                        if (confirmBtnY + confirmBtnHeight > window.innerHeight) confirmBtnY = window.innerHeight - confirmBtnHeight - 10;

                        // 位置を保存（次回以降固定）
                        // レンダリングサイクル中なので、setStateはuseEffectで行うか、ここでの計算値をRefに保存する等の工夫が必要だが、
                        // updateButtonsはuseEffect/setIntervalから呼ばれるため、ここでsetStateすると無限ループのリスクがある。
                        // そのため、updateButtons内ではregisterButtonのみ行い、位置決定ロジックは分離すべき。
                        // しかし、registerButtonに渡す座標と描画座標を一致させる必要がある。
                        
                        // 暫定対応：ここで計算した値を使いつつ、useEffectで位置を固定する
                    }

                    registerButton(confirmBtnId, {
                        x: confirmBtnX,
                        y: confirmBtnY,
                        width: confirmBtnWidth,
                        height: confirmBtnHeight,
                        id: confirmBtnId,
                        isConfirmButton: true, // 識別用フラグ
                        parentId: id
                    });
                }
            } else {
                unregisterButton(id);
            }
        });
    };

    // 確定ボタンの位置管理
    useEffect(() => {
        if (fsmContext.state === 'hover' && fsmContext.hoveredButtonId) {
            // まだ位置が決まっていない、または別のボタンに移った場合のみ更新
            if (!confirmBtnPos || confirmBtnPos.id !== fsmContext.hoveredButtonId) {
                const btnId = fsmContext.hoveredButtonId;
                const confirmBtnWidth = 160;
                const confirmBtnHeight = 80;
                
                let x, y;
                // ポインタ位置が有効ならそこを基準にする
                if (pointerPosition.isTracking) {
                    x = pointerPosition.x - (confirmBtnWidth / 2);
                    y = pointerPosition.y + 50; // ポインタの50px下
                } else {
                    // フォールバック：ボタンの下部中央
                    const el = buttonRefs.current[btnId];
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        x = rect.left + (rect.width / 2) - (confirmBtnWidth / 2);
                        y = rect.bottom + 20;
                    } else {
                        x = window.innerWidth / 2 - confirmBtnWidth / 2;
                        y = window.innerHeight / 2;
                    }
                }

                // 画面外補正
                if (x < 0) x = 10;
                if (x + confirmBtnWidth > window.innerWidth) x = window.innerWidth - confirmBtnWidth - 10;
                if (y + confirmBtnHeight > window.innerHeight) y = window.innerHeight - confirmBtnHeight - 10;

                setConfirmBtnPos({ id: btnId, x, y });
            }
        } else if (fsmContext.state === 'idle') {
            // 完全なアイドル状態になったらリセット
            if (confirmBtnPos) {
                setConfirmBtnPos(null);
            }
        }
        // 依存配列から pointerPosition.isTracking を削除し、fsmContextの変化のみで発火させる
        // これにより、トラッキング状態の変化による不要な再計算を防ぐ
    }, [fsmContext.state, fsmContext.hoveredButtonId]);

    // 画面切り替え時やホバー状態変化時にボタンを更新
    useEffect(() => {
        // ボタンRefをリセット（DOMが再描画されるため）
        // buttonRefs.current = {}; // ここでリセットするとホバー時に消えてしまうので削除

        // 少し待ってから登録（レンダリング待ち）
        const timer = setTimeout(updateButtons, 50);
        return () => clearTimeout(timer);
    }, [currentView, fsmContext.state, fsmContext.hoveredButtonId, confirmBtnPos]); // confirmBtnPosが変わったら再登録

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

    // ジェスチャ処理
    useEffect(() => {
        if (gestureState.direction !== 'none') {
            handleGesture(gestureState.direction, gestureState.distance);
        }
        // gestureState全体ではなく、directionのみを監視してループを防止
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gestureState.direction, handleGesture]);

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
                        console.log('Action Triggered:', payload);
                        const utterance = new SpeechSynthesisUtterance(payload);
                        utterance.lang = 'ja-JP';
                        speechSynthesis.speak(utterance);
                    }
                }
                resetConfirm();
                setConfirmedAction(null);
            }, 600);

            return () => clearTimeout(timer);
        }
    }, [fsmContext.state, fsmContext.confirmedButtonId, config, resetConfirm]);

    // Init Info Timer
    useEffect(() => {
        if (isInitialized && !error) {
            const timer = setTimeout(() => setShowInitInfo(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isInitialized, error]);


    // --- Rendering ---

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
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8fafc',
            padding: '20px',
            position: 'relative',
        }}>
            <CameraOverlay
                videoRef={videoRef}
                pointerPosition={pointerPosition}
                isInitialized={isInitialized}
                isHovering={fsmContext.state === 'hover'}
            />
            {clickFlash && <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.4)', zIndex: 9999, pointerEvents: 'none' }} />}

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

            {/* Header / Title (Only for sub-pages) */}
            {currentView !== 'home' && (
                <div style={{ marginBottom: '20px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#1e293b' }}>
                        {config.icon} {config.title}
                    </h1>
                    <p style={{ color: '#64748b' }}>上を向くと戻ります</p>
                </div>
            )}

            {/* Button Container */}
            <div style={{
                display: currentView === 'home' ? 'flex' : 'grid',
                gridTemplateColumns: currentView === 'home' ? 'none' : 'repeat(2, 1fr)', // Grid for items
                flexDirection: 'row', // for home
                gap: '30px',
                width: '100%',
                maxWidth: currentView === 'home' ? '100%' : '800px',
                height: currentView === 'home' ? '80vh' : 'auto',
                padding: currentView === 'home' ? '40px' : '0',
                boxSizing: 'border-box',
                position: 'relative',
                zIndex: 1,
            }}>
                {config.buttons.map((btn) => {
                    const isActive = fsmContext.activeButtonId === btn.id;
                    const isHover = fsmContext.state === 'hover';
                    const isConfirmed = confirmedAction === btn.id;

                    return (
                        <div key={btn.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <button
                                ref={el => { buttonRefs.current[btn.id] = el; }}
                                style={{
                                    flex: btn.styleType === 'hero' ? 1 : 'none',
                                    height: btn.styleType === 'hero' ? '70vh' : '180px',
                                    fontSize: btn.styleType === 'hero' ? '64px' : '32px',
                                    fontWeight: '800',
                                    border: isActive && isHover ? '12px solid #fbbf24' : '4px solid transparent',
                                    borderRadius: btn.styleType === 'hero' ? '40px' : '24px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease-out',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: btn.styleType === 'hero' ? '32px' : '16px',
                                    backgroundColor: isActive && isHover ? 'rgb(37, 99, 235)' : isConfirmed ? 'rgb(34, 197, 94)' : 'rgb(219, 234, 254)',
                                    color: isActive && isHover ? 'white' : 'rgb(30, 58, 138)',
                                    transform: isActive && isHover ? 'scale(1.05) translateY(-10px)' : isConfirmed ? 'scale(0.95)' : 'scale(1)',
                                    boxShadow: isActive && isHover ? '0 0 0 8px rgba(251, 191, 36, 0.5), 0 25px 50px rgba(37, 99, 235, 0.5)' : '0 10px 20px rgba(37, 99, 235, 0.1)',
                                }}
                            >
                                {btn.icon && <span style={{ fontSize: btn.styleType === 'hero' ? '140px' : '48px' }}>{btn.icon}</span>}
                                <span>{btn.label}</span>
                            </button>
                            {/* 確定ボタン（エンターキー）の表示 */}
                            {isActive && isHover && confirmBtnPos && confirmBtnPos.id === btn.id && (
                                <div style={{
                                    position: 'fixed', // absoluteからfixedに変更（画面全体座標系）
                                    left: confirmBtnPos.x,
                                    top: confirmBtnPos.y,
                                    width: '160px',
                                    height: '80px',
                                    backgroundColor: '#f97316', // Orange
                                    color: 'white',
                                    borderRadius: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '24px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 8px 16px rgba(249, 115, 22, 0.4)',
                                    zIndex: 100,
                                    border: '4px solid white',
                                    pointerEvents: 'none' // 実際の判定はFSMで行うため、ここでは表示のみ
                                }}>
                                    決定 ↵
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Debug Info */}
            {process.env.NODE_ENV === 'development' && (
                <div style={{
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
                }}>
                    <div>State: {fsmContext.state}</div>
                    <div>Active: {fsmContext.activeButtonId}</div>
                    <div>Gesture: {gestureState.direction}</div>
                    <div>View: {currentView}</div>
                </div>
            )}
        </div>
    );
};
