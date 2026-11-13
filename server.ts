import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { InternalRoomState } from './src/shared/gameEngine.ts';
import {
  addChatMessage,
  addHumanPlayer,
  castVote,
  closeVotingPhase,
  createId,
  createInitialRoom,
  finalizeDefenseToVoteOrEliminate,
  generateRoomCode,
  getRequiredNightRolePlayers,
  markRoleReady,
  maybePostBotChat,
  resetToLobby,
  resolveNightPhase,
  runBotDayActions,
  runBotNightActions,
  runBotRevengeIfNeeded,
  sanitizeStateForPlayer,
  startGame,
  submitDefense,
  submitNightAction,
  submitRevenge,
  useSheikhAbility,
  withdrawVote,
} from './src/shared/gameEngine.ts';
import type { ClientMessage, ServerMessage } from './src/shared/types.ts';
import { normalizeRoomCode } from './src/shared/normalize.ts';

interface ClientMeta {
  ws: WebSocket;
  roomCode: string | null;
  playerId: string | null;
}

const PORT = Number(process.env.PORT) || 3000;
const ROOMS_STORE_PATH = '/tmp/mafia_rooms_state.json';
const rooms = new Map<string, InternalRoomState>();
const clients = new Map<WebSocket, ClientMeta>();
const phaseActionTimers = new Map<string, number>();

function loadPersistedRooms(): void {
  try {
    if (!fs.existsSync(ROOMS_STORE_PATH)) return;
    const raw = fs.readFileSync(ROOMS_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as InternalRoomState[];
    const now = Date.now();
    for (const r of parsed) {
      if (r && r.roomCode && now - r.createdAt < 6 * 60 * 60 * 1000) {
        r.players.forEach((p) => {
          if (!p.isBot) p.connected = false;
        });
        rooms.set(r.roomCode, r);
      }
    }
  } catch {
    // ignore corrupt temp cache
  }
}

let saveScheduled = false;
function persistRoomsSoon(): void {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => {
    saveScheduled = false;
    try {
      const list = Array.from(rooms.values());
      fs.writeFileSync(ROOMS_STORE_PATH, JSON.stringify(list));
    } catch {
      // ignore disk write error
    }
  }, 250);
}

function sendToClient(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: InternalRoomState): void {
  persistRoomsSoon();
  for (const [, meta] of clients) {
    if (meta.roomCode === room.roomCode && meta.playerId) {
      sendToClient(meta.ws, {
        type: 'STATE_UPDATE',
        state: sanitizeStateForPlayer(room, meta.playerId),
      });
    }
  }
}

function scheduleBotLoop(room: InternalRoomState): void {
  const now = Date.now();
  const lastBotTick = phaseActionTimers.get(room.roomCode) || 0;
  if (now - lastBotTick < 1500) return;
  phaseActionTimers.set(room.roomCode, now);

  let changed = false;

  if (room.phase === 'NIGHT') {
    changed = runBotNightActions(room);
  } else if (room.phase === 'NIGHT_REVENGE' || room.phase === 'DAY_REVENGE') {
    changed = runBotRevengeIfNeeded(room);
  } else if (
    room.phase === 'DAY_VOTING' ||
    room.phase === 'DAY_DEFENSE' ||
    room.phase === 'DAY_TIE_RUNOFF'
  ) {
    changed = runBotDayActions(room);
    if (room.phase === 'DAY_VOTING' && Math.random() < 0.25) {
      const botChatCount = room.chat.filter(
        (m) => m.type === 'CHAT' && m.senderId.startsWith('bot_')
      ).length;
      if (botChatCount < room.round * 4) {
        if (maybePostBotChat(room)) changed = true;
      }
    }
  }

  if (changed) {
    broadcastRoom(room);
  }
}

function tickRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Cleanup old empty rooms (> 6 hours)
    const anyConnected = room.players.some((p) => !p.isBot && p.connected);
    if (!anyConnected && now - room.createdAt > 6 * 60 * 60 * 1000) {
      rooms.delete(code);
      continue;
    }

    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER' && room.phase !== 'ROLE_REVEAL') {
      scheduleBotLoop(room);
    }

    if (room.phaseEndsAt && now >= room.phaseEndsAt) {
      if (room.phase === 'NIGHT') {
        // Fill any missing night actions for bots & resolve
        runBotNightActions(room);
        if (room.phase === 'NIGHT') {
          resolveNightPhase(room);
        }
        broadcastRoom(room);
      } else if (room.phase === 'NIGHT_REVENGE' || room.phase === 'DAY_REVENGE') {
        const boy = room.players.find((p) => p.id === room.revengePlayerId);
        const living = room.players.filter((p) => p.isAlive);
        if (boy && living.length > 0) {
          const pick = living[Math.floor(Math.random() * living.length)];
          submitRevenge(room, boy.id, pick.id);
        }
        broadcastRoom(room);
      } else if (room.phase === 'DAY_VOTING' || room.phase === 'DAY_TIE_RUNOFF') {
        closeVotingPhase(room);
        broadcastRoom(room);
      } else if (room.phase === 'DAY_DEFENSE' || room.phase === 'DAY_FINAL_VOTE') {
        finalizeDefenseToVoteOrEliminate(room);
        broadcastRoom(room);
      }
    }
  }
}

