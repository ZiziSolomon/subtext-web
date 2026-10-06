import { assignColorSlot, PALETTE } from '../core/layout'
import type { EvaluatedEvent } from '../core/types'

/**
 * Colours contexts as the phone does: a colour picked on the rule wins; otherwise each context
 * name keeps its own palette slot for good. The slot map is shared with the phone through the
 * rules calendar's settings event, so a context is the same colour on both.
 *
 * Built once per render pass: new slots are collected and handed back by [newSlots], so the
 * caller can save them after rendering instead of during it.
 */
export function contextColorer(slots: Record<string, number>) {
  let current = slots
  let changed = false
  return {
    color(context: EvaluatedEvent): number {
      if (context.keyColor !== undefined) return context.keyColor
      const [slot, updated] = assignColorSlot(current, context.keyName?.trim() || context.event.title)
      if (updated) {
        current = updated
        changed = true
      }
      return PALETTE[slot % PALETTE.length]
    },
    newSlots(): Record<string, number> | null {
      return changed ? current : null
    },
  }
}
