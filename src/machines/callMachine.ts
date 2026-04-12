/**
 * XState Call Machine V2 — Autosave, pas de flow manuel.
 *
 * idle → dialing → connected → disconnected → idle
 *
 * Le save est fait par le hook (pas par la machine) en fire-and-forget.
 * Apres hangup, la machine revient directement a idle pour permettre le rappel.
 * La disposition est collectee dans le modal mais n'est PAS bloquante.
 */

import { createMachine, assign } from 'xstate'
import type { Prospect } from '@/types/prospect'
import type { Disposition } from '@/types/call'

export interface CallContext {
  prospect: Prospect | null
  callSid: string | null
  conferenceSid: string | null
  startedAt: number | null
  duration: number | null
  disposition: Disposition | null
  notes: string
  meetingBooked: boolean
  wasAnswered: boolean
  error: string | null
}

const initialContext: CallContext = {
  prospect: null,
  callSid: null,
  conferenceSid: null,
  startedAt: null,
  duration: null,
  disposition: null,
  notes: '',
  meetingBooked: false,
  wasAnswered: false,
  error: null,
}

export type CallEvent =
  | { type: 'CALL'; prospect: Prospect }
  | { type: 'RINGING'; callSid: string }
  | { type: 'ANSWERED'; conferenceSid?: string }
  | { type: 'HANG_UP' }
  | { type: 'REMOTE_HANG_UP' }
  | { type: 'MUTE' }
  | { type: 'UNMUTE' }
  | { type: 'SET_DISPOSITION'; disposition: Disposition }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SET_MEETING'; meetingBooked: boolean }
  | { type: 'RESET' }
  | { type: 'ERROR'; message: string }

export const callMachine = createMachine({
  id: 'call',
  types: {} as { context: CallContext; events: CallEvent },
  initial: 'idle',
  context: initialContext,

  states: {
    idle: {
      on: {
        CALL: {
          target: 'dialing',
          actions: assign({
            prospect: ({ event }) => event.prospect,
            callSid: null,
            conferenceSid: null,
            startedAt: null,
            duration: null,
            disposition: null,
            notes: '',
            meetingBooked: false,
            wasAnswered: false,
            error: null,
          }),
        },
      },
    },

    dialing: {
      on: {
        RINGING: {
          actions: assign({ callSid: ({ event }) => event.callSid }),
        },
        ANSWERED: {
          target: 'connected',
          actions: assign({
            startedAt: () => Date.now(),
            conferenceSid: ({ event }) => event.conferenceSid ?? null,
            wasAnswered: true,
          }),
        },
        HANG_UP: {
          target: 'disconnected',
          actions: assign({ duration: 0 }),
        },
        REMOTE_HANG_UP: {
          target: 'disconnected',
          actions: assign({ duration: 0 }),
        },
        ERROR: {
          target: 'idle',
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },

    connected: {
      initial: 'talking',
      states: {
        talking: {
          on: { MUTE: { target: 'on_hold' } },
        },
        on_hold: {
          on: { UNMUTE: { target: 'talking' } },
        },
      },
      on: {
        HANG_UP: {
          target: 'disconnected',
          actions: assign({
            duration: ({ context }) =>
              context.startedAt ? Math.round((Date.now() - context.startedAt) / 1000) : 0,
          }),
        },
        REMOTE_HANG_UP: {
          target: 'disconnected',
          actions: assign({
            duration: ({ context }) =>
              context.startedAt ? Math.round((Date.now() - context.startedAt) / 1000) : 0,
          }),
        },
        // CallSid peut arriver apres ANSWERED
        RINGING: { actions: assign({ callSid: ({ event }) => event.callSid }) },
        // Pendant l'appel, on peut deja noter des trucs
        SET_NOTES: { actions: assign({ notes: ({ event }) => event.notes }) },
        SET_DISPOSITION: { actions: assign({ disposition: ({ event }) => event.disposition }) },
        SET_MEETING: { actions: assign({ meetingBooked: ({ event }) => event.meetingBooked }) },
      },
    },

    disconnected: {
      // On peut mettre a jour disposition/notes/meeting APRES l'appel
      on: {
        SET_DISPOSITION: { actions: assign({ disposition: ({ event }) => event.disposition }) },
        SET_NOTES: { actions: assign({ notes: ({ event }) => event.notes }) },
        SET_MEETING: { actions: assign({ meetingBooked: ({ event }) => event.meetingBooked }) },
        // RESET pour revenir a idle et pouvoir rappeler
        RESET: {
          target: 'idle',
          actions: assign(initialContext),
        },
        // On peut aussi directement relancer un appel depuis disconnected
        CALL: {
          target: 'dialing',
          actions: assign({
            prospect: ({ event }) => event.prospect,
            callSid: null,
            conferenceSid: null,
            startedAt: null,
            duration: null,
            disposition: null,
            notes: '',
            meetingBooked: false,
            error: null,
          }),
        },
      },
    },
  },
})
