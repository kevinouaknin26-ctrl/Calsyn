export type { CallProvider, CallSession, CallState, ConnectParams, AudioSample } from './types'
export { TwilioProvider } from './twilio-provider'
export { TelnyxProvider } from './telnyx-provider'

import type { CallProvider } from './types'
import { TwilioProvider } from './twilio-provider'
import { TelnyxProvider } from './telnyx-provider'

const providers: Record<string, () => CallProvider> = {
  twilio: () => new TwilioProvider(),
  telnyx: () => new TelnyxProvider(),
}

export function createProvider(name: 'twilio' | 'telnyx'): CallProvider {
  const factory = providers[name]
  if (!factory) throw new Error(`Provider "${name}" not implemented`)
  return factory()
}
