/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { generateNarrationSequence, Roles } from "./src/core/avalon.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: '/avalon/socket.io',
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);

interface Player {
  id: string; // Persistent ID
  socketId: string;
  name: string;
  role?: string;
  isConfirmed: boolean;
}

interface Mission {
  index: number;
  size: number;
  status: 'pending' | 'success' | 'fail';
  votes: ('success' | 'fail')[];
  team: string[];
  rejectionsBefore: number;
}

interface LancelotConfig {
  id: string;
  variant: 'var1' | 'var2' | 'var3' | 'var1_var2' | 'var1_var3' | 'var2_var3' | null;
  deckSize: number;
  deckRevealed: boolean;
  startsAt: number;
  mandatory: boolean;
  recognition: boolean;
}

interface MatchRecord {
  id: string;
  timestamp: string;
  playerCount: number;
  players: { name: string; role: string; team: 'good' | 'evil' }[];
  options: {
    lancelot: string;
    ladyOfLake: boolean;
    excalibur: boolean;
    targeting: boolean;
  };
  missions: {
    status: 'pending' | 'success' | 'fail';
    fails: number;
  }[];
  winner: 'good' | 'evil';
  reason: string;
  duration: number;
}

type GamePhase =
  | 'lobby'
  | 'character-reveal'
  | 'narration'
  | 'team-proposal'
  | 'team-voting'
  | 'team-result'
  | 'mission-voting'
  | 'excalibur-usage'
  | 'mission-result'
  | 'lady-of-the-lake'
  | 'assassination'
  | 'game-over';

interface TeamVoteResult {
  votes: Record<string, 'approve' | 'reject'>;
  passed: boolean;
}

interface MissionVoteResult {
  votes: ('success' | 'fail')[];
  passed: boolean;
}

interface Room {
  code: string;
  hostId: string;
  players: Player[];
  phase: GamePhase;
  selectedRoles: string[];
  missions: Mission[];
  currentMissionIndex: number;
  currentLeaderIndex: number;
  rejectionCount: number;
  proposedTeam: string[];
  teamVotes: Record<string, 'approve' | 'reject'>;
  missionVotes: Record<string, 'success' | 'fail'>;
  lastTeamVoteResult?: TeamVoteResult;
  lastMissionVoteResult?: MissionVoteResult;
  assassinationTargetId?: string;
  firstLeaderId?: string;
  winner?: 'good' | 'evil';
  gameOverReason?: string;
  createdAt: Date;
  // New fields
  lancelotConfig: LancelotConfig | null;
  loyaltyDeck: ('none' | 'switch')[];
  loyaltyDeckIndex: number;
  loyaltyDeckVisible: ('none' | 'switch' | 'hidden')[];
  lancelotLoyalty: {
    lancelotGoodTeam: 'good' | 'evil';
    lancelotEvilTeam: 'good' | 'evil';
    swapOccurred: boolean;
  } | null;
  ladyOfLakeEnabled: boolean;
  ladyOfLakeHolder: string | null;
  ladyOfLakeUsed: string[];
  ladyOfLakePhase: boolean;
  excaliburEnabled: boolean;
  excaliburHolder: string | null;
  excaliburUsed: boolean;
  excaliburTarget: string | null;
  excaliburReveal: 'success' | 'fail' | null;
  targetingEnabled: boolean;
  attemptedMissions: number[];
  matchHistory: MatchRecord[];
  currentMatchStartedAt: Date | null;
}

function generateLoyaltyDeck(deckSize: number): ('none' | 'switch')[] {
  if (deckSize <= 0) return [];
  const deck: ('none' | 'switch')[] = [];
  const swaps = Math.max(1, Math.floor(deckSize / 2)); // At least one swap if deck exists
  for (let i = 0; i < swaps; i++) deck.push('switch');
  for (let i = 0; i < deckSize - swaps; i++) deck.push('none');
  return deck.sort(() => Math.random() - 0.5);
}

const rooms = new Map<string, Room>();
const socketToPlayer = new Map<string, { roomCode: string, playerId: string }>();

