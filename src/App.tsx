/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { 
  Users, 
  Shield, 
  Skull, 
  Sword, 
  CheckCircle2, 
  XCircle, 
  Crown, 
  Play, 
  Pause,
  RotateCcw,
  Volume2, 
  VolumeX, 
  SkipForward, 
  SkipBack,
  Info,
  QrCode,
  Copy,
  LogOut,
  Droplets,
  Target,
  Eye,
  EyeOff,
  RefreshCw,
  Equal,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle,
  MapPinned,
  Book
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { GameGuide } from './components/GameGuide';
import { GameManual } from './components/GameManual';
import {
  ROLES,
  MISSION_SIZES,
  needsTwoFails,
  Team,
  generateNarrationSequence,
  shouldPauseAfter,
  Roles,
  TEAM_DISTRIBUTION,
  getRoleInfo
} from './core/avalon';

// --- Constants ---

const APP_VERSION = '1.2.0';

// --- Types ---

interface AvalonSettings {
  musicEnabled: boolean;
  musicVolume: number;
  narrationVolume: number;
  pauseDuration: number;
  musicVolumeFaded: number;
  keepScreenAwake: boolean;
  confirmOnLeave: boolean;
}

const DEFAULT_SETTINGS: AvalonSettings = {
  musicEnabled: true,
  musicVolume: 0.15,
  narrationVolume: 1.0,
  pauseDuration: 5,
  musicVolumeFaded: 0.15 * 0.33,
  keepScreenAwake: true,
  confirmOnLeave: true,
};

const getPersistentId = () => {
  let id = sessionStorage.getItem('avalon_player_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('avalon_player_id', id);
  }
  return id;
};

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

const LANCELOT_CONFIGS = {
  'var1': { variant: 'var1', deckSize: 3, deckRevealed: false, startsAt: 3, mandatory: false, recognition: false },
  'var2': { variant: 'var2', deckSize: 5, deckRevealed: true, startsAt: 1, mandatory: true, recognition: false },
  'var3': { variant: 'var3', deckSize: 0, deckRevealed: false, startsAt: 0, mandatory: false, recognition: true },
  'var1_var2': { variant: 'var1_var2', deckSize: 5, deckRevealed: false, startsAt: 1, mandatory: true, recognition: false },
  'var1_var3': { variant: 'var1_var3', deckSize: 3, deckRevealed: false, startsAt: 3, mandatory: false, recognition: true },
  'var2_var3': { variant: 'var2_var3', deckSize: 5, deckRevealed: true, startsAt: 1, mandatory: true, recognition: true },
} as const;

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
  lancelotConfig: any;
  loyaltyDeck: string[];
  loyaltyDeckIndex: number;
  loyaltyDeckVisible: string[];
  lancelotLoyalty: { lancelotGoodTeam: 'good' | 'evil'; lancelotEvilTeam: 'good' | 'evil'; swapOccurred: boolean } | null;
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
  matchHistory: any[];
  currentMatchStartedAt: Date | null;
}

// --- Context ---

const SocketContext = createContext<Socket | null>(null);

const SettingsContext = createContext<{
  settings: AvalonSettings;
  updateSettings: (newSettings: Partial<AvalonSettings>) => void;
  restoreDefaults: () => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
} | null>(null);

const useSocket = () => {
  const socket = useContext(SocketContext);
  if (!socket) throw new Error('useSocket must be used within a SocketProvider');
  return socket;
};

const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};

const useWakeLock = (enabled: boolean) => {
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && enabled) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.error(`${err.name}, ${err.message}`);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };

    if (enabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [enabled]);
};

const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AvalonSettings>(() => {
    const saved = localStorage.getItem('avalonSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validation
        if (typeof parsed.narrationVolume !== 'number' || parsed.narrationVolume < 0.5 || parsed.narrationVolume > 1.5) {
          parsed.narrationVolume = 1.0;
        }
        if (typeof parsed.musicVolume !== 'number' || parsed.musicVolume < 0 || parsed.musicVolume > 1) {
          parsed.musicVolume = 0.15;
        }
        parsed.musicVolumeFaded = parsed.musicVolume * 0.33;
        return { ...DEFAULT_SETTINGS, ...parsed };
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  const [showSettings, setShowSettings] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!musicRef.current) {
      musicRef.current = new Audio('/src/assets/audios/soundtrack-selection.mp3');
      musicRef.current.loop = true;
    }

    if (settings.musicEnabled) {
      musicRef.current.volume = settings.musicVolume;
      musicRef.current.play().catch(e => console.log("Music play blocked by browser policy"));
    } else {
      musicRef.current.pause();
    }
  }, [settings.musicEnabled, settings.musicVolume]);

  const updateSettings = (newSettings: Partial<AvalonSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      if (newSettings.musicVolume !== undefined) {
        updated.musicVolumeFaded = newSettings.musicVolume * 0.33;
      }
      return updated;
    });
  };

  const restoreDefaults = () => {
    if (window.confirm(t('app.settings.restoreConfirm'))) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.setItem('avalonSettings', JSON.stringify(DEFAULT_SETTINGS));
      setShowSettings(false);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('avalonSettings', JSON.stringify(settings));
    setShowSettings(false);
  };

  useWakeLock(settings.keepScreenAwake);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, restoreDefaults, showSettings, setShowSettings }}>
      {children}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal 
            settings={settings} 
            onUpdate={updateSettings} 
            onRestore={restoreDefaults} 
            onSave={saveSettings}
            onClose={() => {
              // Restore from localStorage on close without saving
              const saved = localStorage.getItem('avalonSettings');
              if (saved) {
                setSettings(JSON.parse(saved));
              } else {
                setSettings(DEFAULT_SETTINGS);
              }
              setShowSettings(false);
            }}
          />
        )}
      </AnimatePresence>
    </SettingsContext.Provider>
  );
};

