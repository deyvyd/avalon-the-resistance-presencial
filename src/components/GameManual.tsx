import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  ChevronDown, 
  Target, 
  Users, 
  Settings, 
  Gamepad2, 
  Flag, 
  ShieldCheck, 
  Lightbulb,
  Shield,
  Skull,
  Info,
  AlertTriangle,
  Sword,
  Droplets,
  RefreshCw,
  MapPinned,
  Book
} from 'lucide-react';

// --- Types ---

interface SearchEntry {
  sectionId: string;
  sectionTitle: string;
  text: string;
  originalText: string;
  type: 'paragraph' | 'title' | 'box' | 'list-item' | 'character' | 'table-cell';
}

interface ManualSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  render: () => React.ReactNode;
  searchText: string; // Pre-compiled text for search
}

// --- Utils ---

const normalizeText = (text: string) => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

const highlightMatch = (text: string, query: string) => {
  if (!query) return text;
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  const index = normalizedText.indexOf(normalizedQuery);
  
  if (index === -1) return text;

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-[#ffd700]/25 text-[#ffd700] font-bold rounded px-0.5">{match}</mark>
      {after}
    </>
  );
};

// --- Components ---

const Box = ({ children, type }: { children: React.ReactNode; type: 'highlight' | 'warning' | 'tip' | 'evil' }) => {
  const styles = {
    highlight: 'bg-[#4169e1]/15 border-l-4 border-[#4169e1]',
    warning: 'bg-[#dc143c]/15 border-l-4 border-[#dc143c]',
    tip: 'bg-[#d4af37]/15 border-l-4 border-[#d4af37]',
    evil: 'bg-[#8b0000]/20 border-l-4 border-[#8b0000]',
  };

  return (
    <div className={`${styles[type]} rounded-lg p-4 my-4`}>
      {children}
    </div>
  );
};

const ScriptBox = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-[#1e2d45]/60 border border-[#ffd700]/30 rounded-lg p-4 my-4 italic text-sm space-y-2">
    {children}
  </div>
);

const CharacterCard = ({ title, team, children }: { title: string; team: 'good' | 'evil' | 'lancelot'; children: React.ReactNode }) => {
  const borders = {
    good: 'border-[#4169e1]',
    evil: 'border-[#dc143c]',
    lancelot: 'border-[#ffd700]',
  };

  return (
    <div className={`bg-gradient-to-br from-[#2a3f5f] to-[#1e2a3a] border-2 ${borders[team]} rounded-xl p-4 my-3 shadow-lg`}>
      <h4 className="text-lg font-bold mb-2 font-['Cinzel'] text-[#ffd700]">{title}</h4>
      <div className="text-sm text-[#e0e0e0] space-y-1">
        {children}
      </div>
    </div>
  );
};

