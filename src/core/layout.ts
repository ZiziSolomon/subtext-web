import type { Stripe } from './types'
import { MINUTES_PER_DAY } from './stripes'

// --- lanes (ContextualLanes on the phone) ---

export interface Interval {
  group: number
  start: number
  end: number
}

export interface Placement {
  lane: number
  laneCount: number
}

/**
 * Side-by-side lanes for contexts at the same time. Intervals compete only within their group
 * (a day column, or a month-view week row); every interval in one overlap cluster shares that
 * cluster's lane count, so a lane never changes width partway along.
 */
export function assignLanes(intervals: Interval[]): Placement[] {
  const placements: Placement[] = new Array(intervals.length)
  const groups = new Map<number, number[]>()
  intervals.forEach((interval, index) => {
    const list = groups.get(interval.group) ?? []
    list.push(index)
    groups.set(interval.group, list)
  })

  for (const indices of groups.values()) {
    // earliest first; on a tie the longer one takes the lower lane
    const sorted = [...indices].sort((a, b) => {
      const x = intervals[a]
      const y = intervals[b]
      return x.start - y.start || (y.end - y.start) - (x.end - x.start) || a - b
    })
    let cluster: [number, number][] = []
    const laneEnds: number[] = []
    let clusterEnd = Number.MIN_SAFE_INTEGER

    const closeCluster = () => {
      for (const [index, lane] of cluster) placements[index] = { lane, laneCount: laneEnds.length }
      cluster = []
      laneEnds.length = 0
    }

    for (const index of sorted) {
      const interval = intervals[index]
      // touching end-to-start is not an overlap
      if (cluster.length > 0 && interval.start >= clusterEnd) {
        closeCluster()
        clusterEnd = Number.MIN_SAFE_INTEGER
      }
      let lane = laneEnds.findIndex((end) => end <= interval.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(interval.end)
      } else {
        laneEnds[lane] = interval.end
      }
      cluster.push([index, lane])
      clusterEnd = Math.max(clusterEnd, interval.end)
    }
    closeCluster()
  }
  return placements
}

/** Week and day view: lanes per day column. */
export function lanesForColumns(stripes: Stripe[]): Stripe[] {
  const placements = assignLanes(stripes.map((s) => ({ group: s.dayIndex, start: s.startMinute, end: s.endMinute })))
  return stripes.map((stripe, i) => ({ ...stripe, ...placements[i] }))
}

// --- the key (ContextualKey) ---

export interface KeyEntry {
  title: string
  color: number
  eventId: string
  occurrenceStart: number
}

/** One entry per distinct context on screen (same name and colour), in order of first appearance. */
export function keyEntries(stripes: Stripe[]): KeyEntry[] {
  const seen = new Set<string>()
  const entries: KeyEntry[] = []
  const ordered = stripes
    .map((stripe, index) => ({ stripe, index }))
    .sort((a, b) => a.stripe.dayIndex - b.stripe.dayIndex || a.stripe.startMinute - b.stripe.startMinute || a.stripe.lane - b.stripe.lane || a.index - b.index)
  for (const { stripe } of ordered) {
    const identity = `${stripe.title.trim().toLowerCase()}\u0000${stripe.color}`
    if (seen.has(identity)) continue
    seen.add(identity)
    entries.push({ title: stripe.title.trim(), color: stripe.color, eventId: stripe.eventId, occurrenceStart: stripe.occurrenceStart })
  }
  return entries
}

// --- month bars (ContextualMonthBars) ---

export interface MonthBar {
  row: number
  /** Minutes from the row's first day at 00:00, so 0..7 * 1440. */
  start: number
  end: number
  lane: number
  color: number
  title: string
  eventId: string
  occurrenceStart: number
}

/**
 * Each week row is one time axis, left to right; a context is a bar at its true times, and a
 * multi-day context is one continuous bar through the row.
 */
export function monthBars(stripes: Stripe[], daysPerRow = 7): MonthBar[] {
  const pieces: MonthBar[] = stripes.map((s) => {
    const row = Math.floor(s.dayIndex / daysPerRow)
    const dayStart = (s.dayIndex % daysPerRow) * MINUTES_PER_DAY
    return { row, start: dayStart + s.startMinute, end: dayStart + s.endMinute, lane: 0, color: s.color, title: s.title, eventId: s.eventId, occurrenceStart: s.occurrenceStart }
  })

  // join one occurrence's slices on neighbouring days of a row back into one bar
  const groups = new Map<string, MonthBar[]>()
  for (const piece of pieces) {
    const identity = JSON.stringify([piece.row, piece.eventId, piece.occurrenceStart, piece.color, piece.title])
    const list = groups.get(identity) ?? []
    list.push(piece)
    groups.set(identity, list)
  }
  const joined: MonthBar[] = []
  for (const group of groups.values()) {
    const merged: MonthBar[] = []
    for (const piece of [...group].sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1]
      if (last && piece.start <= last.end) {
        merged[merged.length - 1] = { ...last, end: Math.max(last.end, piece.end) }
      } else {
        merged.push(piece)
      }
    }
    joined.push(...merged)
  }

  const placements = assignLanes(joined.map((bar) => ({ group: bar.row, start: bar.start, end: bar.end })))
  return joined
    .map((bar, i) => ({ ...bar, lane: placements[i].lane }))
    .sort((a, b) => a.row - b.row || a.lane - b.lane || a.start - b.start)
}

/** Whether a bar is over at nowMinute on grid day nowDayIndex, so it dims like a past event. */
export function barHasEnded(bar: MonthBar, nowDayIndex: number, nowMinute: number, daysPerRow = 7): boolean {
  return bar.row * daysPerRow * MINUTES_PER_DAY + bar.end <= nowDayIndex * MINUTES_PER_DAY + nowMinute
}

// --- colour slots (ContextualColors) ---

export const PALETTE = [
  0xff1e88e5, 0xffe53935, 0xff43a047, 0xfffb8c00, 0xff8e24aa, 0xff00acc1, 0xffd81b60, 0xffffb300, 0xff5e35b1, 0xff7cb342,
].map((c) => c | 0) // as signed 32-bit ints, like Android colours

export function colorKey(title: string): string {
  return title.trim().toLowerCase()
}

/** The palette slot for a context title, and the updated map when it had none. */
export function assignColorSlot(slots: Record<string, number>, title: string, paletteSize = PALETTE.length): [number, Record<string, number> | null] {
  const key = colorKey(title)
  if (key in slots) return [slots[key], null]
  const used = new Set(Object.values(slots))
  let slot = -1
  for (let i = 0; i < paletteSize; i++) {
    if (!used.has(i)) {
      slot = i
      break
    }
  }
  if (slot === -1) slot = Object.keys(slots).length % paletteSize
  return [slot, { ...slots, [key]: slot }]
}