// Cleanup old rooms
setInterval(() => {
  const now = new Date();
  for (const [code, room] of rooms.entries()) {
    if (now.getTime() - room.createdAt.getTime() > 4 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 60 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", ({ playerName, playerId }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room: Room = {
      code: roomCode,
      hostId: playerId,
      players: [{ id: playerId, socketId: socket.id, name: playerName, isConfirmed: false }],
      phase: 'lobby',
      selectedRoles: [],
      missions: [],
      currentMissionIndex: 0,
      currentLeaderIndex: 0,
      rejectionCount: 0,
      proposedTeam: [],
      teamVotes: {},
      missionVotes: {},
      createdAt: new Date(),
      lancelotConfig: null,
      loyaltyDeck: [],
      loyaltyDeckIndex: 0,
      loyaltyDeckVisible: [],
      lancelotLoyalty: null,
      ladyOfLakeEnabled: false,
      ladyOfLakeHolder: null,
      ladyOfLakeUsed: [],
      ladyOfLakePhase: false,
      excaliburEnabled: false,
      excaliburHolder: null,
      excaliburUsed: false,
      excaliburTarget: null,
      excaliburReveal: null,
      targetingEnabled: false,
      attemptedMissions: [],
      matchHistory: [],
      currentMatchStartedAt: null,
    };
    rooms.set(roomCode, room);
    socketToPlayer.set(socket.id, { roomCode, playerId });
    socket.join(roomCode);
    socket.emit("room-created", { roomCode, playerId });
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("get-room-info", ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("error", { message: "Sala não encontrada" });
      return;
    }
    
    // Update socket ID if player is already in the room
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = socket.id;
      socketToPlayer.set(socket.id, { roomCode, playerId });
      socket.join(roomCode);
    }
    
    socket.emit("room-updated", room);
  });

  socket.on("join-room", ({ roomCode, playerName, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("error", { message: "Sala não encontrada" });
      return;
    }

    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      console.log(`Player ${playerId} rejoining room ${roomCode}. Previous name: ${existingPlayer.name}, New name: ${playerName}`);
      existingPlayer.socketId = socket.id;
      existingPlayer.name = playerName; // Update name if changed
      socketToPlayer.set(socket.id, { roomCode, playerId });
      socket.join(roomCode);
      socket.emit("joined-room", { roomCode, playerId });
      io.to(roomCode).emit("room-updated", room);
      return;
    }

    console.log(`New player ${playerId} (${playerName}) joining room ${roomCode}`);

    if (room.players.length >= 10) {
      socket.emit("error", { message: "Sala cheia" });
      return;
    }
    if (room.phase !== 'lobby') {
      socket.emit("error", { message: "Jogo já iniciado" });
      return;
    }

    room.players.push({ id: playerId, socketId: socket.id, name: playerName, isConfirmed: false });
    socketToPlayer.set(socket.id, { roomCode, playerId });
    socket.join(roomCode);
    socket.emit("joined-room", { roomCode, playerId });
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("reorder-players", ({ roomCode, players }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId || room.phase !== 'lobby') return;
    room.players = players;
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("set-first-leader", ({ roomCode, playerId: targetPlayerId }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId || room.phase !== 'lobby') return;
    room.firstLeaderId = targetPlayerId;
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("start-game", ({ roomCode, selectedRoles, lancelotConfig, ladyOfLakeEnabled, excaliburEnabled, targetingEnabled }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId) return;

    room.selectedRoles = selectedRoles;
    room.lancelotConfig = lancelotConfig;
    room.ladyOfLakeEnabled = ladyOfLakeEnabled;
    room.excaliburEnabled = excaliburEnabled;
    room.targetingEnabled = targetingEnabled;
    room.phase = 'character-reveal';
    room.currentMatchStartedAt = new Date();
    
    // Assign roles logic
    const playerIds = room.players.map(p => p.id);
    const assignments = assignRoles(playerIds, selectedRoles);
    room.players.forEach(p => {
      p.role = assignments[p.id];
    });

    // Lancelot setup
    if (lancelotConfig) {
      room.loyaltyDeck = generateLoyaltyDeck(lancelotConfig.deckSize);
      room.loyaltyDeckIndex = 0;
      room.loyaltyDeckVisible = lancelotConfig.deckRevealed 
        ? [...room.loyaltyDeck] 
        : Array(lancelotConfig.deckSize).fill('hidden');
      room.lancelotLoyalty = {
        lancelotGoodTeam: 'good',
        lancelotEvilTeam: 'evil',
        swapOccurred: false
      };
      
      // Initial loyalty swap check - should happen as soon as game starts
      handleLoyaltySwap(room, 0);
    }

    // Lady of the Lake setup
    if (ladyOfLakeEnabled) {
      const firstLeaderIndex = room.firstLeaderId 
        ? room.players.findIndex(p => p.id === room.firstLeaderId)
        : Math.floor(Math.random() * room.players.length);
      
      const leaderIndex = firstLeaderIndex !== -1 ? firstLeaderIndex : 0;
      const holderIndex = (leaderIndex + room.players.length - 1) % room.players.length;
      room.ladyOfLakeHolder = room.players[holderIndex].id;
      room.ladyOfLakeUsed = [room.ladyOfLakeHolder];
    }

    // Initialize missions
    const playerCount = room.players.length;
    const missionSizes = MISSION_SIZES[playerCount];
    room.missions = missionSizes.map((size, index) => ({
      index,
      size,
      status: 'pending',
      votes: [],
      team: [],
      rejectionsBefore: 0,
    }));

    if (room.firstLeaderId) {
      const leaderIndex = room.players.findIndex(p => p.id === room.firstLeaderId);
      room.currentLeaderIndex = leaderIndex !== -1 ? leaderIndex : Math.floor(Math.random() * playerCount);
    } else {
      room.currentLeaderIndex = Math.floor(Math.random() * playerCount);
    }

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("reset-game", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId) return;

    room.phase = 'lobby';
    room.players.forEach(p => {
      p.role = undefined;
      p.isConfirmed = false;
    });
    room.selectedRoles = [];
    room.missions = [];
    room.currentMissionIndex = 0;
    room.currentLeaderIndex = 0;
    room.rejectionCount = 0;
    room.proposedTeam = [];
    room.teamVotes = {};
    room.missionVotes = {};
    room.lastTeamVoteResult = undefined;
    room.lastMissionVoteResult = undefined;
    room.assassinationTargetId = undefined;
    room.firstLeaderId = undefined;
    room.winner = undefined;
    room.gameOverReason = undefined;
    room.lancelotConfig = null;
    room.loyaltyDeck = [];
    room.loyaltyDeckIndex = 0;
    room.loyaltyDeckVisible = [];
    room.lancelotLoyalty = null;
    room.ladyOfLakeEnabled = false;
    room.ladyOfLakeHolder = null;
    room.ladyOfLakeUsed = [];
    room.ladyOfLakePhase = false;
    room.excaliburEnabled = false;
    room.excaliburHolder = null;
    room.excaliburUsed = false;
    room.excaliburTarget = null;
    room.excaliburReveal = null;
    room.targetingEnabled = false;
    room.attemptedMissions = [];
    room.currentMatchStartedAt = null;

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("confirm-character", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || !playerId) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.isConfirmed = true;

    if (room.players.every(p => p.isConfirmed)) {
      room.phase = 'narration';
    }
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("start-narration", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId) return;

    const roles: Roles = {
      merlin: true,
      assassin: true,
      percival: room.selectedRoles.includes('percival'),
      morgana: room.selectedRoles.includes('morgana'),
      mordred: room.selectedRoles.includes('mordred'),
      oberon: room.selectedRoles.includes('oberon'),
      lancelotGood: room.selectedRoles.includes('lancelot_good'),
      lancelotEvil: room.selectedRoles.includes('lancelot_evil'),
    };

    const sequence = generateNarrationSequence(roles, room.lancelotConfig, room.players.length);
    io.to(roomCode).emit("narration-started", { sequence });
  });

  socket.on("narration-ended", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId) return;
    room.phase = 'team-proposal';
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("propose-team", ({ roomCode, teamPlayerIds, targetMissionIndex }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (room.targetingEnabled && targetMissionIndex !== undefined) {
      if (room.attemptedMissions.includes(targetMissionIndex)) return;
      if (targetMissionIndex === 4 && room.attemptedMissions.length < 2) return;
      room.currentMissionIndex = targetMissionIndex;
    }

    room.proposedTeam = teamPlayerIds;
    room.phase = 'team-voting';
    room.teamVotes = {};
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("assign-excalibur", ({ roomCode, targetPlayerId }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.players[room.currentLeaderIndex].id) return;
    
    room.excaliburHolder = targetPlayerId;
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("vote-team", ({ roomCode, vote }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || !playerId) return;
    room.teamVotes[playerId] = vote;
    
    // Automatic reveal if all voted
    if (Object.keys(room.teamVotes).length === room.players.length) {
      const votes = Object.values(room.teamVotes);
      const approves = votes.filter(v => v === 'approve').length;
      const rejects = votes.length - approves;
      const passed = approves > rejects;

      room.lastTeamVoteResult = {
        votes: { ...room.teamVotes },
        passed
      };
      room.phase = 'team-result';
      
      if (!passed) {
        room.rejectionCount++;
      } else {
        room.rejectionCount = 0;
      }
    }

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("reveal-team-vote", ({ roomCode }) => {
    // Deprecated but kept for compatibility if needed
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    
    if (Object.keys(room.teamVotes).length < room.players.length) return;

    const votes = Object.values(room.teamVotes);
    const approves = votes.filter(v => v === 'approve').length;
    const rejects = votes.length - approves;
    const passed = approves > rejects;

    room.lastTeamVoteResult = {
      votes: { ...room.teamVotes },
      passed
    };
    room.phase = 'team-result';
    
    if (!passed) {
      room.rejectionCount++;
    } else {
      room.rejectionCount = 0;
    }

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("vote-mission", ({ roomCode, vote }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || !playerId) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const isLancelot = player.role === 'lancelot_good' || player.role === 'lancelot_evil';
    const currentTeam = (player.role && room.lancelotLoyalty && isLancelot)
      ? (player.role === 'lancelot_good' ? room.lancelotLoyalty.lancelotGoodTeam : room.lancelotLoyalty.lancelotEvilTeam)
      : (player.role ? ROLES[player.role].team : 'good');

    // Lancelot mandatory check
    if (isLancelot && room.lancelotConfig?.mandatory) {
      if (currentTeam === 'good' && vote === 'fail') {
        socket.emit("error", { message: "Lancelot do Bem deve jogar Sucesso nesta variante." });
        return;
      }
      if (currentTeam === 'evil' && vote === 'success') {
        socket.emit("error", { message: "Lancelot do Mal deve jogar Falha nesta variante." });
        return;
      }
    }

    // Normal Good check
    if (!isLancelot && currentTeam === 'good' && vote === 'fail') {
      socket.emit("error", { message: "Servos Leais de Arthur devem jogar Sucesso." });
      return;
    }

    room.missionVotes[playerId] = vote;
    
    // Automatic reveal if all in team voted
    if (Object.keys(room.missionVotes).length === room.proposedTeam.length) {
      if (room.excaliburEnabled && room.excaliburHolder && !room.excaliburUsed) {
        room.phase = 'excalibur-usage';
      } else {
        processMissionResult(room, roomCode);
      }
    }

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("use-excalibur", ({ roomCode, targetPlayerId }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.excaliburHolder || room.excaliburUsed) return;

    const originalVote = room.missionVotes[targetPlayerId];
    if (!originalVote) return;

    room.excaliburUsed = true;
    room.excaliburTarget = targetPlayerId;
    room.excaliburReveal = originalVote;
    
    // Swap the vote
    room.missionVotes[targetPlayerId] = originalVote === 'success' ? 'fail' : 'success';

    processMissionResult(room, roomCode);
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("skip-excalibur", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.excaliburHolder || room.excaliburUsed) return;

    room.excaliburUsed = true;
    processMissionResult(room, roomCode);
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("lady-examine", ({ roomCode, targetPlayerId }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.ladyOfLakeHolder || !room.ladyOfLakePhase) return;

    if (room.ladyOfLakeUsed.includes(targetPlayerId)) return;

    const targetPlayer = room.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) return;

    let loyalty: 'good' | 'evil' = ROLES[targetPlayer.role!].team;
    
    // Lancelot loyalty check
    if (targetPlayer.role === 'lancelot_good') loyalty = room.lancelotLoyalty!.lancelotGoodTeam;
    if (targetPlayer.role === 'lancelot_evil') loyalty = room.lancelotLoyalty!.lancelotEvilTeam;

    socket.emit("lady-result", { holderPlayerId: playerId, targetPlayerId, loyalty });
    
    room.ladyOfLakeHolder = targetPlayerId;
    room.ladyOfLakeUsed.push(targetPlayerId);
    room.ladyOfLakePhase = false;
    
    // Move to next leader
    room.phase = 'team-proposal';
    room.proposedTeam = [];
    room.currentLeaderIndex = (room.currentLeaderIndex + 1) % room.players.length;

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("reveal-mission", ({ roomCode }) => {
    // Deprecated but kept for compatibility
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;

    if (Object.keys(room.missionVotes).length < room.proposedTeam.length) return;

    const votes = Object.values(room.missionVotes);
    const fails = votes.filter(v => v === 'fail').length;
    const mission = room.missions[room.currentMissionIndex];
    
    const playerCount = room.players.length;
    const failsNeeded = needsTwoFails(room.currentMissionIndex, playerCount) ? 2 : 1;
    const passed = fails < failsNeeded;

    if (passed) {
      mission.status = 'success';
    } else {
      mission.status = 'fail';
    }
    mission.votes = [...votes].sort(() => Math.random() - 0.5);

    room.lastMissionVoteResult = {
      votes: mission.votes,
      passed
    };
    room.phase = 'mission-result';

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("continue-game", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    const { playerId } = socketToPlayer.get(socket.id) || {};
    if (!room || playerId !== room.hostId) return;

    if (room.phase === 'team-result') {
      if (room.lastTeamVoteResult?.passed) {
        room.phase = 'mission-voting';
        room.missionVotes = {};
        room.missions[room.currentMissionIndex].team = room.proposedTeam;
      } else {
        if (room.rejectionCount >= 5) {
          room.phase = 'game-over';
          room.winner = 'evil';
          room.gameOverReason = '5 equipes rejeitadas consecutivamente';
          saveMatchHistory(room);
        } else {
          room.phase = 'team-proposal';
          room.proposedTeam = []; // Reset proposed team
          room.currentLeaderIndex = (room.currentLeaderIndex + 1) % room.players.length;
        }
      }
    } else if (room.phase === 'mission-result') {
      if (checkGameOver(room)) {
        io.to(roomCode).emit("room-updated", room);
        return;
      }

      // Lady of the Lake check
      const completedMissions = room.missions.filter(m => m.status !== 'pending').length;
      if (room.ladyOfLakeEnabled && [2, 3, 4].includes(completedMissions)) {
        room.ladyOfLakePhase = true;
        room.phase = 'lady-of-the-lake';
      } else {
        room.phase = 'team-proposal';
        room.proposedTeam = []; // Reset proposed team
        room.missionVotes = {};
        room.teamVotes = {};
        room.rejectionCount = 0;
        
        if (!room.targetingEnabled) {
          room.currentMissionIndex++;
        }
        room.currentLeaderIndex = (room.currentLeaderIndex + 1) % room.players.length;
        
        // Excalibur reset
        room.excaliburHolder = null;
        room.excaliburUsed = false;
        room.excaliburTarget = null;
        room.excaliburReveal = null;

        // Loyalty swap check
        if (room.lancelotConfig) {
          handleLoyaltySwap(room, room.targetingEnabled ? completedMissions : room.currentMissionIndex);
        }
      }
    } else if (room.phase === 'character-reveal') {
      room.phase = 'team-proposal';
      room.proposedTeam = [];
      room.missionVotes = {};
      room.teamVotes = {};
      room.rejectionCount = 0;
      
      // No need to call handleLoyaltySwap(room, 0) here as it's now called in start-game
    }

    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("assassinate", ({ roomCode, targetPlayerId }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.assassinationTargetId = targetPlayerId;
    const targetPlayer = room.players.find(p => p.id === targetPlayerId);
    if (targetPlayer?.role === 'merlin') {
      room.winner = 'evil';
      room.gameOverReason = 'Merlin foi assassinado!';
    } else {
      room.winner = 'good';
      room.gameOverReason = 'Merlin sobreviveu!';
    }
    room.phase = 'game-over';
    saveMatchHistory(room);
    io.to(roomCode).emit("room-updated", room);
  });

  socket.on("leave-room", ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== playerId);
    socket.leave(roomCode);
    socketToPlayer.delete(socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
    } else {
      if (room.hostId === playerId) {
        room.hostId = room.players[0].id;
      }
      io.to(roomCode).emit("room-updated", room);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const info = socketToPlayer.get(socket.id);
    if (!info) return;

    const { roomCode, playerId } = info;
    const room = rooms.get(roomCode);
    if (!room) {
      socketToPlayer.delete(socket.id);
      return;
    }

    // Check if the player has other active sockets in this room
    const otherSocketsForPlayer = Array.from(socketToPlayer.entries())
      .filter(([sid, data]) => sid !== socket.id && data.playerId === playerId && data.roomCode === roomCode);

    if (otherSocketsForPlayer.length === 0) {
      // This was the last socket for this player
      if (room.phase !== 'lobby') {
        const player = room.players.find(p => p.id === playerId);
        if (player) player.socketId = ""; // Show as offline
        io.to(roomCode).emit("room-updated", room);
      } else {
        // In lobby, remove the player entirely
        room.players = room.players.filter(p => p.id !== playerId);
        if (room.players.length === 0) {
          rooms.delete(roomCode);
        } else {
          if (room.hostId === playerId) {
            room.hostId = room.players[0].id;
          }
          io.to(roomCode).emit("room-updated", room);
        }
      }
    } else {
      // Player still has other sockets open, just update the active socketId if it was this one
      const player = room.players.find(p => p.id === playerId);
      if (player && player.socketId === socket.id) {
        player.socketId = otherSocketsForPlayer[0][0]; // Switch to another active socket
        io.to(roomCode).emit("room-updated", room);
      }
    }
    
    socketToPlayer.delete(socket.id);
  });
});

// Avalon game logic helper (duplicate for server context)
const TEAM_DISTRIBUTION: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

const MISSION_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

const ROLES: Record<string, { team: 'good' | 'evil' }> = {
  merlin: { team: 'good' },
  assassin: { team: 'evil' },
  servant: { team: 'good' },
  minion: { team: 'evil' },
  percival: { team: 'good' },
  morgana: { team: 'evil' },
  mordred: { team: 'evil' },
  oberon: { team: 'evil' },
  lancelot_good: { team: 'good' },
  lancelot_evil: { team: 'evil' },
};

function processMissionResult(room: Room, roomCode: string) {
  const votes = Object.values(room.missionVotes);
  const fails = votes.filter(v => v === 'fail').length;
  const mission = room.missions[room.currentMissionIndex];
  
  const playerCount = room.players.length;
  const failsNeeded = needsTwoFails(room.currentMissionIndex, playerCount) ? 2 : 1;
  const passed = fails < failsNeeded;

  if (passed) {
    mission.status = 'success';
  } else {
    mission.status = 'fail';
  }
  mission.votes = [...votes].sort(() => Math.random() - 0.5);

  room.lastMissionVoteResult = {
    votes: mission.votes,
    passed
  };
  room.phase = 'mission-result';
  
  if (room.targetingEnabled) {
    room.attemptedMissions.push(room.currentMissionIndex);
  }
}

function handleLoyaltySwap(room: Room, roundIndex: number) {
  if (!room.lancelotConfig) return;
  const config = room.lancelotConfig;

  // Check if we should reveal a card for this round
  if (roundIndex + 1 >= config.startsAt) {
    const deckIdx = roundIndex + 1 - config.startsAt;
    
    // Prevent duplicate swaps for the same round index
    if (room.loyaltyDeckIndex >= deckIdx + 1) return;

    if (deckIdx < room.loyaltyDeck.length) {
      const card = room.loyaltyDeck[deckIdx];
      
      // Reveal the card
      room.loyaltyDeckVisible[deckIdx] = card;
      
      // Update swapOccurred for UI feedback
      room.lancelotLoyalty!.swapOccurred = (card === 'switch');
      
      if (card === 'switch') {
        // Swap loyalty
        const temp = room.lancelotLoyalty!.lancelotGoodTeam;
        room.lancelotLoyalty!.lancelotGoodTeam = room.lancelotLoyalty!.lancelotEvilTeam;
        room.lancelotLoyalty!.lancelotEvilTeam = temp;
      }
      
      room.loyaltyDeckIndex = deckIdx + 1;
    } else {
      room.lancelotLoyalty!.swapOccurred = false;
    }
  } else {
    room.lancelotLoyalty!.swapOccurred = false;
  }
}

function checkGameOver(room: Room) {
  const successes = room.missions.filter(m => m.status === 'success').length;
  const failures = room.missions.filter(m => m.status === 'fail').length;

  if (successes >= 3) {
    const hasAssassin = room.players.some(p => p.role === 'assassin');
    if (hasAssassin) {
      room.phase = 'assassination';
    } else {
      room.phase = 'game-over';
      room.winner = 'good';
      room.gameOverReason = 'Três missões bem-sucedidas!';
      saveMatchHistory(room);
    }
    return true;
  }

  if (failures >= 3) {
    room.phase = 'game-over';
    room.winner = 'evil';
    room.gameOverReason = 'Três missões falharam!';
    saveMatchHistory(room);
    return true;
  }
  return false;
}

function saveMatchHistory(room: Room) {
  const match: MatchRecord = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    playerCount: room.players.length,
    players: room.players.map(p => {
      let team = ROLES[p.role!].team;
      if (p.role === 'lancelot_good') team = room.lancelotLoyalty!.lancelotGoodTeam;
      if (p.role === 'lancelot_evil') team = room.lancelotLoyalty!.lancelotEvilTeam;
      return {
        name: p.name,
        role: p.role!,
        team
      };
    }),
    options: {
      lancelot: room.lancelotConfig ? room.lancelotConfig.id : 'none',
      ladyOfLake: room.ladyOfLakeEnabled,
      excalibur: room.excaliburEnabled,
      targeting: room.targetingEnabled
    },
    missions: room.missions.map(m => ({
      status: m.status,
      fails: m.votes.filter(v => v === 'fail').length
    })),
    winner: room.winner!,
    reason: room.gameOverReason!,
    duration: room.currentMatchStartedAt ? Math.floor((Date.now() - room.currentMatchStartedAt.getTime()) / 1000) : 0
  };
  room.matchHistory.unshift(match);
  if (room.matchHistory.length > 10) room.matchHistory.pop();
}

function needsTwoFails(missionIndex: number, playerCount: number): boolean {
  return missionIndex === 3 && playerCount >= 7;
}

function assignRoles(playerIds: string[], selectedOptionalRoles: string[]): Record<string, string> {
  const playerCount = playerIds.length;
  const distribution = TEAM_DISTRIBUTION[playerCount];
  if (!distribution) throw new Error('Número de jogadores inválido');

  const rolesToAssign: string[] = [];
  rolesToAssign.push('merlin');
  rolesToAssign.push('assassin');
  
  // Handle Lancelots separately if selected
  const useLancelots = selectedOptionalRoles.includes('lancelot_good') || selectedOptionalRoles.includes('lancelot_evil');
  const otherOptionalRoles = selectedOptionalRoles.filter(r => r !== 'lancelot_good' && r !== 'lancelot_evil');
  
  if (useLancelots) {
    rolesToAssign.push('lancelot_good');
    rolesToAssign.push('lancelot_evil');
  }
  
  otherOptionalRoles.forEach(roleId => rolesToAssign.push(roleId));

  const currentGood = rolesToAssign.filter(r => ROLES[r].team === 'good').length;
  const currentEvil = rolesToAssign.filter(r => ROLES[r].team === 'evil').length;

  for (let i = 0; i < distribution.good - currentGood; i++) rolesToAssign.push('servant');
  for (let i = 0; i < distribution.evil - currentEvil; i++) rolesToAssign.push('minion');

  const shuffledRoles = [...rolesToAssign].sort(() => Math.random() - 0.5);
  const assignments: Record<string, string> = {};
  playerIds.forEach((id, index) => {
    assignments[id] = shuffledRoles[index];
  });
  return assignments;
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use('/avalon', express.static(distPath));
    app.get('/avalon/*', (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    app.get('/', (req, res) => res.redirect(301, '/avalon/'));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
