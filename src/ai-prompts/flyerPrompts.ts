interface SingleEventPromptParams {
  eventName: string;
  gtdValue: string;
  buyInValue: string;
  eventTime?: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
}

export const buildSingleEventFlyerPrompt = ({
  eventName,
  gtdValue,
  buyInValue,
  eventTime,
  brandPrimaryColor,
  brandSecondaryColor,
}: SingleEventPromptParams): string => `
          TIPO: Flyer de Torneio Individual (single event highlight)

          DADOS DO EVENTO:
          • Torneio: ${eventName}
          • Garantido (GTD): ${gtdValue} ← DESTAQUE MÁXIMO
          • Buy-in: ${buyInValue}
          • Horário: ${eventTime} (GMT-3)

          ESTRUTURA DO LAYOUT:
          1. TOPO: Logo da marca centralizado ou canto superior
          2. CENTRO: Nome do torneio + Valor GTD em GRANDE DESTAQUE
          3. INFERIOR: Horário e buy-in com boa legibilidade

          REGRAS VISUAIS:
          - O GTD (${gtdValue}) deve ocupar pelo menos 30% da área visual
          - Use a cor ${brandSecondaryColor} no valor GTD
          - Fundo escuro/elegante baseado em ${brandPrimaryColor}
        `;

export const buildSingleEventFlyerPromptExtended = ({
  eventName,
  gtdValue,
  buyInValue,
  eventTime,
  brandPrimaryColor,
  brandSecondaryColor,
}: SingleEventPromptParams): string => `
      TIPO: Flyer de Torneio Individual (single event highlight)

      DADOS DO EVENTO:
      • Torneio: ${eventName}
      • Garantido (GTD): ${gtdValue} ← DESTAQUE MÁXIMO
      • Buy-in: ${buyInValue}
      • Horário: ${eventTime} (GMT-3)

      ESTRUTURA DO LAYOUT:
      1. TOPO: Logo da marca centralizado ou canto superior
      2. CENTRO: Nome do torneio + Valor GTD em GRANDE DESTAQUE
      3. INFERIOR: Horário e buy-in com boa legibilidade

      REGRAS VISUAIS:
      - O GTD (${gtdValue}) deve ocupar pelo menos 30% da área visual
      - Use a cor ${brandSecondaryColor} no valor GTD
      - Fundo escuro/elegante baseado em ${brandPrimaryColor}
      - Atmosfera: ambiente premium, elegante e sofisticado
      - Tipografia impactante e moderna para o valor monetário
    `;

interface DailyFlyerPromptParams {
  isHighlights: boolean;
  label: string;
  labelUpper: string;
  dayInfo: string;
  topEventText: string;
  secondEventText: string;
  thirdEventText: string;
  otherEventsList: string;
  topEventName: string;
  topEventGtdValue: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
}

