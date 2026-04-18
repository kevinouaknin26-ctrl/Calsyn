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

export async function startWavRecording(constraints: MediaStreamConstraints = { audio: true }): Promise<WavRecording> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const audioContext = new AudioCtx()
  const source = audioContext.createMediaStreamSource(stream)
  const bufferSize = 4096
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)

  const chunks: Float32Array[] = []
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(input))
  }

  source.connect(processor)
  processor.connect(audioContext.destination)

  return {
    stream,
    async stop() {
      processor.disconnect()
      source.disconnect()
      stream.getTracks().forEach(t => t.stop())
      const sampleRate = audioContext.sampleRate
      await audioContext.close()

      // Concat tous les chunks PCM en un seul Float32Array
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
      const flat = new Float32Array(totalLength)
      let offset = 0
      for (const c of chunks) { flat.set(c, offset); offset += c.length }

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