const ManualTable = ({ headers, rows, type }: { headers: string[]; rows: (string | number)[][]; type?: 'good' | 'evil' }) => (
  <div className="overflow-x-auto my-4 rounded-lg border border-[#ffd700]/20">
    <table className="w-full border-collapse text-sm">
      <thead className="bg-[#2a3f5f]/80 text-[#ffd700] font-['Cinzel']">
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="p-3 text-left border border-[#ffd700]/20">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr 
            key={i} 
            className={`
              ${type === 'good' ? 'bg-[#4169e1]/10' : type === 'evil' ? 'bg-[#dc143c]/10' : 'bg-white/5'}
              border-b border-[#ffd700]/10
            `}
          >
            {row.map((cell, j) => (
              <td key={j} className="p-3 border border-[#ffd700]/20 text-[#e0e0e0]">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Term = ({ pt, en }: { pt: string; en: string }) => (
  <span className="group relative inline-block">
    <span className="underline decoration-dotted decoration-[#ffd700]/50 cursor-help">{pt}</span>
    <span className="hidden sm:group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#0d1b2a] border border-[#ffd700] text-[#ffd700] text-[10px] rounded whitespace-nowrap z-50">
      {en}
    </span>
    <span className="sm:hidden text-[10px] text-[#ffd700] opacity-80 ml-1">({en})</span>
  </span>
);

// --- Main Component ---

export const GameManual = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // --- Content Definition ---
  
  const sections: ManualSection[] = useMemo(() => [
    {
      id: 'objetivo',
      title: 'Objetivo do Jogo',
      icon: <Target size={20} />,
      searchText: 'Objetivo do Jogo The Resistance: Avalon é um jogo de dedução social e lealdade oculta. Os jogadores são divididos em dois times secretos: Servos de Arthur Loyal Servants of Arthur BEM Lutam pela bondade e honra. Vencem completando 3 missões com sucesso. Minions de Mordred MAL Alinhados com as forças do mal. Vencem se 3 missões falharem, ou assassinando Merlin, ou se 5 times consecutivos forem rejeitados. Durante o jogo, os jogadores podem fazer qualquer afirmação, a qualquer momento. Discussão, enganação, acusação e dedução lógica são fundamentais para a vitória de qualquer lado. Dica Importante: Mesmo um único jogador do mal em uma equipe é suficiente para sabotar uma missão!',
      render: () => (
        <div className="space-y-4">
          <p className="text-[#e0e0e0]">
            <strong>The Resistance: Avalon</strong> é um jogo de dedução social e lealdade oculta. Os jogadores são divididos em dois times secretos:
          </p>
          
          <Box type="highlight">
            <h4 className="font-bold text-[#82a1fd] flex items-center gap-2 mb-1">
              🛡️ Servos de Arthur <span className="text-xs opacity-70 italic">(Loyal Servants of Arthur)</span> (BEM)
            </h4>
            <p className="text-sm">Lutam pela bondade e honra. Vencem completando <strong>3 missões com sucesso</strong>.</p>
          </Box>

          <Box type="evil">
            <h4 className="font-bold text-[#ff6282] flex items-center gap-2 mb-1">
              💀 Minions de Mordred <span className="text-xs opacity-70 italic">(Minions of Mordred)</span> (MAL)
            </h4>
            <p className="text-sm">Alinhados com as forças do mal. Vencem se <strong>3 missões falharem</strong>, ou assassinando Merlin, ou se 5 times consecutivos forem rejeitados.</p>
          </Box>

          <p className="text-sm text-[#e0e0e0]">
            Durante o jogo, os jogadores podem fazer <strong>qualquer afirmação</strong>, a qualquer momento. Discussão, enganação, acusação e dedução lógica são fundamentais para a vitória de qualquer lado.
          </p>

          <Box type="tip">
            <p className="text-sm">
              💡 <strong>Dica Importante:</strong> Mesmo um único jogador do mal em uma equipe é suficiente para sabotar uma missão!
            </p>
          </Box>
        </div>
      )
    },
    {
      id: 'personagens',
      title: 'Personagens Especiais',
      icon: <Users size={20} />,
      searchText: 'Personagens Especiais Personagens Obrigatórios MERLIN BEM Poder: Sabe quem são TODOS os jogadores do mal (exceto Mordred, se estiver em jogo). Desafio: Deve guiar o bem sem revelar sua identidade, ou será assassinado! Assassino Assassin MAL Poder: Se o bem vencer 3 missões, o Assassino pode tentar adivinhar quem é Merlin. Vitória: Se acertar, mata Merlin e o mal vence mesmo após 3 sucessos! Personagens Opcionais PERCIVAL BEM Poder: Sabe quem é Merlin (ou quem parece ser Merlin se Morgana estiver em jogo). Objetivo: Proteger a identidade de Merlin. Tendência: Fortalece o Bem Nota: Em jogos com Percival, adicione Mordred OU Morgana para balancear. MORDRED MAL Poder: Sua identidade NÃO é revelada para Merlin no início do jogo. Estratégia: Pode fingir ser do bem sem Merlin saber. Tendência: Fortalece o Mal OBERON MAL Poder: NÃO se revela para os outros jogadores do mal, nem os conhece. Desafio: Está isolado, mas Merlin o vê (não sabe que os outros não o conhecem). Tendência: Fortalece o Bem (dificulta coordenação do mal) Nota: Oberon não é um Minion de Mordred (Minion of Mordred) e não abre os olhos durante a revelação inicial. MORGANA MAL Poder: Aparece para Percival como se fosse Merlin. Confusão: Percival vê duas pessoas e não sabe qual é o verdadeiro Merlin. Tendência: Fortalece o Mal LANCELOT BOM Good Lancelot E LANCELOT MAU Evil Lancelot Nomes nas cartas: Lancelot Bom (Good Lancelot) e Lancelot Mau (Evil Lancelot) Mecânica: Se adicionar Lancelot Bom, DEVE adicionar Lancelot Mau (só é possível jogar com os 2 ou nenhum). Tendência: Adiciona complexidade e incerteza ao jogo. Veja seção de Regras Opcionais para as 3 variantes de Lancelot.',
      render: () => (
        <div className="space-y-6">
          <div>
            <h4 className="text-xs uppercase tracking-widest text-[#b8956a] font-bold mb-4 border-b border-[#4a5f7f] pb-1">Personagens Obrigatórios</h4>
            <CharacterCard title="🧙🏻‍♂️ MERLIN — BEM" team="good">
              <p>⚡ <strong>Poder:</strong> Sabe quem são TODOS os jogadores do mal (exceto Mordred, se estiver em jogo).</p>
              <p>🏔️ <strong>Desafio:</strong> Deve guiar o bem sem revelar sua identidade, ou será assassinado!</p>
            </CharacterCard>
            <CharacterCard title="💀 Assassino (Assassin) — MAL" team="evil">
              <p>⚡ <strong>Poder:</strong> Se o bem vencer 3 missões, o Assassino pode tentar adivinhar quem é Merlin.</p>
              <p>🏆 <strong>Vitória:</strong> Se acertar, mata Merlin e o mal vence mesmo após 3 sucessos!</p>
            </CharacterCard>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest text-[#b8956a] font-bold mb-4 border-b border-[#4a5f7f] pb-1">Personagens Opcionais</h4>
            <CharacterCard title="🛡️ PERCIVAL — BEM" team="good">
              <p>⚡ <strong>Poder:</strong> Sabe quem é Merlin (ou quem parece ser Merlin se Morgana estiver em jogo).</p>
              <p>🎯 <strong>Objetivo:</strong> Proteger a identidade de Merlin.</p>
              <p>📈 <strong>Tendência:</strong> Fortalece o Bem</p>
              <Box type="highlight">
                <p className="text-xs">Nota: Em jogos com Percival, adicione Mordred OU Morgana para balancear.</p>
              </Box>
            </CharacterCard>
            <CharacterCard title="🐍 MORDRED — MAL" team="evil">
              <p>⚡ <strong>Poder:</strong> Sua identidade NÃO é revelada para Merlin no início do jogo.</p>
              <p>♞ <strong>Estratégia:</strong> Pode fingir ser do bem sem Merlin saber.</p>
              <p>📈 <strong>Tendência:</strong> Fortalece o Mal</p>
            </CharacterCard>
            <CharacterCard title="👻 OBERON — MAL" team="evil">
              <p>⚡ <strong>Poder:</strong> NÃO se revela para os outros jogadores do mal, nem os conhece.</p>
              <p>🏔️ <strong>Desafio:</strong> Está isolado, mas Merlin o vê (não sabe que os outros não o conhecem).</p>
              <p>📈 <strong>Tendência:</strong> Fortalece o Bem (dificulta coordenação do mal)</p>
              <Box type="highlight">
                <p className="text-xs">Nota: Oberon não é um <em>Minion de Mordred</em> <span className="italic">(Minion of Mordred)</span> e não abre os olhos durante a revelação inicial.</p>
              </Box>
            </CharacterCard>
            <CharacterCard title="🧙‍♀️ MORGANA — MAL" team="evil">
              <p>⚡ <strong>Poder:</strong> Aparece para Percival como se fosse Merlin.</p>
              <p>🔀 <strong>Confusão:</strong> Percival vê duas pessoas e não sabe qual é o verdadeiro Merlin.</p>
              <p>📈 <strong>Tendência:</strong> Fortalece o Mal</p>
            </CharacterCard>
            <CharacterCard title="👍🏻 LANCELOT BOM (Good Lancelot) E 👎🏻 LANCELOT MAU (Evil Lancelot)" team="lancelot">
              <p>🏷️ <strong>Nomes nas cartas:</strong> <em>Lancelot Bom</em> <span className="italic">(Good Lancelot)</span> e <em>Lancelot Mau</em> <span className="italic">(Evil Lancelot)</span></p>
              <p>⚙️ <strong>Mecânica:</strong> Se adicionar Lancelot Bom, DEVE adicionar Lancelot Mau (só é possível jogar com os 2 ou nenhum).</p>
              <p>📈 <strong>Tendência:</strong> Adiciona complexidade e incerteza ao jogo.</p>
              <p className="text-xs italic mt-2">*Veja seção de Regras Opcionais para as 3 variantes de Lancelot.*</p>
            </CharacterCard>
          </div>
        </div>
      )
    },
    {
      id: 'preparacao',
      title: 'Preparação do Jogo',
      icon: <Settings size={20} />,
      searchText: 'Preparação do Jogo Distribuição de Jogadores Use a tabela abaixo para determinar quantos jogadores estarão em cada time: Bem (Azul) Mal (Vermelho) Tamanho das Equipes por Missão Em partidas com 7+ jogadores, a 4ª missão requer 2 cartas de falha para falhar. Revelação Inicial: O Mal se Reconhece Após todos os jogadores conhecerem suas cartas secretas, o Líder deve conduzir a seguinte sequência para que os jogadores do mal se reconheçam e Merlin identifique os vilões: Todos, fechem os olhos e estendam a mão em punho na frente de vocês Minions de Mordred, abram os olhos e olhem ao redor para conhecer todos os agentes do mal Minions de Mordred, fechem os olhos Todos devem estar com os olhos fechados e mãos em punho Minions de Mordred, estendam o polegar para que Merlin saiba quem vocês são Merlin, abra os olhos e veja os agentes do mal Minions de Mordred, abaixem o polegar e formem o punho novamente Merlin, feche os olhos Todos devem estar com os olhos fechados e mãos em punho Todos, abram os olhos Importante: Os jogadores do mal se conhecem e Merlin sabe quem são eles, mas não pode revelar que sabe ou tudo estará perdido! Ele precisa ser sutil! Revelação com Personagens Opcionais Quando usar personagens opcionais, a sequência de revelação muda: Todos, fechem os olhos e estendam a mão em punho Minions de Mordred, exceto Oberon, abram os olhos e se reconheçam Minions de Mordred, fechem os olhos Todos com olhos fechados e mãos em punho Minions de Mordred, exceto Mordred, estendam o polegar para Merlin Merlin, abra os olhos e veja o mal Minions, abaixem o polegar Merlin, feche os olhos Todos com olhos fechados Merlin e Morgana, estendam o polegar para Percival Percival, abra os olhos e veja Merlin e Morgana Merlin e Morgana, abaixem o polegar Percival, feche os olhos Todos abram os olhos Nota: No app, a narração é feita automaticamente pelo áudio. Este roteiro é apenas referência.',
      render: () => (
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Distribuição de Jogadores</h4>
            <p className="text-xs text-[#b0b0b0] mb-3">Use a tabela abaixo para determinar quantos jogadores estarão em cada time:</p>
            <ManualTable 
              headers={['', '5', '6', '7', '8', '9', '10']}
              rows={[
                ['Bem (Azul)', 3, 4, 4, 5, 6, 6],
                ['Mal (Vermelho)', 2, 2, 3, 3, 3, 4]
              ]}
            />
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Tamanho das Equipes por Missão</h4>
            <ManualTable 
              headers={['Missão', '5', '6', '7', '8', '9', '10']}
              rows={[
                ['1ª Missão', 2, 2, 2, 3, 3, 3],
                ['2ª Missão', 3, 3, 3, 4, 4, 4],
                ['3ª Missão', 2, 4, 3, 4, 4, 4],
                ['4ª Missão', 3, 3, '4*', '5*', '5*', '5*'],
                ['5ª Missão', 3, 4, 4, 5, 5, 5]
              ]}
            />
            <Box type="warning">
              <p className="text-xs">Em partidas com 7+ jogadores, a 4ª missão requer <strong>2 cartas de falha</strong> para falhar.</p>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Revelação Inicial: O Mal se Reconhece</h4>
            <p className="text-xs text-[#b0b0b0] mb-3">Após todos os jogadores conhecerem suas cartas secretas, o Líder deve conduzir a seguinte sequência:</p>
            <ScriptBox>
              <p>"Todos, fechem os olhos e estendam a mão em punho na frente de vocês"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, abram os olhos e olhem ao redor para conhecer todos os agentes do mal"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, fechem os olhos"</p>
              <p>"Todos devem estar com os olhos fechados e mãos em punho"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, estendam o polegar para que Merlin saiba quem vocês são"</p>
              <p className="text-[#82a1fd]">[BEM] "Merlin, abra os olhos e veja os agentes do mal"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, abaixem o polegar e formem o punho novamente"</p>
              <p className="text-[#82a1fd]">[BEM] "Merlin, feche os olhos"</p>
              <p>"Todos devem estar com os olhos fechados e mãos em punho"</p>
              <p>"Todos, abram os olhos"</p>
            </ScriptBox>
            <Box type="warning">
              <p className="text-xs">⚠️ <strong>Importante:</strong> Os jogadores do mal se conhecem e Merlin sabe quem são eles, mas não pode revelar que sabe ou tudo estará perdido! Ele precisa ser sutil!</p>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Revelação com Personagens Opcionais</h4>
            <ScriptBox>
              <p>"Todos, fechem os olhos e estendam a mão em punho"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, exceto Oberon, abram os olhos e se reconheçam"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, fechem os olhos"</p>
              <p>"Todos com olhos fechados e mãos em punho"</p>
              <p className="text-[#ff6282]">[MAL] "Minions de Mordred, exceto Mordred, estendam o polegar para Merlin"</p>
              <p className="text-[#82a1fd]">[BEM] "Merlin, abra os olhos e veja o mal"</p>
              <p className="text-[#ff6282]">[MAL] "Minions, abaixem o polegar"</p>
              <p className="text-[#82a1fd]">[BEM] "Merlin, feche os olhos"</p>
              <p>"Todos com olhos fechados"</p>
              <p className="text-[#c08fff]">[ROXO] "Merlin e Morgana, estendam o polegar para Percival"</p>
              <p className="text-[#c08fff]">[ROXO] "Percival, abra os olhos e veja Merlin e Morgana"</p>
              <p className="text-[#c08fff]">[ROXO] "Merlin e Morgana, abaixem o polegar"</p>
              <p className="text-[#c08fff]">[ROXO] "Percival, feche os olhos"</p>
              <p>"Todos abram os olhos"</p>
            </ScriptBox>
            <p className="text-[10px] text-gray-500 italic mt-2">Nota: No app, a narração é feita automaticamente pelo áudio. Este roteiro é apenas referência.</p>
          </div>
        </div>
      )
    },
    {
      id: 'como-jogar',
      title: 'Como Jogar',
      icon: <Gamepad2 size={20} />,
      searchText: 'Como Jogar O jogo consiste em várias rodadas. Cada rodada tem duas fases: 1. Fase de Formação de Equipe O Líder propõe uma equipe para completar a missão Todos os jogadores discutem a proposta (discussão é fundamental!) Cada jogador vota secretamente usando seus Tokens de Voto: Aprovar Approve - aceitar a equipe proposta Rejeitar Reject - recusar a equipe proposta Os votos são revelados simultaneamente Se a maioria aprovar, a equipe vai para a missão Se for rejeitada, a liderança passa para o próximo jogador (sentido horário) Atenção: Se 5 equipes consecutivas forem rejeitadas na mesma rodada, o Mal vence automaticamente! Estratégia: Cuidado em quem vai confiar! Rejeitar uma equipe NÃO significa que você é do mal. Jogadores experientes podem rejeitar várias equipes antes de aprovar uma. Observe quem aprova e pergunte o motivo. 2. Fase da Missão Cada membro da equipe aprovada recebe Cartas de Missão: Sucesso Success Jogadores do BEM SEMPRE devem jogar essa carta Jogadores do MAL PODEM jogar essa carta para blefar Falha Fail Jogadores do BEM NUNCA devem jogar essa carta Jogadores do MAL NORMALMENTE jogam essa carta para sabotar missões Cada um escolhe secretamente uma carta e joga virada para baixo O Líder embaralha e revela as cartas jogadas A missão é SUCESSO apenas se TODAS as cartas forem de sucesso A missão FALHA se houver uma ou mais cartas de falha Exceção: Na 4ª missão com 7+ jogadores, são necessárias 2 cartas Falha Fail para a missão falhar Progressão do Jogo Após cada missão (sucesso ou falha), marque o resultado no tabuleiro e passe a liderança para o próximo jogador. O jogo continua até que um lado vença.',
      render: () => (
        <div className="space-y-6">
          <p className="text-sm text-[#e0e0e0]">O jogo consiste em várias rodadas. Cada rodada tem duas fases:</p>
          
          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-3 font-['Cinzel']">1. Fase de Formação de Equipe</h4>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-[#e0e0e0]">
              <li>O <strong>Líder</strong> propõe uma equipe para completar a missão</li>
              <li>Todos os jogadores <strong>discutem</strong> a proposta (discussão é fundamental!)</li>
              <li>Cada jogador vota secretamente usando seus <strong>Tokens de Voto</strong>:
                <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                  <li><Term pt="Aprovar" en="Approve" /> - aceitar a equipe proposta</li>
                  <li><Term pt="Rejeitar" en="Reject" /> - recusar a equipe proposta</li>
                </ul>
              </li>
              <li>Os votos são revelados simultaneamente</li>
              <li>Se a <strong>maioria aprovar</strong>, a equipe vai para a missão</li>
              <li>Se for rejeitada, a liderança passa para o próximo jogador (sentido horário)</li>
            </ol>
            <Box type="warning">
              <p className="text-xs">⚠️ <strong>Atenção:</strong> Se 5 equipes consecutivas forem rejeitadas na mesma rodada, o <strong>Mal vence automaticamente</strong>!</p>
            </Box>
            <Box type="tip">
              <h5 className="font-bold text-xs mb-1">🕵️ Estratégia:</h5>
              <ul className="list-disc pl-4 text-xs space-y-1">
                <li>Cuidado em quem vai confiar!</li>
                <li>Rejeitar uma equipe NÃO significa que você é do mal. Jogadores experientes podem rejeitar várias equipes antes de aprovar uma.</li>
                <li>Observe quem aprova e pergunte o motivo.</li>
              </ul>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-3 font-['Cinzel']">2. Fase da Missão</h4>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-[#e0e0e0]">
              <li>Cada membro da equipe aprovada recebe <strong>Cartas de Missão</strong>:
                <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                  <li><Term pt="Sucesso" en="Success" />
                    <ul className="pl-4 mt-0.5 opacity-80">
                      <li>Jogadores do <strong>BEM</strong> SEMPRE devem jogar essa carta</li>
                      <li>Jogadores do <strong>MAL</strong> PODEM jogar essa carta para blefar</li>
                    </ul>
                  </li>
                  <li><Term pt="Falha" en="Fail" />
                    <ul className="pl-4 mt-0.5 opacity-80">
                      <li>Jogadores do <strong>BEM</strong> NUNCA devem jogar essa carta</li>
                      <li>Jogadores do <strong>MAL</strong> NORMALMENTE jogam essa carta para sabotar missões</li>
                    </ul>
                  </li>
                </ul>
              </li>
              <li>Cada um escolhe <strong>secretamente</strong> uma carta e joga virada para baixo</li>
              <li>O Líder embaralha e revela as cartas jogadas
                <ul className="list-disc pl-5 mt-1 opacity-80 text-xs">
                  <li>A missão é <strong>SUCESSO</strong> apenas se TODAS as cartas forem de sucesso</li>
                  <li>A missão <strong>FALHA</strong> se houver uma ou mais cartas de falha</li>
                </ul>
              </li>
            </ol>
            <Box type="warning">
              <p className="text-xs"><strong>Exceção:</strong> Na 4ª missão com 7+ jogadores, são necessárias <strong>2 cartas <Term pt="Falha" en="Fail" /></strong> para a missão falhar</p>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Progressão do Jogo</h4>
            <p className="text-sm text-[#e0e0e0]">Após cada missão (sucesso ou falha), marque o resultado no tabuleiro e passe a liderança para o próximo jogador. O jogo continua até que um lado vença.</p>
          </div>
        </div>
      )
    },
    {
      id: 'final',
      title: 'Final do Jogo',
      icon: <Flag size={20} />,
      searchText: 'Final do Jogo Condições de Vitória do BEM 3 missões completadas com sucesso E Merlin não for assassinado (ou o Assassino errar) Condições de Vitória do MAL 3 missões falharem, OU 5 equipes consecutivas serem rejeitadas na mesma rodada, OU Assassinar Merlin corretamente após 3 sucessos do bem Tentativa de Assassinato Se o Bem completar 3 missões com sucesso, o jogo NÃO termina imediatamente! Os jogadores do mal têm uma última chance: Procedimento: Os jogadores do mal discutem entre si (sem revelar cartas) O jogador com a carta de Assassino aponta para um jogador do bem Se for Merlin MAL VENCE! Se não for Merlin BEM VENCE! Dica Final: Merlin deve ajudar o bem de forma sutil, usando votos e comentários discretos. Se for óbvio demais, será facilmente identificado e assassinado! Resumo das Vitórias BEM Vence Se... MAL Vence Se... 3 missões bem-sucedidas + Merlin sobreviver 3 missões falharem Assassino errar ao tentar matar Merlin Assassinar Merlin corretamente 5 times rejeitados consecutivamente',
      render: () => (
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-bold text-[#82a1fd] mb-2 font-['Cinzel']">Condições de Vitória do BEM</h4>
            <Box type="highlight">
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li><strong>3 missões completadas com sucesso</strong></li>
                <li><strong>E</strong> Merlin não for assassinado (ou o Assassino errar)</li>
              </ul>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ff6282] mb-2 font-['Cinzel']">Condições de Vitória do MAL</h4>
            <Box type="warning">
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li><strong>3 missões falharem</strong>, OU</li>
                <li><strong>5 equipes consecutivas serem rejeitadas</strong> na mesma rodada, OU</li>
                <li><strong>Assassinar Merlin</strong> corretamente após 3 sucessos do bem</li>
              </ul>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Tentativa de Assassinato</h4>
            <p className="text-sm text-[#e0e0e0] mb-3">Se o Bem completar 3 missões com sucesso, o jogo NÃO termina imediatamente! Os jogadores do mal têm uma última chance:</p>
            <Box type="tip">
              <h5 className="font-bold text-xs mb-2">Procedimento:</h5>
              <ol className="list-decimal pl-5 text-xs space-y-2">
                <li>Os jogadores do mal discutem entre si (sem revelar cartas)</li>
                <li>O jogador com a carta de <strong>Assassino</strong> aponta para um jogador do bem</li>
                <li>Se for Merlin → <strong>MAL VENCE!</strong></li>
                <li>Se não for Merlin → <strong>BEM VENCE!</strong></li>
              </ol>
            </Box>
            <Box type="highlight">
              <p className="text-xs">👑 <strong>Dica Final:</strong> Merlin deve ajudar o bem de forma sutil, usando votos e comentários discretos. Se for óbvio demais, será facilmente identificado e assassinado!</p>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-2 font-['Cinzel']">Resumo das Vitórias</h4>
            <ManualTable 
              headers={['BEM Vence Se...', 'MAL Vence Se...']}
              rows={[
                ['3 missões bem-sucedidas + Merlin sobreviver', '3 missões falharem'],
                ['Assassino errar ao tentar matar Merlin', 'Assassinar Merlin corretamente'],
                ['—', '5 times rejeitados consecutivamente']
              ]}
            />
          </div>
        </div>
      )
    },
    {
      id: 'regras-opcionais',
      title: 'Regras Opcionais Avançadas',
      icon: <ShieldCheck size={20} />,
      searchText: 'Regras Opcionais Avançadas As regras a seguir são opcionais e podem ser adicionadas ao jogo para aumentar a complexidade, estratégia e diversão. Recomenda-se jogar algumas partidas com as regras básicas antes de adicionar estas variantes. Missão Alvo Targeting A variante Missão Alvo Targeting permite aos jogadores completar as missões em qualquer ordem, adicionando um nível de planejamento estratégico ao jogo. Como Funciona: Durante a Fase de Formação de Equipe, o Líder escolhe: Quais jogadores estarão na equipe Qual missão a equipe tentará completar Use o marcador de rodada para indicar qual missão foi selecionada O número de jogadores na equipe deve corresponder ao requisito da missão escolhida Exemplo: O líder decide começar pela 3ª missão, que requer 4 membros. O líder escolhe 4 jogadores para a equipe e coloca o marcador de rodada na 3ª missão antes de pedir a votação. Regras Importantes: A 5ª missão só pode ser tentada após pelo menos 2 outras missões serem finalizadas Uma missão tentada não pode ser tentada novamente Para 7+ jogadores, a 4ª missão ainda requer 2 cartas Fail (Falha) para falhar Após a missão, coloque o marcador de pontuação correspondente no espaço da missão tentada Excalibur Quem controla Excalibur tem tremendo poder, para o BEM ou para o MAL. Excalibur permite a um membro da equipe alterar o resultado da missão trocando a carta jogada por outro jogador. Como Funciona: Fase de Formação: O Líder dá Excalibur a UM jogador da equipe (não pode ser ele mesmo) Fase da Missão: Cada jogador coloca sua carta virada para baixo na sua frente (para ficar claro quem jogou o quê) Poder de Excalibur: ANTES de coletar as cartas, o jogador com Excalibur pode mandar UM outro jogador trocar sua carta (a carta não jogada vira a carta jogada) Revelação: O jogador com Excalibur olha a carta que foi originalmente jogada pelo outro jogador Assim, ele sabe qual carta aquele jogador escolheu e se a troca foi benéfica ou prejudicial O Líder então coleta e embaralha as cartas normalmente Exemplo: João (Líder) dá Excalibur para Maria e escolhe ela, Pedro e Ana para a equipe. Todos jogam suas cartas viradas na frente deles. Maria usa Excalibur e manda Pedro trocar sua carta. Maria olha a carta original de Pedro (era Sucesso) e percebe que sua troca condenou a missão ao fracasso! O Líder embaralha e revela: 2 Sucessos e 1 Falha. Estratégia: Excalibur pode ser usada pelo BEM para forçar suspeitos a revelarem sua verdadeira intenção Ou pelo MAL para sabotar missões de forma disfarçada Dama do Lago Lady of the Lake Recomendado para 7+ jogadores. A Dama do Lago Lady of the Lake permite que um jogador examine secretamente a lealdade de outro jogador. Ela fortalece o time do BEM. Preparação: Dê o token Dama do Lago Lady of the Lake ao jogador à direita do Líder inicial Prepare 2 Cartas de Lealdade Loyalty Cards: uma do BEM (azul) e uma do MAL (vermelha) Como Usar: Após a 2ª, 3ª e 4ª missões, o jogador com a Dama do Lago escolhe outro jogador para examinar O jogador examinado recebe as 2 Cartas de Lealdade e passa secretamente a carta correspondente à sua lealdade A Dama do Lago vê a lealdade (Bem ou Mal), pode discutir sobre o que viu, mas não pode revelar a carta O jogador examinado recebe o token Dama do Lago Um jogador que já usou a Dama do Lago não pode ser examinado Importante: Passar a carta errada resulta em perda automática! Lancelot — Personagem Complexo Lancelot é um personagem complexo com múltiplas motivações. Os jogadores nunca trocam suas cartas de Personagem. Apenas a lealdade pode mudar. Se ocorrer uma troca de lealdade, afetará: Cartas de missão: Quem está do lado do BEM só pode jogar Sucesso. Quem está do lado do MAL pode jogar Sucesso ou Falha (exceto na variante 2, onde só pode jogar Falha) Condições de vitória: Quem está do lado do BEM no fim do jogo ganha/perde com o BEM. Quem está do lado do MAL ganha/perde com o MAL. Estratégia de jogo Existem 3 variantes. Variante 1 — Lancelot Troca de Lado Durante o Jogo: Preparação: Crie Baralho de Lealdade com: 3 cartas Sem Mudança No Change + 2 cartas Trocar de Lado Switch Allegiance Embaralhe e coloque próximo ao tabuleiro Minions de Mordred, incluindo Lancelot do Mal, estendam o polegar para Merlin Merlin, abra os olhos e veja o mal (Lancelot do Mal levanta o polegar, mas Merlin não sabe que ele é o Lancelot) Merlin, feche os olhos. Minions, abaixem o polegar Durante o Jogo: A partir da 3ª rodada e em cada rodada seguinte, vire 1 carta do baralho Sem Mudança: Nada acontece, jogo continua Trocar de Lado: Os dois Lancelots TROCAM DE LADO secretamente! A troca afeta TUDO: condições de vitória, cartas de missão, estratégia Eles NÃO trocam nem mostram suas cartas de personagem É possível trocar 0, 1 ou 2 vezes durante o jogo Tendência: Beneficia levemente o MAL | Alto caos e blefe Variante 2 — Trocas Conhecidas Antecipadamente: Preparação: Crie Baralho de Lealdade com: 5 cartas Sem Mudança + 2 cartas Trocar de Lado Embaralhe o baralho e revele as 5 primeiras cartas viradas para cima, em ordem, acima do tabuleiro Todos sabem QUANDO as trocas acontecerão. Isso adiciona uma camada de planejamento estratégico. Obrigatoriedade de Missão: Lancelot do Mal deve jogar Falha em missões Lancelot do Bem deve jogar Sucesso em missões Não há escolha — as cartas de missão são obrigatórias Tendência: Beneficia levemente o BEM | Dedução estratégica Variante 3 — Lancelots se Conhecem: Sem Baralho de Lealdade — os Lancelots não trocam de lado Os dois Lancelots abrem os olhos e se reconhecem apenas entre si (ao final da fase de revelação, com 8+ jogadores) O Lancelot Mau permanece de olhos fechados durante o reconhecimento do time do Mal Tendência: Jogo psicológico | Foco em identidades Variante Usada na Narração do App: O app usa uma combinação da Variante 1 com a Variante 3 como padrão configurável: Lancelots podem trocar de lado durante o jogo (Variante 1) Com 8+ jogadores, os Lancelots se reconhecem no início (Variante 3) Com menos de 8 jogadores, eles NÃO se reconhecem Atenção: Lancelots aumentam muito a complexidade do jogo Recomendado apenas para jogadores experientes. O suspense de não saber quando (ou se) a lealdade vai mudar é intenso!',
      render: () => (
        <div className="space-y-6">
          <p className="text-sm text-[#e0e0e0]">As regras a seguir são <strong>opcionais</strong> e podem ser adicionadas ao jogo para aumentar a complexidade, estratégia e diversão.</p>
          
          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-3 font-['Cinzel']">🎯 <Term pt="Missão Alvo" en="Targeting" /></h4>
            <p className="text-sm text-[#e0e0e0] mb-3">A variante <Term pt="Missão Alvo" en="Targeting" /> permite aos jogadores completar as missões em <strong>qualquer ordem</strong>.</p>
            <Box type="highlight">
              <h5 className="font-bold text-xs mb-2">Como Funciona:</h5>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>Durante a Fase de Formação de Equipe, o Líder escolhe:
                  <ol className="list-decimal pl-4 mt-1">
                    <li>Quais jogadores estarão na equipe</li>
                    <li>Qual missão a equipe tentará completar</li>
                  </ol>
                </li>
                <li>Use o marcador de rodada para indicar qual missão foi selecionada</li>
                <li>O número de jogadores na equipe deve corresponder ao requisito da missão escolhida</li>
              </ul>
            </Box>
            <Box type="tip">
              <p className="text-xs">💡 <strong>Exemplo:</strong> O líder decide começar pela 3ª missão, que requer 4 membros. O líder escolhe 4 jogadores para a equipe e coloca o marcador de rodada na 3ª missão antes de pedir a votação.</p>
            </Box>
            <Box type="warning">
              <h5 className="font-bold text-xs mb-2">Regras Importantes:</h5>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>A 5ª missão só pode ser tentada após pelo menos 2 outras missões serem finalizadas</li>
                <li>Uma missão tentada não pode ser tentada novamente</li>
                <li>Para 7+ jogadores, a 4ª missão ainda requer 2 cartas Fail (Falha) para falhar</li>
                <li>Após a missão, coloque o marcador de pontuação correspondente no espaço da missão tentada</li>
              </ul>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-3 font-['Cinzel']">🗡️ Excalibur</h4>
            <p className="text-sm text-[#e0e0e0] mb-3">Excalibur permite a um membro da equipe <strong>alterar o resultado da missão</strong> trocando a carta jogada por outro jogador.</p>
            <Box type="highlight">
              <h5 className="font-bold text-xs mb-2">Como Funciona:</h5>
              <ul className="list-disc pl-5 text-xs space-y-2">
                <li><strong>Fase de Formação:</strong> O Líder dá Excalibur a UM jogador da equipe (não pode ser ele mesmo)</li>
                <li><strong>Fase da Missão:</strong> Cada jogador coloca sua carta virada para baixo <strong>na sua frente</strong></li>
                <li><strong>Poder de Excalibur:</strong> ANTES de coletar as cartas, o jogador com Excalibur pode mandar UM outro jogador <strong>trocar</strong> sua carta</li>
                <li><strong>Revelação:</strong> O jogador com Excalibur <strong>olha</strong> a carta que foi originalmente jogada pelo outro jogador</li>
                <li>O Líder então coleta e embaralha as cartas normalmente</li>
              </ul>
            </Box>
            <Box type="tip">
              <p className="text-xs">💡 <strong>Exemplo:</strong> Maria usa Excalibur e manda Pedro trocar sua carta. Maria olha a carta original de Pedro (era Sucesso) e percebe que sua troca condenou a missão ao fracasso!</p>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-3 font-['Cinzel']">💧 <Term pt="Dama do Lago" en="Lady of the Lake" /></h4>
            <p className="text-sm text-[#e0e0e0] mb-3">Recomendado para 7+ jogadores. Permite que um jogador examine secretamente a lealdade de outro jogador.</p>
            <Box type="highlight">
              <h5 className="font-bold text-xs mb-2">Preparação:</h5>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>Dê o token <Term pt="Dama do Lago" en="Lady of the Lake" /> ao jogador à <strong>direita</strong> do Líder inicial</li>
                <li>Prepare 2 <strong><Term pt="Cartas de Lealdade" en="Loyalty Cards" /></strong>: uma do BEM (azul) e uma do MAL (vermelha)</li>
              </ul>
            </Box>
            <Box type="tip">
              <h5 className="font-bold text-xs mb-2">Como Usar:</h5>
              <ul className="list-disc pl-5 text-xs space-y-2">
                <li>Após a <strong>2ª, 3ª e 4ª missões</strong>, o portador escolhe outro jogador para examinar</li>
                <li>O jogador examinado passa secretamente a carta correspondente à sua lealdade</li>
                <li>A Dama do Lago vê a lealdade, pode discutir, mas <strong>não pode revelar a carta</strong></li>
                <li>O jogador examinado <strong>recebe o token</strong></li>
                <li>Um jogador que já usou a Dama do Lago <strong>não pode</strong> ser examinado</li>
              </ul>
            </Box>
            <Box type="warning">
              <p className="text-xs">⚠️ <strong>Importante:</strong> Passar a carta errada resulta em perda automática!</p>
            </Box>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#ffd700] mb-3 font-['Cinzel']">🔄 Lancelot — Personagem Complexo</h4>
            <p className="text-sm text-[#e0e0e0] mb-3">Os jogadores nunca trocam suas cartas de Personagem. Apenas a lealdade pode mudar.</p>
            
            <h5 className="text-xs font-bold text-[#ffd700] mt-4 mb-2">Variante 1 — Lancelot Troca de Lado Durante o Jogo:</h5>
            <Box type="highlight">
              <h5 className="font-bold text-xs mb-2">Preparação:</h5>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>Crie <strong>Baralho de Lealdade</strong> com: 3 cartas <strong><Term pt="Sem Mudança" en="No Change" /></strong> + 2 cartas <strong><Term pt="Trocar de Lado" en="Switch Allegiance" /></strong></li>
              </ul>
            </Box>
            <ScriptBox>
              <p className="text-[#ff6282]">"Minions de Mordred, incluindo Lancelot do Mal, estendam o polegar para Merlin"</p>
              <p className="text-[#82a1fd]">"Merlin, abra os olhos e veja o mal (Lancelot do Mal levanta o polegar, mas Merlin não sabe que ele é o Lancelot)"</p>
              <p className="text-[#82a1fd]">"Merlin, feche os olhos. Minions, abaixem o polegar"</p>
            </ScriptBox>
            <Box type="tip">
              <h5 className="font-bold text-xs mb-2">Durante o Jogo:</h5>
              <p className="text-xs">A partir da <strong>3ª rodada</strong>, vire 1 carta do baralho:</p>
              <ul className="list-disc pl-5 text-xs mt-1 space-y-1">
                <li><em>Sem Mudança</em>: Nada acontece</li>
                <li><em>Trocar de Lado</em>: Os dois Lancelots TROCAM DE LADO secretamente!</li>
              </ul>
            </Box>

            <h5 className="text-xs font-bold text-[#ffd700] mt-6 mb-2">Variante 2 — Trocas Conhecidas Antecipadamente:</h5>
            <Box type="highlight">
              <p className="text-xs">As 5 primeiras cartas do baralho são reveladas no início. Todos sabem QUANDO as trocas acontecerão.</p>
            </Box>

            <h5 className="text-xs font-bold text-[#ffd700] mt-6 mb-2">Variante 3 — Lancelots se Conhecem:</h5>
            <Box type="highlight">
              <p className="text-xs">Os dois Lancelots se reconhecem apenas entre si no início do jogo.</p>
            </Box>

            <Box type="warning">
              <p className="text-xs">⚠️ <strong>Atenção:</strong> Lancelots aumentam muito a complexidade do jogo. Recomendado apenas para jogadores experientes.</p>
            </Box>
          </div>
        </div>
      )
    },
    {
      id: 'dicas',
      title: 'Dicas Estratégicas',
      icon: <Lightbulb size={20} />,
      searchText: 'Dicas Estratégicas Para o BEM: Discuta MUITO antes de aprovar qualquer equipe Observe padrões de votação (quem aprova/rejeita frequentemente) Não tenha medo de rejeitar equipes suspeitas Merlin: seja sutil! Use votos e comentários indiretos Percival: proteja Merlin sem revelar quem ele é Para o MAL: Coordene-se com seus aliados sem ser óbvio Às vezes, jogar SUCESSO pode gerar mais confusão Acuse outros jogadores para desviar suspeitas Observe quem Merlin pode estar protegendo ou acusando Na tentativa de assassinato, escolham o jogador mais sábio Dicas Gerais: Comunique-se! O jogo vive da discussão Blefar é permitido e incentivado Preste atenção nas reações emocionais dos jogadores Use a lógica: Se X fosse do mal, por que faria Y? Lembre-se: votação apertada não significa necessariamente mal',
      render: () => (
        <div className="space-y-6">
          <Box type="highlight">
            <h4 className="font-bold text-xs mb-2">🛡️ Para o BEM:</h4>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>Discuta MUITO antes de aprovar qualquer equipe</li>
              <li>Observe padrões de votação (quem aprova/rejeita frequentemente)</li>
              <li>Não tenha medo de rejeitar equipes suspeitas</li>
              <li>Merlin: seja sutil! Use votos e comentários indiretos</li>
              <li>Percival: proteja Merlin sem revelar quem ele é</li>
            </ul>
          </Box>

          <Box type="evil">
            <h4 className="font-bold text-xs mb-2">💀 Para o MAL:</h4>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>Coordene-se com seus aliados sem ser óbvio</li>
              <li>Às vezes, jogar SUCESSO pode gerar mais confusão</li>
              <li>Acuse outros jogadores para desviar suspeitas</li>
              <li>Observe quem Merlin pode estar protegendo ou acusando</li>
              <li>Na tentativa de assassinato, escolham o jogador mais "sábio"</li>
            </ul>
          </Box>

          <Box type="tip">
            <h4 className="font-bold text-xs mb-2">💡 Dicas Gerais:</h4>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li><strong>Comunique-se!</strong> O jogo vive da discussão</li>
              <li>Blefar é permitido e incentivado</li>
              <li>Preste atenção nas reações emocionais dos jogadores</li>
              <li>Use a lógica: "Se X fosse do mal, por que faria Y?"</li>
              <li>Lembre-se: votação apertada não significa necessariamente mal</li>
            </ul>
          </Box>
        </div>
      )
    }
  ], []);

  // --- Search Logic ---

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    
    const normalizedQuery = normalizeText(searchQuery);
    const results: { section: ManualSection; snippet: React.ReactNode }[] = [];

    sections.forEach(section => {
      const normalizedContent = normalizeText(section.searchText);
      if (normalizedContent.includes(normalizedQuery)) {
        // Find a snippet around the match
        const index = normalizedContent.indexOf(normalizedQuery);
        const start = Math.max(0, index - 60);
        const end = Math.min(section.searchText.length, index + normalizedQuery.length + 60);
        let snippet = section.searchText.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < section.searchText.length) snippet = snippet + '...';

        results.push({
          section,
          snippet: highlightMatch(snippet, searchQuery)
        });
      }
    });

    return results;
  }, [searchQuery, sections]);

  // --- Handlers ---

  const handleSectionClick = (id: string, query?: string) => {
    // We MUST clear the search query to switch back to Accordion View
    // so the elements we want to scroll to actually exist in the DOM.
    const currentQuery = query || searchQuery;
    setSearchQuery('');
    setActiveSection(id);
    
    // Scroll to section
    setTimeout(() => {
      const sectionElement = document.getElementById(`section-${id}`);
      if (sectionElement) {
        sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // If there was a query, try to find the specific text within the section
        if (currentQuery && currentQuery.length >= 2) {
          setTimeout(() => {
            const walker = document.createTreeWalker(sectionElement, NodeFilter.SHOW_TEXT, null);
            let node;
            const normalizedQuery = normalizeText(currentQuery);
            
            while (node = walker.nextNode()) {
              if (normalizeText(node.textContent || '').includes(normalizedQuery)) {
                const parent = node.parentElement;
                if (parent) {
                  parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  parent.classList.add('search-highlight-temp');
                  setTimeout(() => parent.classList.remove('search-highlight-temp'), 2000);
                  break;
                }
              }
            }
          }, 400); // Wait for accordion expansion
        }
      }
    }, 150); // Slightly longer delay to ensure React has rendered the Accordion View
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-[900px] bg-[#0d1b2a] md:rounded-3xl border border-[#4a5f7f] flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 border-b border-[#4a5f7f] flex flex-col gap-4 bg-[#1e2d45]/50">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[#b8956a] font-['Cinzel']">The Resistance</span>
                <h2 className="text-2xl font-bold text-[#ffd700] font-['Cinzel'] tracking-[0.2em]">AVALON</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-block px-3 py-1 rounded-full border border-[#ffd700]/30 bg-[#1e2d45] text-[#ffd700] text-[10px] font-bold uppercase tracking-widest">
                  Manual de Regras
                </span>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-[#ffd700]"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="text"
                placeholder="Buscar no manual..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e2d45]/80 border border-[#4a5f7f] focus:border-[#ffd700] rounded-xl py-2.5 pl-10 pr-10 text-sm text-white outline-none transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div ref={contentRef} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-[#0d1b2a]">
            {searchQuery.length >= 2 ? (
              /* Search Results View */
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-widest text-[#b8956a] font-bold mb-4">
                  Resultados para "{searchQuery}"
                </h3>
                {searchResults.length > 0 ? (
                  searchResults.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => handleSectionClick(result.section.id, searchQuery)}
                      className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#ffd700]/30 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[#ffd700] opacity-50">{result.section.icon}</span>
                        <span className="text-[10px] uppercase tracking-widest text-[#ffd700] font-bold">
                          {result.section.title}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed italic">
                        {result.snippet}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <Search size={48} className="mx-auto text-gray-700" />
                    <p className="text-gray-500">
                      Nenhum resultado para "{searchQuery}"<br />
                      <span className="text-xs">Tente buscar por outro termo.</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Accordion View */
              <div className="space-y-4">
                {sections.map(section => (
                  <div key={section.id} id={`section-${section.id}`} className="scroll-mt-4">
                    <button
                      onClick={() => handleSectionClick(section.id)}
                      className={`
                        w-full flex items-center justify-between p-4 rounded-xl border transition-all
                        ${activeSection === section.id 
                          ? 'bg-[#1e2d45] border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.1)]' 
                          : 'bg-white/5 border-white/10 hover:border-white/20'}
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${activeSection === section.id ? 'bg-[#ffd700] text-[#0d1b2a]' : 'bg-white/5 text-[#ffd700]'}`}>
                          {section.icon}
                        </div>
                        <h3 className={`text-lg font-bold font-['Cinzel'] tracking-widest ${activeSection === section.id ? 'text-[#ffd700]' : 'text-[#e0e0e0]'}`}>
                          {section.title}
                        </h3>
                      </div>
                      <ChevronDown 
                        size={20} 
                        className={`text-gray-500 transition-transform duration-300 ${activeSection === section.id ? 'rotate-180 text-[#ffd700]' : ''}`} 
                      />
                    </button>

                    <AnimatePresence>
                      {activeSection === section.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 md:p-6 border-x border-b border-[#ffd700]/20 rounded-b-xl bg-[#1e2d45]/20">
                            {section.render()}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#4a5f7f] bg-[#1e2d45]/30 text-center">
            <p className="text-[10px] text-[#b8956a] font-['Cinzel'] tracking-widest">
              The Resistance: AVALON • Design original: Don Eskridge
            </p>
            <p className="text-[8px] text-gray-500 mt-1">
              Este manual foi adaptado para português brasileiro para uso com o Assistente do jogo
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
