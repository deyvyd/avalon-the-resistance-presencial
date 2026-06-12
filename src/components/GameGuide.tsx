import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Shield, 
  Skull, 
  Sword, 
  Target, 
  Droplets, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MapPinned,
  Check
} from 'lucide-react';

type StepType = 'setup' | 'revelation' | 'mission' | 'optional' | 'assassination';

interface StepAction {
  text: string;
  subactions?: string[];
}

interface GameStep {
  type: StepType;
  badges: string[];
  title: string;
  actions?: StepAction[];
  note?: string;
  description?: string;
}

interface LancelotConfig {
  variant: string;
  recognition: boolean;
  hasSwitches: boolean;
}

const generateGameSteps = (
  lancelots: boolean,
  lancelotConfig: LancelotConfig | null,
  excalibur: boolean,
  targeting: boolean,
  ladyOfLake: boolean
): GameStep[] => {
  const steps: GameStep[] = [];

  // ETAPA 1 — Preparação do Jogo
  steps.push({
    type: 'setup',
    badges: ['Preparação'],
    title: '🃏 Preparação do Jogo',
    actions: [
      { text: 'Embaralhe as cartas de personagem conforme o número de jogadores' },
      { text: 'Distribua as cartas secretamente para cada jogador' },
      { text: 'Cada jogador olha sua carta sem revelar aos outros' }
    ]
  });

  // ETAPA 2 — Narração Inicial
  let revelationDesc = "O mal se reconhece e Merlin reconhece o mal.";
  if (lancelots && lancelotConfig) {
    const { hasSwitches, recognition } = lancelotConfig;
    if (hasSwitches && !recognition) {
      revelationDesc = "O mal se reconhece (Lancelot Mau levanta polegar, não abre os olhos). Merlin reconhece o mal. Lancelots NÃO se reconhecem entre si.";
    } else if (!hasSwitches && recognition) {
      revelationDesc = "O mal se reconhece e Merlin reconhece o mal. Ao final (8+ jogadores), os dois Lancelots abrem os olhos e se reconhecem entre si.";
    } else if (hasSwitches && recognition) {
      revelationDesc = "O mal se reconhece (Lancelot Mau levanta polegar, não abre os olhos). Merlin reconhece o mal. Ao final (8+ jogadores), os dois Lancelots se reconhecem entre si.";
    }
  }

  steps.push({
    type: 'revelation',
    badges: ['Revelação'],
    title: '🗣️ Narração Inicial',
    description: revelationDesc
  });

  // ETAPA 3 — Troca de Lado dos Lancelots
  if (lancelots && lancelotConfig?.hasSwitches) {
    steps.push({
      type: 'optional',
      badges: ['Opcional'],
      title: '🔄 Troca de Lado dos Lancelots',
      actions: [
        { 
          text: 'A partir da 3ª rodada e em cada rodada seguinte, vire 1 carta do baralho de Lealdade',
          subactions: [
            'Se for uma carta vazia (Sem Mudança): Nada acontece, jogo continua',
            'Se for uma carta de Troca de Lado: Os dois Lancelots TROCAM DE LADO secretamente!'
          ]
        }
      ],
      note: 'A troca afeta tudo: condições de vitória, cartas de missão e estratégia'
    });
  }

  // ETAPA 4 — Definição do Líder da Rodada
  steps.push({
    type: 'mission',
    badges: ['Missão'],
    title: '👑 Definição do Líder da Rodada',
    note: 'O primeiro líder é decidido aleatoriamente no início do jogo',
    actions: [
      { text: 'A liderança é alterada a cada rodada no sentido horário' }
    ]
  });

  // ETAPA 5 — Missão Alvo
  if (targeting) {
    steps.push({
      type: 'optional',
      badges: ['Opcional'],
      title: '🎯 Missão Alvo - Fase de Escolha da Missão',
      actions: [
        { text: 'O líder pode escolher QUAL missão a equipe tentará completar (em qualquer ordem)' },
        { text: 'A 5ª missão só pode ser tentada após 2 missões bem-sucedidas' },
        { text: 'Uma missão tentada não pode ser tentada novamente' }
      ],
      note: 'A escolha da missão pode influenciar na aprovação ou não da equipe formada.'
    });
  }

  // ETAPA 6 — Fase de Formação de Equipe
  steps.push({
    type: 'mission',
    badges: ['Missão'],
    title: '👨🏻👩🏻👧🏻👧🏻 Fase de Formação de Equipe',
    actions: [
      { text: 'O líder propõe uma equipe para a missão e todos discutem a proposta' },
      { 
        text: 'Cada jogador vota secretamente (Aprovar/Rejeitar) e todos exibem os votos simultaneamente',
        subactions: [
          'Se a maioria aprovar → A equipe vai para a missão',
          'Se a empatar ou a maioria rejeitar → o líder passa a ser o próximo na ordem do jogo (sentido horário)'
        ]
      }
    ],
    note: '5 rejeições consecutivas = Mal vence automaticamente!'
  });

  // ETAPA 7 — Uso de Excalibur
  if (excalibur) {
    steps.push({
      type: 'optional',
      badges: ['Opcional'],
      title: '🗡️ Uso de Excalibur',
      actions: [
        { text: 'O líder dá Excalibur a um membro da equipe (não pode manter com ele)' },
        { text: 'Cada jogador da equipe coloca sua carta virada para baixo na sua frente' },
        { text: 'ANTES de coletar as cartas, o portador de Excalibur pode mandar UM jogador trocar sua carta' },
        { text: 'O portador olha a carta original do jogador (para saber qual foi a escolha inicial)' },
        { text: 'O líder então coleta e embaralha as cartas normalmente' }
      ],
      note: 'Pode ser usado pelo Bem ou pelo Mal para alterar estrategicamente o resultado!'
    });
  }

  // ETAPA 8 — Fase da Missão
  steps.push({
    type: 'mission',
    badges: ['Missão'],
    title: '⚔️ Fase da Missão',
    actions: [
      { text: 'Cada membro da equipe recebe cartas de Missão (Sucesso/Falha) e escolhe secretamente uma para jogar' },
      { text: 'Cada membro da equipe joga a carta escolhida virada para baixo' },
      { 
        text: 'O líder embaralha e revela as cartas jogadas',
        subactions: [
          'Se TODAS as cartas forem Sucesso → Missão é bem-sucedida',
          'Se houver UMA ou mais cartas de Falha → Missão mal-sucedida'
        ]
      },
      { text: 'Marque o resultado da missão no tabuleiro (vitória do BEM ou do MAL)' }
    ],
    note: 'O BEM só pode jogar cartas de Sucesso. O MAL pode jogar Sucesso ou Falha.\n4ª missão com 7+ jogadores precisa de 2 Falhas para falhar'
  });

  // ETAPA 9 — Dama do Lago
  if (ladyOfLake) {
    steps.push({
      type: 'optional',
      badges: ['Opcional'],
      title: '💧 Dama do Lago',
      actions: [
        { text: 'O token da Dama do Lago começa com o jogador imediatamente à esquerda (sentido horário) do líder inicial.' },
        { text: 'Após a 2ª, 3ª e 4ª missões, o portador do token escolhe outro jogador para examinar' },
        { text: 'O jogador examinado recebe as 2 Cartas de Lealdade e passa secretamente a carta correspondente à sua lealdade' },
        { text: 'O portador vê a lealdade (Bem ou Mal) e pode discutir sobre o que viu' },
        { text: 'O jogador examinado recebe o token da Dama do Lago' }
      ],
      note: 'Passar a carta errada resulta em perda automática. Não é permitido blefar!\nUm jogador que já usou a Dama do Lago não pode ser examinado'
    });
  }

  // ETAPA 10 — Próxima Rodada
  steps.push({
    type: 'mission',
    badges: ['Missão'],
    title: '⏭️ Próxima Rodada',
    actions: [
      { text: 'Passe a liderança para o próximo jogador (sentido horário)' },
      { text: 'Continue até que um lado vença (3 sucessos ou 3 falhas)' }
    ]
  });

  // ETAPA 11 — Tentativa de Assassinato
  steps.push({
    type: 'assassination',
    badges: ['Assassinato'],
    title: '💀 Tentativa de Assassinato',
    actions: [
      { text: 'Se o Bem conquistar Sucesso em 3 missões, o jogo NÃO termina imediatamente' },
      { text: 'Os jogadores do MAL discutem entre si (sem revelar cartas)' },
      { 
        text: 'O Assassino aponta para um jogador do BEM',
        subactions: [
          'Se for Merlin: MAL VENCE!',
          'Se NÃO for Merlin: BEM VENCE!'
        ]
      }
    ],
    note: 'Esta é a última chance do Mal! Merlin precisa ser sutil para o BEM vencer o jogo.'
  });

  return steps;
};

