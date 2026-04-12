/**
 * Interface d'abstraction pour les providers VoIP.
 * XState et les hooks parlent a cette interface, jamais directement a Twilio/Telnyx.
 * Changer de provider = changer 1 fichier d'implementation.
 */

export type CallState =
  | 'new'       // appel cree, pas encore connecte
  | 'ringing'   // le telephone sonne chez le prospect
  | 'active'    // conversation en cours
  | 'held'      // en attente / mute
  | 'done'      // appel termine
  | 'error'     // erreur

export interface AudioSample {
  mos: number          // Mean Opinion Score 1-5
  jitter: number       // ms
  rtt: number          // ms
  packetLoss: number   // pourcentage
  timestamp: number
}

export interface CallSession {
  /** Identifiant unique de l'appel (CallSid Twilio ou call_control_id Telnyx) */
  id: string
  /** Etat courant */
  state: CallState
  /** Raccrocher cet appel */
  hangup(): void
  /** Couper le micro */
  mute(): void
  /** Reactiver le micro */
  unmute(): void
  /** Envoyer une touche DTMF */
  sendDTMF(digit: string): void
  /** Le micro est-il coupe ? */
  isMuted: boolean
}

export interface CallProviderEvents {
  /** L'etat de l'appel a change */
  onStateChange(state: CallState, session: CallSession): void
  /** Le provider est pret a passer des appels */
  onReady(): void
  /** Erreur provider */
  onError(error: Error): void
  /** Echantillon qualite audio (toutes les secondes) */
  onAudioSample?(sample: AudioSample): void
}

export interface ConnectParams {
  /** Numero du prospect */
  to: string
  /** Numero de l'appelant */
  from: string
  /** ID de conference pour le double-leg */
  conferenceId?: string
}

export interface CallProvider {
  /** Nom du provider */
  readonly name: 'twilio' | 'telnyx'

  /** Initialiser le provider avec un token d'authentification */
  init(token: string): Promise<void>

  /** Detruire le provider et liberer les ressources */
  destroy(): void

  /** Le provider est-il pret a passer des appels ? */
  readonly isReady: boolean

  /** Lancer un appel */
  connect(params: ConnectParams): Promise<CallSession | null>

  /** Raccrocher tous les appels actifs */
  disconnectAll(): void

  /** S'abonner aux events. Retourne une fonction unsubscribe. */
  on(events: Partial<CallProviderEvents>): () => void
}
