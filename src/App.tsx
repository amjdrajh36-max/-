import { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { WifiOff, Loader2 } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ClientMessage, ConnectionMode, PublicGameState } from './shared/types';
import {
  LocalOfflineController,
  clearOfflineSnapshot,
  hasSavedOfflineSnapshot,
} from './utils/localController';
import { soundFx } from './utils/sound';
import { normalizeRoomCode } from './shared/normalize';
import {
  auth,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
} from './firebase/config';
import { FirestoreRoomController } from './firebase/firestoreRoomController';
import { VoiceChatManager, VoiceManagerSnapshot } from './firebase/voiceChatManager';
import { TopHeader } from './components/TopHeader';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameBoard } from './components/GameBoard';
import { GameOverScreen } from './components/GameOverScreen';
import { RulesModal } from './components/RulesModal';

const ACTIVE_ONLINE_SESSION_KEY = 'mafia_active_online_session_v1';
const LEGACY_SESSION_KEY = 'mafia_firestore_session';

interface SavedOnlineSession {
  roomCode: string;
  savedAt: number;
}

function saveActiveOnlineSession(roomCode: string): void {
  try {
    const payload = JSON.stringify({ roomCode, savedAt: Date.now() });
    sessionStorage.setItem(ACTIVE_ONLINE_SESSION_KEY, payload);
    localStorage.setItem(ACTIVE_ONLINE_SESSION_KEY, payload);
  } catch {
    // ignore storage errors
  }
}