export const buildDailyFlyerPromptDetailed = ({
  isHighlights,
  label,
  labelUpper,
  dayInfo,
  topEventText,
  secondEventText,
  thirdEventText,
  otherEventsList,
  topEventName,
  topEventGtdValue,
  brandPrimaryColor,
  brandSecondaryColor,
}: DailyFlyerPromptParams): string =>
  isHighlights
    ? `
        TIPO: Flyer de Destaques do Dia - TOP 3 TORNEIOS
        TÍTULO: ${labelUpper}
        DATA: ${dayInfo}

        REGRA CRÍTICA: Este flyer mostra EXATAMENTE 3 torneios. NÃO ADICIONE, NÃO DUPLIQUE, NÃO REPITA nenhum torneio.

        OS 3 TORNEIOS (em ordem de importância):

        TORNEIO PRINCIPAL (MAIOR GTD - área principal):
        ${topEventText}

        SEGUNDO TORNEIO:
        ${secondEventText}

        TERCEIRO TORNEIO:
        ${thirdEventText}

        LAYOUT OBRIGATÓRIO:
        - O torneio principal (${topEventName}) ocupa a METADE SUPERIOR com visual impactante
        - Os outros 2 torneios ficam na METADE INFERIOR em formato de cards ou lista
        - TOTAL DE ITENS NA IMAGEM: EXATAMENTE 3 torneios
        - NÃO crie linhas extras, NÃO repita nenhum nome

        DESIGN:
        - Logo da marca no topo
        - Título "${label}" logo após o logo
        - Data "${dayInfo}" em tamanho discreto (menor que o título)
        - GTD em cor ${brandSecondaryColor}
        - Fundo baseado em ${brandPrimaryColor}
        - Visual premium e sofisticado
        - Efeitos visuais: partículas, brilhos, elementos decorativos
        `
    : `
        TIPO: Grade de Programação com Torneio Principal
        TÍTULO DA SESSÃO: ${labelUpper}
        DATA: ${dayInfo}

        ESTRUTURA OBRIGATÓRIA - 2 SEÇÕES DISTINTAS:

        SEÇÃO 1 - TORNEIO PRINCIPAL (TOPO - 40% do espaço):

        TORNEIO EM EVIDÊNCIA (maior GTD):
        ${topEventText}

        REGRAS:
        - Esta seção deve ocupar aproximadamente 40% da área do flyer
        - Nome do torneio em FONTE GIGANTE E BOLD
        - GTD (${topEventGtdValue}) deve ser o MAIOR elemento visual - cor ${brandSecondaryColor}
        - Efeitos visuais: partículas, brilhos, explosão de elementos dinâmicos
        - Background desta área pode ter gradiente ou elementos visuais dinâmicos
        - Horário e Buy-in em tamanho médio, bem legíveis

        SEÇÃO 2 - GRADE DE OUTROS TORNEIOS (60% do espaço):

        LISTA DOS DEMAIS TORNEIOS (cada torneio aparece UMA ÚNICA VEZ, não repita):
        ${otherEventsList}

        FORMATO DA GRADE:
        - Layout tipo tabela/lista profissional
        - Cada linha: [HORÁRIO] | [NOME] | [BUY-IN] | [GTD]
        - IMPORTANTE: Cada torneio deve aparecer EXATAMENTE 1 vez na grade
        - GTD em cor ${brandSecondaryColor} (menor que o destaque, mas visível)
        - Linhas alternadas ou separadores para facilitar leitura
        - Fonte menor que o destaque, mas perfeitamente legível
        - Espaçamento uniforme entre linhas

        DESIGN GERAL:
        - Logo da marca no topo
        - Título "${label}" logo após o logo
        - Data "${dayInfo}" em tamanho discreto (menor que o título)
        - Fundo baseado em ${brandPrimaryColor}
        - Contraste forte entre o torneio principal (topo) e a grade (inferior)
        - Visual profissional e premium
        `;

interface DailyFlyerPromptCompactParams {
  isHighlights: boolean;
  label: string;
  labelUpper: string;
  dayInfo: string;
  topEventText: string;
  secondEventText: string;
  thirdEventText: string;
  otherEventsList: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
}

export const buildDailyFlyerPromptCompact = ({
  isHighlights,
  label,
  labelUpper,
  dayInfo,
  topEventText,
  secondEventText,
  thirdEventText,
  otherEventsList,
  brandPrimaryColor,
  brandSecondaryColor,
}: DailyFlyerPromptCompactParams): string =>
  isHighlights
    ? `
        TIPO: Flyer de Destaques do Dia - TOP 3 TORNEIOS
        TÍTULO: ${labelUpper}
        DATA: ${dayInfo}

        REGRA CRÍTICA: Este flyer mostra EXATAMENTE 3 torneios.

        OS 3 TORNEIOS (em ordem de importância):
        TORNEIO PRINCIPAL: ${topEventText}
        SEGUNDO TORNEIO: ${secondEventText}
        TERCEIRO TORNEIO: ${thirdEventText}

        DESIGN: Logo no topo, título "${label}", data "${dayInfo}" em tamanho discreto, GTD em cor ${brandSecondaryColor}, fundo ${brandPrimaryColor}
        `
    : `
        TIPO: Grade de Programação com Torneio Principal
        TÍTULO: ${labelUpper}
        DATA: ${dayInfo}

        TORNEIO PRINCIPAL (maior GTD): ${topEventText}

        LISTA DOS DEMAIS TORNEIOS:
        ${otherEventsList}

        DESIGN: Logo no topo, título "${label}", data "${dayInfo}" em tamanho discreto, GTD em ${brandSecondaryColor}, fundo ${brandPrimaryColor}
        `;

export const buildBackgroundFlyerPrompt = (eventName: string, gtdValue?: string | null): string =>
  `Generate flyer for ${eventName} with GTD ${gtdValue}`;
