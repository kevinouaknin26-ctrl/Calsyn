/**
 * Conversion audio navigateur — webm/opus → WAV PCM 16-bit mono.
 *
 * Raison : Twilio <Play> ne supporte pas le webm (formats autorisés : mp3, wav,
 * aiff, gsm, ulaw). Le MediaRecorder natif Chrome/Safari produit uniquement du
 * webm/opus ou ogg/opus. On décode le webm en PCM via AudioContext puis on
 * encode en WAV RIFF minimal (mono pour réduire la taille, Twilio resample
 * tout en 8 kHz ulaw à la volée de toute façon).
 */

export async function webmBlobToWav(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer()
  const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const audioContext = new AudioCtx()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBufferToWav(audioBuffer)
  } finally {
    audioContext.close()
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = buffer.sampleRate
  const bitDepth = 16

  // Downmix en mono si besoin (moyenne des canaux)
  const length = buffer.length
  const samples = new Float32Array(length)
  if (buffer.numberOfChannels === 1) {
    samples.set(buffer.getChannelData(0))
  } else {
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)
    for (let i = 0; i < length; i++) samples[i] = (left[i] + right[i]) / 2
  }

  const byteLength = 44 + length * (bitDepth / 8)
  const arrayBuffer = new ArrayBuffer(byteLength)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, byteLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true)  // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true)
  view.setUint16(32, numChannels * bitDepth / 8, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, length * (bitDepth / 8), true)

  let offset = 44
  for (let i = 0; i < length; i++) {
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
