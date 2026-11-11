# Sonora · estúdio de sons por receita

O Sonora transforma uma **receita em JSON** em áudio de verdade, direto no navegador. Não tem IA embutida e não depende de internet: você copia um prompt pronto, pede para a IA que a sua empresa libera (Copilot, ChatGPT, Gemini...) escrever a receita, cola a resposta no app e ouve o resultado. Depois é só exportar.

Foi pensado para redes corporativas: tudo roda no navegador, nenhum dado sai da máquina e o build final é um site estático que pode ser hospedado em qualquer servidor interno.

## Como funciona

1. **Prompt.** Descreva o som (ou escolha uma das ideias prontas), defina quantas variações quer e clique em **Copiar prompt**. O prompt ensina a IA o formato da receita.
2. **Receita.** Cole a resposta da IA no editor. Pode colar tudo, inclusive o texto que a IA escreve em volta: o Sonora extrai o JSON, formata e valida na hora, apontando erros na linha certa. Também dá para abrir um `.json`, arrastar um arquivo ou começar por um dos exemplos.
3. **Som.** O áudio é sintetizado em milissegundos. Você ouve, vê a forma de onda e o espectro, silencia ou isola camadas e exporta no formato que precisar.

Para ir e voltar com a IA sem montar nada na mão:

- **Pedir ajuste:** no player, escreva o que mudar ("mais grave, sem reverb") e o app copia um pedido que já leva a receita atual.
- **Pedir correção:** se a receita vier com erro, um botão copia o pedido de correção com os erros e a linha de cada um.
- **Ajustes rápidos:** tom e velocidade mudam direto no player, sem IA. O ajuste fica gravado na receita (`transpose` e `speed`).
- **Prévia:** no editor, `Alt Enter` toca a receita sem salvar. No menu Exemplos, cada item tem um botão para ouvir.
- **Vários sons por pedido:** peça de 1 a 4 versões no mesmo pedido e compare lado a lado no player.
- **Link:** o botão de link copia um endereço com a receita compactada dentro. Quem abrir recebe a receita no editor.

## Histórico organizado por pedido

Tudo que você gera fica salvo automaticamente neste navegador. A barra lateral mostra cada **pedido** (o texto que você descreveu ou o ajuste que pediu) com os sons que ele gerou logo abaixo, então dá para ver o que foi criado, quando e a partir de quê.

- **Novo som** fica sempre no topo da barra lateral (`Alt N`).
- **Busca** procura no nome do som, nas etiquetas e no texto do pedido.
- **Agrupar por** pedido, data, coleção ou etiqueta, e **ordenar** por data, nome ou duração.
- **Coleções** juntam sons de pedidos diferentes (por projeto, por exemplo). Crie pelo `+` nos filtros e mova sons pelo menu de cada item.
- **Favoritos** com a estrela, direto na lista ou nos cartões do player.
- Quando um pedido gera vários sons, todos aparecem juntos acima do player para comparar com um clique.
- O menu de cada pedido permite usar o texto de novo, anotar o que foi pedido, baixar os sons em .zip ou excluir tudo de uma vez.

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

## Baixar sem git clone

Se a rede da empresa bloqueia o `git clone`, mas o GitHub abre no navegador:

1. Abra [`scripts/baixar-sonora.sh`](scripts/baixar-sonora.sh) no GitHub, clique no botão de copiar o conteúdo (Copy raw file) e salve num arquivo `baixar-sonora.sh`.
2. No terminal (no Windows, use o Git Bash), rode `bash baixar-sonora.sh`.

O script tenta três caminhos até um funcionar: o pacote `.tar.gz`/`.zip` do repositório, a API do GitHub e, por último, uma lista de arquivos embutida nele mesmo, baixando arquivo por arquivo. Nos dois últimos ele confere o hash do git de cada arquivo, então a cópia fica idêntica ao repositório.

| Opção | O que faz |
| --- | --- |
| `bash baixar-sonora.sh minha-pasta` | escolhe a pasta de destino (padrão: `sonora-studio`) |
| `--git` | cria um repositório git local com um commit da cópia |
| `--instalar` | roda `npm install` no final |
| `--inseguro` | ignora erro de certificado (proxy que intercepta HTTPS) |
| `--metodo zip\|api\|lista` | força um caminho específico |
| `--ref <branch\|tag\|commit>` | baixa outra versão |

Se nenhum endereço do GitHub estiver liberado, use [`scripts/sonora-offline.sh`](scripts/sonora-offline.sh) do mesmo jeito: ele traz o projeto inteiro embutido (cerca de 280 KB de texto) e não precisa de rede.

Os dois scripts são atualizados sozinhos pelo workflow `.github/workflows/scripts-de-copia.yml` a cada push na `main`.

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

**Ajustes globais:** `transpose` (semitons somados a todas as notas) e `speed` (multiplicador de andamento, sem mudar a afinação) na raiz da receita.

**Automação:** frequências, filtros e pan aceitam valor fixo (`440` ou `"A4"`), rampa (`{ "from": 2000, "to": 100 }`) ou pontos (`{ "points": [[0, 300], [0.5, 5000]] }`).

O validador é tolerante: aceita comentários, vírgula sobrando, cercas de markdown, apelidos comuns (`freq`, `cutoff`, `saw`, `echo`...) e limita valores fora da faixa. Propriedades desconhecidas viram avisos e são ignoradas. O formato completo está no próprio prompt (botão **Ver prompt**) e em `src/lib/recipe/schema.ts`. Há 16 receitas de exemplo no menu **Exemplos**.

A síntese é determinística: a mesma receita sempre gera exatamente o mesmo áudio (os ruídos usam a `seed` da receita).

## Atalhos

| Ação | Atalho |
| --- | --- |
| Novo som | `Alt N` |
| Buscar e comandos | `Ctrl K` |
| Mostrar/ocultar histórico | `Ctrl B` |
| Copiar prompt | `Ctrl Shift C` |
| Gerar som | `Ctrl Enter` |
| Ouvir prévia (no editor) | `Alt Enter` |
| Tocar / pausar | `Espaço` |
| Parar | `Esc` |
| Ir para a etapa 1, 2 ou 3 | `Alt 1` a `Alt 3` |
| Renomear / excluir item focado | `F2` / `Del` |
| Lista de atalhos | `?` |

## Onde ficam os dados

Histórico, pedidos, coleções, rascunho e preferências ficam no `localStorage` do navegador. Para levar os sons para outra máquina, use **Exportar backup** no menu do histórico e depois **Importar backup**.

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
scripts/baixar-sonora.sh  cópia do repositório sem git clone
scripts/sonora-offline.sh instalador com o projeto embutido (gerado)
```

Stack: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Motion, CodeMirror 6, Zustand e Zod.

## Verificações

```bash
npm run check       # exemplos, prompt e codificadores
npm run typecheck
npm run lint
```
