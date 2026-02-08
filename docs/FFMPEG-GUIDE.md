# FFmpeg Video Editing Guide

Guia completo de como usar FFmpeg para editar videos programaticamente. Este documento cobre todas as operacoes comuns para criar videos profissionais como Shorts, TikToks e Reels.

## Indice

1. [Conceitos Basicos](#conceitos-basicos)
2. [Pipeline de Video](#pipeline-de-video)
3. [Operacoes Basicas](#operacoes-basicas)
4. [Concatenar Videos (Juntar Clips)](#concatenar-videos-juntar-clips)
5. [Transicoes entre Clips](#transicoes-entre-clips)
6. [Overlay de Imagens](#overlay-de-imagens)
7. [Mixagem de Audio](#mixagem-de-audio)
8. [Legendas](#legendas)
9. [Normalizacao de Video](#normalizacao-de-video)
10. [Configuracoes de Qualidade](#configuracoes-de-qualidade)
11. [Exemplos Completos](#exemplos-completos)
12. [Uso no Browser (WebAssembly)](#uso-no-browser-webassembly)

---

## Conceitos Basicos

### Estrutura de um comando FFmpeg

```bash
ffmpeg [input_options] -i input1 -i input2 [filters] [output_options] output
```

### Terminologia

| Termo | Significado |
|-------|-------------|
| `-i` | Input (arquivo de entrada) |
| `-filter_complex` | Filtros complexos com multiplos inputs/outputs |
| `-vf` | Video filter (filtro simples de video) |
| `-af` | Audio filter (filtro simples de audio) |
| `-map` | Mapeia streams especificos para o output |
| `-c:v` | Codec de video |
| `-c:a` | Codec de audio |
| `-y` | Sobrescreve arquivo sem perguntar |

### Referenciando Streams

```
[0:v]  = Video do primeiro input
[0:a]  = Audio do primeiro input
[1:v]  = Video do segundo input
[1:a]  = Audio do segundo input
[nome] = Stream nomeado (output de um filtro)
```

---

## Pipeline de Video

Estrutura tipica de um video de Shorts/TikTok:

```
┌─────────────────────────────────────┐
│          VIDEO BASE (base.mp4)      │  ← Video unico e continuo
│   (gameplay, parkour, satisfying)   │     (sem cortes)
├─────────────────────────────────────┤
│  + Audio narrado (ElevenLabs)       │  ← Camada de audio
├─────────────────────────────────────┤
│  + Musica de fundo (10% volume)     │  ← Camada de audio
├─────────────────────────────────────┤
│  + Legendas queimadas (subtitles)   │  ← Camada visual
├─────────────────────────────────────┤
│  + Imagem overlay (thumbnail)       │  ← Camada visual
└─────────────────────────────────────┘
                 ↓
           output.mp4
```

---

## Operacoes Basicas

### Converter formato

```bash
ffmpeg -i input.mov -c:v libx264 -c:a aac output.mp4
```

### Cortar video (trim)

```bash
# Do segundo 10 ao segundo 30
ffmpeg -i input.mp4 -ss 10 -to 30 -c copy output.mp4

# Primeiros 60 segundos
ffmpeg -i input.mp4 -t 60 -c copy output.mp4
```

### Redimensionar

```bash
# Para 1080x1920 (formato 9:16 vertical)
ffmpeg -i input.mp4 -vf "scale=1080:1920" output.mp4

# Manter proporcao com padding preto
ffmpeg -i input.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" output.mp4
```

### Extrair audio

```bash
ffmpeg -i video.mp4 -vn -c:a mp3 audio.mp3
```

### Remover audio

```bash
ffmpeg -i input.mp4 -an -c:v copy output.mp4
```

### Converter MP3 para WAV (para Whisper)

```bash
ffmpeg -i audio.mp3 -ar 16000 -ac 1 audio.wav
```

---

## Concatenar Videos (Juntar Clips)

### Metodo 1: Concat Demuxer (videos identicos)

Use quando os videos tem EXATAMENTE o mesmo formato (resolucao, codec, fps).

```bash
# Criar arquivo de lista
echo "file 'video1.mp4'" > list.txt
echo "file 'video2.mp4'" >> list.txt
echo "file 'video3.mp4'" >> list.txt

# Concatenar
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
```

### Metodo 2: Filter Complex (videos diferentes)

Use quando os videos tem formatos diferentes. Normaliza antes de juntar.

```bash
ffmpeg -i video1.mp4 -i video2.mp4 -i video3.mp4 \
  -filter_complex "
    [0:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v0];
    [0:a]aresample=44100,asetpts=PTS-STARTPTS[a0];
    [1:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v1];
    [1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];
    [2:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v2];
    [2:a]aresample=44100,asetpts=PTS-STARTPTS[a2];
    [v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vout][aout]
  " \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -c:a aac \
  output.mp4
```

### Metodo 3: Concatenar apenas audios

```bash
ffmpeg -i audio1.wav -i audio2.wav \
  -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[aout]" \
  -map "[aout]" output.wav
```

---

## Transicoes entre Clips

### Tipos de transicao (xfade)

```
fade        - Fade simples (mais comum)
dissolve    - Dissolve suave
wipeleft    - Wipe da direita para esquerda
wiperight   - Wipe da esquerda para direita
wipeup      - Wipe de baixo para cima
wipedown    - Wipe de cima para baixo
slideleft   - Slide para esquerda
slideright  - Slide para direita
smoothleft  - Smooth slide esquerda
smoothright - Smooth slide direita
circleopen  - Circulo abrindo
circleclose - Circulo fechando
radial      - Transicao radial
pixelize    - Pixelizacao
```

### Xfade entre 2 videos

```bash
# offset = quando a transicao comeca (duracao_video1 - duracao_transicao)
# duration = duracao da transicao

ffmpeg -i video1.mp4 -i video2.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=fade:duration=1:offset=4[vout];
    [0:a][1:a]acrossfade=d=1:c1=exp:c2=exp[aout]
  " \
  -map "[vout]" -map "[aout]" \
  output.mp4
```

**Parametros:**
- `transition=fade`: Tipo de transicao
- `duration=1`: Duracao da transicao (1 segundo)
- `offset=4`: Comeca aos 4s (se video1 tem 5s, transicao de 4s a 5s)
- `c1=exp:c2=exp`: Curvas exponenciais para audio (mais suave)

### Xfade entre multiplos videos

```bash
ffmpeg -i v1.mp4 -i v2.mp4 -i v3.mp4 \
  -filter_complex "
    [0:v]trim=0:5,setpts=PTS-STARTPTS,format=yuv420p[v0];
    [1:v]trim=0:5,setpts=PTS-STARTPTS,format=yuv420p[v1];
    [2:v]trim=0:5,setpts=PTS-STARTPTS,format=yuv420p[v2];
    [0:a]atrim=0:5,asetpts=PTS-STARTPTS[a0];
    [1:a]atrim=0:5,asetpts=PTS-STARTPTS[a1];
    [2:a]atrim=0:5,asetpts=PTS-STARTPTS[a2];
    [v0][v1]xfade=transition=fade:duration=0.5:offset=4.5[vt1];
    [vt1][v2]xfade=transition=fade:duration=0.5:offset=9[vout];
    [a0][a1]acrossfade=d=0.5:c1=exp:c2=exp[at1];
    [at1][a2]acrossfade=d=0.5:c1=exp:c2=exp[aout]
  " \
  -map "[vout]" -map "[aout]" \
  output.mp4
```

**Calculo do offset:**
```
Video 1: 5s, Video 2: 5s, Video 3: 5s
Transicao: 0.5s

Transicao 1: offset = 5 - 0.5 = 4.5
Transicao 2: offset = 4.5 + 5 - 0.5 = 9
```

---

## Overlay de Imagens

### Overlay centralizado

```bash
ffmpeg -i video.mp4 -i image.png \
  -filter_complex "[0:v][1:v]overlay=(W-w)/2:(H-h)/2[vout]" \
  -map "[vout]" -map "0:a" \
  output.mp4
```

### Overlay no topo (1/6 da altura)

```bash
ffmpeg -i video.mp4 -i image.png \
  -filter_complex "
    [1:v]scale=-1:300[img];
    [0:v][img]overlay=(W-w)/2:(H-h)/6[vout]
  " \
  -map "[vout]" -map "0:a" \
  output.mp4
```

### Overlay com tempo especifico

```bash
# Mostra imagem de 0s a 5s
ffmpeg -i video.mp4 -i image.png \
  -filter_complex "
    [0:v][1:v]overlay=(W-w)/2:(H-h)/2:enable='between(t,0,5)'[vout]
  " \
  -map "[vout]" -map "0:a" \
  output.mp4
```

### Multiplos overlays em tempos diferentes

```bash
ffmpeg -i video.mp4 -i img1.png -i img2.png -i img3.png \
  -filter_complex "
    [0:v][1:v]overlay=(W-w)/2:(H-h)/2:enable='between(t,0,3)'[v1];
    [v1][2:v]overlay=(W-w)/2:(H-h)/2:enable='between(t,3,6)'[v2];
    [v2][3:v]overlay=(W-w)/2:(H-h)/2:enable='between(t,6,9)'[vout]
  " \
  -map "[vout]" -map "0:a" \
  output.mp4
```

### Posicoes de overlay

```
Centralizado:     (W-w)/2:(H-h)/2
Topo esquerda:    0:0
Topo direita:     W-w:0
Topo centro:      (W-w)/2:0
Centro esquerda:  0:(H-h)/2
Centro direita:   W-w:(H-h)/2
Baixo esquerda:   0:H-h
Baixo direita:    W-w:H-h
Baixo centro:     (W-w)/2:H-h
```

---

## Mixagem de Audio

### Substituir audio do video

```bash
ffmpeg -i video.mp4 -i audio.mp3 \
  -map 0:v -map 1:a \
  -c:v copy -c:a aac \
  output.mp4
```

### Mixar audio com video (manter ambos)

```bash
ffmpeg -i video.mp4 -i music.mp3 \
  -filter_complex "
    [0:a]volume=1[original];
    [1:a]volume=0.1[music];
    [original][music]amix=inputs=2:duration=shortest[aout]
  " \
  -map "0:v" -map "[aout]" \
  output.mp4
```

### Mixar narracao + musica de fundo + video

```bash
ffmpeg -i video.mp4 -i narration.mp3 -i background_music.mp3 \
  -filter_complex "
    [1:a]volume=1[narr];
    [2:a]volume=0.1[bg];
    [narr][bg]amix=inputs=2:duration=first[aout]
  " \
  -map "0:v" -map "[aout]" \
  -c:v copy -c:a aac \
  output.mp4
```

### Delay no audio (atrasar)

```bash
# Atrasar audio em 2 segundos
ffmpeg -i video.mp4 -i audio.mp3 \
  -filter_complex "[1:a]adelay=2000:all=1[delayed]" \
  -map "0:v" -map "[delayed]" \
  output.mp4
```

### Ajustar volume

```bash
# Volume em 50%
ffmpeg -i video.mp4 -af "volume=0.5" output.mp4

# Aumentar volume em 3dB
ffmpeg -i video.mp4 -af "volume=3dB" output.mp4
```

### Remover silencio

```bash
ffmpeg -i audio.mp3 \
  -af "silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB" \
  output.mp3
```

---

## Legendas

### Queimar legendas (hardcoded)

```bash
ffmpeg -i video.mp4 \
  -vf "subtitles=legendas.srt" \
  output.mp4
```

### Legendas com estilo customizado

```bash
ffmpeg -i video.mp4 \
  -vf "subtitles=legendas.srt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2,Alignment=10'" \
  output.mp4
```

**Parametros de estilo:**
- `FontName`: Nome da fonte
- `FontSize`: Tamanho
- `PrimaryColour`: Cor do texto (formato &HBBGGRR&)
- `OutlineColour`: Cor do contorno
- `Outline`: Espessura do contorno
- `Alignment`: Posicao (10 = centro-topo)
- `MarginV`: Margem vertical

### Posicoes de Alignment

```
7 - Topo Esquerda     8 - Topo Centro     9 - Topo Direita
4 - Centro Esquerda   5 - Centro          6 - Centro Direita
1 - Baixo Esquerda    2 - Baixo Centro    3 - Baixo Direita
+3 para estilo "karaoke" (10, 11, 12)
```

### Legendas com VTT

```bash
ffmpeg -i video.mp4 \
  -vf "subtitles=legendas.vtt:force_style='Alignment=10,FontName=Trebuchet,FontSize=18,PrimaryColour=&Hffffff&,OutlineColour=&H00000000&,MarginV=25'" \
  output.mp4
```

---

## Normalizacao de Video

Para transicoes suaves, TODOS os videos precisam ter o mesmo formato.

### Pipeline de normalizacao completo

```bash
ffmpeg -i input.mp4 \
  -vf "
    scale=1080:1920:force_original_aspect_ratio=decrease,
    pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,
    fps=30,
    format=yuv420p,
    setsar=1
  " \
  -af "aresample=44100" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  output.mp4
```

**Explicacao:**
| Filtro | Funcao |
|--------|--------|
| `scale=1080:1920:force_original_aspect_ratio=decrease` | Redimensiona mantendo proporcao |
| `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black` | Adiciona padding preto para preencher |
| `fps=30` | Normaliza para 30fps |
| `format=yuv420p` | Formato de pixel padrao |
| `setsar=1` | Reseta sample aspect ratio |
| `aresample=44100` | Normaliza audio para 44.1kHz |

---

## Configuracoes de Qualidade

### Presets de encoding (libx264)

```
ultrafast - Mais rapido, pior qualidade
superfast
veryfast
faster
fast
medium    - Balanceado (recomendado)
slow
slower
veryslow  - Mais lento, melhor qualidade
```

### CRF (Constant Rate Factor)

```
0  - Lossless
18 - Visualmente lossless
23 - Padrao (boa qualidade)
28 - Qualidade media
51 - Pior qualidade
```

### Comando com qualidade otimizada

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset medium \
  -crf 23 \
  -c:a aac \
  -b:a 192k \
  -movflags +faststart \
  output.mp4
```

**`-movflags +faststart`**: Move metadados para o inicio do arquivo, permitindo streaming antes do download completo.

---

## Exemplos Completos

### Exemplo 1: Video completo estilo Shorts

```bash
ffmpeg \
  -i gameplay.mp4 \
  -i narration.mp3 \
  -i background_music.mp3 \
  -i thumbnail.png \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p[video];
    [1:a]volume=1[narr];
    [2:a]volume=0.1[bg];
    [narr][bg]amix=inputs=2:duration=first[audio];
    [3:v]scale=-1:300[img];
    [video][img]overlay=(W-w)/2:(H-h)/6[vout]
  " \
  -map "[vout]" -map "[audio]" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  -t 60 \
  output.mp4
```

### Exemplo 2: Juntar clips com transicao fade

```bash
ffmpeg -i clip1.mp4 -i clip2.mp4 -i clip3.mp4 \
  -filter_complex "
    [0:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v0];
    [1:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v1];
    [2:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v2];
    [0:a]aresample=44100,asetpts=PTS-STARTPTS[a0];
    [1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];
    [2:a]aresample=44100,asetpts=PTS-STARTPTS[a2];
    [v0][v1]xfade=transition=fade:duration=0.5:offset=4.5[vt1];
    [vt1][v2]xfade=transition=fade:duration=0.5:offset=9[vout];
    [a0][a1]acrossfade=d=0.5:c1=exp:c2=exp[at1];
    [at1][a2]acrossfade=d=0.5:c1=exp:c2=exp[aout]
  " \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  output.mp4
```

### Exemplo 3: Video com legendas estilizadas

```bash
ffmpeg -i video.mp4 -i audio.mp3 \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[scaled];
    [scaled]subtitles=legendas.vtt:force_style='Alignment=10,FontName=Impact,FontSize=22,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=3,MarginV=50'[vout]
  " \
  -map "[vout]" -map "1:a" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  output.mp4
```

---

## Uso no Browser (WebAssembly)

### Instalacao

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

### Configuracao basica

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const ffmpeg = new FFmpeg();

// Carregar FFmpeg (CDN)
const FFMPEG_CORE_VERSION = "0.12.6";
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

await ffmpeg.load({
  coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript"),
  wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
});
```

### Exemplo: Concatenar videos no browser

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";

const concatenateVideos = async (videoBlobs: Blob[]): Promise<Blob> => {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ /* ... */ });

  // Escrever arquivos no filesystem virtual
  for (let i = 0; i < videoBlobs.length; i++) {
    const data = new Uint8Array(await videoBlobs[i].arrayBuffer());
    await ffmpeg.writeFile(`input_${i}.mp4`, data);
  }

  // Criar lista de concat
  const concatList = videoBlobs
    .map((_, i) => `file input_${i}.mp4`)
    .join("\n");
  await ffmpeg.writeFile("list.txt", concatList);

  // Executar FFmpeg
  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", "list.txt",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-y", "output.mp4"
  ]);

  // Ler resultado
  const outputData = await ffmpeg.readFile("output.mp4");
  return new Blob([outputData], { type: "video/mp4" });
};
```

### Exemplo: Transicao xfade no browser

```typescript
const mergeWithTransition = async (
  video1: Blob,
  video2: Blob,
  transitionDuration: number = 0.5
): Promise<Blob> => {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ /* ... */ });

  // Escrever inputs
  await ffmpeg.writeFile("v1.mp4", new Uint8Array(await video1.arrayBuffer()));
  await ffmpeg.writeFile("v2.mp4", new Uint8Array(await video2.arrayBuffer()));

  // Obter duracao do primeiro video (simplificado - assume 5s)
  const video1Duration = 5;
  const offset = video1Duration - transitionDuration;

  // Filter complex com xfade
  const filterComplex = `
    [0:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v0];
    [1:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v1];
    [0:a]aresample=44100,asetpts=PTS-STARTPTS[a0];
    [1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];
    [v0][v1]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}[vout];
    [a0][a1]acrossfade=d=${transitionDuration}:c1=exp:c2=exp[aout]
  `;

  await ffmpeg.exec([
    "-i", "v1.mp4",
    "-i", "v2.mp4",
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "192k",
    "-y", "output.mp4"
  ]);

  const outputData = await ffmpeg.readFile("output.mp4");
  return new Blob([outputData], { type: "video/mp4" });
};
```

---

## Dicas e Troubleshooting

### Problema: Transicoes com "pulo" visual

**Causa:** Videos com resolucoes/fps diferentes.
**Solucao:** Normalizar todos os videos antes:
```
scale=1080:1920,fps=30,format=yuv420p,setsar=1
```

### Problema: Audio cortando abruptamente

**Causa:** Crossfade com curvas lineares.
**Solucao:** Usar curvas exponenciais:
```
acrossfade=d=0.5:c1=exp:c2=exp
```

### Problema: Video nao toca no browser

**Causa:** Metadados no final do arquivo.
**Solucao:** Adicionar `-movflags +faststart`

### Problema: Cores diferentes entre clips

**Causa:** Diferentes color spaces.
**Solucao:** Normalizar formato de pixel:
```
format=yuv420p
```

### Problema: Aspecto distorcido

**Causa:** Sample aspect ratio inconsistente.
**Solucao:** Resetar SAR:
```
setsar=1
```

---

## Referencias

- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [FFmpeg Filters](https://ffmpeg.org/ffmpeg-filters.html)
- [xfade Transitions](https://trac.ffmpeg.org/wiki/Xfade)
- [@ffmpeg/ffmpeg (npm)](https://www.npmjs.com/package/@ffmpeg/ffmpeg)