const SettingsModal = ({
  settings,
  onUpdate,
  onRestore,
  onSave,
  onClose
}: {
  settings: AvalonSettings;
  onUpdate: (s: Partial<AvalonSettings>) => void;
  onRestore: () => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.9 }}
        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`relative w-full md:max-w-[480px] bg-gradient-to-br from-[#16213e] to-[#1e2d45] border-t-2 md:border-2 border-[#ffd700] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col ${
          isMobile ? 'rounded-t-[20px] max-h-[85dvh]' : 'rounded-[15px] max-h-[90vh]'
        }`}
      >
        {/* Handle for mobile */}
        {isMobile && (
          <div className="flex justify-center py-3">
            <div className="w-10 h-1 bg-gray-500/50 rounded-full" />
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-[#ffd700]/20">
          <h2 className="text-xl font-['Cinzel'] text-[#ffd700] flex items-center gap-3">
            <Settings size={24} /> {t('app.settings.title')}
          </h2>
          {!isMobile && (
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={24} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-8">
          {/* Áudio */}
          <section className="space-y-4">
            <h3 className="text-xs font-['Cinzel'] text-[#ffd700] tracking-[2px] uppercase border-b border-[#ffd700]/20 pb-2">
              {t('app.settings.audio')}
            </h3>
            
            <div className="bg-[#1e2d45]/40 border border-[#ffd700]/10 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                  {t('app.settings.backgroundMusic')}
                </div>
                <button 
                  onClick={() => onUpdate({ musicEnabled: !settings.musicEnabled })}
                  className={`w-12 h-6 rounded-full relative transition-all ${settings.musicEnabled ? 'bg-[#4169e1]/40 border border-[#4169e1]' : 'bg-[#dc143c]/10 border border-[#dc143c]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${settings.musicEnabled ? 'right-1 bg-[#ffd700]' : 'left-1 bg-gray-500'}`} />
                </button>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01"
                  value={settings.musicVolume}
                  disabled={!settings.musicEnabled}
                  onChange={(e) => onUpdate({ musicVolume: parseFloat(e.target.value) })}
                  className="flex-grow accent-[#ffd700] h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                />
                <span className="text-xs font-mono w-8 text-right">{Math.round(settings.musicVolume * 100)}%</span>
              </div>
            </div>

            <div className="bg-[#1e2d45]/40 border border-[#ffd700]/10 rounded-lg p-4 space-y-3">
              <div className="font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                {t('app.settings.narrationVolume')}
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0.5" 
                  max="1.5" 
                  step="0.05"
                  value={settings.narrationVolume}
                  onChange={(e) => onUpdate({ narrationVolume: parseFloat(e.target.value) })}
                  className="flex-grow accent-[#ffd700] h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-mono w-8 text-right">{Math.round(settings.narrationVolume * 100)}%</span>
              </div>
            </div>

            <div className="bg-[#1e2d45]/40 border border-[#ffd700]/10 rounded-lg p-4 space-y-3">
              <div className="font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                {t('app.settings.pauseBetweenAudios')}
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  step="1"
                  value={settings.pauseDuration}
                  onChange={(e) => onUpdate({ pauseDuration: parseInt(e.target.value) })}
                  className="flex-grow accent-[#ffd700] h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-mono w-8 text-right">{settings.pauseDuration}s</span>
              </div>
              <p className="text-[10px] text-[#9b7a4f] italic">{t('app.settings.pauseHint')}</p>
            </div>
          </section>

          {/* Interface */}
          <section className="space-y-4">
            <h3 className="text-xs font-['Cinzel'] text-[#ffd700] tracking-[2px] uppercase border-b border-[#ffd700]/20 pb-2">
              {t('app.settings.interface')}
            </h3>
            
            <div className="bg-[#1e2d45]/40 border border-[#ffd700]/10 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                  {t('app.settings.keepScreenAwake')}
                </div>
                <button 
                  disabled={!('wakeLock' in navigator)}
                  onClick={() => onUpdate({ keepScreenAwake: !settings.keepScreenAwake })}
                  className={`w-12 h-6 rounded-full relative transition-all ${settings.keepScreenAwake ? 'bg-[#4169e1]/40 border border-[#4169e1]' : 'bg-[#dc143c]/10 border border-[#dc143c]'} disabled:opacity-20`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${settings.keepScreenAwake ? 'right-1 bg-[#ffd700]' : 'left-1 bg-gray-500'}`} />
                </button>
              </div>
              <p className="text-[10px] text-[#9b7a4f] italic">{t('app.settings.keepScreenHint')}</p>
            </div>

            <div className="bg-[#1e2d45]/40 border border-[#ffd700]/10 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                  {t('app.settings.confirmLeave')}
                </div>
                <button 
                  onClick={() => onUpdate({ confirmOnLeave: !settings.confirmOnLeave })}
                  className={`w-12 h-6 rounded-full relative transition-all ${settings.confirmOnLeave ? 'bg-[#4169e1]/40 border border-[#4169e1]' : 'bg-[#dc143c]/10 border border-[#dc143c]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${settings.confirmOnLeave ? 'right-1 bg-[#ffd700]' : 'left-1 bg-gray-500'}`} />
                </button>
              </div>
              <p className="text-[10px] text-[#9b7a4f] italic">{t('app.settings.confirmLeaveHint')}</p>
            </div>
          </section>

          {/* Sobre */}
          <section className="space-y-4">
            <h3 className="text-xs font-['Cinzel'] text-[#ffd700] tracking-[2px] uppercase border-b border-[#ffd700]/20 pb-2">
              {t('app.settings.about')}
            </h3>
            <div className="text-center space-y-2">
              <p className="font-['Cinzel'] text-[#ffd700]">The Resistance: Avalon</p>
              <p className="text-[10px] text-gray-400">{t('app.settings.originalDesign')}</p>
              <p className="text-[10px] text-gray-500">{t('app.settings.appVersion', { version: APP_VERSION })}</p>
              <p className="text-[10px] text-gray-500">{t('app.settings.developedFor')}</p>
              <div className="pt-4 flex justify-center gap-4 text-xs font-bold text-[#ffd700]">
                <button onClick={() => { onClose(); /* Trigger Manual */ window.dispatchEvent(new CustomEvent('open-manual')); }} className="hover:underline">{t('app.settings.manual')}</button>
                <span className="text-gray-700">|</span>
                <button onClick={() => { onClose(); /* Trigger Guide */ window.dispatchEvent(new CustomEvent('open-guide')); }} className="hover:underline">{t('app.settings.gameGuide')}</button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#ffd700]/20 flex gap-3 bg-[#16213e]">
          <button
            onClick={onRestore}
            className="flex-1 py-3 px-4 rounded-xl border border-[#4a5f7f] text-[#b0b0b0] font-bold text-sm transition-all hover:bg-white/5"
          >
            {t('app.settings.restoreDefaults')}
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-br from-[#ffd700] to-[#b8860b] text-[#1a0a2e] font-bold text-sm transition-all active:scale-95"
          >
            {t('app.settings.saveAndClose')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Components ---

const GameTitle = ({ small = false }: { small?: boolean }) => (
  <div className={`text-center mb-8 ${small ? 'scale-75 -mb-4' : ''}`}>
    <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-bold mb-1">The Resistance</div>
    <h1 className="text-5xl font-['Cinzel'] text-[#ffd700] drop-shadow-[0_0_15px_rgba(255,215,0,0.3)] tracking-widest">AVALON</h1>
  </div>
);

const Layout = ({ children, showTitle = true, onSettingsClick }: { children: ReactNode; showTitle?: boolean; onSettingsClick?: () => void }) => (
  <div className="min-h-screen bg-[#0d1b2a] text-white font-['Lato'] selection:bg-[#ffd700] selection:text-[#0d1b2a] pb-12">
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="flex justify-end mb-4">
        <button 
          onClick={onSettingsClick}
          className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-[#ffd700] transition-all"
        >
          <Settings size={24} />
        </button>
      </div>
      {showTitle && <GameTitle small={!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('/room/')} />}
      {children}
    </div>
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false,
  className = ''
}: { 
  children: ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  disabled?: boolean;
  className?: string;
}) => {
  const variants = {
    primary: 'bg-[#ffd700] text-[#0d1b2a] hover:bg-[#ffed4a]',
    secondary: 'bg-[#2a3f5f] text-white hover:bg-[#3a547a]',
    danger: 'bg-[#c0392b] text-white hover:bg-[#e74c3c]',
    outline: 'border-2 border-[#ffd700] text-[#ffd700] hover:bg-[#ffd700] hover:text-[#0d1b2a]'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 px-6 rounded-xl font-['Cinzel'] font-bold text-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`bg-[#1b263b] border border-white/10 rounded-2xl p-6 shadow-xl ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, team, variant }: { children: ReactNode; team?: Team; variant?: 'purple' }) => (
  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
    variant === 'purple' ? 'bg-purple-600 text-white' :
    team === 'good' ? 'bg-[#3498db] text-white' : 'bg-[#c0392b] text-white'
  }`}>
    {children}
  </span>
);

// --- Pages ---

const MatchHistoryView = ({ history, onBack }: { history: any[]; onBack: () => void }) => {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
          <SkipBack size={24} />
        </button>
        <h2 className="text-2xl font-['Cinzel'] text-[#ffd700]">{t('app.lobby.history')}</h2>
      </div>

      <div className="space-y-4">
        {history.map((match) => (
          <div key={match.id}>
            <Card className="space-y-3">
            <div className="flex justify-between items-start">
              <div className="text-xs text-gray-500 font-mono">{new Date(match.timestamp).toLocaleString('pt-BR')}</div>
              <Badge team={match.winner}>{match.winner === 'good' ? t('app.lobby.goodWin') : t('app.lobby.evilWin')}</Badge>
            </div>
            
            <div className="grid grid-cols-5 gap-1">
              {match.missions.map((m: any, i: number) => (
                <div key={i} className={`h-2 rounded-full ${m.status === 'success' ? 'bg-[#3498db]' : m.status === 'fail' ? 'bg-[#c0392b]' : 'bg-gray-700'}`}></div>
              ))}
            </div>

            <p className="text-sm font-bold">{match.reason}</p>
            
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="flex flex-wrap gap-1">
                {match.players.map((p: any, i: number) => (
                  <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${p.team === 'good' ? 'border-[#3498db]/30 text-[#3498db]' : 'border-[#c0392b]/30 text-[#c0392b]'}`}>
                    {p.name} ({getRoleInfo(p.role, t).name})
                  </span>
                ))}
              </div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">
                {t('app.lobby.durationLabel', { minutes: Math.floor(match.duration / 60), seconds: match.duration % 60, count: match.playerCount })}
              </div>
            </div>
          </Card>
        </div>
      ))}
      </div>
    </motion.div>
  );
};

const Home = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const socket = useSocket();
  const navigate = useNavigate();
  const { setShowSettings } = useSettings();

  const handleCreate = () => {
    if (!name) return alert(t('app.enterNameAlert'));
    socket.emit('create-room', { playerName: name, playerId: getPersistentId() });
  };

  const handleJoin = () => {
    if (!name || !roomCode) return alert(t('app.fillNameAndCode'));
    socket.emit('join-room', { roomCode: roomCode.toUpperCase(), playerName: name, playerId: getPersistentId() });
  };

  useEffect(() => {
    socket.on('room-created', ({ roomCode }) => {
      navigate(`/room/${roomCode}`);
    });
    socket.on('joined-room', ({ roomCode }) => {
      navigate(`/room/${roomCode}`);
    });
    socket.on('error', ({ message }) => alert(message));

    return () => {
      socket.off('room-created');
      socket.off('joined-room');
      socket.off('error');
    };
  }, [socket, navigate]);

  return (
    <Layout showTitle={false} onSettingsClick={() => setShowSettings(true)}>
      <div className="space-y-12 text-center pt-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <GameTitle />
          <p className="text-gray-400 italic">{t('app.subtitle')}</p>
        </motion.div>

        <div className="space-y-6">
          <div className="space-y-2 text-left">
            <label className="text-xs uppercase tracking-widest text-gray-500 font-bold ml-2">{t('app.yourName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Arthur"
              className="w-full bg-[#1b263b] border-2 border-white/10 rounded-xl py-4 px-6 focus:border-[#ffd700] outline-none transition-all"
            />
          </div>

          <div className="pt-4 space-y-4">
            <Button onClick={handleCreate}>{t('app.createRoom')}</Button>
            
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
              <div className="relative flex justify-center text-xs uppercase bg-[#0d1b2a] px-4 text-gray-500 font-bold">{t('app.joinRoomOr')}</div>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder={t('app.roomCodePlaceholder')}
                className="w-full bg-[#1b263b] border-2 border-white/10 rounded-xl py-4 px-6 text-center font-mono text-2xl tracking-widest focus:border-[#ffd700] outline-none transition-all uppercase"
              />
              <Button variant="secondary" onClick={handleJoin}>{t('app.joinRoom')}</Button>
            </div>

            <div className="pt-8 opacity-40 hover:opacity-100 transition-opacity">
              <button 
                onClick={() => {
                  sessionStorage.removeItem('avalon_player_id');
                  window.location.reload();
                }}
                className="text-[10px] uppercase tracking-widest flex items-center gap-2 mx-auto"
              >
                <Users size={12} />
                <span>{t('app.resetIdentity')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

const Room = () => {
  const { t } = useTranslation();
  const { code } = useParams();
  const socket = useSocket();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { settings, setShowSettings } = useSettings();

  useEffect(() => {
    const handleRoomUpdate = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setIsJoining(false);
    };

    const handleError = ({ message }: { message: string }) => {
      alert(message);
      setIsJoining(false);
      if (message === "Sala não encontrada") navigate('/');
    };

    socket.on('room-updated', handleRoomUpdate);
    socket.on('error', handleError);

    // Solicitar informações da sala ao entrar
    socket.emit('get-room-info', { roomCode: code?.toUpperCase(), playerId: getPersistentId() });
    
    return () => {
      socket.off('room-updated', handleRoomUpdate);
      socket.off('error', handleError);
    };
  }, [socket, navigate, code]);

  const handleJoin = () => {
    if (!playerName) return alert(t('app.enterNameAlert'));
    setIsJoining(true);
    socket.emit('join-room', { roomCode: code?.toUpperCase(), playerName, playerId: getPersistentId() });
  };

  if (!room) {
    return (
      <Layout onSettingsClick={() => setShowSettings(true)}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#ffd700]"></div>
        </div>
      </Layout>
    );
  }

  const playerId = getPersistentId();
  const me = room.players.find(p => p.id === playerId);
  const isHost = playerId === room.hostId;

  // Se o usuário NÃO está na sala, mostrar formulário de entrada
  if (!me) {
    return (
      <Layout onSettingsClick={() => setShowSettings(true)}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 text-center py-12">
          <div className="space-y-4">
            <h2 className="text-sm uppercase tracking-widest text-gray-500 font-bold">{t('app.enterRoom')}</h2>
            <h1 className="text-4xl font-mono font-bold text-[#ffd700]">{code}</h1>
          </div>

          <Card className="space-y-6">
            <div className="space-y-2 text-left">
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold ml-2">{t('app.yourName')}</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ex: Mordred"
                className="w-full bg-[#0d1b2a] border-2 border-white/10 rounded-xl py-4 px-6 focus:border-[#ffd700] outline-none transition-all"
              />
            </div>
            <Button onClick={handleJoin} disabled={isJoining}>
              {isJoining ? t('app.joining') : t('app.joinGame')}
            </Button>
          </Card>
          
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto">
            <LogOut size={16} />
            <span>{t('app.leaveRoom')}</span>
          </button>
        </motion.div>
      </Layout>
    );
  }

  const handleLeave = () => {
    if (settings.confirmOnLeave) {
      if (!window.confirm(t('app.confirmLeave'))) return;
    }
    socket.emit('leave-room', { roomCode: code?.toUpperCase(), playerId: getPersistentId() });
    navigate('/');
  };

  return (
    <Layout onSettingsClick={() => setShowSettings(true)}>
      <AnimatePresence mode="wait">
        {room.phase === 'lobby' && <LobbyView room={room} isHost={isHost} onLeave={handleLeave} />}
        {room.phase === 'character-reveal' && <CharacterRevealView room={room} me={me} />}
        {room.phase === 'narration' && <NarrationView room={room} isHost={isHost} />}
        {(['team-proposal', 'team-voting', 'team-result', 'mission-voting', 'mission-result', 'assassination', 'game-over'].includes(room.phase)) && (
          <GameView room={room} me={me} isHost={isHost} onLeave={handleLeave} />
        )}
      </AnimatePresence>
    </Layout>
  );
};

const LancelotModal = ({
  isOpen,
  onClose,
  onConfirm,
  initialConfig
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (configKey: string) => void;
  initialConfig: string | null;
}) => {
  const { t } = useTranslation();
  const [v1, setV1] = useState(false);
  const [v2, setV2] = useState(false);
  const [v3, setV3] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setV1(initialConfig?.includes('var1') || false);
      setV2(initialConfig?.includes('var2') || false);
      setV3(initialConfig?.includes('var3') || false);
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const selectedCount = [v1, v2, v3].filter(Boolean).length;
  
  const getLancelotConfigKey = (var1: boolean, var2: boolean, var3: boolean): string => {
    if (!var1 && !var2 && !var3) return 'none';
    if ( var1 && !var2 && !var3) return 'var1';
    if (!var1 &&  var2 && !var3) return 'var2';
    if (!var1 && !var2 &&  var3) return 'var3';
    if ( var1 &&  var2 && !var3) return 'var1_var2';
    if ( var1 && !var2 &&  var3) return 'var1_var3';
    if (!var1 &&  var2 &&  var3) return 'var2_var3';
    return 'none';
  };

  const configKey = getLancelotConfigKey(v1, v2, v3);

  const PREVIEWS: Record<string, any> = {
    none: {
      title: t('app.lancelot.none.title'),
    },
    var1: {
      title: t('app.lancelot.var1.title'),
      preparacao: [t('app.lancelot.var1.prep0'), t('app.lancelot.var1.prep1'), t('app.lancelot.var1.prep2')],
      durante: [t('app.lancelot.var1.during0'), t('app.lancelot.var1.during1'), t('app.lancelot.var1.during2')],
      tendencia: t('app.lancelot.var1.tendency'),
      ideal: t('app.lancelot.var1.ideal')
    },
    var2: {
      title: t('app.lancelot.var2.title'),
      preparacao: [t('app.lancelot.var2.prep0'), t('app.lancelot.var2.prep1'), t('app.lancelot.var2.prep2')],
      durante: [t('app.lancelot.var2.during0'), t('app.lancelot.var2.during1'), t('app.lancelot.var2.during2')],
      tendencia: t('app.lancelot.var2.tendency'),
      ideal: t('app.lancelot.var2.ideal'),
      avisos: [t('app.lancelot.var2.warn0')]
    },
    var3: {
      title: t('app.lancelot.var3.title'),
      preparacao: [t('app.lancelot.var3.prep0'), t('app.lancelot.var3.prep1'), t('app.lancelot.var3.prep2')],
      durante: [t('app.lancelot.var3.during0'), t('app.lancelot.var3.during1')],
      tendencia: t('app.lancelot.var3.tendency'),
      ideal: t('app.lancelot.var3.ideal')
    },
    var1_var2: {
      title: t('app.lancelot.var1_var2.title'),
      preparacao: [t('app.lancelot.var1_var2.prep0'), t('app.lancelot.var1_var2.prep1'), t('app.lancelot.var1_var2.prep2')],
      durante: [t('app.lancelot.var1_var2.during0'), t('app.lancelot.var1_var2.during1'), t('app.lancelot.var1_var2.during2')],
      tendencia: t('app.lancelot.var1_var2.tendency'),
      ideal: t('app.lancelot.var1_var2.ideal')
    },
    var1_var3: {
      title: t('app.lancelot.var1_var3.title'),
      preparacao: [t('app.lancelot.var1_var3.prep0'), t('app.lancelot.var1_var3.prep1'), t('app.lancelot.var1_var3.prep2')],
      durante: [t('app.lancelot.var1_var3.during0'), t('app.lancelot.var1_var3.during1'), t('app.lancelot.var1_var3.during2')],
      tendencia: t('app.lancelot.var1_var3.tendency'),
      ideal: t('app.lancelot.var1_var3.ideal')
    },
    var2_var3: {
      title: t('app.lancelot.var2_var3.title'),
      preparacao: [t('app.lancelot.var2_var3.prep0'), t('app.lancelot.var2_var3.prep1'), t('app.lancelot.var2_var3.prep2')],
      durante: [t('app.lancelot.var2_var3.during0'), t('app.lancelot.var2_var3.during1'), t('app.lancelot.var2_var3.during2'), t('app.lancelot.var2_var3.during3')],
      tendencia: t('app.lancelot.var2_var3.tendency'),
      ideal: t('app.lancelot.var2_var3.ideal'),
      avisos: [t('app.lancelot.var2_var3.warn0')]
    }
  };

  const preview = PREVIEWS[configKey];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#0d1b2a]/95 border-2 border-[#ffd700] w-full h-full md:h-auto md:max-w-3xl md:rounded-3xl flex flex-col overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.2)]"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#ffd700]/30 flex justify-between items-center bg-[#1b263b]/50">
          <h2 className="text-2xl font-['Cinzel'] text-[#ffd700] flex items-center gap-3">
            <span className="text-3xl">🗡️</span> {t('app.lancelot.configureTitle')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <XCircle size={28} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto md:flex md:overflow-hidden">
          {/* Left: Selection */}
          <div className="p-6 space-y-4 md:w-[320px] md:border-r md:border-[#ffd700]/20 md:overflow-y-auto">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#ffd700]" /> {t('app.lancelot.selectVariants')}
            </h3>
            
            {[
              { id: 'v1', label: t('app.lancelot.variant1'), sub: t('app.lancelot.variant1Sub'), icon: '🎲', state: v1, setter: setV1 },
              { id: 'v2', label: t('app.lancelot.variant2'), sub: t('app.lancelot.variant2Sub'), icon: '📅', state: v2, setter: setV2 },
              { id: 'v3', label: t('app.lancelot.variant3'), sub: t('app.lancelot.variant3Sub'), icon: '👁️', state: v3, setter: setV3 },
            ].map((item) => {
              const disabled = !item.state && selectedCount >= 2;
              return (
                <button
                  key={item.id}
                  disabled={disabled}
                  onClick={() => item.setter(!item.state)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                    item.state 
                      ? 'border-[#ffd700] bg-[#ffd700]/10 shadow-[0_0_15px_rgba(255,215,0,0.1)]' 
                      : 'border-[#4a5f7f] bg-white/5'
                  } ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:border-[#ffd700]/50'}`}
                >
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    item.state ? 'bg-[#ffd700] border-[#ffd700]' : 'border-[#4a5f7f]'
                  }`}>
                    {item.state && <CheckCircle2 size={16} className="text-[#0d1b2a]" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item.icon}</span>
                      <span className={`font-bold text-sm ${item.state ? 'text-[#ffd700]' : 'text-white'}`}>{item.label}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Preview */}
          <div className="p-6 bg-[#1b263b]/30 flex-grow md:overflow-y-auto">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-6 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#ffd700]" /> {t('app.lancelot.previewCurrent')}
            </h3>

            {configKey === 'none' ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Info size={32} className="text-gray-600" />
                </div>
                <div className="space-y-2">
                  <p className="text-[#ffd700] font-bold uppercase tracking-widest">{t('app.lancelot.noVariantSelected')}</p>
                  <p className="text-sm text-gray-500 max-w-[240px] mx-auto">
                    {t('app.lancelot.noVariantHint')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h4 className="text-xl font-['Cinzel'] text-[#ffd700] text-center drop-shadow-[0_0_10px_rgba(255,215,0,0.2)]">
                  {preview.title}
                </h4>

                <div className="space-y-6">
                  <section className="space-y-3">
                    <h5 className="text-xs font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                      <span className="text-lg">⚙️</span> {t('app.lancelot.preparation')}
                    </h5>
                    <ul className="space-y-2 ml-2">
                      {preview.preparacao.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-[#e0e0e0] flex items-start gap-2">
                          <span className="text-[#ffd700] mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="space-y-3">
                    <h5 className="text-xs font-['Cinzel'] text-[#ffd700] flex items-center gap-2">
                      <span className="text-lg">🎮</span> {t('app.lancelot.duringGame')}
                    </h5>
                    <ul className="space-y-2 ml-2">
                      {preview.durante.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-[#e0e0e0] flex items-start gap-2">
                          <span className="text-[#ffd700] mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <div className="pt-6 border-t border-[#ffd700]/20 grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-[#b8860b]">{t('app.lancelot.tendency')}</p>
                      <p className="text-xs font-bold text-[#ffd700]">{preview.tendencia}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-[#b8860b]">{t('app.lancelot.idealFor')}</p>
                      <p className="text-xs font-bold text-[#ffd700]">{preview.ideal}</p>
                    </div>
                  </div>

                  {preview.avisos && (
                    <div className="p-4 bg-red-500/15 border-l-4 border-red-600 rounded-r-xl space-y-2">
                      <p className="text-xs font-bold text-red-400 flex items-center gap-2">
                        <span>⚠️</span> {t('app.lancelot.warnings')}
                      </p>
                      <ul className="space-y-1">
                        {preview.avisos.map((item: string, i: number) => (
                          <li key={i} className="text-xs text-red-200/80 flex items-start gap-2">
                            <span>⚠</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#ffd700]/30 flex gap-3 bg-[#1b263b]/50">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-white/20 text-gray-400 font-bold hover:bg-white/5 transition-all"
          >
            {t('app.lancelot.cancel')}
          </button>
          <button
            disabled={configKey === 'none'}
            onClick={() => onConfirm(configKey)}
            className="flex-[1.5] py-3 px-4 rounded-xl bg-[#ffd700] text-[#0d1b2a] font-bold hover:bg-[#ffed4a] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={20} /> {t('app.lancelot.confirm')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const LobbyView = ({ room, isHost, onLeave }: { room: Room; isHost: boolean; onLeave: () => void }) => {
  const { t } = useTranslation();
  const socket = useSocket();
  const { showSettings } = useSettings();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [lancelotConfigId, setLancelotConfigId] = useState<string>('none');
  const [ladyOfLakeEnabled, setLadyOfLakeEnabled] = useState(false);
  const [excaliburEnabled, setExcaliburEnabled] = useState(false);
  const [targetingEnabled, setTargetingEnabled] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLancelotModal, setShowLancelotModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showOptionalRules, setShowOptionalRules] = useState(false);

  useEffect(() => {
    const handleOpenManual = () => setShowManual(true);
    const handleOpenGuide = () => setShowGuide(true);
    window.addEventListener('open-manual', handleOpenManual);
    window.addEventListener('open-guide', handleOpenGuide);
    return () => {
      window.removeEventListener('open-manual', handleOpenManual);
      window.removeEventListener('open-guide', handleOpenGuide);
    };
  }, []);
  const playerCount = room.players.length;
  const distribution = TEAM_DISTRIBUTION[playerCount] || { good: 0, evil: 0 };

  const selectedGood = selectedRoles.filter(r => ROLES[r].team === 'good');
  const selectedEvil = selectedRoles.filter(r => ROLES[r].team === 'evil');

  const goodSlots = distribution.good;
  const evilSlots = distribution.evil;

  const canSelectGood = selectedGood.length < goodSlots - 1; // -1 for Merlin
  const canSelectEvil = selectedEvil.length < evilSlots - 1; // -1 for Assassin

  const toggleRole = (roleId: string) => {
    if (!isHost) return;
    
    let newRoles = [...selectedRoles];
    if (newRoles.includes(roleId)) {
      if (roleId === 'lancelot_good' || roleId === 'lancelot_evil') {
        newRoles = newRoles.filter(r => r !== 'lancelot_good' && r !== 'lancelot_evil');
        setLancelotConfigId('none');
      } else {
        newRoles = newRoles.filter(r => r !== roleId);
      }
    } else {
      if (roleId === 'lancelot_good' || roleId === 'lancelot_evil') {
        if (!canSelectGood || !canSelectEvil) {
          // Check if we can select both
          const canBoth = (selectedGood.length < goodSlots - 1) && (selectedEvil.length < evilSlots - 1);
          if (!canBoth) return;
        }
        newRoles.push('lancelot_good', 'lancelot_evil');
        setShowLancelotModal(true);
      } else {
        const role = ROLES[roleId];
        if (role.team === 'good' && !canSelectGood) return;
        if (role.team === 'evil' && !canSelectEvil) return;
        newRoles.push(roleId);
      }
    }
    setSelectedRoles(newRoles);
  };

  const handleStart = () => {
    if (playerCount < 5) return alert(t('app.minPlayers'));
    const lancelotConfig = lancelotConfigId === 'none' ? null : { id: lancelotConfigId, ...LANCELOT_CONFIGS[lancelotConfigId as keyof typeof LANCELOT_CONFIGS] };
    socket.emit('start-game', { 
      roomCode: room.code, 
      selectedRoles, 
      lancelotConfig,
      ladyOfLakeEnabled,
      excaliburEnabled,
      targetingEnabled
    });
  };

  const movePlayer = (index: number, direction: 'up' | 'down') => {
    const newPlayers = [...room.players];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newPlayers.length) return;
    
    [newPlayers[index], newPlayers[targetIndex]] = [newPlayers[targetIndex], newPlayers[index]];
    socket.emit('reorder-players', { roomCode: room.code, players: newPlayers });
  };

  const setFirstLeader = (playerId: string) => {
    socket.emit('set-first-leader', { roomCode: room.code, playerId: room.firstLeaderId === playerId ? null : playerId });
  };

  if (showHistory) {
    return <MatchHistoryView history={room.matchHistory} onBack={() => setShowHistory(false)} />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
      <LancelotModal 
        isOpen={showLancelotModal} 
        onClose={() => {
          setShowLancelotModal(false);
          // Se fechou sem confirmar e não tinha config, remove os lancelots
          if (lancelotConfigId === 'none') {
            setSelectedRoles(prev => prev.filter(r => r !== 'lancelot_good' && r !== 'lancelot_evil'));
          }
        }}
        onConfirm={(configKey) => {
          setLancelotConfigId(configKey);
          setShowLancelotModal(false);
        }}
        initialConfig={lancelotConfigId === 'none' ? null : lancelotConfigId}
      />
      <GameGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
      <div className="text-center space-y-2">
        <div className="flex justify-between items-center px-4">
          <div className="w-10"></div>
          <h2 className="text-sm uppercase tracking-widest text-gray-500 font-bold">{t('app.lobby.room')}</h2>
          {room.matchHistory.length > 0 ? (
            <button onClick={() => setShowHistory(true)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-[#ffd700]">
              <Info size={20} />
            </button>
          ) : <div className="w-10"></div>}
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-4">
            <span className="text-4xl font-mono font-bold text-[#ffd700]">{room.code}</span>
            <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10">
              <Copy size={20} />
            </button>
          </div>
          {isHost && (
            <div className="bg-white p-2 rounded-xl">
              <QRCodeSVG value={window.location.href} size={120} />
            </div>
          )}
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-['Cinzel'] text-xl text-[#ffd700]">{t('app.lobby.players', { count: playerCount })}</h3>
            {isHost && <p className="text-[10px] text-gray-500 uppercase tracking-widest">{t('app.lobby.setOrderHint')}</p>}
          </div>
          <Users size={20} className="text-gray-500" />
        </div>
        <div className="space-y-2">
          {room.players.map((p, index) => (
            <div key={p.id} className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5 group">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.id === room.hostId ? 'bg-[#ffd700]' : 'bg-green-500'}`}></div>
                <span className="truncate font-bold">
                  {p.name}
                  {p.id === socket.id && <span className="font-normal text-blue-300 ml-1">{t('app.me')}</span>}
                </span>
                {room.firstLeaderId === p.id && <Crown size={14} className="text-[#ffd700] flex-shrink-0" />}
              </div>
              
              {isHost && (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setFirstLeader(p.id)}
                    className={`p-1.5 rounded-lg transition-colors ${room.firstLeaderId === p.id ? 'bg-[#ffd700] text-[#0d1b2a]' : 'hover:bg-white/10 text-gray-500'}`}
                    title={t('app.lobby.setFirstLeaderTitle')}
                  >
                    <Crown size={16} />
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <button 
                      onClick={() => movePlayer(index, 'up')}
                      disabled={index === 0}
                      className="p-1 hover:bg-white/10 rounded disabled:opacity-20"
                    >
                      <SkipForward size={12} className="-rotate-90" />
                    </button>
                    <button 
                      onClick={() => movePlayer(index, 'down')}
                      disabled={index === room.players.length - 1}
                      className="p-1 hover:bg-white/10 rounded disabled:opacity-20"
                    >
                      <SkipForward size={12} className="rotate-90" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {isHost && playerCount >= 5 && (
        <div className="space-y-8">
          <div className="space-y-6">
            {/* Forças do Bem */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="font-['Cinzel'] text-lg text-[#3498db] flex items-center gap-2">
                  <Shield size={18} /> {t('app.lobby.forcesGood')} <span className="text-gray-500">{t('app.lobby.goodSlots', { count: goodSlots })}</span>
                </h3>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {/* Mandatory and Generic Good */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-[#3498db] bg-[#3498db]/10 shadow-[0_0_10px_rgba(52,152,219,0.1)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-white">🧙‍♂️ Merlin</span>
                        <span className="text-[8px] uppercase bg-[#ffd700] text-[#0d1b2a] px-1 rounded font-bold">{t('app.lobby.mandatory')}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-tight">{t('app.lobby.merlinHint')}</p>
                    </div>
                  </div>
                  
                  {/* Servos de Arthur */}
                  <div className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                    (goodSlots - 1 - selectedGood.length) > 0 
                      ? 'border-[#3498db] bg-[#3498db]/10 shadow-[0_0_10px_rgba(52,152,219,0.1)]' 
                      : 'border-white/10 bg-white/5 opacity-60 grayscale'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-white">
                          🛡️ <span className={(goodSlots - 1 - selectedGood.length) > 0 ? 'text-[#ffd700]' : ''}>{goodSlots - 1 - selectedGood.length}</span> {goodSlots - 1 - selectedGood.length === 1 ? t('app.lobby.servantOne') : t('app.lobby.servantMany')} de Arthur
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-tight">{t('app.lobby.fillsRemaining')}</p>
                    </div>
                  </div>
                </div>

                {/* Optional Good */}
                <div className="grid grid-cols-2 gap-3">
                  {['percival', 'lancelot_good'].map(roleId => {
                    const isSelected = selectedRoles.includes(roleId);
                    const disabled = !isSelected && !canSelectGood;
                    return (
                      <div
                        key={roleId}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        onClick={() => !disabled && toggleRole(roleId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            !disabled && toggleRole(roleId);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-1 cursor-pointer ${
                          isSelected 
                            ? 'border-[#3498db] bg-[#3498db]/10 shadow-[0_0_10px_rgba(52,152,219,0.1)]' 
                            : 'border-white/10 bg-white/5 opacity-60'
                        } ${disabled ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{ROLES[roleId].icon}</span>
                            <span className="font-bold text-sm">{getRoleInfo(roleId, t).name}</span>
                          </div>
                          {roleId === 'lancelot_good' && isSelected && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowLancelotModal(true); }}
                              className="p-1 hover:bg-white/10 rounded text-[#ffd700]"
                            >
                              <Sword size={12} />
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] text-gray-400 leading-tight h-6 overflow-hidden">{getRoleInfo(roleId, t).description}</p>
                        {roleId === 'lancelot_good' && isSelected && (
                          <div className="mt-1 text-[8px] text-[#ffd700] font-bold uppercase tracking-tighter flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-[#ffd700]" />
                            {lancelotConfigId === 'none' ? t('app.lobby.configure') : lancelotConfigId.toUpperCase().replace('_', ' + ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Forças do Mal */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="font-['Cinzel'] text-lg text-[#c0392b] flex items-center gap-2">
                  <Skull size={18} /> {t('app.lobby.forcesBad')} <span className="text-gray-500">{t('app.lobby.badSlots', { count: evilSlots })}</span>
                </h3>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {/* Mandatory and Generic Evil */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-red-500/50 bg-red-500/5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">💀 {t('roles.assassin.name')}</span>
                        <span className="text-[8px] uppercase bg-[#ffd700] text-[#0d1b2a] px-1 rounded font-bold">{t('app.lobby.mandatory')}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-tight">{t('app.lobby.assassinHint')}</p>
                    </div>
                  </div>
                  
                  {/* Minions de Mordred */}
                  <div className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                    (evilSlots - 1 - selectedEvil.length) > 0 
                      ? 'border-[#c0392b] bg-[#c0392b]/10 shadow-[0_0_10px_rgba(192,57,43,0.1)]' 
                      : 'border-white/10 bg-white/5 opacity-60 grayscale'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-white">
                          🗡️ <span className={(evilSlots - 1 - selectedEvil.length) > 0 ? 'text-[#ffd700]' : ''}>{evilSlots - 1 - selectedEvil.length}</span> {evilSlots - 1 - selectedEvil.length === 1 ? t('app.lobby.minionOne') : t('app.lobby.minionMany')} de Mordred
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-tight">{t('app.lobby.fillsRemaining')}</p>
                    </div>
                  </div>
                </div>

                {/* Optional Evil */}
                <div className="grid grid-cols-2 gap-3">
                  {['morgana', 'mordred', 'oberon', 'lancelot_evil'].map(roleId => {
                    const isSelected = selectedRoles.includes(roleId);
                    const disabled = !isSelected && !canSelectEvil;
                    return (
                      <div
                        key={roleId}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        onClick={() => !disabled && toggleRole(roleId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            !disabled && toggleRole(roleId);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-1 cursor-pointer ${
                          isSelected 
                            ? 'border-red-500 bg-red-500/10' 
                            : 'border-white/10 bg-white/5 opacity-60'
                        } ${disabled ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{ROLES[roleId].icon}</span>
                            <span className="font-bold text-sm">{getRoleInfo(roleId, t).name}</span>
                          </div>
                          {roleId === 'lancelot_evil' && isSelected && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowLancelotModal(true); }}
                              className="p-1 hover:bg-white/10 rounded text-[#ffd700]"
                            >
                              <Sword size={12} />
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] text-gray-400 leading-tight h-6 overflow-hidden">{getRoleInfo(roleId, t).description}</p>
                        {roleId === 'lancelot_evil' && isSelected && (
                          <div className="mt-1 text-[8px] text-[#ffd700] font-bold uppercase tracking-tighter flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-[#ffd700]" />
                            {lancelotConfigId === 'none' ? t('app.lobby.configure') : lancelotConfigId.toUpperCase().replace('_', ' + ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Regras Opcionais */}
            <div className="space-y-2">
              <button 
                onClick={() => setShowOptionalRules(!showOptionalRules)}
                className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group"
              >
                <h3 className="text-xs uppercase tracking-widest text-gray-500 font-bold ml-2 group-hover:text-gray-300 transition-colors">{t('app.lobby.optionalRules')}</h3>
                <div className="flex items-center gap-2">
                  {!showOptionalRules && (ladyOfLakeEnabled || excaliburEnabled || targetingEnabled) && (
                    <span className="text-[10px] bg-[#ffd700]/20 text-[#ffd700] px-2 py-0.5 rounded-full font-bold">
                      {t('app.lobby.activeCount', { count: (ladyOfLakeEnabled ? 1 : 0) + (excaliburEnabled ? 1 : 0) + (targetingEnabled ? 1 : 0) })}
                    </span>
                  )}
                  {showOptionalRules ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                </div>
              </button>
              
              <AnimatePresence>
                {showOptionalRules && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-3 px-2 pb-2"
                  >
                    {/* Lady of the Lake */}
                    <button 
                      onClick={() => setLadyOfLakeEnabled(!ladyOfLakeEnabled)}
                      className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                        ladyOfLakeEnabled ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${ladyOfLakeEnabled ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                        <Droplets size={24} />
                      </div>
                      <div className="text-left flex-1">
                        <span className="font-['Cinzel'] font-bold text-sm block">{t('app.lobby.ladyOfLake')}</span>
                        <p className="text-[10px] text-gray-400">{t('app.lobby.ladyOfLakeDesc')}</p>
                      </div>
                      {ladyOfLakeEnabled && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                    </button>

                    {/* Excalibur */}
                    <button 
                      onClick={() => setExcaliburEnabled(!excaliburEnabled)}
                      className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                        excaliburEnabled ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${excaliburEnabled ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                        <Sword size={24} />
                      </div>
                      <div className="text-left flex-1">
                        <span className="font-['Cinzel'] font-bold text-sm block">{t('app.lobby.excalibur')}</span>
                        <p className="text-[10px] text-gray-400">{t('app.lobby.excaliburDesc')}</p>
                      </div>
                      {excaliburEnabled && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                    </button>

                    {/* Targeting (Missão Alvo) */}
                    <button 
                      onClick={() => setTargetingEnabled(!targetingEnabled)}
                      className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                        targetingEnabled ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${targetingEnabled ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                        <Target size={24} />
                      </div>
                      <div className="text-left flex-1">
                        <span className="font-['Cinzel'] font-bold text-sm block">{t('app.lobby.targetMission')}</span>
                        <p className="text-[10px] text-gray-400">{t('app.lobby.targetMissionDesc')}</p>
                      </div>
                      {targetingEnabled && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <Button onClick={handleStart} className="shadow-[0_0_20px_rgba(255,215,0,0.2)]">
            {t('app.lobby.sortCharacters')}
          </Button>
        </div>
      )}

      {(playerCount < 5 || !isHost) && (
        <div className="text-center p-8 border-2 border-dashed border-white/10 rounded-2xl">
          <p className="text-gray-400 italic">
            {playerCount < 5
              ? t('app.lobby.waitingPlayers')
              : t('app.lobby.waitingHost')}
          </p>
        </div>
      )}

      <button
        onClick={onLeave}
        className="w-full py-3 px-4 rounded-xl border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-400/30 transition-all flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest"
      >
        <LogOut size={16} />
        {t('app.leaveRoom')}
      </button>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col sm:flex-row gap-3">
        <button 
          onClick={() => setShowManual(true)}
          className="p-4 rounded-full bg-[#0d1b2a]/80 backdrop-blur-md border border-[#ffd700] text-[#ffd700] shadow-[0_0_15px_rgba(255,215,0,0.2)] hover:scale-110 transition-all flex items-center gap-2 font-bold text-sm font-['Cinzel']"
        >
          <Book size={20} />
          <span className="hidden sm:inline">{t('app.lobby.manual')}</span>
        </button>

        <button 
          onClick={() => setShowGuide(true)}
          className="p-4 rounded-full bg-[#0d1b2a]/80 backdrop-blur-md border border-[#ffd700] text-[#ffd700] shadow-[0_0_15px_rgba(255,215,0,0.2)] hover:scale-110 transition-all flex items-center gap-2 font-bold text-sm font-['Cinzel']"
        >
          <MapPinned size={20} />
          <span className="hidden sm:inline">{t('app.lobby.guide')}</span>
        </button>
      </div>

      <GameGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
      <GameManual isOpen={showManual} onClose={() => setShowManual(false)} />
    </motion.div>
  );
};

const CharacterRevealView = ({ room, me }: { room: Room; me?: Player }) => {
  const { t } = useTranslation();
  const socket = useSocket();
  const [revealed, setRevealed] = useState(false);
  const role = me?.role ? ROLES[me.role] : null;

  if (!role) return null;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8 text-center">
      <h2 className="text-3xl font-['Cinzel'] text-[#ffd700]">{t('app.character.yourDestiny')}</h2>
      
      <Card className="relative overflow-hidden py-12 space-y-6">
        <div className={`space-y-6 transition-all duration-500 ${revealed ? 'blur-0' : 'blur-xl opacity-20'}`}>
          <div className="text-8xl">{role.icon}</div>
          <div className="space-y-2">
            <Badge team={role.team}>{role.team === 'good' ? t('app.character.loyalServant') : t('app.character.mordredServant')}</Badge>
            <h3 className="text-4xl font-['Cinzel'] font-bold">{me?.role ? getRoleInfo(me.role, t).name : ''}</h3>
          </div>
          <p className="text-gray-300 px-4">{me?.role ? getRoleInfo(me.role, t).description : ''}</p>
        </div>

        {!revealed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <Button onClick={() => setRevealed(true)} className="w-auto shadow-2xl">{t('app.character.reveal')}</Button>
          </div>
        )}
      </Card>

      {revealed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <p className="text-sm text-gray-400 italic">{t('app.character.memorize')}</p>
          <Button variant={me?.isConfirmed ? 'secondary' : 'primary'} onClick={() => socket.emit('confirm-character', { roomCode: room.code })}>
            {me?.isConfirmed ? t('app.character.waiting') : t('app.character.confirm')}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
};

const NarrationView = ({ room, isHost }: { room: Room; isHost: boolean }) => {
  const { t } = useTranslation();
  const socket = useSocket();
  const { settings, showSettings } = useSettings();
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (showSettings) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPaused(true);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    }
  }, [showSettings]);

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
  
  const narrationTexts: Record<string, string> = {
    '1': t('narration.1'),
    '2': t('narration.2'),
    '3': t('narration.3'),
    '3-lancelot': t('narration.3-lancelot'),
    '4': t('narration.4'),
    '4-oberon': t('narration.4-oberon'),
    '4-lancelot': t('narration.4-lancelot'),
    '4-oberon-lancelot': t('narration.4-oberon-lancelot'),
    '5': t('narration.5'),
    '5-mordred': t('narration.5-mordred'),
    '5-lancelot': t('narration.5-lancelot'),
    '5-mordred-lancelot': t('narration.5-mordred-lancelot'),
    '6': t('narration.6'),
    '7': t('narration.7'),
    '8': t('narration.8'),
    '8-morgana': t('narration.8-morgana'),
    '9': t('narration.9'),
    '9-morgana': t('narration.9-morgana'),
    '10': t('narration.10'),
    '11': t('narration.11'),
    '12': t('narration.12'),
    '13': t('narration.13'),
    '14': t('narration.14'),
  };

  const playStep = (index: number) => {
    if (index >= sequence.length) {
      if (isHost) {
        socket.emit('narration-ended', { roomCode: room.code });
      }
      return;
    }

    setStep(index);
    const audioFile = sequence[index];
    const audio = new Audio(`/src/assets/audios/${audioFile}.mp3`);
    audio.volume = settings.narrationVolume;
    audioRef.current = audio;

    audio.onended = () => {
      if (shouldPauseAfter(audioFile)) {
        timerRef.current = setTimeout(() => {
          playStep(index + 1);
        }, settings.pauseDuration * 1000);
      } else {
        playStep(index + 1);
      }
    };

    audio.play().catch(e => console.error("Erro ao tocar áudio:", e));
  };

  const togglePlay = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      playStep(step);
    } else {
      if (isPaused) {
        audioRef.current?.play();
        setIsPaused(false);
      } else {
        audioRef.current?.pause();
        setIsPaused(true);
      }
    }
  };

  const restart = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setStep(0);
    setIsPlaying(false);
    setIsPaused(false);
  };

  const skip = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (step + 1 < sequence.length) {
      playStep(step + 1);
    } else {
      if (isHost) {
        socket.emit('narration-ended', { roomCode: room.code });
      }
    }
  };

  const skipAll = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (isHost) {
      socket.emit('narration-ended', { roomCode: room.code });
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 text-center py-12">
      <div className="space-y-4">
        <div className="text-8xl animate-pulse">🌙</div>
        <h2 className="text-4xl font-['Cinzel'] text-[#ffd700]">{t('app.narrationView.nightFalls')}</h2>
      </div>

      <Card className="py-12">
        {isHost ? (
          <div className="space-y-8">
            <p className="text-2xl font-bold italic">"{narrationTexts[sequence[step]] || '...'}"</p>
            <div className="flex flex-col gap-6 items-center">
              <div className="flex justify-center gap-4">
                <Button variant="secondary" onClick={restart} className="w-auto px-4"><RotateCcw size={20} /></Button>
                <Button onClick={togglePlay} className="w-auto px-8">
                  {!isPlaying ? t('app.narrationView.startNarration') : (isPaused ? <Play /> : <Pause />)}
                </Button>
                <Button variant="secondary" onClick={skip} className="w-auto px-4" disabled={!isPlaying}><SkipForward size={20} /></Button>
              </div>
              
              {!isPlaying && (
                <button 
                  onClick={skipAll}
                  className="text-gray-500 hover:text-white text-[10px] uppercase tracking-[0.2em] font-black transition-colors flex items-center gap-2"
                >
                  <VolumeX size={14} />
                  {t('app.narrationView.skipFullNarration')}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t('app.narrationView.step', { current: step + 1, total: sequence.length })}</p>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <Volume2 size={16} />
              <span>{isPlaying ? t('app.narrationView.playing', { file: sequence[step] }) : t('app.narrationView.readyToStart')}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xl text-gray-300">{t('app.narrationView.followAudioHost')}</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2, delay: i * 0.4 }}
                  className="w-3 h-3 bg-[#ffd700] rounded-full"
                />
              ))}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
};

const KnowledgeSection = ({ room, me }: { room: Room; me: Player }) => {
  const { t } = useTranslation();
  const role = ROLES[me.role!];
  if (!role) return null;

  const knowledge: { name: string; info: string; icon: string; team?: Team; isMerlin?: boolean }[] = [];

  // 1. Lancelots (Var 3)
  const isVar3 = room.lancelotConfig?.variant?.includes('var3');
  if (isVar3 && me.role?.includes('lancelot')) {
    const otherLancelot = room.players.find(p => p.role?.includes('lancelot') && p.id !== me.id);
    if (otherLancelot) {
      const otherRole = ROLES[otherLancelot.role!];
      knowledge.push({
        name: otherLancelot.name,
        info: t('app.game.lancelotLabel'),
        icon: '⚔️',
        team: otherRole.team
      });
    }
  }

  // 2. Evil Team (except Oberon)
  const isEvil = role.team === 'evil';
  const isOberon = me.role === 'oberon';
  const isLancelotEvil = me.role === 'lancelot_evil';

  if (isEvil && !isOberon && !isLancelotEvil) {
    const otherEvil = room.players.filter(p => {
      if (p.id === me.id) return false;
      const otherRole = ROLES[p.role!];
      return otherRole.team === 'evil' && p.role !== 'oberon';
    });
    otherEvil.forEach(p => {
      knowledge.push({
        name: p.name,
        info: t('app.game.mal'),
        icon: '🗡️',
        team: 'evil'
      });
    });
  }

  // 3. Merlin
  if (me.role === 'merlin') {
    const evilPlayers = room.players.filter(p => {
      if (p.id === me.id) return false;
      const otherRole = ROLES[p.role!];
      // Merlin sees all evil except Mordred
      return otherRole.team === 'evil' && p.role !== 'mordred';
    });
    evilPlayers.forEach(p => {
      knowledge.push({
        name: p.name,
        info: t('app.game.mal'),
        icon: '💀',
        team: 'evil'
      });
    });
  }

  // 4. Percival
  if (me.role === 'percival') {
    const merlinOrMorgana = room.players.filter(p => {
      return p.role === 'merlin' || p.role === 'morgana';
    });
    merlinOrMorgana.forEach(p => {
      knowledge.push({
        name: p.name,
        info: t('app.game.merlinMaybe'),
        icon: '🧙‍♂️',
        isMerlin: true
      });
    });
  }

  if (knowledge.length === 0) return null;

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{t('app.game.acquiredKnowledge')}</h3>
      <div className="grid grid-cols-1 gap-2">
        {knowledge.map((k, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-black/20 rounded-lg border border-white/5">
            <div className="flex items-center gap-3">
              <span className="text-xl">{k.icon}</span>
              <p className="text-xs font-bold text-white">{k.name}</p>
            </div>
            <div className="flex gap-1 items-center">
              {k.isMerlin ? (
                <Badge variant="purple">{t('app.game.merlinMaybe')}</Badge>
              ) : (
                <>
                  {k.info === t('app.game.lancelotLabel') && <span className="text-[10px] text-gray-400 font-bold mr-1">{t('app.game.lancelotLabel')}</span>}
                  <Badge team={k.team}>{k.team === 'good' ? t('app.game.good') : t('app.game.evil')}</Badge>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const GameView = ({ room, me, isHost, onLeave }: { room: Room; me?: Player; isHost: boolean; onLeave: () => void }) => {
  const { t } = useTranslation();
  const socket = useSocket();
  const { showSettings } = useSettings();
  const playerId = sessionStorage.getItem('avalon_player_id');
  const currentMission = room.missions[room.currentMissionIndex];
  const leader = room.players[room.currentLeaderIndex];
  const isLeader = playerId === leader.id;
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [targetMissionIndex, setTargetMissionIndex] = useState<number | null>(null);
  const [ladyResult, setLadyResult] = useState<{ targetName: string; loyalty: 'good' | 'evil' } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  const isLancelot = me?.role?.includes('lancelot');
  const currentTeam = (me?.role && room.lancelotLoyalty && isLancelot)
    ? (me.role === 'lancelot_good' ? room.lancelotLoyalty.lancelotGoodTeam : room.lancelotLoyalty.lancelotEvilTeam)
    : (me?.role ? ROLES[me.role].team : 'good');

  useEffect(() => {
    setShowSecrets(false);
  }, [room.phase, room.currentMissionIndex, room.currentLeaderIndex]);

  useEffect(() => {
    const handleLadyResult = ({ holderPlayerId, targetPlayerId, loyalty }: any) => {
      if (holderPlayerId === playerId) {
        const target = room.players.find(p => p.id === targetPlayerId);
        if (target) {
          setLadyResult({ targetName: target.name, loyalty });
        }
      }
    };

    socket.on('lady-result', handleLadyResult);
    return () => {
      socket.off('lady-result', handleLadyResult);
    };
  }, [socket, playerId, room.players]);

  useEffect(() => {
    if (room.phase === 'team-proposal') {
      setSelectedTeam([]);
      setTargetMissionIndex(null);
      setLadyResult(null);
    }
  }, [room.phase, room.currentLeaderIndex]);

  const formatName = (p: Player, showCrown = true) => (
    <span className="inline-flex items-center gap-1">
      <span className={!p.socketId ? 'opacity-40 grayscale' : ''}>
        {p.name}
        {p.id === playerId && <span className="font-normal text-blue-300 ml-1">{t('app.me')}</span>}
        {!p.socketId && <span className="text-[8px] ml-1 text-red-400 uppercase font-bold">{t('app.offline')}</span>}
      </span>
      {showCrown && p.id === leader.id && <Crown size={14} className="text-[#ffd700] shrink-0" />}
    </span>
  );

  const handlePropose = () => {
    const missionIndex = room.targetingEnabled ? targetMissionIndex : room.currentMissionIndex;
    if (missionIndex === null) return alert(t('app.selectMission'));
    const missionSize = room.missions[missionIndex].size;
    if (selectedTeam.length !== missionSize) return alert(t('app.selectExactPlayers', { count: missionSize }));
    socket.emit('propose-team', { roomCode: room.code, teamPlayerIds: selectedTeam, targetMissionIndex: missionIndex });
  };

  const handleVoteTeam = (vote: 'approve' | 'reject') => {
    socket.emit('vote-team', { roomCode: room.code, vote });
  };

  const handleVoteMission = (vote: 'success' | 'fail') => {
    socket.emit('vote-mission', { roomCode: room.code, vote });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header Info */}
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs uppercase tracking-widest text-gray-500 font-bold">{t('app.game.currentMission')}</h2>
            <button 
              onClick={onLeave}
              className="p-1 text-gray-600 hover:text-red-400 transition-colors"
              title={t('app.leaveRoom')}
            >
              <LogOut size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            {room.missions.map((m, i) => (
              <div 
                key={i} 
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 ${
                  m.status === 'success' ? 'bg-blue-600 border-blue-400' :
                  m.status === 'fail' ? 'bg-red-600 border-red-400' :
                  i === room.currentMissionIndex ? 'bg-[#ffd700] text-[#0d1b2a] border-white' :
                  'bg-white/5 border-white/10 text-gray-500'
                }`}
              >
                {m.size}{needsTwoFails(i, room.players.length) ? '*' : ''}
              </div>
            ))}
          </div>
        </div>
        <div className="text-right space-y-1">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 font-bold">{t('app.game.rejections')}</h2>
          <div className="flex gap-1 justify-end">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`w-3 h-3 rounded-full ${i <= room.rejectionCount ? 'bg-red-500' : 'bg-white/10'}`}></div>
            ))}
          </div>
        </div>
      </div>

      {/* Lancelot Loyalty Deck */}
      {room.lancelotConfig && room.lancelotConfig.variant !== 'var3' && room.phase !== 'game-over' && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-purple-400" />
              <h3 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold">{t('app.game.loyaltyDeck')}</h3>
            </div>
            <span className="text-[9px] text-gray-500 font-mono">
              {room.lancelotConfig.variant.toUpperCase()} • INÍCIO: R{room.lancelotConfig.startsAt}
            </span>
          </div>
          <div className="flex gap-2 justify-center">
            {room.loyaltyDeckVisible.map((card, i) => {
              const isActive = i === room.loyaltyDeckIndex - 1;
              return (
                <div 
                  key={i}
                  className={`w-12 h-16 rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-500 ${
                    card === 'hidden' 
                      ? 'bg-gray-800 border-gray-700' 
                      : card === 'switch' 
                        ? 'bg-orange-600 border-orange-400' 
                        : 'bg-gray-700/50 border-gray-600/50'
                  } ${isActive 
                    ? 'scale-110 z-10 shadow-[0_0_20px_rgba(168,85,247,0.8)] border-purple-400 ring-2 ring-purple-400/50' 
                    : 'opacity-40 grayscale-[0.3]'
                  }`}
                >
                  {card === 'hidden' ? (
                    <span className="text-gray-600 font-black text-xl">?</span>
                  ) : (
                    <>
                      <span className={`text-[8px] font-bold mb-0.5 ${isActive ? 'text-white' : 'text-white/30'}`}>R{room.lancelotConfig!.startsAt + i}</span>
                      {card === 'switch' ? (
                        <RefreshCw size={14} className={`${isActive ? 'text-white' : 'text-white/40'} mb-1`} />
                      ) : (
                        <Equal size={14} className={`${isActive ? 'text-white' : 'text-white/20'} mb-1`} />
                      )}
                      <span className={`text-[9px] font-black text-center px-1 leading-tight ${isActive ? 'text-white' : 'text-white/30'}`}>
                        {card === 'switch' ? t('app.game.cardSwitch') : t('app.game.cardSame')}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <Card className="space-y-6">
        {ladyResult && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-center space-y-2">
            <h4 className="text-xs uppercase tracking-widest text-[#ffd700] font-bold">{t('app.game.investigationResult')}</h4>
            <p className="text-sm" dangerouslySetInnerHTML={{ __html: t('app.game.investigationIs', { name: ladyResult.targetName }) }} />
            <Badge team={ladyResult.loyalty}>{ladyResult.loyalty === 'good' ? t('app.game.loyal') : t('app.game.disloyal')}</Badge>
          </div>
        )}

        {room.lancelotLoyalty?.swapOccurred && room.phase !== 'game-over' && (
          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl text-center animate-pulse">
            <p className="text-xs uppercase tracking-widest text-purple-400 font-bold">{t('app.game.loyaltySwapAlert')}</p>
            <p className="text-[10px] text-gray-400">{t('app.game.loyaltySwapDesc')}</p>
          </div>
        )}

        {room.phase === 'team-proposal' && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <Crown className="mx-auto text-[#ffd700]" size={32} />
              <h3 className="text-2xl font-['Cinzel'] flex items-center justify-center gap-2">
                {isLeader ? t('app.game.leaderRound') : <>{formatName(leader, false)} {t('app.game.leaderRoundOther', { name: '' }).trimStart()}</>}
              </h3>
              <p className="text-gray-400">
                {isLeader
                  ? t('app.game.chooseTeam', { count: currentMission.size })
                  : t('app.game.waitingTeam')}
              </p>
            </div>

            {isLeader ? (
              <div className="space-y-4">
                {room.targetingEnabled && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">{t('app.game.selectMissionLabel')}</p>
                    <div className="flex justify-center gap-2">
                      {room.missions.map((m, i) => {
                        const isAttempted = room.attemptedMissions.includes(i);
                        const isSelected = targetMissionIndex === i;
                        return (
                          <button
                            key={i}
                            disabled={isAttempted}
                            onClick={() => setTargetMissionIndex(i)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-all ${
                              isAttempted ? 'bg-gray-800 border-gray-700 text-gray-600 opacity-40' :
                              isSelected ? 'bg-[#ffd700] text-[#0d1b2a] border-white scale-110' :
                              'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                            }`}
                          >
                            {m.size}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {room.players.map(p => {
                    const missionIndex = room.targetingEnabled ? targetMissionIndex : room.currentMissionIndex;
                    const missionSize = missionIndex !== null ? room.missions[missionIndex].size : 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedTeam(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : prev.length < missionSize ? [...prev, p.id] : prev)}
                        className={`p-3 rounded-xl border-2 transition-all font-bold ${
                          selectedTeam.includes(p.id) ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-white/5'
                        }`}
                      >
                        {formatName(p)}
                      </button>
                    );
                  })}
                </div>
                <Button onClick={handlePropose} disabled={selectedTeam.length === 0 || (room.targetingEnabled && targetMissionIndex === null)}>{t('app.game.confirmTeam')}</Button>

                {room.excaliburEnabled && !room.excaliburUsed && (
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">{t('app.game.excaliburAssign')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {room.players.filter(p => p.id !== playerId).map(p => (
                        <button
                          key={p.id}
                          onClick={() => socket.emit('assign-excalibur', { roomCode: room.code, targetPlayerId: p.id })}
                          className={`p-2 rounded-lg border transition-all text-xs font-bold ${
                            room.excaliburHolder === p.id ? 'border-[#ffd700] bg-[#ffd700]/10 text-[#ffd700]' : 'border-white/10 bg-white/5 text-gray-400'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-500 italic">{t('app.game.excaliburHint')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 animate-pulse text-gray-500 italic">{t('app.game.waitingFormation')}</div>
            )}
          </div>
        )}

        {room.phase === 'team-voting' && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className="text-2xl font-['Cinzel']">{t('app.game.teamVote')}</h3>
              <div className="flex flex-wrap justify-center gap-2">
                {room.proposedTeam.map(id => (
                  <span key={id} className="bg-[#ffd700]/20 text-[#ffd700] px-3 py-1 rounded-full text-sm font-bold">
                    {room.players.find(p => p.id === id) ? formatName(room.players.find(p => p.id === id)!) : ''}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {room.teamVotes[playerId || ''] ? (
                <div className="py-8 space-y-4">
                  <p className="text-gray-400 italic">{t('app.game.youVoted')}</p>
                  <p className="text-sm text-gray-500">{t('app.game.waitingPlayers', { voted: Object.keys(room.teamVotes).length, total: room.players.length })}</p>
                </div>
              ) : (
                <div className="flex gap-4">
                  <Button variant="danger" onClick={() => handleVoteTeam('reject')} className="flex-1">{t('app.game.reject')}</Button>
                  <Button onClick={() => handleVoteTeam('approve')} className="flex-1">{t('app.game.approve')}</Button>
                </div>
              )}

              {isHost && Object.keys(room.teamVotes).length === room.players.length && (
                <div className="py-4 animate-pulse text-[#ffd700] italic">{t('app.game.revealingVotes')}</div>
              )}
            </div>
          </div>
        )}

        {room.phase === 'mission-voting' && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className="text-2xl font-['Cinzel']">{t('app.game.onMission')}</h3>
              <p className="text-xs text-gray-500 uppercase tracking-widest">{t('app.game.missionTeamVotes')}</p>
              <div className="flex flex-wrap justify-center gap-1 max-w-xs mx-auto">
                {room.players.map(p => (
                  <div key={p.id} className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1 ${
                    room.lastTeamVoteResult?.votes[p.id] === 'approve' 
                      ? 'bg-green-500/10 border-green-500/30 text-green-500' 
                      : 'bg-red-500/10 border-red-500/30 text-red-500'
                  }`}>
                    {formatName(p)}: {room.lastTeamVoteResult?.votes[p.id] === 'approve' ? t('app.game.yes') : t('app.game.no')}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {room.proposedTeam.includes(playerId || '') ? (
                room.missionVotes[playerId || ''] ? (
                  <div className="py-8 space-y-4">
                    <p className="text-gray-400 italic">{t('app.game.youActed')}</p>
                    <p className="text-sm text-gray-500">{t('app.game.waitingTeamVotes', { voted: Object.keys(room.missionVotes).length, total: room.proposedTeam.length })}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-400">{t('app.game.chooseMissionFate')}</p>
                    <div className="flex gap-4">
                      {(!isLancelot || !room.lancelotConfig?.mandatory || currentTeam === 'good') && (
                        <Button onClick={() => handleVoteMission('success')} className="flex-1 bg-blue-600 hover:bg-blue-500">{t('app.game.success')}</Button>
                      )}
                      {currentTeam === 'evil' && (
                        <Button variant="danger" onClick={() => handleVoteMission('fail')} className="flex-1">{t('app.game.fail')}</Button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="py-8 space-y-4">
                  <p className="text-gray-400 italic">{t('app.game.teamOnMission')}</p>
                  <p className="text-sm text-gray-500">{t('app.game.waitingResults', { voted: Object.keys(room.missionVotes).length, total: room.proposedTeam.length })}</p>
                </div>
              )}

              {isHost && Object.keys(room.missionVotes).length === room.proposedTeam.length && (
                <div className="py-4 animate-pulse text-[#ffd700] italic">{t('app.game.revealingResult')}</div>
              )}
            </div>
          </div>
        )}

        {room.phase === 'team-result' && room.lastTeamVoteResult && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className={`text-4xl font-['Cinzel'] ${room.lastTeamVoteResult.passed ? 'text-green-500' : 'text-red-500'}`}>
                {room.lastTeamVoteResult.passed ? t('app.game.teamApproved') : t('app.game.teamRejected')}
              </h3>
              <p className="text-gray-400">{t('app.game.individualVotes')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              {room.players.map(p => (
                <div key={p.id} className="flex flex-col items-center p-4 bg-white/5 rounded-2xl border border-white/10 shadow-lg">
                  <span className="font-bold text-lg mb-2 truncate w-full">{formatName(p)}</span>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter ${
                    room.lastTeamVoteResult?.votes[p.id] === 'approve' 
                      ? 'bg-green-500/20 text-green-500 border border-green-500/30' 
                      : 'bg-red-500/20 text-red-500 border border-red-500/30'
                  }`}>
                    {room.lastTeamVoteResult?.votes[p.id] === 'approve' ? (
                      <><CheckCircle2 size={14} /> {t('app.game.approved')}</>
                    ) : (
                      <><XCircle size={14} /> {t('app.game.rejected')}</>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isHost && (
              <Button onClick={() => socket.emit('continue-game', { roomCode: room.code })}>{t('app.game.continue')}</Button>
            )}
          </div>
        )}

        {room.phase === 'excalibur-usage' && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className="text-2xl font-['Cinzel'] text-[#ffd700]">{t('app.game.excaliburTitle')}</h3>
              <p className="text-gray-400">
                {room.excaliburHolder === playerId
                  ? t('app.game.excaliburYouHave')
                  : t('app.game.excaliburOtherDeciding', { name: room.players.find(p => p.id === room.excaliburHolder)?.name })}
              </p>
            </div>

            {room.excaliburHolder === playerId ? (
              <div className="space-y-4">
                <p className="text-sm font-bold">{t('app.game.excaliburChoosePlayer')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {room.proposedTeam.map(id => (
                    <Button 
                      variant="outline" 
                      onClick={() => socket.emit('use-excalibur', { roomCode: room.code, targetPlayerId: id })}
                    >
                      {room.players.find(p => p.id === id)?.name}
                    </Button>
                  ))}
                </div>
                <Button variant="secondary" onClick={() => socket.emit('skip-excalibur', { roomCode: room.code })}>{t('app.game.skipUse')}</Button>
              </div>
            ) : (
              <div className="py-8 animate-pulse text-[#ffd700] italic">{t('app.game.waitingExcalibur')}</div>
            )}
          </div>
        )}

        {room.phase === 'mission-result' && room.lastMissionVoteResult && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className={`text-3xl font-['Cinzel'] ${room.lastMissionVoteResult.passed ? 'text-blue-500' : 'text-red-500'}`}>
                {room.lastMissionVoteResult.passed ? t('app.game.missionSucceeded') : t('app.game.missionFailed')}
              </h3>
              <p className="text-gray-400">{t('app.game.anonymousVotes')}</p>
            </div>

            {room.excaliburUsed && room.excaliburTarget && (
              <div className="p-3 bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-xl max-w-xs mx-auto space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-[#ffd700] font-bold">{t('app.game.excaliburUsed')}</p>
                <p className="text-xs" dangerouslySetInnerHTML={{ __html: t('app.game.excaliburRevealVote', { name: room.players.find(p => p.id === room.excaliburTarget)?.name }) }} />
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">{room.excaliburReveal === 'success' ? '🏆' : '💣'}</span>
                  <span className={`font-bold ${room.excaliburReveal === 'success' ? 'text-blue-400' : 'text-red-400'}`}>
                    {room.excaliburReveal === 'success' ? 'SUCESSO' : 'FALHA'}
                  </span>
                </div>
                <p className="text-[9px] text-gray-500 italic">{t('app.game.excaliburVoteInverted')}</p>
              </div>
            )}

            <div className="flex justify-center gap-4">
              <div className="flex flex-col items-center p-6 bg-blue-600/20 rounded-2xl border-2 border-blue-600/50 w-32">
                <span className="text-4xl mb-2">🏆</span>
                <span className="text-3xl font-bold">{room.lastMissionVoteResult.votes.filter(v => v === 'success').length}</span>
                <span className="text-xs uppercase tracking-widest opacity-60">{t('app.game.successCount')}</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-red-600/20 rounded-2xl border-2 border-red-600/50 w-32">
                <span className="text-4xl mb-2">💣</span>
                <span className="text-3xl font-bold">{room.lastMissionVoteResult.votes.filter(v => v === 'fail').length}</span>
                <span className="text-xs uppercase tracking-widest opacity-60">{t('app.game.failCount')}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest">{t('app.game.recallTeamVotes')}</p>
              <div className="flex flex-wrap justify-center gap-1 max-w-xs mx-auto">
                {room.players.map(p => (
                  <div key={p.id} className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1 ${
                    room.lastTeamVoteResult?.votes[p.id] === 'approve' 
                      ? 'bg-green-500/10 border-green-500/30 text-green-500' 
                      : 'bg-red-500/10 border-red-500/30 text-red-500'
                  }`}>
                    {formatName(p)}: {room.lastTeamVoteResult?.votes[p.id] === 'approve' ? t('app.game.yes') : t('app.game.no')}
                  </div>
                ))}
              </div>
            </div>

            {isHost && (
              <Button onClick={() => socket.emit('continue-game', { roomCode: room.code })}>{t('app.game.continue')}</Button>
            )}
          </div>
        )}

        {room.phase === 'lady-of-the-lake' && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className="text-2xl font-['Cinzel'] text-[#ffd700]">{t('app.game.ladyOfLake')}</h3>
              <p className="text-gray-400">
                {room.ladyOfLakeHolder === playerId
                  ? t('app.game.ladyYouAre')
                  : t('app.game.ladyOtherInvestigating', { name: room.players.find(p => p.id === room.ladyOfLakeHolder)?.name })}
              </p>
            </div>

            {room.ladyOfLakeHolder === playerId ? (
              <div className="space-y-4">
                <p className="text-sm font-bold">{t('app.game.ladyChoosePlayer')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {room.players.filter(p => p.id !== playerId && !room.ladyOfLakeUsed.includes(p.id)).map(p => (
                    <Button 
                      variant="outline" 
                      onClick={() => socket.emit('lady-examine', { roomCode: room.code, targetPlayerId: p.id })}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 animate-pulse text-[#ffd700] italic">{t('app.game.waitingLady')}</div>
            )}
          </div>
        )}

        {room.phase === 'assassination' && (
          <div className="space-y-6 text-center">
            <h3 className="text-2xl font-['Cinzel'] text-red-500">{t('app.game.assassinationPhase')}</h3>
            
            {me?.role && ROLES[me.role].team === 'evil' ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
                <p className="text-red-400 font-bold flex items-center justify-center gap-2 uppercase tracking-widest">
                  <Users size={18} /> {t('app.game.evilMeeting')}
                </p>
                <p className="text-sm text-gray-300">
                  {t('app.game.evilMeetingDesc')}
                </p>
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
                <p className="text-red-400 font-bold flex items-center justify-center gap-2 uppercase tracking-widest">
                  <Info size={18} /> {t('app.game.goodWarning')}
                </p>
                <p className="text-sm text-gray-300">
                  {t('app.game.goodWarningDesc')}
                </p>
              </div>
            )}

            <p className="text-gray-300">{t('app.game.goodWon3')}</p>
            
            {me?.role === 'assassin' ? (
              <div className="space-y-4">
                <p className="font-bold">{t('app.game.whoIsMerlin')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {room.players.filter(p => p.role && ROLES[p.role].team === 'good').map(p => (
                    <div key={p.id}>
                      <Button variant="outline" onClick={() => socket.emit('assassinate', { roomCode: room.code, targetPlayerId: p.id })} className="text-sm">
                        {formatName(p)}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 animate-pulse text-red-400 italic">{t('app.game.assassinActing')}</div>
            )}
          </div>
        )}

        {room.phase === 'game-over' && (
          <div className="space-y-8 text-center">
            <div className="space-y-2">
              <h3 className={`text-5xl font-['Cinzel'] ${room.winner === 'good' ? 'text-blue-500' : 'text-red-500'}`}>
                {room.winner === 'good' ? t('app.game.goodWins') : t('app.game.evilWins')}
              </h3>
              <p className="text-gray-400 italic">{room.gameOverReason}</p>
              {room.assassinationTargetId && (
                <div className="mt-4 p-4 bg-black/20 rounded-2xl border border-white/10 inline-block">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">{t('app.game.assassinTarget')}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-xl">
                      {room.players.find(p => p.id === room.assassinationTargetId) ? formatName(room.players.find(p => p.id === room.assassinationTargetId)!) : ''}
                    </span>
                    {room.players.find(p => p.id === room.assassinationTargetId)?.role === 'merlin' ? (
                      <div className="bg-green-500/20 p-1 rounded-full border border-green-500/50">
                        <CheckCircle2 className="text-green-500" size={20} />
                      </div>
                    ) : (
                      <div className="bg-red-500/20 p-1 rounded-full border border-red-500/50">
                        <XCircle className="text-red-500" size={20} />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {room.players.find(p => p.id === room.assassinationTargetId)?.role === 'merlin'
                      ? t('app.game.hitMerlin')
                      : t('app.game.missedMerlin')}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm uppercase tracking-widest text-gray-500 font-bold">{t('app.game.finalReveal')}</h4>
              <div className="grid grid-cols-1 gap-2">
                {room.players.map(p => {
                  const isLancelot = p.role?.includes('lancelot');
                  const playerTeam = (p.role && room.lancelotLoyalty && isLancelot)
                    ? (p.role === 'lancelot_good' ? room.lancelotLoyalty.lancelotGoodTeam : room.lancelotLoyalty.lancelotEvilTeam)
                    : (p.role ? ROLES[p.role].team : 'good');
                  const won = playerTeam === room.winner;

                  return (
                    <div 
                      key={p.id} 
                      className={`flex items-center justify-between bg-black/20 p-3 rounded-xl border transition-all duration-500 ${
                        won 
                          ? 'border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]' 
                          : 'border-white/5 opacity-30 grayscale-[0.5]'
                      }`}
                    >
                      <span className={`font-bold ${won ? 'text-white' : 'text-gray-500'}`}>{formatName(p)}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${won ? 'text-gray-400' : 'text-gray-600'}`}>{p.role && getRoleInfo(p.role, t).name}</span>
                        <span className={won ? '' : 'opacity-50'}>{p.role && ROLES[p.role].icon}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {isHost && (
                <Button onClick={() => socket.emit('reset-game', { roomCode: room.code })}>
                  {t('app.game.playAgain')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => window.location.href = '/'}>
                {t('app.game.leaveRoom')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Footer Player Info */}
      {me?.role && room.phase !== 'game-over' && (
        <div className="mt-8 max-w-md mx-auto space-y-4">
          <div className="flex justify-center">
            <button
              onClick={() => setShowSecrets(!showSecrets)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all font-black uppercase tracking-widest text-[10px] ${
                showSecrets 
                  ? 'bg-[#ffd700] text-[#0d1b2a] border-[#ffd700]' 
                  : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/30'
              }`}
            >
              {showSecrets ? <><EyeOff size={14} /> {t('app.game.hideSecrets')}</> : <><Eye size={14} /> {t('app.game.showSecrets')}</>}
            </button>
          </div>

          <AnimatePresence>
            {showSecrets && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="space-y-4"
              >
                <div className="bg-[#1b263b] border border-[#ffd700]/30 rounded-xl p-4 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{ROLES[me.role].icon}</span>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500">{t('app.game.yourCharacter')}</p>
                        <p className="font-bold text-[#ffd700] text-lg">{getRoleInfo(me.role, t).name}</p>
                      </div>
                    </div>
                    <Badge team={ROLES[me.role].team}>{ROLES[me.role].team === 'good' ? t('app.game.good') : t('app.game.evil')}</Badge>
                  </div>
                  
                  {me.role.includes('lancelot') && room.lancelotLoyalty && room.lancelotConfig?.variant !== 'var3' && (
                    <div className="bg-purple-500/20 border border-purple-500/40 rounded-xl p-2 text-center mb-4">
                      <p className="text-[9px] uppercase font-bold text-purple-300 tracking-widest">{t('app.game.currentLoyalty')}</p>
                      <p className="text-sm font-black text-white">
                        {me.role === 'lancelot_good' ? room.lancelotLoyalty.lancelotGoodTeam.toUpperCase() : room.lancelotLoyalty.lancelotEvilTeam.toUpperCase()}
                      </p>
                    </div>
                  )}

                  <KnowledgeSection room={room} me={me} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

// --- App ---

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(window.location.origin, { path: '/avalon/socket.io' });
    setSocket(newSocket);
    return () => {
      newSocket.close();
    };
  }, []);

  if (!socket) return null;

  return (
    <SocketContext.Provider value={socket}>
      <SettingsProvider>
        <Router basename="/avalon">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room/:code" element={<Room />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Router>
      </SettingsProvider>
    </SocketContext.Provider>
  );
}