const StepCard = ({ step, index, total }: { step: GameStep; index: number; total: number; key?: any }) => {
  const typeColors = {
    setup: { border: '#4169e1', badgeText: '#82a1fd', badgeBg: 'rgba(65,105,225,0.2)', badgeBorder: '#4169e1' },
    revelation: { border: '#9370db', badgeText: '#c08fff', badgeBg: 'rgba(138,43,226,0.2)', badgeBorder: '#9370db' },
    mission: { border: '#ff9500', badgeText: '#ffb84d', badgeBg: 'rgba(255,165,0,0.2)', badgeBorder: '#ff9500' },
    optional: { border: '#0099ff', badgeText: '#33ccff', badgeBg: 'rgba(0,195,255,0.2)', badgeBorder: '#0099ff' },
    assassination: { border: '#dc143c', badgeText: '#ff6282', badgeBg: 'rgba(220,20,60,0.2)', badgeBorder: '#dc143c' }
  };

  const colors = typeColors[step.type];

  return (
    <motion.div 
      key={index}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className="game-step w-full p-4 rounded-xl border-l-4 bg-white/5 shadow-lg flex flex-col gap-4 relative overflow-hidden group transition-all duration-300 hover:translate-x-1 hover:shadow-[0_4px_12px_rgba(255,215,0,0.2)]"
      style={{ 
        borderLeftColor: colors.border,
        background: step.type === 'optional' ? 'linear-gradient(145deg, rgba(0,195,255,0.05), rgba(0,195,255,0.02))' : undefined
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div 
            className="flex items-center justify-center rounded-full font-bold text-lg shadow-inner min-w-[40px] h-[40px]"
            style={{ 
              background: 'linear-gradient(145deg, #ffd700, #b8860b)',
              color: '#1a0a2e',
              fontFamily: '"Cinzel", serif'
            }}
          >
            {index + 1}
          </div>
          <h3 className="text-lg font-bold tracking-tight text-[#ffd700] font-['Cinzel']">
            {step.title}
          </h3>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {step.badges.map(badge => (
            <span 
              key={badge}
              className="text-[10px] uppercase font-bold px-2 py-0.5 rounded border"
              style={{ 
                color: colors.badgeText,
                backgroundColor: colors.badgeBg,
                borderColor: colors.badgeBorder
              }}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3 text-[#e0e0e0] font-['Lato']">
        {step.description && (
          <p className="text-sm leading-relaxed">{step.description}</p>
        )}

        {step.actions && (
          <div className="space-y-2">
            {step.actions.map((action, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  {step.actions!.length > 1 && (
                    <span className="font-bold text-[#ffd700]">{i + 1}.</span>
                  )}
                  <p className="text-sm leading-relaxed">{action.text}</p>
                </div>
                {action.subactions && (
                  <ul className="pl-8 space-y-1">
                    {action.subactions.map((sub, j) => (
                      <li key={j} className="text-xs flex gap-2 items-start">
                        <span className="text-[#ffd700] mt-1">•</span>
                        <span className="opacity-80">{sub}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {step.note && (
          <div 
            className="p-3 rounded-md border-l-4 italic flex gap-3 items-start"
            style={{ 
              borderLeftColor: colors.border,
              backgroundColor: `rgba(${parseInt(colors.border.slice(1,3), 16)}, ${parseInt(colors.border.slice(3,5), 16)}, ${parseInt(colors.border.slice(5,7), 16)}, 0.1)`
            }}
          >
            <Info size={16} className="shrink-0 mt-0.5" style={{ color: colors.border }} />
            <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: colors.border }}>
              {step.note}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const VictoryConditions = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* BEM */}
      <div 
        className="victory-group p-5 rounded-2xl border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
        style={{ 
          borderColor: '#4169e1',
          backgroundColor: 'rgba(65,105,225,0.15)'
        }}
      >
        <h3 className="text-xl font-bold mb-6 text-[#82a1fd] font-['Cinzel'] flex items-center gap-2">
          <Shield size={24} /> BEM Vence Se...
        </h3>
        
        <div className="space-y-6">
          <div className="victory-condition flex gap-4 p-2 rounded-lg transition-all duration-300 hover:bg-white/5 hover:translate-x-1">
            <span className="text-3xl">😄</span>
            <div>
              <p className="font-bold text-[#e0e0e0]">3 missões bem-sucedidas</p>
              <p className="text-xs text-[#b0b0b0]">Complete três missões com sucesso</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-[1px] flex-1 bg-[#4169e1]/30" />
            <span className="font-['Cinzel'] text-[#4169e1] text-sm font-bold">E</span>
            <div className="h-[1px] flex-1 bg-[#4169e1]/30" />
          </div>

          <div className="victory-condition flex gap-4 p-2 rounded-lg transition-all duration-300 hover:bg-white/5 hover:translate-x-1">
            <span className="text-3xl">🧙🏻‍♂️</span>
            <div>
              <p className="font-bold text-[#e0e0e0]">Merlin sobrevive</p>
              <p className="text-xs text-[#b0b0b0]">O Assassino erra ao tentar matá-lo</p>
            </div>
          </div>
        </div>
      </div>

      {/* MAL */}
      <div 
        className="victory-group p-5 rounded-2xl border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
        style={{ 
          borderColor: '#dc143c',
          backgroundColor: 'rgba(220,20,60,0.15)'
        }}
      >
        <h3 className="text-xl font-bold mb-6 text-[#ff6282] font-['Cinzel'] flex items-center gap-2">
          <Skull size={24} /> MAL Vence Se...
        </h3>
        
        <div className="space-y-6">
          <div className="victory-condition flex gap-4 p-2 rounded-lg transition-all duration-300 hover:bg-white/5 hover:translate-x-1">
            <span className="text-3xl">😈</span>
            <div>
              <p className="font-bold text-[#e0e0e0]">3 missões falharem</p>
              <p className="text-xs text-[#b0b0b0]">Sabote três missões</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-[1px] flex-1 bg-[#dc143c]/30" />
            <span className="font-['Cinzel'] text-[#dc143c] text-sm font-bold">OU</span>
            <div className="h-[1px] flex-1 bg-[#dc143c]/30" />
          </div>

          <div className="victory-condition flex gap-4 p-2 rounded-lg transition-all duration-300 hover:bg-white/5 hover:translate-x-1">
            <span className="text-3xl">🤯</span>
            <div>
              <p className="font-bold text-[#e0e0e0]">5 times rejeitados</p>
              <p className="text-xs text-[#b0b0b0]">Gere confusão o suficiente para não confiarem em ninguém</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-[1px] flex-1 bg-[#dc143c]/30" />
            <span className="font-['Cinzel'] text-[#dc143c] text-sm font-bold">OU</span>
            <div className="h-[1px] flex-1 bg-[#dc143c]/30" />
          </div>

          <div className="victory-condition flex gap-4 p-2 rounded-lg transition-all duration-300 hover:bg-white/5 hover:translate-x-1">
            <span className="text-3xl">💀</span>
            <div>
              <p className="font-bold text-[#e0e0e0]">Assassinar Merlin</p>
              <p className="text-xs text-[#b0b0b0]">Identifique quem conhece o mal e mate Merlin</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GameGuide = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [lancelots, setLancelots] = useState(false);
  const [lancelotVariants, setLancelotVariants] = useState<string[]>([]);
  const [excalibur, setExcalibur] = useState(false);
  const [targeting, setTargeting] = useState(false);
  const [ladyOfLake, setLadyOfLake] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const toggleLancelotVariant = (variant: string) => {
    setLancelotVariants(prev => {
      if (prev.includes(variant)) {
        return prev.filter(v => v !== variant);
      }
      if (prev.length >= 2) return prev;
      
      // Validation logic for combinations
      const next = [...prev, variant];
      const hasVar1 = next.includes('var1');
      const hasVar2 = next.includes('var2');
      const hasVar3 = next.includes('var3');

      if (hasVar1 && hasVar2 && hasVar3) return prev;
      return next;
    });
  };

  const getLancelotConfig = (): LancelotConfig | null => {
    if (!lancelots || lancelotVariants.length === 0) return null;
    
    const variant = lancelotVariants.sort().join('_');
    const hasSwitches = lancelotVariants.some(v => v === 'var1' || v === 'var2');
    const recognition = lancelotVariants.includes('var3');
    
    return { variant, recognition, hasSwitches };
  };

  const steps = generateGameSteps(
    lancelots && lancelotVariants.length > 0,
    getLancelotConfig(),
    excalibur,
    targeting,
    ladyOfLake
  );

  useEffect(() => {
    setCurrentStep(0);
  }, [lancelots, lancelotVariants, excalibur, targeting, ladyOfLake]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full h-full md:h-auto md:max-h-[85vh] md:max-w-[900px] bg-[#0d1b2a] md:rounded-3xl border border-[#4a5f7f] flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 border-b border-[#4a5f7f] flex items-center justify-between bg-white/5">
            <h2 className="text-xl font-bold text-[#ffd700] font-['Cinzel'] flex items-center gap-2">
              <MapPinned size={24} /> Guia de Jogo
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-[#ffd700]"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 custom-scrollbar">
            
            {/* Toggles Section */}
            <section className="space-y-4">
              <h3 className="text-xs uppercase tracking-widest text-[#b8956a] font-bold border-b border-[#4a5f7f] pb-2">
                Regras Opcionais (Visualização)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Lancelots */}
                <div className="space-y-3">
                  <button 
                    onClick={() => setLancelots(!lancelots)}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 h-fit ${
                      lancelots ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${lancelots ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                      <RefreshCw size={24} />
                    </div>
                    <div className="text-left flex-1">
                      <span className="font-['Cinzel'] font-bold text-sm block">Lancelots</span>
                      <p className="text-[10px] text-gray-400">Adiciona os cavaleiros Lancelot (Bom e Mau).</p>
                    </div>
                    {lancelots && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                  </button>
                  
                  <AnimatePresence>
                    {lancelots && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pl-2 space-y-2 overflow-hidden"
                      >
                        <div className="grid grid-cols-1 gap-2">
                          {['var1', 'var2', 'var3'].map((v, i) => {
                            const isSelected = lancelotVariants.includes(v);
                            const isMaxed = lancelotVariants.length >= 2 && !isSelected;
                            return (
                              <button 
                                key={v}
                                onClick={() => toggleLancelotVariant(v)}
                                disabled={isMaxed}
                                className={`w-full p-2 rounded-lg border transition-all flex items-center gap-3 text-left ${
                                  isSelected 
                                    ? 'border-[#ffd700] bg-[#ffd700]/10 text-[#ffd700]' 
                                    : isMaxed 
                                      ? 'border-white/5 bg-white/5 opacity-20 cursor-not-allowed' 
                                      : 'border-white/10 bg-white/5 text-[#b0b0b0] hover:bg-white/10'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[#ffd700] border-[#ffd700]' : 'border-white/30'}`}>
                                  {isSelected && <Check size={12} className="text-[#0d1b2a]" />}
                                </div>
                                <div className="flex-1">
                                  <span className="text-[10px] font-bold block">Variante {i + 1}</span>
                                  <span className="text-[9px] opacity-70">
                                    {v === 'var1' ? 'Trocas Ocultas' : v === 'var2' ? 'Trocas Predeterminadas' : 'Reconhecimento Mútuo'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {lancelotVariants.length === 0 && (
                          <p className="text-[10px] text-[#dc143c] italic mt-1">
                            Selecione ao menos uma variante.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Excalibur */}
                <button 
                  onClick={() => setExcalibur(!excalibur)}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 h-fit ${
                    excalibur ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${excalibur ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                    <Sword size={24} />
                  </div>
                  <div className="text-left flex-1">
                    <span className="font-['Cinzel'] font-bold text-sm block">Excalibur</span>
                    <p className="text-[10px] text-gray-400">Permite forçar a troca de uma carta de missão.</p>
                  </div>
                  {excalibur && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                </button>

                {/* Missão Alvo */}
                <button 
                  onClick={() => setTargeting(!targeting)}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 h-fit ${
                    targeting ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${targeting ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                    <Target size={24} />
                  </div>
                  <div className="text-left flex-1">
                    <span className="font-['Cinzel'] font-bold text-sm block">Missão Alvo</span>
                    <p className="text-[10px] text-gray-400">Permite escolher a ordem das missões.</p>
                  </div>
                  {targeting && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                </button>

                {/* Dama do Lago */}
                <button 
                  onClick={() => setLadyOfLake(!ladyOfLake)}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 h-fit ${
                    ladyOfLake ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-white/5 bg-[#1b263b] opacity-60'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${ladyOfLake ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/5 text-gray-500'}`}>
                    <Droplets size={24} />
                  </div>
                  <div className="text-left flex-1">
                    <span className="font-['Cinzel'] font-bold text-sm block">Dama do Lago</span>
                    <p className="text-[10px] text-gray-400">Permite investigar a lealdade de outros jogadores.</p>
                  </div>
                  {ladyOfLake && <CheckCircle2 size={16} className="text-[#ffd700]" />}
                </button>
              </div>
            </section>

            {/* Steps Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-[#4a5f7f] pb-2">
                <h3 className="text-xs uppercase tracking-widest text-[#b8956a] font-bold">
                  📋 Etapas do Jogo
                </h3>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#b0b0b0] font-bold">
                    Etapa {currentStep + 1} de {steps.length}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      disabled={currentStep === 0}
                      onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-[#ffd700]"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button 
                      disabled={currentStep === steps.length - 1}
                      onClick={() => setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-[#ffd700]"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-[300px] flex items-start justify-center">
                <AnimatePresence mode="wait">
                  <StepCard 
                    key={currentStep}
                    step={steps[currentStep]} 
                    index={currentStep} 
                    total={steps.length} 
                  />
                </AnimatePresence>
              </div>
            </section>

            {/* Victory Conditions Section */}
            <section className="space-y-6">
              <h3 className="text-xs uppercase tracking-widest text-[#b8956a] font-bold border-b border-[#4a5f7f] pb-2">
                Condições de Vitória
              </h3>
              <VictoryConditions />
            </section>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
