import { assignColorSlot, PALETTE } from '../core/layout'
import type { EvaluatedEvent } from '../core/types'
import { readStored, writeStored } from './storage'

const SLOTS_KEY = 'subtext.colorSlots'

/**
 * The colour a context is drawn in, as on the phone: a colour picked on its rule, else its own
 * palette colour, keyed by the name the key shows. The slot map is per browser for now; phase 19
 * moves it into the Google rules calendar, so phone and laptop agree.
 */
export function contextColor(context: EvaluatedEvent): number {
  if (context.keyColor !== undefined) return context.keyColor
  const name = context.keyName?.trim() || context.event.title
  const slots = readStored<Record<string, number>>(SLOTS_KEY, {})
  const [slot, updated] = assignColorSlot(slots, name)
  if (updated) writeStored(SLOTS_KEY, updated)
  return PALETTE[slot % PALETTE.length]
}