function loadActiveOnlineSession(): SavedOnlineSession | null {
  try {
    const raw =
      sessionStorage.getItem(ACTIVE_ONLINE_SESSION_KEY) ||
      localStorage.getItem(ACTIVE_ONLINE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedOnlineSession>;
    if (
      !parsed.roomCode ||
      !parsed.savedAt ||
      Date.now() - parsed.savedAt > 6 * 60 * 60 * 1000
    ) {
      clearActiveOnlineSession();
      return null;
    }
    return { roomCode: parsed.roomCode, savedAt: parsed.savedAt };
  } catch {
    clearActiveOnlineSession();
    return null;
  }
}

function clearActiveOnlineSession(): void {
  try {
    sessionStorage.removeItem(ACTIVE_ONLINE_SESSION_KEY);
    localStorage.removeItem(ACTIVE_ONLINE_SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

const INITIAL_VOICE_STATE: VoiceManagerSnapshot = {
  joinedVoice: false,
  micEnabled: false,
  speakerMuted: false,
  speaking: false,
  connectingVoice: false,
  forcedMuteReason: null,
  voiceError: null,
  peers: {},
};

function formatFirebaseErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'تم إغلاق نافذة تسجيل الدخول بحساب Google قبل إتمامها.';
  }
  if (code === 'auth/popup-blocked') {
    return 'منع المتصفح نافذة تسجيل الدخول المنبثقة. اسمح بالنوافذ المنبثقة ثم حاول مجدداً.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بالإنترنت. يمكنك اللعب دون اتصال بالذكاء الاصطناعي.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'النطاق الحالي غير مصرح له بتسجيل الدخول. تأكد من فتح اللعبة عبر الرابط الصحيح.';
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  if (rawMsg.startsWith('{') && rawMsg.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(rawMsg) as { error?: string };
      if (parsed.error?.toLowerCase().includes('permission')) {
        return 'تعذر الوصول للغرفة بسبب صلاحيات الحساب أو انتهاء الجلسة. تأكد من تسجيل الدخول بحساب Google موثق.';
      }
      if (parsed.error?.toLowerCase().includes('offline')) {
        return 'أنت غير متصل بالإنترنت حالياً. يمكنك استخدام اللعب الفردي دون اتصال.';
      }
    } catch {
      // fall through
    }
  }

  return rawMsg || 'حدث خطأ أثناء الاتصال بالغرفة. حاول مجدداً.';
}

export default function App() {
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [mode, setMode] = useState<ConnectionMode>('ONLINE_ROOM');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [restoringSession, setRestoringSession] = useState(() =>
    Boolean(loadActiveOnlineSession() || hasSavedOfflineSnapshot())
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [initialRoomCode, setInitialRoomCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    return roomParam ? normalizeRoomCode(roomParam) : '';
  });
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [voiceState, setVoiceState] = useState<VoiceManagerSnapshot>(INITIAL_VOICE_STATE);

  const firestoreCtrlRef = useRef<FirestoreRoomController | null>(null);
  const localCtrlRef = useRef<LocalOfflineController | null>(null);
  const voiceManagerRef = useRef<VoiceChatManager | null>(null);
  const voiceRoomCodeRef = useRef<string | null>(null);
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const clearConnections = useCallback(() => {
    if (voiceManagerRef.current) {
      voiceManagerRef.current.destroy();
      voiceManagerRef.current = null;
      voiceRoomCodeRef.current = null;
      setVoiceState(INITIAL_VOICE_STATE);
    }
    if (firestoreCtrlRef.current) {
      firestoreCtrlRef.current.destroy();
      firestoreCtrlRef.current = null;
    }
    if (localCtrlRef.current) {
      localCtrlRef.current.destroy();
      localCtrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearConnections();
    };
  }, [clearConnections]);

  const handleRoomStateUpdate = useCallback((state: PublicGameState) => {
    setConnecting(false);
    setRestoringSession(false);
    setErrorMsg(null);
    setGameState(state);
    saveActiveOnlineSession(state.roomCode);
  }, []);

  const handleRoomError = useCallback((msg: string) => {
    setConnecting(false);
    setRestoringSession(false);
    setErrorMsg(msg);
  }, []);

  // Boot: clean legacy storage, restore offline game immediately if present, and listen to auth
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // ignore storage errors
    }

    const restoredOffline = LocalOfflineController.restoreFromSnapshot(
      (state) => {
        setRestoringSession(false);
        setGameState(state);
      },
      (err) => setErrorMsg(err)
    );
    if (restoredOffline) {
      localCtrlRef.current = restoredOffline.controller;
      setMode(restoredOffline.mode);
      setRestoringSession(false);
      restoreAttemptedRef.current = true;
    }

    testFirestoreConnection();
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsubAuth();
  }, []);

  // Auto-rejoin active online room across page refreshes (works even with ?room= in URL)
  useEffect(() => {
    if (!authReady || restoreAttemptedRef.current || localCtrlRef.current) return;
    const saved = loadActiveOnlineSession();
    if (!saved) {
      setRestoringSession(false);
      return;
    }
    if (!authUser) {
      clearActiveOnlineSession();
      setRestoringSession(false);
      return;
    }

    restoreAttemptedRef.current = true;
    setMode('ONLINE_ROOM');
    setConnecting(true);

    FirestoreRoomController.joinRoom(
      saved.roomCode,
      authUser.displayName || 'لاعب',
      handleRoomStateUpdate,
      (err) => {
        clearActiveOnlineSession();
        setConnecting(false);
        setRestoringSession(false);
        setGameState(null);
        setErrorMsg(err);
      }
    )
      .then((ctrl) => {
        if (ctrl) {
          firestoreCtrlRef.current = ctrl;
        } else {
          clearActiveOnlineSession();
          setConnecting(false);
          setRestoringSession(false);
        }
      })
      .catch(() => {
        clearActiveOnlineSession();
        setConnecting(false);
        setRestoringSession(false);
      });
  }, [authReady, authUser, handleRoomStateUpdate]);

  const ensureGoogleAuth = async () => {
    if (auth.currentUser) return auth.currentUser;
    const user = await signInWithGooglePopup();
    setAuthUser(user);
    return user;
  };

  const handleCreateOnlineRoom = async (playerName: string, dayDurationSec: number) => {
    clearConnections();
    clearOfflineSnapshot();
    clearActiveOnlineSession();
    setMode('ONLINE_ROOM');
    setErrorMsg(null);
    setConnecting(true);

    try {
      await ensureGoogleAuth();
      const ctrl = await FirestoreRoomController.createRoom(
        playerName,
        dayDurationSec,
        handleRoomStateUpdate,
        handleRoomError
      );
      firestoreCtrlRef.current = ctrl;
    } catch (err) {
      setConnecting(false);
      setErrorMsg(formatFirebaseErrorMessage(err));
    }
  };

  const handleJoinOnlineRoom = async (roomCode: string, playerName: string) => {
    clearConnections();
    clearOfflineSnapshot();
    clearActiveOnlineSession();
    setMode('ONLINE_ROOM');
    setErrorMsg(null);
    setConnecting(true);

    try {
      await ensureGoogleAuth();
      const ctrl = await FirestoreRoomController.joinRoom(
        roomCode,
        playerName,
        handleRoomStateUpdate,
        handleRoomError
      );
      if (ctrl) {
        firestoreCtrlRef.current = ctrl;
      } else {
        setConnecting(false);
      }
    } catch (err) {
      setConnecting(false);
      setErrorMsg(formatFirebaseErrorMessage(err));
    }
  };

  const handleSignOut = async () => {
    clearConnections();
    clearActiveOnlineSession();
    clearOfflineSnapshot();
    setGameState(null);
    setErrorMsg(null);
    await signOutFirebase();
    setAuthUser(null);
  };

  const sendAction = useCallback(
    (msg: ClientMessage) => {
      setErrorMsg(null);
      if (mode === 'ONLINE_ROOM') {
        if (firestoreCtrlRef.current) {
          firestoreCtrlRef.current.dispatch(msg).catch((err) => {
            setErrorMsg(formatFirebaseErrorMessage(err));
          });
        } else {
          setErrorMsg('انقطع الاتصال بالغرفة. يرجى إعادة المحاولة.');
        }
      } else if (localCtrlRef.current) {
        localCtrlRef.current.dispatch(msg);
      }
    },
    [mode]
  );

  const handleStartOfflineSolo = (playerName: string, dayDurationSec: number) => {
    clearConnections();
    clearActiveOnlineSession();
    clearOfflineSnapshot();
    setMode('OFFLINE_SOLO');
    setErrorMsg(null);
    localCtrlRef.current = new LocalOfflineController(
      playerName,
      'OFFLINE_SOLO',
      [],
      dayDurationSec,
      (state) => setGameState(state),
      (err) => setErrorMsg(err)
    );
  };

  const handleStartPassPlay = (hostName: string, dayDurationSec: number) => {
    clearConnections();
    clearActiveOnlineSession();
    clearOfflineSnapshot();
    setMode('OFFLINE_PASS_PLAY');
    setErrorMsg(null);
    localCtrlRef.current = new LocalOfflineController(
      hostName,
      'OFFLINE_PASS_PLAY',
      [],
      dayDurationSec,
      (state) => setGameState(state),
      (err) => setErrorMsg(err)
    );
  };

  const handleLeaveSession = () => {
    clearConnections();
    clearActiveOnlineSession();
    clearOfflineSnapshot();
    setRestoringSession(false);
    setGameState(null);
    setErrorMsg(null);
    setInitialRoomCode('');
    if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundFx.muted = next;
    setMuted(next);
  };

  const handleScrollToRoles = () => {
    document.getElementById('roles-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const me = gameState?.players.find((p) => p.id === gameState.myPlayerId);
  const isHost = Boolean(me?.isHost);

  // Sync WebRTC VoiceChatManager across all online room phases
  useEffect(() => {
    if (mode !== 'ONLINE_ROOM' || !gameState || !me) {
      if (voiceManagerRef.current) {
        voiceManagerRef.current.destroy();
        voiceManagerRef.current = null;
        voiceRoomCodeRef.current = null;
        setVoiceState(INITIAL_VOICE_STATE);
      }
      return;
    }

    const hostUid = gameState.players.find((p) => p.isHost)?.id || gameState.myPlayerId;
    if (!voiceManagerRef.current || voiceRoomCodeRef.current !== gameState.roomCode) {
      voiceManagerRef.current?.destroy();
      voiceRoomCodeRef.current = gameState.roomCode;
      voiceManagerRef.current = new VoiceChatManager(
        gameState.roomCode,
        hostUid,
        gameState.myPlayerId,
        me.name,
        (snap) => setVoiceState(snap)
      );
    }

    voiceManagerRef.current.updateMeta(hostUid, me.name);
    voiceManagerRef.current.syncHumanPeers(
      gameState.players.filter((p) => !p.isBot).map((p) => p.id)
    );

    let muteReason: string | null = null;
    if (
      gameState.phase !== 'LOBBY' &&
      gameState.phase !== 'ROLE_REVEAL' &&
      gameState.phase !== 'GAME_OVER'
    ) {
      if (!me.isAlive) {
        muteReason = 'أنت خارج اللعب الآن — تستمع فقط حتى نهاية الجولة.';
      } else if (me.isSilenced) {
        muteReason = 'تم كتم المايك مؤقتاً لأنك مُسكَّت في هذه الجولة.';
      } else if (gameState.phase === 'NIGHT') {
        muteReason = 'مرحلة الليل — يعود المايك تلقائياً عند إشراقة النهار.';
      }
    }
    voiceManagerRef.current.setForcedMuteReason(muteReason);
  }, [mode, gameState, me]);

  const handleToggleMic = useCallback(() => {
    voiceManagerRef.current?.toggleMicrophone();
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    voiceManagerRef.current?.toggleSpeakerOnly();
  }, []);

  const handleLeaveVoice = useCallback(() => {
    voiceManagerRef.current?.leaveVoice();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
        <TopHeader
          inSession={Boolean(gameState)}
          muted={muted}
          onToggleMute={handleToggleMute}
          onOpenRules={() => setRulesOpen(true)}
          onScrollToRoles={!gameState ? handleScrollToRoles : undefined}
          onLeaveSession={gameState ? handleLeaveSession : undefined}
        />

        {errorMsg && gameState && (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-sm flex items-center justify-between gap-4">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-xs font-bold text-red-300 hover:text-white whitespace-nowrap"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        <div className="flex-1">
          {!gameState && restoringSession ? (
            <div className="min-h-[65vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-white">جاري استعادة جلستك في الغرفة...</h2>
                <p className="text-sm text-slate-400">
                  تبقى داخل نفس الغرفة والمباراة تلقائياً دون العودة للرئيسية.
                </p>
              </div>
            </div>
          ) : !gameState ? (
            <HomeScreen
              initialRoomCode={initialRoomCode}
              errorMsg={errorMsg}
              connecting={connecting}
              authUser={
                authUser
                  ? { displayName: authUser.displayName, email: authUser.email }
                  : null
              }
              onSignOut={handleSignOut}
              onCreateOnlineRoom={handleCreateOnlineRoom}
              onJoinOnlineRoom={handleJoinOnlineRoom}
              onStartOfflineSolo={handleStartOfflineSolo}
              onStartPassPlay={handleStartPassPlay}
              onClearError={() => setErrorMsg(null)}
            />
          ) : gameState.phase === 'LOBBY' ? (
            <LobbyScreen
              state={gameState}
              mode={mode}
              isHost={isHost}
              voice={voiceState}
              onToggleMic={handleToggleMic}
              onToggleSpeaker={handleToggleSpeaker}
              onLeaveVoice={handleLeaveVoice}
              onStartGame={() => sendAction({ type: 'START_GAME' })}
              onUpdateDayDuration={(dayDurationSec) =>
                sendAction({ type: 'UPDATE_SETTINGS', dayDurationSec })
              }
              onAddLocalPlayer={
                mode === 'OFFLINE_PASS_PLAY'
                  ? (name) => localCtrlRef.current?.addPassPlayPlayer(name)
                  : undefined
              }
              onRemoveLocalPlayer={
                mode === 'OFFLINE_PASS_PLAY'
                  ? (id) => localCtrlRef.current?.removePassPlayPlayer(id)
                  : undefined
              }
            />
          ) : gameState.phase === 'GAME_OVER' ? (
            <GameOverScreen
              state={gameState}
              mode={mode}
              isHost={isHost}
              voice={voiceState}
              onToggleMic={handleToggleMic}
              onToggleSpeaker={handleToggleSpeaker}
              onLeaveVoice={handleLeaveVoice}
              onPlayAgain={() => sendAction({ type: 'PLAY_AGAIN' })}
              onExitHome={handleLeaveSession}
            />
          ) : (
            <GameBoard
              state={gameState}
              mode={mode}
              isHost={isHost}
              voice={voiceState}
              onToggleMic={handleToggleMic}
              onToggleSpeaker={handleToggleSpeaker}
              onLeaveVoice={handleLeaveVoice}
              localHumans={
                mode === 'OFFLINE_PASS_PLAY'
                  ? localCtrlRef.current?.getHumanPlayers() || []
                  : []
              }
              onSwitchLocalHuman={(id) => localCtrlRef.current?.switchActiveHuman(id)}
              onMarkReady={() => sendAction({ type: 'MARK_ROLE_READY' })}
              onSubmitNightAction={(targetId) =>
                sendAction({ type: 'SUBMIT_NIGHT_ACTION', targetId })
              }
              onCastVote={(targetId) => sendAction({ type: 'CAST_VOTE', targetId })}
              onWithdrawVote={() => sendAction({ type: 'WITHDRAW_VOTE' })}
              onCloseVoting={() => sendAction({ type: 'CLOSE_VOTING' })}
              onSubmitDefense={(text) => sendAction({ type: 'SUBMIT_DEFENSE', text })}
              onUseSheikhAbility={() => sendAction({ type: 'USE_SHEIKH_ABILITY' })}
              onFinalizeDefense={() => sendAction({ type: 'FINALIZE_DEFENSE' })}
              onContinueAfterElimination={() =>
                sendAction({ type: 'CONTINUE_AFTER_ELIMINATION' })
              }
              onSubmitRevenge={(targetId) => sendAction({ type: 'SUBMIT_REVENGE', targetId })}
              onSendChat={(text) => sendAction({ type: 'SEND_CHAT', text })}
            />
          )}
        </div>

        <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

        {!isOnline && (
          <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>وضع عدم الاتصال — اللعب المحلي بالذكاء الاصطناعي متاح</span>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
