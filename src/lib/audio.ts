/**
 * Capture audio navigateur → WAV PCM 16-bit mono.
 *
 * Raison : MediaRecorder produit du webm/opus sans duration tag ; decodeAudioData
 * ne décode que les premières secondes → audio tronqué. On contourne en
 * capturant les samples PCM directement depuis le MediaStream via un
 * ScriptProcessorNode (deprecated mais fiable et universel).
 *
 * Usage :
 *   const rec = await startWavRecording()
 *   // ... plus tard
 *   const wavBlob = await rec.stop()
 */

export interface WavRecording {
  stop(): Promise<Blob>
  stream: MediaStream
}

export interface StartWavOptions {
  padStartMs?: number  // silence préfixé en début de WAV (absorbe le warmup Twilio <Play>)
}

export async function startWavRecording(
  constraints: MediaStreamConstraints = { audio: true },
  options: StartWavOptions = {},
): Promise<WavRecording> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const audioContext = new AudioCtx()
  const source = audioContext.createMediaStreamSource(stream)
  const bufferSize = 4096
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)

  const chunks: Float32Array[] = []
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    // slice() copie de façon indépendante — évite tout risque de référence au buffer réutilisé
    chunks.push(input.slice())
  }

  source.connect(processor)
  processor.connect(audioContext.destination)
  // Chrome : le context peut être 'suspended' tant qu'il n'y a pas eu d'interaction
  if (audioContext.state === 'suspended') await audioContext.resume()

  return {
    stream,
    async stop() {
      processor.disconnect()
      source.disconnect()
      stream.getTracks().forEach(t => t.stop())
      const sampleRate = audioContext.sampleRate
      await audioContext.close()

      // Padding silence en début (absorbe le warmup Twilio <Play> qui mange 2-3s)
      const padSamples = Math.round((options.padStartMs || 0) / 1000 * sampleRate)
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0) + padSamples
      const flat = new Float32Array(totalLength)
      let offset = padSamples // skip les premiers samples = silence (zeros par défaut)
      for (const c of chunks) { flat.set(c, offset); offset += c.length }

      console.log(`[startWavRecording] ${chunks.length} chunks, ${totalLength - padSamples} samples + ${padSamples} pad, ${(totalLength / sampleRate).toFixed(2)}s @ ${sampleRate}Hz`)

      return floatToWavBlob(flat, sampleRate)
    },
  }
}

function floatToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitDepth = 16
  const byteLength = 44 + samples.length * (bitDepth / 8)
  const arrayBuffer = new ArrayBuffer(byteLength)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, byteLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true)
  view.setUint16(32, numChannels * bitDepth / 8, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * (bitDepth / 8), true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
