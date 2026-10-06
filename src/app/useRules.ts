import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeRule } from '../core/ruleText'
import { FORMAT_VERSION, toRule, type SharedRule } from '../core/sharedRule'
import type { Rule } from '../core/types'
import { SignedOutError } from '../google/events'
import {
  ConflictError,
  createRulesCalendar,
  deleteRule,
  loadRulesCalendar,
  saveRule,
  saveSettings,
  type StoredRule,
} from '../google/rulesCalendar'
import { zone } from './dates'
import { demoRules } from './demo'
import type { CalendarData } from './useCalendarData'
import { isDemo } from './useCalendarData'

export type RulesStatus = 'loading' | 'missing' | 'ready' | 'signed-out' | 'error'

export interface RulesState {
  status: RulesStatus
  error: string | null
  stored: StoredRule[]
  /** What the evaluator runs. */
  rules: Rule[]
  /** The account that holds the rules calendar. */
  account?: string
  unreadable: number
  createCalendar: (email: string) => Promise<void>
  save: (rule: SharedRule, existing?: StoredRule) => Promise<boolean>
  remove: (stored: StoredRule) => Promise<void>
  reload: () => Promise<void>
  colorSlots: Record<string, number>
  /** Records a new colour slot; shared with the phone through the rules calendar. */
  recordColorSlots: (slots: Record<string, number>) => void
}

export function newRuleId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// the demo's rules as if they were stored, so the editor can be tried without an account
function demoStored(): StoredRule[] {
  return demoRules.map((rule, i) => ({
    eventId: `demo-rule-${i}`,
    etag: '0',
    rule: {
      version: FORMAT_VERSION, uuid: `demo-${i}`, updated: '2026-10-06T00:00:00Z', enabled: rule.enabled, type: rule.type, pattern: rule.pattern,
      calendar: rule.calendarId ? { id: rule.calendarId } : undefined, keyName: rule.keyName, keyColor: rule.keyColor, extra: {},
    },
  }))
}

export function summaryFor(rule: SharedRule): string {
  return `Subtext rule: ${describeRule(rule, rule.event?.title)}`
}

export function useRules(data: CalendarData): RulesState {
  const [stored, setStored] = useState<StoredRule[]>(() => (isDemo ? demoStored() : []))
  const [colorSlots, setColorSlots] = useState<Record<string, number>>({})
  const settingsEvent = useRef<{ eventId: string; etag: string } | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(0)
  const [status, setStatus] = useState<RulesStatus>(isDemo ? 'ready' : 'loading')
  const [error, setError] = useState<string | null>(null)

  const calendar = data.rulesCalendar
  const token = calendar ? data.accounts.find((a) => a.email === calendar.account)?.token : undefined

  const reload = useCallback(async () => {
    if (isDemo) return
    if (!calendar) {
      setStatus(data.accounts.length > 0 ? 'missing' : 'signed-out')
      return
    }
    if (!token) {
      setStatus('signed-out')
      return
    }
    try {
      const contents = await loadRulesCalendar(token, calendar.id)
      setStored(contents.rules)
      setColorSlots(contents.settings.colorSlots)
      settingsEvent.current = contents.settingsEvent
      setUnreadable(contents.unreadable)
      setStatus('ready')
      setError(null)
    } catch (e) {
      setStatus(e instanceof SignedOutError ? 'signed-out' : 'error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [calendar, token, data.accounts.length])

  useEffect(() => {
    void reload()
  }, [reload])

  // pick up edits made on the phone when coming back to the tab
  useEffect(() => {
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  const createCalendar = useCallback(
    async (email: string) => {
      const account = data.accounts.find((a) => a.email === email)
      if (!account) return
      try {
        await createRulesCalendar(account.token, zone)
        await data.reloadCalendars(email)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [data],
  )

  const save = useCallback(
    async (rule: SharedRule, existing?: StoredRule): Promise<boolean> => {
      const updated = { ...rule, updated: nowIso() }
      if (isDemo) {
        const saved = { rule: updated, eventId: existing?.eventId ?? `demo-rule-${Date.now()}`, etag: '0' }
        setStored((all) => (existing ? all.map((s) => (s.eventId === existing.eventId ? saved : s)) : [...all, saved]))
        return true
      }
      if (!calendar || !token) return false
      try {
        const saved = await saveRule(token, calendar.id, updated, summaryFor(updated), existing)
        setStored((all) => (existing ? all.map((s) => (s.eventId === existing.eventId ? saved : s)) : [...all, saved]))
        setError(null)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        if (e instanceof ConflictError) await reload()
        return false
      }
    },
    [calendar, token, reload],
  )

  const remove = useCallback(
    async (target: StoredRule) => {
      if (!isDemo) {
        if (!calendar || !token) return
        try {
          await deleteRule(token, calendar.id, target)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          if (e instanceof ConflictError) await reload()
          return
        }
      }
      setStored((all) => all.filter((s) => s.eventId !== target.eventId))
    },
    [calendar, token, reload],
  )

  // colour slots: batch new ones and write them once, so a page of new contexts is one save
  const pendingSave = useRef<number | undefined>(undefined)
  const recordColorSlots = useCallback(
    (slots: Record<string, number>) => {
      setColorSlots(slots)
      if (isDemo || !calendar || !token) return
      window.clearTimeout(pendingSave.current)
      pendingSave.current = window.setTimeout(() => {
        saveSettings(token, calendar.id, { colorSlots: slots }, settingsEvent.current)
          .then((saved) => (settingsEvent.current = saved))
          .catch(() => {
            // not worth bothering anyone: the slots are recomputed and saved next time
          })
      }, 2000)
    },
    [calendar, token],
  )

  const rules = useMemo(() => stored.map((s) => toRule(s.rule)), [stored])

  return {
    status, error, stored, rules, account: calendar?.account, unreadable,
    createCalendar, save, remove, reload, colorSlots, recordColorSlots,
  }
}
