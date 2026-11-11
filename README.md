# Sonora · estúdio de sons por receita

O Sonora transforma uma **receita em JSON** em áudio de verdade, direto no navegador. Não tem IA embutida e não depende de internet: você copia um prompt pronto, pede para a IA que a sua empresa libera (Copilot, ChatGPT, Gemini...) escrever a receita, cola a resposta no app e ouve o resultado. Depois é só exportar.

Foi pensado para redes corporativas: tudo roda no navegador, nenhum dado sai da máquina e o build final é um site estático que pode ser hospedado em qualquer servidor interno.

## Como funciona

1. **Prompt.** Descreva o som (ou escolha uma das ideias prontas), defina quantas variações quer e clique em **Copiar prompt**. O prompt ensina a IA o formato da receita.
2. **Receita.** Cole a resposta da IA no editor. Pode colar tudo, inclusive o texto que a IA escreve em volta: o Sonora extrai o JSON, formata e valida na hora, apontando erros na linha certa. Também dá para abrir um `.json`, arrastar um arquivo ou começar por um dos exemplos.
3. **Som.** O áudio é sintetizado em milissegundos. Você ouve, vê a forma de onda e o espectro, silencia ou isola camadas e exporta no formato que precisar.

Tudo que você gera fica salvo automaticamente no **histórico** (barra lateral redimensionável), que dá para tocar direto, favoritar, renomear, buscar e baixar.

## Formatos de exportação

| Formato | Detalhes |
| --- | --- |
| WAV 16-bit, 24-bit e 32-bit float | Sem perdas, compatível com tudo |
| FLAC | Sem perdas e bem menor que WAV (codificador próprio) |
| AIFF 16-bit | Padrão Apple (Logic, GarageBand) |
| MP3 320 / 192 / 128 kbps | Codificado no navegador (LAME em JavaScript) |
| OGG Opus, WebM Opus, M4A | Quando o navegador suporta (gravação em tempo real) |
| Receita JSON | Para reabrir ou compartilhar |
| Data URI | Copia o WAV em base64 para colar direto no código |
| .zip do histórico | Todos os sons em WAV + as receitas |
| Backup do histórico | Exporta e importa o histórico em JSON |

## Rodando

Requer Node.js 20 ou mais recente.

```bash
npm install
npm run dev        # http://localhost:3000
```

### Build estático (para hospedar internamente)

```bash
npm run build      # gera a pasta out/
npm run preview    # serve a pasta out/ em http://localhost:4173
```

A pasta `out/` é um site estático comum: dá para copiar para IIS, nginx, Apache, um bucket ou a Vercel. Se for publicar numa subpasta (por exemplo `https://intranet/sonora`), gere o build assim:

```bash
SONORA_BASE_PATH=/sonora npm run build
```

O app funciona também em `http://` (sem HTTPS). Nesse caso o navegador não libera a leitura da área de transferência, então o botão **Colar** pede para usar `Ctrl+V` no editor. Copiar continua funcionando.

## A receita

A receita descreve camadas que tocam juntas. Cada camada tem um tipo, tempo de início, duração, volume, envelope, filtros, LFOs, efeitos e repetições.

```json
{
  "name": "Notificação de mensagem",
  "layers": [
    {
      "type": "fm",
      "frequency": "E6",
      "duration": 0.9,
      "modulator": { "ratio": 3.5, "index": 1.6 },
      "envelope": { "attack": 0.002, "decay": 0.5, "sustain": 0.05, "release": 0.4 }
    },
    {
      "type": "fm",
      "frequency": "B6",
      "start": 0.12,
      "duration": 1.1,
      "modulator": { "ratio": 3.5, "index": 1.3 },
      "envelope": "pluck"
    }
  ],
  "master": { "effects": [{ "type": "reverb", "decay": 1.8, "mix": 0.28 }] }
}
```

**Tipos de camada:** `tone` (osciladores com unison e harmônicos), `noise` (branco, rosa, marrom), `fm` (sinos, metais), `pluck` (corda Karplus-Strong), `drum` (kick, snare, hihat, clap, tom, rim, cowbell, crash) e `sequence` (notas, acordes e padrões de bateria com bpm).

**Efeitos:** reverb, delay (com ping-pong), distortion, bitcrush, chorus, phaser, tremolo, filter, compressor e eq.

**Automação:** frequências, filtros e pan aceitam valor fixo (`440` ou `"A4"`), rampa (`{ "from": 2000, "to": 100 }`) ou pontos (`{ "points": [[0, 300], [0.5, 5000]] }`).

O validador é tolerante: aceita comentários, vírgula sobrando, cercas de markdown, apelidos comuns (`freq`, `cutoff`, `saw`, `echo`...) e limita valores fora da faixa. Propriedades desconhecidas viram avisos e são ignoradas. O formato completo está no próprio prompt (botão **Ver prompt**) e em `src/lib/recipe/schema.ts`. Há 16 receitas de exemplo no menu **Exemplos**.

A síntese é determinística: a mesma receita sempre gera exatamente o mesmo áudio (os ruídos usam a `seed` da receita).

## Atalhos

| Ação | Atalho |
| --- | --- |
| Buscar e comandos | `Ctrl K` |
| Mostrar/ocultar histórico | `Ctrl B` |
| Copiar prompt | `Ctrl Shift C` |
| Gerar som | `Ctrl Enter` |
| Tocar / pausar | `Espaço` |
| Parar | `Esc` |
| Ir para a etapa 1, 2 ou 3 | `Alt 1` a `Alt 3` |
| Renomear / excluir item focado | `F2` / `Del` |
| Lista de atalhos | `?` |

## Onde ficam os dados

Histórico, rascunho e preferências ficam no `localStorage` do navegador. Para levar os sons para outra máquina, use **Exportar backup** no menu do histórico e depois **Importar backup**.

## Estrutura

```
src/
  app/                    layout, página e ícone
  components/studio/      interface (etapas, editor, player, histórico, diálogos)
  components/ui/          componentes shadcn/ui
  lib/recipe/             esquema (zod), validação, prompt, exemplos, autocompletar
  lib/audio/              motor de síntese (Web Audio offline), efeitos, player
  lib/audio/encoders/     WAV, AIFF, FLAC e MP3
  stores/                 estado (zustand) do estúdio, histórico e preferências
scripts/check.ts          verificação rápida dos exemplos e codificadores
```

Stack: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Motion, CodeMirror 6, Zustand e Zod.

## Verificações

```bash
npm run check       # exemplos, prompt e codificadores
npm run typecheck
npm run lint
```