async function startServer() {
  loadPersistedRooms();
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = normalizeRoomCode(String(req.params.code || ''));
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ ok: false, error: 'الغرفة غير موجودة.' });
      return;
    }
    res.json({
      ok: true,
      roomCode: room.roomCode,
      phase: room.phase,
      playerCount: room.players.length,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1');
      if (parsed.pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    clients.set(ws, { ws, roomCode: null, playerId: null });

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendToClient(ws, { type: 'ERROR', message: 'رسالة غير صالحة.' });
        return;
      }

      const meta = clients.get(ws);
      if (!meta) return;

      if (msg.type === 'CREATE_ROOM') {
        let code = generateRoomCode();
        while (rooms.has(code)) {
          code = generateRoomCode();
        }
        const hostId = createId('player');
        const room = createInitialRoom(code, hostId, msg.playerName, msg.dayDurationSec || 90);
        rooms.set(code, room);
        persistRoomsSoon();

        meta.roomCode = code;
        meta.playerId = hostId;
        sendToClient(ws, {
          type: 'ROOM_JOINED',
          roomCode: code,
          playerId: hostId,
          state: sanitizeStateForPlayer(room, hostId),
        });
        return;
      }

      if (msg.type === 'JOIN_ROOM') {
        const code = normalizeRoomCode(msg.roomCode);
        const room = rooms.get(code);
        if (!room) {
          sendToClient(ws, {
            type: 'ERROR',
            message: 'رمز الغرفة غير موجود على هذا الخادم. تأكد من الرمز وأنكما تفتحان نفس رابط المشاركة (ais-pre).',
          });
          return;
        }
        const playerId = msg.playerId || createId('player');
        const result = addHumanPlayer(room, playerId, msg.playerName);
        if (!result.ok) {
          sendToClient(ws, { type: 'ERROR', message: result.error || 'تعذر الانضمام للغرفة.' });
          return;
        }
        meta.roomCode = code;
        meta.playerId = playerId;
        sendToClient(ws, {
          type: 'ROOM_JOINED',
          roomCode: code,
          playerId,
          state: sanitizeStateForPlayer(room, playerId),
        });
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'RECONNECT') {
        const room = rooms.get(normalizeRoomCode(msg.roomCode));
        if (!room) {
          sendToClient(ws, { type: 'ERROR', message: 'انتهت صلاحية الغرفة.' });
          return;
        }
        const player = room.players.find((p) => p.id === msg.playerId);
        if (!player) {
          sendToClient(ws, { type: 'ERROR', message: 'تعذر استعادة جلستك في هذه الغرفة.' });
          return;
        }
        player.connected = true;
        meta.roomCode = room.roomCode;
        meta.playerId = player.id;
        sendToClient(ws, {
          type: 'ROOM_JOINED',
          roomCode: room.roomCode,
          playerId: player.id,
          state: sanitizeStateForPlayer(room, player.id),
        });
        broadcastRoom(room);
        return;
      }

      if (!meta.roomCode || !meta.playerId) {
        sendToClient(ws, { type: 'ERROR', message: 'أنت غير متصل بغرفة.' });
        return;
      }

      const room = rooms.get(meta.roomCode);
      if (!room) {
        sendToClient(ws, { type: 'ERROR', message: 'الغرفة لم تعد موجودة.' });
        return;
      }
      const playerId = meta.playerId;
      const actor = room.players.find((p) => p.id === playerId);

      switch (msg.type) {
        case 'UPDATE_SETTINGS': {
          if (!actor?.isHost || room.phase !== 'LOBBY') return;
          room.dayDurationSec = Math.max(45, Math.min(180, msg.dayDurationSec));
          broadcastRoom(room);
          break;
        }
        case 'START_GAME': {
          if (!actor?.isHost) {
            sendToClient(ws, { type: 'ERROR', message: 'صاحب الغرفة فقط يمكنه بدء اللعبة.' });
            return;
          }
          const res = startGame(room);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'تعذر البدء.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'MARK_ROLE_READY': {
          markRoleReady(room, playerId);
          // Immediately trigger bot night actions if night started and no human has a night role
          if (room.phase === 'NIGHT') {
            const reqHumans = getRequiredNightRolePlayers(room).filter((p) => !p.isBot);
            if (reqHumans.length === 0) {
              setTimeout(() => {
                if (room.phase === 'NIGHT') {
                  runBotNightActions(room);
                  broadcastRoom(room);
                }
              }, 1500);
            }
          }
          broadcastRoom(room);
          break;
        }
        case 'SUBMIT_NIGHT_ACTION': {
          const res = submitNightAction(room, playerId, msg.targetId);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'فشل تنفيذ القدرة.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'CAST_VOTE': {
          const res = castVote(room, playerId, msg.targetId);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'فشل التصويت.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'WITHDRAW_VOTE': {
          const res = withdrawVote(room, playerId);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'تعذر سحب الصوت.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'CLOSE_VOTING': {
          if (!actor?.isHost) return;
          closeVotingPhase(room);
          broadcastRoom(room);
          break;
        }
        case 'SUBMIT_DEFENSE': {
          const res = submitDefense(room, playerId, msg.text);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'تعذر إرسال التبرير.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'USE_SHEIKH_ABILITY': {
          const res = useSheikhAbility(room, playerId);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'لا يمكن استخدام القدرة الآن.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'FINALIZE_DEFENSE': {
          if (!actor?.isHost && room.accusedPlayerId !== playerId) return;
          finalizeDefenseToVoteOrEliminate(room);
          broadcastRoom(room);
          break;
        }
        case 'SUBMIT_REVENGE': {
          const res = submitRevenge(room, playerId, msg.targetId);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'تعذر تنفيذ الاختيار.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'SEND_CHAT': {
          const res = addChatMessage(room, playerId, msg.text);
          if (!res.ok) {
            sendToClient(ws, { type: 'ERROR', message: res.error || 'تعذر إرسال الرسالة.' });
            return;
          }
          broadcastRoom(room);
          break;
        }
        case 'PLAY_AGAIN': {
          if (!actor?.isHost) return;
          resetToLobby(room);
          broadcastRoom(room);
          break;
        }
      }
    });

    ws.on('close', () => {
      const meta = clients.get(ws);
      if (meta?.roomCode && meta.playerId) {
        const room = rooms.get(meta.roomCode);
        if (room) {
          const p = room.players.find((pl) => pl.id === meta.playerId);
          if (p) {
            p.connected = false;
            broadcastRoom(room);
          }
        }
      }
      clients.delete(ws);
    });
  });

  setInterval(tickRooms, 1000);

  const baseDir = import.meta.dirname || process.cwd();
  const distPath = path.resolve(baseDir, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const useProdStatic =
    process.env.NODE_ENV === 'production' && fs.existsSync(distIndexPath);

  if (!useProdStatic) {
    if (!process.env.DISABLE_HMR) {
      process.env.DISABLE_HMR = 'true';
    }
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: {
          server,
          path: '/vite-hmr',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mafia Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
