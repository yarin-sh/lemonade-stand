import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import {
  getPosterSpend,
  getPosterUnitCost,
  socketEvents,
  type AutoPlayerInput,
  type AutoPlayerRiskProfile,
  type RoomListItem,
  type RoomSnapshot,
  type SetupInput,
  type SingleplayerAutoRunResult,
  type SingleplayerSaveData,
  type SingleplayerSnapshot
} from "@lemonade-game/shared";

const serverUrl = import.meta.env.VITE_SERVER_URL;

type SetupDraft = {
  cups: string;
  posters: string;
  price: string;
};

type AppPage = "home" | "multiplayer" | "singleplayerResume";

type AutoPlayerDraft = {
  days: string;
  riskProfile: AutoPlayerRiskProfile;
  stopBalance: string;
};

const emptySetupDraft: SetupDraft = {
  cups: "",
  posters: "",
  price: ""
};

const singleplayerSaveKey = "lemonade-game:singleplayer-save:v1";
const emptyAutoPlayerDraft: AutoPlayerDraft = {
  days: "",
  riskProfile: "balanced",
  stopBalance: "0"
};

export function App() {
  const socketRef = useRef<Socket | null>(null);
  const singleplayerSetupKeyRef = useRef<string | null>(null);
  const roomSetupKeyRef = useRef<string | null>(null);
  const setupSubmittingRef = useRef(false);
  const autoRunStartedAtRef = useRef<number | null>(null);
  const autoRunResultTimerRef = useRef<number | null>(null);
  const [page, setPage] = useState<AppPage>("home");
  const [singleplayer, setSingleplayer] = useState<SingleplayerSnapshot | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[]>([]);
  const [singleplayerSave, setSingleplayerSave] = useState<SingleplayerSaveData | null>(() => readSingleplayerSave());
  const [autoPlayerDialogOpen, setAutoPlayerDialogOpen] = useState(false);
  const [autoPlayerLoading, setAutoPlayerLoading] = useState(false);
  const [autoPlayerLogsOpen, setAutoPlayerLogsOpen] = useState(false);
  const [autoPlayerResult, setAutoPlayerResult] = useState<SingleplayerAutoRunResult | null>(null);
  const [setup, setSetup] = useState<SetupDraft>(emptySetupDraft);
  const [setupSubmitAttempted, setSetupSubmitAttempted] = useState(false);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  const clearAutoRunTimer = () => {
    if (autoRunResultTimerRef.current) {
      window.clearTimeout(autoRunResultTimerRef.current);
      autoRunResultTimerRef.current = null;
    }
  };

  const resetAutoPlayerUi = () => {
    clearAutoRunTimer();
    autoRunStartedAtRef.current = null;
    setAutoPlayerDialogOpen(false);
    setAutoPlayerLoading(false);
    setAutoPlayerLogsOpen(false);
    setAutoPlayerResult(null);
  };

  useEffect(() => {
    const socket = serverUrl ? io(serverUrl, {
      autoConnect: true,
      transports: ["websocket"]
    }) : io({
      autoConnect: true,
      transports: ["websocket"]
    });

    socketRef.current = socket;
    socket.on(socketEvents.server.singleplayerSnapshot, (snapshot: SingleplayerSnapshot) => {
      setupSubmittingRef.current = false;
      setSetupSubmitting(false);
      setSingleplayer(snapshot);
      setRoom(null);
      setCommandError(null);
      roomSetupKeyRef.current = null;

      if (snapshot.saveData) {
        writeSingleplayerSave(snapshot.saveData);
        setSingleplayerSave(snapshot.saveData);
      } else if (snapshot.phase === "GAME_OVER") {
        clearSingleplayerSave();
        setSingleplayerSave(null);
      }

      const setupKey = snapshot.phase === "SETUP" ? `${snapshot.day}:${snapshot.configVersion}` : null;

      if (setupKey && setupKey !== singleplayerSetupKeyRef.current) {
        setSetup(emptySetupDraft);
        setSetupSubmitAttempted(false);
      } else if (!setupKey) {
        setSetupSubmitAttempted(false);
      }

      singleplayerSetupKeyRef.current = setupKey;

      if (snapshot.autoRunResult) {
        const startedAt = autoRunStartedAtRef.current ?? Date.now();
        const waitMs = Math.max(0, 2500 - (Date.now() - startedAt));

        clearAutoRunTimer();
        autoRunResultTimerRef.current = window.setTimeout(() => {
          setAutoPlayerResult(snapshot.autoRunResult ?? null);
          setAutoPlayerLoading(false);
          setAutoPlayerDialogOpen(false);
          setAutoPlayerLogsOpen(false);
          autoRunStartedAtRef.current = null;
          autoRunResultTimerRef.current = null;
        }, waitMs);
      }
    });
    socket.on(socketEvents.server.roomSnapshot, (snapshot: RoomSnapshot) => {
      setupSubmittingRef.current = false;
      setSetupSubmitting(false);
      setRoom(snapshot);
      setSingleplayer(null);
      setCommandError(null);
      singleplayerSetupKeyRef.current = null;

      const setupKey = snapshot.phase === "SETUP" ? `${snapshot.id}:${snapshot.day}` : null;

      if (setupKey && setupKey !== roomSetupKeyRef.current) {
        setSetup(emptySetupDraft);
        setSetupSubmitAttempted(false);
      } else if (!setupKey) {
        setSetupSubmitAttempted(false);
      }

      roomSetupKeyRef.current = setupKey;
    });
    socket.on(socketEvents.server.roomListResult, (rooms: RoomListItem[]) => {
      setRoomList(rooms);
    });
    socket.on(socketEvents.server.commandError, (payload: { code?: string; message?: string }) => {
      setupSubmittingRef.current = false;
      setSetupSubmitting(false);
      clearAutoRunTimer();
      autoRunStartedAtRef.current = null;
      setAutoPlayerLoading(false);
      setCommandError(payload.message ?? payload.code ?? "Command failed.");
    });

    return () => {
      clearAutoRunTimer();
      socketRef.current = null;
      socket.disconnect();
    };
  }, []);

  const continueGame = () => {
    socketRef.current?.emit(socketEvents.client.singleplayerContinue);
  };

  const continueRoom = () => {
    socketRef.current?.emit(socketEvents.client.roomContinue);
  };

  const startNewSingleplayer = () => {
    clearSingleplayerSave();
    resetAutoPlayerUi();
    setSingleplayerSave(null);
    singleplayerSetupKeyRef.current = null;
    roomSetupKeyRef.current = null;
    setSetup(emptySetupDraft);
    setSetupSubmitAttempted(false);
    socketRef.current?.emit(socketEvents.client.roomLeave);
    socketRef.current?.emit(socketEvents.client.singleplayerStart);
  };

  const loadSingleplayer = () => {
    const save = singleplayerSave ?? readSingleplayerSave();

    if (!save) {
      startNewSingleplayer();
      return;
    }

    resetAutoPlayerUi();
    socketRef.current?.emit(socketEvents.client.roomLeave);
    singleplayerSetupKeyRef.current = null;
    roomSetupKeyRef.current = null;
    setSetupSubmitAttempted(false);
    socketRef.current?.emit(socketEvents.client.singleplayerLoad, save);
  };

  const requestSingleplayerStart = () => {
    socketRef.current?.emit(socketEvents.client.roomLeave);
    resetAutoPlayerUi();
    const save = readSingleplayerSave();

    if (save) {
      setSingleplayerSave(save);
      setPage("singleplayerResume");
      return;
    }

    startNewSingleplayer();
  };

  const backHomeFromSingleplayer = () => {
    resetAutoPlayerUi();
    setSingleplayer(null);
    setRoom(null);
    setPage("home");
    setCommandError(null);
    singleplayerSetupKeyRef.current = null;
    setSetupSubmitAttempted(false);
  };

  const backHomeFromRoom = () => {
    resetAutoPlayerUi();
    socketRef.current?.emit(socketEvents.client.roomLeave);
    setRoom(null);
    setSingleplayer(null);
    setPage("home");
    setCommandError(null);
    roomSetupKeyRef.current = null;
    setSetupSubmitAttempted(false);
  };

  useEffect(() => {
    if (!singleplayer || !canPressAnyKey(singleplayer)) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();

      if (tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button") {
        return;
      }

      event.preventDefault();
      continueGame();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [singleplayer]);

  useEffect(() => {
    if (!room || !canPressAnyKeyRoom(room)) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();

      if (tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button") {
        return;
      }

      event.preventDefault();
      continueRoom();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [room]);

  const setupInput = useMemo(() => parseSetupDraft(setup), [setup]);
  const setupPreview = useMemo(() => createSetupPreview(setup), [setup]);
  const roomSetupSnapshot = useMemo(() => createRoomPlaySnapshot(room), [room]);
  const activeSetupSnapshot = singleplayer?.phase === "SETUP" ? singleplayer : roomSetupSnapshot?.phase === "SETUP" ? roomSetupSnapshot : null;
  const setupSpend = useMemo(() => {
    if (!activeSetupSnapshot) {
      return 0;
    }

    return setupPreview.cups * activeSetupSnapshot.cupCost + getPosterSpend(setupPreview.posters);
  }, [setupPreview, activeSetupSnapshot]);

  const canSubmitSetup =
    activeSetupSnapshot !== null &&
    setupInput !== null &&
    !setupSubmitting &&
    setupSpend <= activeSetupSnapshot.coins &&
    setupInput.posters <= activeSetupSnapshot.maxPosters &&
    setupInput.price <= activeSetupSnapshot.maxPrice;
  const canSendSetup =
    activeSetupSnapshot !== null &&
    setupInput !== null &&
    setupSpend <= activeSetupSnapshot.coins &&
    setupInput.posters <= activeSetupSnapshot.maxPosters &&
    !isPriceRequired(setupInput) &&
    setupInput.price <= activeSetupSnapshot.maxPrice;

  const submitRoomSetup = () => {
    setSetupSubmitAttempted(true);
    setCommandError(null);

    if (!setupInput || !canSendSetup || setupSubmittingRef.current) {
      return;
    }

    setupSubmittingRef.current = true;
    setSetupSubmitting(true);
    socketRef.current?.emit(socketEvents.client.roomSubmitSetup, setupInput);
  };

  const submitSingleplayerSetup = () => {
    setSetupSubmitAttempted(true);
    setCommandError(null);

    if (!setupInput || !canSendSetup || setupSubmittingRef.current) {
      return;
    }

    setupSubmittingRef.current = true;
    setSetupSubmitting(true);
    socketRef.current?.emit(socketEvents.client.singleplayerSubmitSetup, setupInput);
  };

  const startAutoPlayer = (input: AutoPlayerInput) => {
    setCommandError(null);
    clearAutoRunTimer();
    setAutoPlayerDialogOpen(false);
    setAutoPlayerLogsOpen(false);
    setAutoPlayerResult(null);
    setAutoPlayerLoading(true);
    autoRunStartedAtRef.current = Date.now();
    socketRef.current?.emit(socketEvents.client.singleplayerAutoRun, input);
  };

  return (
    <main className="app-shell">
      <div className="machine-shell">
        <section className="console-screen" aria-live="polite">
          {room ? (
            <MultiplayerRoomPage
              backHome={backHomeFromRoom}
              canSubmitSetup={canSubmitSetup}
              commandError={commandError}
              continueRoom={continueRoom}
              leaveRoom={() => {
                socketRef.current?.emit(socketEvents.client.roomLeave);
                setRoom(null);
                setPage("multiplayer");
                roomSetupKeyRef.current = null;
                setSetupSubmitAttempted(false);
              }}
              room={room}
              setSetup={setSetup}
              setupSubmitAttempted={setupSubmitAttempted}
              setupSubmitting={setupSubmitting}
              setup={setup}
              setupInput={setupInput}
              setupSpend={setupSpend}
              startRoom={() => socketRef.current?.emit(socketEvents.client.roomStart)}
              submitSetup={submitRoomSetup}
            />
          ) : singleplayer ? (
            <SingleplayerPage
              canSubmitSetup={canSubmitSetup}
              backHome={backHomeFromSingleplayer}
              commandError={commandError}
              continueGame={continueGame}
              setSetup={setSetup}
              setupSubmitAttempted={setupSubmitAttempted}
              setupSubmitting={setupSubmitting}
              setup={setup}
              setupInput={setupInput}
              setupSpend={setupSpend}
              autoPlayerDialogOpen={autoPlayerDialogOpen}
              autoPlayerLoading={autoPlayerLoading}
              autoPlayerLogsOpen={autoPlayerLogsOpen}
              autoPlayerResult={autoPlayerResult}
              clearAutoPlayerResult={() => {
                setAutoPlayerResult(null);
                setAutoPlayerLogsOpen(false);
              }}
              setAutoPlayerDialogOpen={setAutoPlayerDialogOpen}
              setAutoPlayerLogsOpen={setAutoPlayerLogsOpen}
              snapshot={singleplayer}
              startNewSingleplayer={startNewSingleplayer}
              startAutoPlayer={startAutoPlayer}
              submitSetup={submitSingleplayerSetup}
              answerTrivia={(answerIndex) =>
                socketRef.current?.emit(socketEvents.client.singleplayerAnswerTrivia, { answerIndex })
              }
            />
          ) : page === "multiplayer" ? (
            <MultiplayerPage
              backHome={() => setPage("home")}
              commandError={commandError}
              createRoom={(payload) => socketRef.current?.emit(socketEvents.client.roomCreate, payload)}
              joinRoom={(payload) => socketRef.current?.emit(socketEvents.client.roomJoin, payload)}
              refreshRooms={() => socketRef.current?.emit(socketEvents.client.roomList)}
              roomList={roomList}
            />
          ) : page === "singleplayerResume" && singleplayerSave ? (
            <SingleplayerResumePage
              backHome={() => setPage("home")}
              commandError={commandError}
              loadSingleplayer={loadSingleplayer}
              save={singleplayerSave}
              startNewSingleplayer={startNewSingleplayer}
            />
          ) : (
            <HomePage
              commandError={commandError}
              openMultiplayer={() => {
                setPage("multiplayer");
                socketRef.current?.emit(socketEvents.client.roomList);
              }}
              startSingleplayer={requestSingleplayerStart}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function HomePage({
  commandError,
  openMultiplayer,
  startSingleplayer
}: {
  commandError: string | null;
  openMultiplayer: () => void;
  startSingleplayer: () => void;
}) {
  return (
    <div className="console-page home-page">
      <div className="pixel-sun" aria-hidden="true" />
      <div className="dialog-box">
        <p className="terminal-line">READY PLAYER?</p>
        <h2>Lemonade Game</h2>
        <p>Run your stand one day at a time. Watch the sky. Set your price. Squeeze every coin you can.</p>
      </div>

      <div className="command-grid">
        <button type="button" onClick={startSingleplayer}>
          Start Singleplayer
        </button>
        <button type="button" onClick={openMultiplayer}>
          Multiplayer
        </button>
      </div>

      {commandError ? <p className="error-line">{commandError}</p> : null}
    </div>
  );
}

function SingleplayerResumePage({
  backHome,
  commandError,
  loadSingleplayer,
  save,
  startNewSingleplayer
}: {
  backHome: () => void;
  commandError: string | null;
  loadSingleplayer: () => void;
  save: SingleplayerSaveData;
  startNewSingleplayer: () => void;
}) {
  return (
    <div className="console-page home-page">
      <BackButton backHome={backHome} />
      <div className="dialog-box">
        <p className="terminal-line">SAVED GAME</p>
        <h2>Continue?</h2>
        <p>An existing game data has been found,</p>
        <p>
          Day <strong>{save.preview.day}</strong>, coins <strong>{save.preview.coins}</strong>.
        </p>
      </div>

      <div className="command-grid">
        <button type="button" onClick={loadSingleplayer}>
          Load
        </button>
        <button type="button" onClick={startNewSingleplayer}>
          Start New
        </button>
      </div>

      {commandError ? <p className="error-line">{commandError}</p> : null}
    </div>
  );
}

function MultiplayerPage({
  backHome,
  commandError,
  createRoom,
  joinRoom,
  refreshRooms,
  roomList
}: {
  backHome: () => void;
  commandError: string | null;
  createRoom: (payload: {
    roomName: string;
    nickname: string;
    visibility: "public" | "private";
  }) => void;
  joinRoom: (payload: { roomCode: string; nickname: string }) => void;
  refreshRooms: () => void;
  roomList: RoomListItem[];
}) {
  const [createNickname, setCreateNickname] = useState("");
  const [roomName, setRoomName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [joinNickname, setJoinNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

  return (
    <div className="console-page multiplayer-page">
      <div className="dialog-box">
        <p className="terminal-line">MULTIPLAYER</p>
        <h2>Room Select</h2>
        <p>Create a stand for friends, join by code, or browse public rooms.</p>
      </div>

      <div className="page-actions">
        <button type="button" onClick={backHome}>
          Back
        </button>
        <button type="button" onClick={refreshRooms}>
          Refresh Rooms
        </button>
      </div>

      <div className="multiplayer-grid">
        <form
          className="compact-form"
          onSubmit={(event) => {
            event.preventDefault();
            createRoom({
              roomName,
              nickname: createNickname,
              visibility
            });
          }}
        >
          <p className="terminal-line">Create room</p>
          <TextField label="Host nickname" onChange={setCreateNickname} value={createNickname} />
          <TextField label="Room name" onChange={setRoomName} value={roomName} />
          <div className="segmented-control" aria-label="Room visibility">
            <button
              aria-pressed={visibility === "private"}
              type="button"
              onClick={() => setVisibility("private")}
            >
              Private
            </button>
            <button
              aria-pressed={visibility === "public"}
              type="button"
              onClick={() => setVisibility("public")}
            >
              Public
            </button>
          </div>
          <button type="submit" disabled={!createNickname || !roomName}>
            Create
          </button>
        </form>

        <form
          className="compact-form"
          onSubmit={(event) => {
            event.preventDefault();
            joinRoom({ roomCode, nickname: joinNickname });
          }}
        >
          <p className="terminal-line">Join room</p>
          <TextField label="Player nickname" onChange={setJoinNickname} value={joinNickname} />
          <TextField label="Room code" onChange={(value) => setRoomCode(value.toUpperCase())} value={roomCode} />
          <button type="submit" disabled={!joinNickname || !roomCode}>
            Join
          </button>
        </form>

        <div className="room-list-panel">
          <div className="room-list-header">
            <p className="terminal-line">Public rooms</p>
          </div>
          {roomList.length ? (
            <div className="room-list">
              {roomList.map((room) => (
                <button
                  key={room.code}
                  type="button"
                  onClick={() => setRoomCode(room.code)}
                >
                  {room.name} [{room.playerCount}/{room.maxPlayers}] {room.code}
                </button>
              ))}
            </div>
          ) : (
            <p>No public rooms yet.</p>
          )}
        </div>
      </div>

      {commandError ? <p className="error-line">{commandError}</p> : null}
    </div>
  );
}

function MultiplayerRoomPage({
  backHome,
  canSubmitSetup,
  commandError,
  continueRoom,
  leaveRoom,
  room,
  setSetup,
  setup,
  setupSubmitAttempted,
  setupSubmitting,
  setupInput,
  setupSpend,
  startRoom,
  submitSetup
}: {
  backHome: () => void;
  canSubmitSetup: boolean;
  commandError: string | null;
  continueRoom: () => void;
  leaveRoom: () => void;
  room: RoomSnapshot;
  setSetup: (setup: SetupDraft) => void;
  setup: SetupDraft;
  setupSubmitAttempted: boolean;
  setupSubmitting: boolean;
  setupInput: SetupInput | null;
  setupSpend: number;
  startRoom: () => void;
  submitSetup: () => void;
}) {
  const currentPlayer = getCurrentRoomPlayer(room);
  const isHost = room.currentPlayerId === room.hostPlayerId;
  const connectedPlayers = room.players.filter((player) => player.isConnected);

  if (room.phase === "WEATHER_REVEAL") {
    const snapshot = createRoomPlaySnapshot(room);
    return snapshot ? <WeatherPage backHome={backHome} continueGame={continueRoom} snapshot={snapshot} /> : null;
  }

  if (room.phase === "SPECIAL_REVEAL") {
    const snapshot = createRoomPlaySnapshot(room);
    return snapshot ? <SpecialWeatherPage backHome={backHome} continueGame={continueRoom} snapshot={snapshot} /> : null;
  }

  if (room.phase === "SETUP") {
    const snapshot = createRoomPlaySnapshot(room);
    const currentPlayerReady = Boolean(
      room.currentPlayerId && room.readyPlayerIds?.includes(room.currentPlayerId)
    );

    if (!snapshot) {
      return null;
    }

    if (currentPlayerReady) {
      return <WaitingForSetupsPage backHome={backHome} commandError={commandError} leaveRoom={leaveRoom} room={room} />;
    }

    return (
      <SetupPage
        backHome={backHome}
        canSubmitSetup={canSubmitSetup}
        commandError={commandError}
        setSetup={setSetup}
        setup={setup}
        setupSubmitAttempted={setupSubmitAttempted}
        setupSubmitting={setupSubmitting}
        setupInput={setupInput}
        setupSpend={setupSpend}
        snapshot={snapshot}
        submitSetup={submitSetup}
      />
    );
  }

  if (room.phase === "SUMMARY") {
    return <MultiplayerSummaryPage backHome={backHome} commandError={commandError} continueRoom={continueRoom} leaveRoom={leaveRoom} room={room} />;
  }

  return (
    <div className="console-page lobby-page">
      <BackButton backHome={backHome} />
      <div className="dialog-box">
        <p className="terminal-line">MULTIPLAYER LOBBY</p>
        <h2>{room.name}</h2>
        <p>
          Room code: <strong>{room.code}</strong>
        </p>
        <p>
          Visibility: <strong>{room.visibility}</strong>
        </p>
      </div>

      <div className="lobby-grid">
        <div className="player-list">
          <p className="terminal-line">Players</p>
          {room.players.map((player) => (
            <div className="player-row" key={player.id}>
              <span>{player.nickname}</span>
              <strong>{player.isHost ? "Host" : player.isConnected ? "Ready" : "Offline"}</strong>
            </div>
          ))}
        </div>

        <div className="dialog-box">
          <p className="terminal-line">Host controls</p>
          <p>
            {isHost
              ? connectedPlayers.length >= 2
                ? "Start when everyone is ready."
                : "Waiting for one more player."
              : `${currentPlayer?.nickname ?? "Player"}, wait for the host to start.`}
          </p>
          <button type="button" disabled={!isHost || connectedPlayers.length < 2} onClick={startRoom}>
            Start Game
          </button>
          <button type="button" onClick={leaveRoom}>
            Leave Room
          </button>
        </div>
      </div>

      {commandError ? <p className="error-line">{commandError}</p> : null}
    </div>
  );
}

function WaitingForSetupsPage({
  backHome,
  commandError,
  leaveRoom,
  room
}: {
  backHome: () => void;
  commandError: string | null;
  leaveRoom: () => void;
  room: RoomSnapshot;
}) {
  const readyCount = room.readyPlayerIds?.length ?? 0;
  const connectedCount = room.players.filter((player) => player.isConnected).length;

  return (
    <div className="console-page waiting-page">
      <BackButton backHome={backHome} />
      <div className="dialog-box">
        <p className="terminal-line">SETUP LOCKED</p>
        <h2>Waiting</h2>
        <p>
          {readyCount} / {connectedCount} players have submitted their stand setup.
        </p>
      </div>

      <RoomLeaderboard room={room} />

      <button type="button" onClick={leaveRoom}>
        Leave Room
      </button>

      {commandError ? <p className="error-line">{commandError}</p> : null}
    </div>
  );
}

function MultiplayerSummaryPage({
  backHome,
  commandError,
  continueRoom,
  leaveRoom,
  room
}: {
  backHome: () => void;
  commandError: string | null;
  continueRoom: () => void;
  leaveRoom: () => void;
  room: RoomSnapshot;
}) {
  const currentPlayer = getCurrentRoomPlayer(room);
  const currentResult = room.currentPlayerId ? room.lastResults?.[room.currentPlayerId] : undefined;

  return (
    <ContinuePage backHome={backHome} className="summary-page multiplayer-summary-page" continueGame={continueRoom}>
      <div className="dialog-box">
        <p className="terminal-line">MULTIPLAYER SUMMARY</p>
        <h2>Day {room.day}</h2>
        {currentResult ? (
          <>
            <p>
              You had <strong>{currentResult.observedVisitors}</strong> visitors.{" "}
              <strong>{currentResult.soldCups}</strong> bought, with about{" "}
              <strong>{formatPercent(currentResult.purchaseChance)}</strong> buy chance.
            </p>
            <p>
              Sold <strong>{currentResult.soldCups}</strong> cups at{" "}
              <strong>{currentResult.setup.price}</strong> coins each.
            </p>
          </>
        ) : (
          <p>{currentPlayer?.nickname ?? "Player"}, your result is being prepared.</p>
        )}
      </div>

      {currentResult ? (
        <dl className="summary-totals">
          <div>
            <dt>Profit today</dt>
            <dd className={currentResult.profit < 0 ? "danger" : ""}>{currentResult.profit}</dd>
          </div>
          <div>
            <dt>Total coins</dt>
            <dd>{currentResult.endingBalance}</dd>
          </div>
        </dl>
      ) : null}

      <RoomLeaderboard room={room} />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          leaveRoom();
        }}
      >
        Leave Room
      </button>

      {commandError ? <p className="error-line">{commandError}</p> : null}
    </ContinuePage>
  );
}

function RoomLeaderboard({ room }: { room: RoomSnapshot }) {
  const rankedPlayers = [...room.players].sort((a, b) => b.coins - a.coins);

  return (
    <div className="player-list">
      <p className="terminal-line">Leaderboard</p>
      {rankedPlayers.map((player, index) => (
        <div className="player-row" key={player.id}>
          <span>
            {index + 1}. {player.nickname}
          </span>
          <strong>{player.coins} coins</strong>
        </div>
      ))}
    </div>
  );
}

function SingleplayerPage({
  answerTrivia,
  autoPlayerDialogOpen,
  autoPlayerLoading,
  autoPlayerLogsOpen,
  autoPlayerResult,
  backHome,
  canSubmitSetup,
  clearAutoPlayerResult,
  commandError,
  continueGame,
  setSetup,
  setAutoPlayerDialogOpen,
  setAutoPlayerLogsOpen,
  setup,
  setupSubmitAttempted,
  setupSubmitting,
  setupInput,
  setupSpend,
  snapshot,
  startAutoPlayer,
  startNewSingleplayer,
  submitSetup
}: {
  answerTrivia: (answerIndex: number) => void;
  autoPlayerDialogOpen: boolean;
  autoPlayerLoading: boolean;
  autoPlayerLogsOpen: boolean;
  autoPlayerResult: SingleplayerAutoRunResult | null;
  backHome: () => void;
  canSubmitSetup: boolean;
  clearAutoPlayerResult: () => void;
  commandError: string | null;
  continueGame: () => void;
  setSetup: (setup: SetupDraft) => void;
  setAutoPlayerDialogOpen: (open: boolean) => void;
  setAutoPlayerLogsOpen: (open: boolean) => void;
  setup: SetupDraft;
  setupSubmitAttempted: boolean;
  setupSubmitting: boolean;
  setupInput: SetupInput | null;
  setupSpend: number;
  snapshot: SingleplayerSnapshot;
  startAutoPlayer: (input: AutoPlayerInput) => void;
  startNewSingleplayer: () => void;
  submitSetup: () => void;
}) {
  if (autoPlayerLoading) {
    return <AutoPlayerLoadingPage />;
  }

  if (autoPlayerResult) {
    return (
      <AutoPlayerResultPage
        backHome={backHome}
        continueGame={clearAutoPlayerResult}
        logsOpen={autoPlayerLogsOpen}
        result={autoPlayerResult}
        setLogsOpen={setAutoPlayerLogsOpen}
      />
    );
  }

  if (snapshot.phase === "WEATHER_REVEAL") {
    return <WeatherPage backHome={backHome} continueGame={continueGame} snapshot={snapshot} />;
  }

  if (snapshot.phase === "SPECIAL_REVEAL") {
    return <SpecialWeatherPage backHome={backHome} continueGame={continueGame} snapshot={snapshot} />;
  }

  if (snapshot.phase === "SUMMARY") {
    return <SummaryPage backHome={backHome} continueGame={continueGame} snapshot={snapshot} />;
  }

  if (snapshot.phase === "TRIVIA") {
    return <TriviaPage answerTrivia={answerTrivia} backHome={backHome} continueGame={continueGame} snapshot={snapshot} />;
  }

  if (snapshot.phase === "GAME_OVER") {
    return <GameOverPage backHome={backHome} snapshot={snapshot} startNewSingleplayer={startNewSingleplayer} />;
  }

  return (
    <SetupPage
      backHome={backHome}
      canSubmitSetup={canSubmitSetup}
      commandError={commandError}
      setSetup={setSetup}
      setup={setup}
      setupSubmitAttempted={setupSubmitAttempted}
      setupSubmitting={setupSubmitting}
      setupInput={setupInput}
      setupSpend={setupSpend}
      snapshot={snapshot}
      autoPlayerDialogOpen={autoPlayerDialogOpen}
      setAutoPlayerDialogOpen={setAutoPlayerDialogOpen}
      startAutoPlayer={startAutoPlayer}
      submitSetup={submitSetup}
    />
  );
}

function GameOverPage({
  backHome,
  snapshot,
  startNewSingleplayer
}: {
  backHome: () => void;
  snapshot: SingleplayerSnapshot;
  startNewSingleplayer: () => void;
}) {
  return (
    <div className="console-page game-over-page">
      <BackButton backHome={backHome} />
      <div className="dialog-box alert-box">
        <p className="terminal-line">STAND CLOSED</p>
        <h2>Out of Cups</h2>
        <p>
          You have <strong>{snapshot.coins}</strong> coins, but lemonade cups cost{" "}
          <strong>{snapshot.cupCost}</strong> coins today.
        </p>
        <p>The stand cannot open without enough coins for at least one cup.</p>
      </div>

      <button type="button" onClick={startNewSingleplayer}>
        Start New
      </button>
    </div>
  );
}

function WeatherPage({
  backHome,
  continueGame,
  snapshot
}: {
  backHome: () => void;
  continueGame: () => void;
  snapshot: SingleplayerSnapshot;
}) {
  return (
    <ContinuePage backHome={backHome} className="weather-page" continueGame={continueGame}>
      <div className="day-chip">Day {snapshot.day}</div>
      <div className="weather-scene" data-weather={snapshot.weather.baseId} aria-hidden="true" />
      <div className="dialog-box">
        <p className="terminal-line">FORECAST RECEIVED</p>
        <h2>{snapshot.weather.baseId.toUpperCase()}</h2>
        <p>The pitcher is ready. Your lemonade stand awaits.</p>
      </div>
    </ContinuePage>
  );
}

function SpecialWeatherPage({
  backHome,
  continueGame,
  snapshot
}: {
  backHome: () => void;
  continueGame: () => void;
  snapshot: SingleplayerSnapshot;
}) {
  return (
    <ContinuePage backHome={backHome} className="special-page" continueGame={continueGame}>
      <div className="dialog-box alert-box">
        <p className="terminal-line">SPECIAL CONDITION</p>
        <h2>{snapshot.weather.label}</h2>
        <p>{getSpecialWeatherCopy(snapshot.weather.id)}</p>
      </div>
    </ContinuePage>
  );
}

function SetupPage({
  autoPlayerDialogOpen = false,
  backHome,
  canSubmitSetup,
  commandError,
  setSetup,
  setAutoPlayerDialogOpen,
  setup,
  setupSubmitAttempted,
  setupSubmitting,
  setupInput,
  setupSpend,
  snapshot,
  startAutoPlayer,
  submitSetup
}: {
  autoPlayerDialogOpen?: boolean;
  backHome: () => void;
  canSubmitSetup: boolean;
  commandError: string | null;
  setSetup: (setup: SetupDraft) => void;
  setAutoPlayerDialogOpen?: (open: boolean) => void;
  setup: SetupDraft;
  setupSubmitAttempted: boolean;
  setupSubmitting: boolean;
  setupInput: SetupInput | null;
  setupSpend: number;
  snapshot: SingleplayerSnapshot;
  startAutoPlayer?: (input: AutoPlayerInput) => void;
  submitSetup: () => void;
}) {
  const updateSetup = (field: keyof SetupDraft, value: string) => {
    setSetup({ ...setup, [field]: sanitizeNumberInput(value) });
  };
  const posterCount = setupPreviewValue(setup.posters);
  const nextPosterNumber = Math.min(posterCount + 1, snapshot.maxPosters);
  const cupSpend = setupPreviewValue(setup.cups) * snapshot.cupCost;
  const posterSpend = getPosterSpend(posterCount);
  const coinsAfterSpend = snapshot.coins - setupSpend;
  const priceRequired = setupSubmitAttempted && setupInput !== null && isPriceRequired(setupInput);
  const priceTooHigh = setupInput !== null && setupInput.price > snapshot.maxPrice;
  const tooManyPosters = setupInput !== null && setupInput.posters > snapshot.maxPosters;

  return (
    <div className="console-page setup-page">
      <BackButton backHome={backHome} />
      <form
        className="setup-form shop-panel"
        onSubmit={(event) => {
          event.preventDefault();
          submitSetup();
        }}
      >
        <div className="shop-status">
          <p className="terminal-line">DAY {snapshot.day} SETUP</p>
          <dl>
            <div>
              <dt>Coins</dt>
              <dd>
                <CoinAmount amount={snapshot.coins} />
              </dd>
            </div>
            <div>
              <dt>Weather</dt>
              <dd>{snapshot.weather.label}</dd>
            </div>
            <div>
              <dt>Cup cost</dt>
              <dd>
                <CoinAmount amount={snapshot.cupCost} />
              </dd>
            </div>
          </dl>
        </div>

        <div className="shop-menu">
          <ShopMenuItem
            label="Lemonade cups"
            note={<><CoinAmount amount={snapshot.cupCost} /> each</>}
          >
            <NumberField
              label="Amount"
              max={Math.floor(snapshot.coins / snapshot.cupCost)}
              min={0}
              onChange={(value) => updateSetup("cups", value)}
              value={setup.cups}
            />
          </ShopMenuItem>

          <ShopMenuItem
            label="Posters"
            note={posterCount >= snapshot.maxPosters ? "Full boost" : <><CoinAmount amount={getPosterUnitCost(nextPosterNumber)} /> next</>}
          >
            <NumberField
              label="Amount"
              max={snapshot.maxPosters}
              min={0}
              onChange={(value) => updateSetup("posters", value)}
              value={setup.posters}
            />
          </ShopMenuItem>

          <ShopMenuItem label="Cup price" note="Sale price per cup">
            <NumberField
              label="Price"
              max={snapshot.maxPrice}
              min={0}
              onChange={(value) => updateSetup("price", value)}
              value={setup.price}
            />
          </ShopMenuItem>
        </div>

        <dl className="setup-receipt">
          <div>
            <dt>Cups</dt>
            <dd>
              <CoinAmount amount={cupSpend} />
            </dd>
          </div>
          <div>
            <dt>Posters</dt>
            <dd>
              <CoinAmount amount={posterSpend} />
            </dd>
          </div>
          <div>
            <dt>Total spend</dt>
            <dd className={setupSpend > snapshot.coins ? "danger" : ""}>
              <CoinAmount amount={setupSpend} />
            </dd>
          </div>
          <div>
            <dt>After spend</dt>
            <dd className={coinsAfterSpend < 0 ? "danger" : ""}>
              <CoinAmount amount={coinsAfterSpend} />
            </dd>
          </div>
        </dl>

        {setupSpend > snapshot.coins ? <p className="error-line">Not enough coins for this order.</p> : null}
        {priceRequired ? <p className="error-line">Cup price must be at least 1 when your cart is not empty.</p> : null}
        {tooManyPosters ? <p className="error-line">Poster boost is capped at {snapshot.maxPosters} posters.</p> : null}
        {priceTooHigh ? <p className="error-line">Cup price is too high for today.</p> : null}

        {commandError ? <p className="error-line">{commandError}</p> : null}

        <div className="setup-actions">
          {setAutoPlayerDialogOpen && startAutoPlayer ? (
            <button type="button" onClick={() => setAutoPlayerDialogOpen(true)}>
              Auto Player
            </button>
          ) : null}
          <button type="submit" disabled={!canSubmitSetup}>
            {setupSubmitting ? "Running..." : "Run Day"}
          </button>
        </div>
      </form>

      {autoPlayerDialogOpen && setAutoPlayerDialogOpen && startAutoPlayer ? (
        <AutoPlayerDialog
          closeDialog={() => setAutoPlayerDialogOpen(false)}
          coins={snapshot.coins}
          startAutoPlayer={startAutoPlayer}
        />
      ) : null}
    </div>
  );
}

function AutoPlayerDialog({
  closeDialog,
  coins,
  startAutoPlayer
}: {
  closeDialog: () => void;
  coins: number;
  startAutoPlayer: (input: AutoPlayerInput) => void;
}) {
  const [draft, setDraft] = useState<AutoPlayerDraft>(emptyAutoPlayerDraft);
  const input = parseAutoPlayerDraft(draft, coins);
  const stopBalance = setupPreviewValue(draft.stopBalance);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="auto-player-title">
      <form
        className="auto-player-dialog"
        onSubmit={(event) => {
          event.preventDefault();

          if (input) {
            startAutoPlayer(input);
          }
        }}
      >
        <p className="terminal-line">AUTO PLAYER</p>
        <h3 id="auto-player-title">Bot shift</h3>
        <div className="risk-grid" aria-label="Risk profile">
          {(["safe", "balanced", "risky", "wild"] as const).map((riskProfile) => (
            <button
              aria-pressed={draft.riskProfile === riskProfile}
              key={riskProfile}
              type="button"
              onClick={() => setDraft({ ...draft, riskProfile })}
            >
              {formatRiskProfile(riskProfile)}
            </button>
          ))}
        </div>

        <div className="auto-player-fields">
          <NumberField
            label="Days"
            max={365}
            min={1}
            onChange={(value) => setDraft({ ...draft, days: value })}
            value={draft.days}
          />
          <NumberField
            label="Stop balance"
            max={Math.max(0, coins - 1)}
            min={0}
            onChange={(value) => setDraft({ ...draft, stopBalance: value })}
            value={draft.stopBalance}
          />
        </div>

        {draft.days === "" ? <p className="error-line">Choose how many days the bot should play.</p> : null}
        {stopBalance >= coins ? <p className="error-line">Stop balance must be below your current coins.</p> : null}

        <div className="dialog-actions">
          <button type="button" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" disabled={!input}>
            Start Bot
          </button>
        </div>
      </form>
    </div>
  );
}

function AutoPlayerLoadingPage() {
  return (
    <div className="console-page auto-player-loading-page">
      <div className="auto-player-scene" aria-hidden="true">
        <div className="auto-sky">
          <span className="auto-sun" />
          <span className="auto-moon" />
          <span className="auto-star star-one" />
          <span className="auto-star star-two" />
          <span className="auto-cloud cloud-one" />
          <span className="auto-cloud cloud-two" />
        </div>
        <div className="auto-stand">
          <span className="stand-canopy" />
          <span className="stand-sign" />
          <span className="stand-counter" />
          <span className="stand-legs" />
        </div>
        <div className="auto-ground" />
      </div>
      <div className="dialog-box">
        <p className="terminal-line">BOT AT WORK</p>
        <h2>Running Days</h2>
        <p>The bot is opening the stand, counting coins, and chasing the next sunrise.</p>
        <div className="loading-meter" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}

function AutoPlayerResultPage({
  backHome,
  continueGame,
  logsOpen,
  result,
  setLogsOpen
}: {
  backHome: () => void;
  continueGame: () => void;
  logsOpen: boolean;
  result: SingleplayerAutoRunResult;
  setLogsOpen: (open: boolean) => void;
}) {
  return (
    <div className="console-page auto-player-result-page">
      <BackButton backHome={backHome} />
      <div className="dialog-box">
        <p className="terminal-line">AUTO PLAYER RESULT</p>
        <h2>{formatRiskProfile(result.riskProfile)} Run</h2>
        <p>{getAutoRunStopCopy(result)}</p>
      </div>

      <dl className="auto-player-totals">
        <div>
          <dt>Days played</dt>
          <dd>{result.completedDays}</dd>
        </div>
        <div>
          <dt>Coins</dt>
          <dd>
            {result.startingCoins} to {result.endingCoins}
          </dd>
        </div>
        <div>
          <dt>Total profit</dt>
          <dd className={result.totalProfit < 0 ? "danger" : ""}>{result.totalProfit}</dd>
        </div>
        <div>
          <dt>Cups sold</dt>
          <dd>{result.totalSoldCups}</dd>
        </div>
        <div>
          <dt>Visitors</dt>
          <dd>{result.totalVisitors}</dd>
        </div>
        <div>
          <dt>Avg buy chance</dt>
          <dd>{formatPercent(result.averagePurchaseChance)}</dd>
        </div>
      </dl>

      <div className="page-actions">
        <button type="button" onClick={() => setLogsOpen(!logsOpen)}>
          {logsOpen ? "Hide Logs" : "View Logs"}
        </button>
        <button type="button" onClick={continueGame}>
          Continue
        </button>
      </div>

      {logsOpen ? (
        <div className="auto-log-list">
          {result.logs.map((log) => (
            <div className="auto-log-card" key={log.day}>
              <p className="terminal-line">
                Day {log.day} / {log.weather.label}
              </p>
              <p>
                Made <strong>{log.setup.cups}</strong> cups, <strong>{log.setup.posters}</strong>{" "}
                posters, priced at <strong>{log.setup.price}</strong>.
              </p>
              <p>
                Sold <strong>{log.result.soldCups}</strong> cups to{" "}
                <strong>{log.result.observedVisitors}</strong> visitors for{" "}
                <strong>{log.result.profit}</strong> profit.
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ShopMenuItem({
  children,
  label,
  note
}: {
  children: ReactNode;
  label: string;
  note: ReactNode;
}) {
  return (
    <div className="shop-menu-item">
      <p className="shop-item-label">{label}</p>
      {children}
      <span className="shop-note">{note}</span>
    </div>
  );
}

function CoinAmount({ amount }: { amount: number }) {
  return (
    <span className="coin-amount">
      <span>{amount}</span>
      <span className="coin-icon" aria-hidden="true" />
    </span>
  );
}

function BackButton({ backHome }: { backHome: () => void }) {
  return (
    <button
      className="back-button"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        backHome();
      }}
    >
      Back
    </button>
  );
}

function SummaryPage({
  backHome,
  continueGame,
  snapshot
}: {
  backHome: () => void;
  continueGame: () => void;
  snapshot: SingleplayerSnapshot;
}) {
  const result = snapshot.lastResult;

  if (!result) {
    return null;
  }

  const posterSpend = result.posterSpend ?? getPosterSpend(result.setup.posters);

  return (
    <ContinuePage backHome={backHome} className="summary-page" continueGame={continueGame}>
      <div className="dialog-box">
        <p className="terminal-line">DAILY SUMMARY</p>
        <p>
          You had <strong>{result.observedVisitors}</strong> visitors. <strong>{result.soldCups}</strong>{" "}
          bought, with about <strong>{formatPercent(result.purchaseChance)}</strong> buy chance.
        </p>
        <p>
          Sold <strong>{result.soldCups}</strong> cups, and charged <strong>{result.setup.price}</strong>{" "}
          coins per cup.
        </p>
        <p>
          You made <strong>{result.setup.posters}</strong> posters, costing <strong>{posterSpend}</strong>{" "}
          coins total.
        </p>
      </div>

      <dl className="summary-totals">
        <div>
          <dt>Profit today</dt>
          <dd className={result.profit < 0 ? "danger" : ""}>{result.profit}</dd>
        </div>
        <div>
          <dt>Total coins</dt>
          <dd>{result.endingBalance}</dd>
        </div>
      </dl>
    </ContinuePage>
  );
}

function TriviaPage({
  answerTrivia,
  backHome,
  continueGame,
  snapshot
}: {
  answerTrivia: (answerIndex: number) => void;
  backHome: () => void;
  continueGame: () => void;
  snapshot: SingleplayerSnapshot;
}) {
  const trivia = snapshot.trivia;

  if (!trivia) {
    return null;
  }

  if (trivia.status !== "active") {
    return (
      <ContinuePage backHome={backHome} className="trivia-page" continueGame={continueGame}>
        <div className="dialog-box alert-box">
          <p className="terminal-line">TRIVIA RESULT</p>
          <h2>{trivia.status === "passed" ? "Reward claimed!" : "No reward today."}</h2>
          <p>
            {trivia.status === "passed"
              ? `You won ${trivia.rewardCoins} coins from the lemonade gods.`
              : "A wrong answer ends the occasion. The stand opens again tomorrow."}
          </p>
        </div>
      </ContinuePage>
    );
  }

  return (
    <div className="console-page trivia-page">
      <BackButton backHome={backHome} />
      <div className="dialog-box alert-box">
        <p className="terminal-line">RARE OCCASION</p>
        <h2>The lemonade gods chose you!</h2>
        <p>
          Answer {trivia.requiredQuestions} question{trivia.requiredQuestions === 1 ? "" : "s"} for{" "}
          <strong>{trivia.rewardCoins}</strong> coins.
        </p>
      </div>

      {trivia.question ? (
        <div className="question-box">
          <p className="question-count">
            Question {trivia.currentQuestionNumber} / {trivia.requiredQuestions}
          </p>
          <h3>{trivia.question.question}</h3>
          <div className="answer-grid">
            {trivia.question.choices.map((choice, index) => (
              <button key={choice} type="button" onClick={() => answerTrivia(index)}>
                {index + 1}. {choice}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContinuePage({
  backHome,
  children,
  className,
  continueGame
}: {
  backHome: () => void;
  children: ReactNode;
  className: string;
  continueGame: () => void;
}) {
  return (
    <div className={`console-page continue-page ${className}`} onClick={continueGame}>
      <BackButton backHome={backHome} />
      {children}
      <button
        className="continue-prompt"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          continueGame();
        }}
      >
        Press any key / tap to continue
      </button>
    </div>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        type="number"
        value={value}
      />
    </label>
  );
}

function TextField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={value}
      />
    </label>
  );
}

function canPressAnyKey(snapshot: SingleplayerSnapshot): boolean {
  return (
    snapshot.phase === "WEATHER_REVEAL" ||
    snapshot.phase === "SPECIAL_REVEAL" ||
    snapshot.phase === "SUMMARY" ||
    (snapshot.phase === "TRIVIA" && snapshot.trivia?.status !== "active")
  );
}

function canPressAnyKeyRoom(room: RoomSnapshot): boolean {
  return room.phase === "WEATHER_REVEAL" || room.phase === "SPECIAL_REVEAL" || room.phase === "SUMMARY";
}

function getCurrentRoomPlayer(room: RoomSnapshot) {
  return room.players.find((player) => player.id === room.currentPlayerId);
}

function createRoomPlaySnapshot(room: RoomSnapshot | null): SingleplayerSnapshot | null {
  if (
    !room ||
    !room.weather ||
    room.cupCost === undefined ||
    room.posterCost === undefined ||
    room.maxPosters === undefined ||
    room.maxPrice === undefined
  ) {
    return null;
  }

  const currentPlayer = getCurrentRoomPlayer(room);

  if (!currentPlayer) {
    return null;
  }

  if (
    room.phase !== "WEATHER_REVEAL" &&
    room.phase !== "SPECIAL_REVEAL" &&
    room.phase !== "SETUP" &&
    room.phase !== "SUMMARY"
  ) {
    return null;
  }

  return {
    phase: room.phase,
    day: room.day,
    coins: currentPlayer.coins,
    weather: room.weather,
    cupCost: room.cupCost,
    posterCost: room.posterCost,
    maxPosters: room.maxPosters,
    maxPrice: room.maxPrice,
    configVersion: "multiplayer"
  };
}

function getSpecialWeatherCopy(weatherId: string): string {
  if (weatherId === "thunder_storm") {
    return "Thunder shakes the street. Fewer people are outside, and buyers are cautious.";
  }

  if (weatherId === "extremely_hot_dry") {
    return "The sun is brutal. Thirst is everywhere, and lemonade suddenly looks heroic.";
  }

  return "Something unusual is happening around the stand today.";
}

function readSingleplayerSave(): SingleplayerSaveData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSave = window.localStorage.getItem(singleplayerSaveKey);

  if (!rawSave) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSave);

    if (isSingleplayerSaveData(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid saves are cleared below.
  }

  window.localStorage.removeItem(singleplayerSaveKey);
  return null;
}

function writeSingleplayerSave(save: SingleplayerSaveData) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(singleplayerSaveKey, JSON.stringify(save));
}

function clearSingleplayerSave() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(singleplayerSaveKey);
}

function isSingleplayerSaveData(value: unknown): value is SingleplayerSaveData {
  if (!isRecord(value) || value.version !== 2 || typeof value.token !== "string" || value.token.length === 0) {
    return false;
  }

  return isRecord(value.preview) && isSingleplayerSavePreview(value.preview);
}

function isSingleplayerSavePreview(value: Record<string, unknown>): value is SingleplayerSaveData["preview"] {
  return (
    typeof value.configVersion === "string" &&
    value.configVersion.length > 0 &&
    typeof value.day === "number" &&
    Number.isInteger(value.day) &&
    value.day >= 1 &&
    typeof value.coins === "number" &&
    Number.isFinite(value.coins) &&
    value.coins >= 0 &&
    typeof value.savedAt === "number" &&
    Number.isInteger(value.savedAt) &&
    value.savedAt > 0
  );
}

function sanitizeNumberInput(value: string): string {
  if (value.trim() === "") {
    return "";
  }

  return String(Math.max(0, Math.floor(Number(value) || 0)));
}

function parseAutoPlayerDraft(draft: AutoPlayerDraft, coins: number): AutoPlayerInput | null {
  const days = setupPreviewValue(draft.days);
  const stopBalance = setupPreviewValue(draft.stopBalance);

  if (
    days < 1 ||
    days > 365 ||
    stopBalance < 0 ||
    stopBalance >= coins
  ) {
    return null;
  }

  return {
    days,
    riskProfile: draft.riskProfile,
    stopBalance
  };
}

function parseSetupDraft(setup: SetupDraft): SetupInput | null {
  return createSetupPreview(setup);
}

function setupPreviewValue(value: string): number {
  return value === "" ? 0 : Number(value);
}

function formatPercent(value: number): string {
  const percent = value * 100;

  if (percent === 0) {
    return "0%";
  }

  if (percent < 10) {
    return `${percent.toFixed(1)}%`;
  }

  return `${Math.round(percent)}%`;
}

function createSetupPreview(setup: SetupDraft): SetupInput {
  return {
    cups: setupPreviewValue(setup.cups),
    posters: setupPreviewValue(setup.posters),
    price: setupPreviewValue(setup.price)
  };
}

function isPriceRequired(setup: SetupInput): boolean {
  return (setup.cups > 0 || setup.posters > 0) && setup.price === 0;
}

function formatRiskProfile(riskProfile: AutoPlayerRiskProfile): string {
  if (riskProfile === "safe") {
    return "Safe";
  }

  if (riskProfile === "balanced") {
    return "Balanced";
  }

  if (riskProfile === "risky") {
    return "Risky";
  }

  return "Wild";
}

function getAutoRunStopCopy(result: SingleplayerAutoRunResult): string {
  if (result.completedDays === 0) {
    return "The bot stopped before opening the stand.";
  }

  if (result.stopReason === "broke") {
    return `The bot reached day ${result.endingDay}, but the stand cannot afford another cup.`;
  }

  if (result.stopReason === "stop_balance") {
    return `The bot stopped at or below your ${result.stopBalance} coin safety line.`;
  }

  return `The bot played ${result.completedDays} day${result.completedDays === 1 ? "" : "s"} and returned control.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
