/**
 * Receitas de exemplo embutidas no app. Servem para testar sem IA, como
 * ponto de partida para editar e como referência de formato.
 */

export type ExampleCategory = "Interface" | "Jogos" | "Música" | "Ambiente"

export type Example = {
  id: string
  category: ExampleCategory
  recipe: Record<string, unknown>
}

export const EXAMPLES: Example[] = [
  {
    id: "notificacao-suave",
    category: "Interface",
    recipe: {
      name: "Notificação suave",
      description: "Dois toques de sino, leves e arejados",
      tags: ["notificação", "ui", "sino"],
      layers: [
        {
          name: "Sino grave",
          type: "fm",
          frequency: "E6",
          duration: 0.9,
          gain: 0.5,
          modulator: { ratio: 3.5, index: 1.6 },
          envelope: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.4 },
        },
        {
          name: "Sino agudo",
          type: "fm",
          frequency: "B6",
          start: 0.12,
          duration: 1.1,
          gain: 0.42,
          modulator: { ratio: 3.5, index: 1.3 },
          envelope: { attack: 0.002, decay: 0.6, sustain: 0.05, release: 0.5 },
        },
        { name: "Corpo", type: "tone", waveform: "sine", frequency: "E5", duration: 0.7, gain: 0.14, envelope: "pluck" },
      ],
      master: { effects: [{ type: "reverb", decay: 1.8, mix: 0.28, tone: 0.7 }] },
    },
  },
  {
    id: "sucesso",
    category: "Interface",
    recipe: {
      name: "Sucesso",
      description: "Arpejo maior ascendente, brilhante e positivo",
      tags: ["sucesso", "ui", "confirmação"],
      layers: [
        {
          name: "Arpejo",
          type: "sequence",
          gain: 0.55,
          voice: {
            type: "tone",
            waveform: "triangle",
            envelope: { attack: 0.003, decay: 0.25, sustain: 0.25, release: 0.25 },
          },
          notes: [
            { note: "C5", time: 0, duration: 0.12 },
            { note: "E5", time: 0.07, duration: 0.12 },
            { note: "G5", time: 0.14, duration: 0.12 },
            { note: "C6", time: 0.21, duration: 0.55, velocity: 0.9 },
          ],
        },
        {
          name: "Brilho",
          type: "tone",
          waveform: "sine",
          frequency: "C7",
          start: 0.21,
          duration: 0.5,
          gain: 0.08,
          envelope: "pluck",
        },
      ],
      master: {
        effects: [
          { type: "delay", time: 0.12, feedback: 0.25, mix: 0.18 },
          { type: "reverb", decay: 1.2, mix: 0.22 },
        ],
      },
    },
  },
  {
    id: "erro",
    category: "Interface",
    recipe: {
      name: "Erro",
      description: "Dois bipes graves e abafados",
      tags: ["erro", "ui", "alerta"],
      layers: [
        {
          name: "Buzz",
          type: "tone",
          waveform: "square",
          frequency: { from: "A3", to: "G#3" },
          duration: 0.14,
          gain: 0.5,
          unison: { voices: 2, detune: 18, spread: 0.3 },
          envelope: { attack: 0.004, decay: 0.05, sustain: 0.7, release: 0.04 },
          filter: { type: "lowpass", frequency: 1100, Q: 2 },
          repeat: { count: 2, interval: 0.19 },
        },
      ],
      master: { effects: [{ type: "reverb", decay: 0.6, mix: 0.12 }] },
    },
  },
  {
    id: "clique",
    category: "Interface",
    recipe: {
      name: "Clique de interface",
      description: "Clique curto e seco, estilo teclado mecânico",
      tags: ["clique", "ui", "botão"],
      layers: [
        {
          name: "Transiente",
          type: "noise",
          color: "white",
          duration: 0.018,
          gain: 0.45,
          envelope: "click",
          filter: { type: "highpass", frequency: 2500 },
        },
        {
          name: "Corpo",
          type: "tone",
          waveform: "sine",
          frequency: { from: 1800, to: 700 },
          duration: 0.04,
          gain: 0.5,
          envelope: "click",
        },
      ],
    },
  },
  {
    id: "bolha",
    category: "Interface",
    recipe: {
      name: "Bolha (pop)",
      description: "Pop arredondado para toggles e confirmações rápidas",
      tags: ["pop", "ui", "toggle"],
      layers: [
        {
          type: "tone",
          waveform: "sine",
          frequency: { from: 280, to: 1100, time: 0.06 },
          duration: 0.12,
          gain: 0.7,
          envelope: { attack: 0.002, decay: 0.09, sustain: 0, release: 0.02 },
        },
        {
          type: "tone",
          waveform: "triangle",
          frequency: { from: 560, to: 2200, time: 0.05 },
          duration: 0.07,
          gain: 0.15,
          envelope: "percussive",
        },
      ],
    },
  },
  {
    id: "moeda",
    category: "Jogos",
    recipe: {
      name: "Moeda 8-bit",
      description: "Coleta de item em estilo console retrô",
      tags: ["jogo", "8-bit", "moeda"],
      layers: [
        {
          name: "Nota 1",
          type: "tone",
          waveform: "square",
          frequency: "B5",
          duration: 0.08,
          gain: 0.35,
          envelope: "organ",
        },
        {
          name: "Nota 2",
          type: "tone",
          waveform: "square",
          frequency: "E6",
          start: 0.08,
          duration: 0.42,
          gain: 0.35,
          envelope: { attack: 0.001, decay: 0.35, sustain: 0.2, release: 0.05 },
        },
      ],
      master: { effects: [{ type: "bitcrush", bits: 7, mix: 0.6 }] },
    },
  },
  {
    id: "power-up",
    category: "Jogos",
    recipe: {
      name: "Power-up",
      description: "Escada ascendente de bipes com vibrato no final",
      tags: ["jogo", "power-up", "8-bit"],
      layers: [
        {
          name: "Escada",
          type: "tone",
          waveform: "square",
          frequency: "C5",
          duration: 0.07,
          gain: 0.32,
          envelope: "organ",
          repeat: { count: 8, interval: 0.055, pitchStep: 2 },
        },
        {
          name: "Final",
          type: "tone",
          waveform: "triangle",
          frequency: "C6",
          start: 0.44,
          duration: 0.5,
          gain: 0.4,
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.25 },
          lfo: { target: "pitch", rate: 9, depth: 40 },
        },
      ],
      master: { effects: [{ type: "delay", time: 0.11, feedback: 0.3, mix: 0.2 }] },
    },
  },
  {
    id: "laser",
    category: "Jogos",
    recipe: {
      name: "Laser sci-fi",
      description: "Disparo com queda de afinação e eco estéreo",
      tags: ["jogo", "sci-fi", "laser"],
      layers: [
        {
          name: "Feixe",
          type: "tone",
          waveform: "sawtooth",
          frequency: { from: 2600, to: 110, curve: "exponential" },
          duration: 0.35,
          gain: 0.5,
          unison: { voices: 3, detune: 25, spread: 0.8 },
          envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.05 },
          filter: { type: "lowpass", frequency: { from: 9000, to: 700 }, Q: 3 },
        },
        {
          name: "Faísca",
          type: "fm",
          frequency: { from: 1800, to: 300 },
          duration: 0.2,
          gain: 0.2,
          modulator: { ratio: 1.41, index: 6 },
          envelope: "percussive",
        },
      ],
      master: { effects: [{ type: "delay", time: 0.09, feedback: 0.4, mix: 0.3, pingPong: true }] },
    },
  },
  {
    id: "explosao",
    category: "Jogos",
    recipe: {
      name: "Explosão retrô",
      description: "Estouro grave com textura 8-bit",
      tags: ["jogo", "explosão", "8-bit"],
      layers: [
        {
          name: "Estouro",
          type: "noise",
          color: "brown",
          duration: 1.4,
          gain: 0.9,
          envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 0.2 },
          filter: { type: "lowpass", frequency: { from: 4000, to: 120 }, Q: 1.5 },
        },
        { name: "Impacto", type: "drum", kind: "kick", pitch: 38, decay: 0.6, gain: 0.8 },
      ],
      master: {
        effects: [
          { type: "bitcrush", bits: 6, mix: 0.5 },
          { type: "reverb", decay: 1.5, mix: 0.2, tone: 0.3 },
        ],
      },
    },
  },
  {
    id: "alarme",
    category: "Interface",
    recipe: {
      name: "Alarme",
      description: "Alerta insistente de duas notas",
      tags: ["alarme", "alerta"],
      layers: [
        {
          type: "sequence",
          gain: 0.5,
          voice: {
            type: "tone",
            waveform: "square",
            envelope: "organ",
            filter: { type: "lowpass", frequency: 3200 },
          },
          notes: [
            { note: "A5", time: 0, duration: 0.14 },
            { note: "E5", time: 0.18, duration: 0.14 },
          ],
          repeat: { count: 4, interval: 0.4 },
        },
      ],
      master: { effects: [{ type: "reverb", decay: 0.5, mix: 0.1 }] },
    },
  },
  {
    id: "whoosh",
    category: "Ambiente",
    recipe: {
      name: "Whoosh de transição",
      description: "Rajada de ar que atravessa da esquerda para a direita",
      tags: ["transição", "vídeo", "whoosh"],
      layers: [
        {
          type: "noise",
          color: "white",
          duration: 1.2,
          gain: 0.7,
          envelope: { attack: 0.55, decay: 0.15, sustain: 0.6, release: 0.5, curve: "linear" },
          filter: { type: "bandpass", frequency: { points: [[0, 300], [0.6, 5000], [1.2, 500]], curve: "exponential" }, Q: 2.5 },
          pan: { points: [[0, -0.9], [1.2, 0.9]] },
        },
      ],
      master: { effects: [{ type: "reverb", decay: 1.2, mix: 0.25 }] },
    },
  },
  {
    id: "chuva",
    category: "Ambiente",
    recipe: {
      name: "Chuva fina",
      description: "Textura de chuva com respiração lenta, ótima para fundo",
      tags: ["ambiente", "chuva", "foco"],
      duration: 8,
      layers: [
        {
          name: "Chuva",
          type: "noise",
          color: "pink",
          duration: 8,
          gain: 0.55,
          envelope: "sustain",
          filter: [
            { type: "highpass", frequency: 400 },
            { type: "lowpass", frequency: 6000 },
          ],
          lfo: { target: "gain", rate: 0.18, depth: 0.25 },
        },
        {
          name: "Ronco distante",
          type: "noise",
          color: "brown",
          duration: 8,
          gain: 0.35,
          envelope: "sustain",
          filter: { type: "lowpass", frequency: 300 },
        },
        {
          name: "Gotas",
          type: "sequence",
          gain: 0.12,
          voice: { type: "tone", waveform: "sine", envelope: "click", gain: 1 },
          notes: [
            { note: 2400, time: 0.7, duration: 0.03 },
            { note: 3100, time: 1.9, duration: 0.03, velocity: 0.5 },
            { note: 2700, time: 3.3, duration: 0.03 },
            { note: 3500, time: 4.1, duration: 0.03, velocity: 0.4 },
            { note: 2200, time: 5.6, duration: 0.03 },
            { note: 2900, time: 6.8, duration: 0.03, velocity: 0.6 },
          ],
          pan: { points: [[0, -0.5], [4, 0.6], [8, -0.3]] },
        },
      ],
      master: { fadeIn: 1, fadeOut: 1.5, effects: [{ type: "reverb", decay: 2.5, mix: 0.3, tone: 0.4 }] },
    },
  },
  {
    id: "sino-meditacao",
    category: "Ambiente",
    recipe: {
      name: "Sino de meditação",
      description: "Tigela tibetana com batimento lento e cauda longa",
      tags: ["meditação", "sino", "calmo"],
      layers: [
        {
          name: "Fundamental",
          type: "fm",
          frequency: "G3",
          duration: 6,
          gain: 0.6,
          modulator: {
            ratio: 3.5,
            index: 2.2,
            envelope: { attack: 0.002, decay: 2.5, sustain: 0.1, release: 2 },
          },
          envelope: { attack: 0.004, decay: 5, sustain: 0, release: 1 },
          lfo: { target: "gain", rate: 4.2, depth: 0.15 },
        },
        {
          name: "Parcial",
          type: "fm",
          frequency: "G4",
          detune: 7,
          duration: 4,
          gain: 0.2,
          modulator: { ratio: 2.76, index: 1 },
          envelope: { attack: 0.004, decay: 3.5, sustain: 0, release: 0.5 },
        },
      ],
      master: { effects: [{ type: "reverb", decay: 4, mix: 0.35, tone: 0.6 }] },
    },
  },
  {
    id: "lofi",
    category: "Música",
    recipe: {
      name: "Batida lo-fi",
      description: "Dois compassos de lo-fi hip hop com acordes e chiado de vinil",
      tags: ["música", "lo-fi", "loop"],
      bpm: 84,
      layers: [
        {
          name: "Bateria",
          type: "sequence",
          gain: 0.75,
          voice: { type: "drum", tone: 0.35 },
          notes: [
            { note: "kick", time: 0 },
            { note: "hihat", time: 0.5, velocity: 0.5 },
            { note: "snare", time: 1 },
            { note: "hihat", time: 1.5, velocity: 0.4 },
            { note: "kick", time: 1.75, velocity: 0.7 },
            { note: "kick", time: 2.25 },
            { note: "hihat", time: 2.5, velocity: 0.5 },
            { note: "snare", time: 3 },
            { note: "hihat", time: 3.5, velocity: 0.45 },
          ],
          repeat: { count: 2 },
        },
        {
          name: "Acordes",
          type: "sequence",
          gain: 0.45,
          voice: {
            type: "tone",
            waveform: "triangle",
            unison: { voices: 2, detune: 10, spread: 0.5 },
            envelope: { attack: 0.04, decay: 0.4, sustain: 0.55, release: 0.6 },
            filter: { type: "lowpass", frequency: 1600 },
          },
          notes: [
            { note: ["A3", "C4", "E4", "G4"], time: 0, duration: 3.8 },
            { note: ["F3", "A3", "C4", "E4"], time: 4, duration: 3.8 },
          ],
          lfo: { target: "gain", rate: 0.5, depth: 0.1 },
        },
        {
          name: "Vinil",
          type: "noise",
          color: "pink",
          duration: 5.8,
          gain: 0.06,
          envelope: "sustain",
          filter: { type: "bandpass", frequency: 3000, Q: 0.8 },
        },
      ],
      master: {
        effects: [
          { type: "bitcrush", bits: 10, mix: 0.25 },
          { type: "eq", low: 2, high: -5 },
          { type: "compressor", threshold: -20, ratio: 3 },
          { type: "reverb", decay: 1.4, mix: 0.18, tone: 0.35 },
        ],
      },
    },
  },
  {
    id: "synthwave",
    category: "Música",
    recipe: {
      name: "Arpejo synthwave",
      description: "Arpejo anos 80 com serra desafinada, chorus e eco pontuado",
      tags: ["música", "synthwave", "retrô"],
      bpm: 110,
      layers: [
        {
          name: "Arpejo",
          type: "sequence",
          gain: 0.5,
          voice: {
            type: "tone",
            waveform: "sawtooth",
            unison: { voices: 3, detune: 16, spread: 0.7 },
            envelope: { attack: 0.003, decay: 0.18, sustain: 0.3, release: 0.12 },
            filter: { type: "lowpass", frequency: { from: 4500, to: 1200 }, Q: 4 },
          },
          notes: [
            { note: "A3", time: 0, duration: 0.25 },
            { note: "C4", time: 0.25, duration: 0.25 },
            { note: "E4", time: 0.5, duration: 0.25 },
            { note: "A4", time: 0.75, duration: 0.25 },
            { note: "E4", time: 1, duration: 0.25 },
            { note: "C4", time: 1.25, duration: 0.25 },
            { note: "F3", time: 2, duration: 0.25 },
            { note: "A3", time: 2.25, duration: 0.25 },
            { note: "C4", time: 2.5, duration: 0.25 },
            { note: "F4", time: 2.75, duration: 0.25 },
            { note: "C4", time: 3, duration: 0.25 },
            { note: "A3", time: 3.25, duration: 0.25 },
          ],
          repeat: { count: 2 },
          effects: [{ type: "chorus", rate: 0.8, depth: 0.6, mix: 0.45 }],
        },
        {
          name: "Baixo",
          type: "sequence",
          gain: 0.5,
          voice: { type: "tone", waveform: "square", envelope: "pluck", filter: { type: "lowpass", frequency: 700 } },
          notes: [
            { note: "A1", time: 0, duration: 1.8 },
            { note: "F1", time: 2, duration: 1.8 },
          ],
          repeat: { count: 2 },
        },
        {
          name: "Kick",
          type: "sequence",
          gain: 0.6,
          voice: { type: "drum" },
          notes: [{ note: "kick", time: 0 }, { note: "kick", time: 1 }, { note: "kick", time: 2 }, { note: "kick", time: 3 }],
          repeat: { count: 2 },
        },
      ],
      master: {
        effects: [
          { type: "delay", time: 0.409, feedback: 0.35, mix: 0.22, pingPong: true },
          { type: "reverb", decay: 2, mix: 0.2 },
        ],
      },
    },
  },
  {
    id: "violao",
    category: "Música",
    recipe: {
      name: "Violão dedilhado",
      description: "Dedilhado em Sol maior com cordas Karplus-Strong",
      tags: ["música", "violão", "acústico"],
      bpm: 96,
      layers: [
        {
          type: "sequence",
          gain: 0.6,
          voice: { type: "pluck", damping: 0.35, brightness: 0.55 },
          notes: [
            { note: "G2", time: 0, duration: 2 },
            { note: "D3", time: 0.5, duration: 1.5 },
            { note: "G3", time: 1, duration: 1 },
            { note: "B3", time: 1.5, duration: 1 },
            { note: "D4", time: 2, duration: 1 },
            { note: "B3", time: 2.5, duration: 1 },
            { note: "G3", time: 3, duration: 1.5, velocity: 0.7 },
            { note: ["G2", "B3", "D4", "G4"], time: 4, duration: 3 },
          ],
        },
      ],
      master: { effects: [{ type: "reverb", decay: 1.6, mix: 0.2, tone: 0.5 }] },
    },
  },
]

export function exampleJson(e: Example) {
  return JSON.stringify(e.recipe, null, 2)
}
