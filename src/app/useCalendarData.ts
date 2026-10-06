import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestAccessToken } from '../google/auth'
import { listCalendars, type CalendarListEntry } from '../google/calendarApi'
import { listEvents, SignedOutError, type AppEvent } from '../google/events'
import { RULES_CALENDAR_NAME } from '../google/rulesCalendar'
import { mergeCalendars, primaryEmail, type Account, type AccountCalendar } from './accounts'
import { rangeToInstants, type VisibleRange } from './dates'
import { demoCalendars, demoEvents } from './demo'
import { readStored, useStored, writeStored } from './storage'

export const isDemo = new URLSearchParams(location.search).has('demo')

// tokens survive a reload for their hour, in this tab only; which accounts are in survives longer
const TOKENS_KEY = 'subtext.tokens'
const ACCOUNTS_KEY = 'subtext.accounts'

function loadTokens(): Account[] {
  try {
    const all = JSON.parse(sessionStorage.getItem(TOKENS_KEY) ?? '[]') as Account[]
    return all.filter((a) => a.token.expiresAt > Date.now() + 60_000)
  } catch {
    return []
  }
}

function saveTokens(accounts: Account[]) {
  try {
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(accounts))
  } catch {
    // storage blocked: sign in again after a reload
  }
}

export interface CalendarData {
  /** Accounts with a working token. */
  accounts: Account[]
  /** Accounts added before whose token has expired: one click renews each. */
  expired: string[]
  addAccount: () => Promise<void>
  renewAccount: (email: string) => Promise<void>
  removeAccount: (email: string) => void
  calendars: AccountCalendar[]
  /** The shared "Subtext rules" calendar, if a signed-in account owns one (kept out of [calendars]). */
  rulesCalendar: AccountCalendar | undefined
  /** Re-reads an account's calendar list, e.g. after creating the rules calendar in it. */
  reloadCalendars: (email: string) => Promise<void>
  hiddenCalendars: string[]
  toggleCalendar: (id: string) => void
  events: AppEvent[]
  loading: boolean
  error: string | null
  signedIn: boolean
}

export function useCalendarData(range: VisibleRange): CalendarData {
  const [accounts, setAccounts] = useState<Account[]>(() => (isDemo ? [] : loadTokens()))
  const [known, setKnown] = useState<string[]>(() => readStored<string[]>(ACCOUNTS_KEY, []))
  const [listsByAccount, setListsByAccount] = useState<Record<string, CalendarListEntry[]>>({})
  const [hiddenCalendars, setHiddenCalendars] = useStored<string[]>('subtext.hiddenCalendars', [])
  const [events, setEvents] = useState<AppEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // events per calendar and range, so switching views or weeks back and forth doesn't refetch
  const cache = useRef(new Map<string, AppEvent[]>())

  useEffect(() => saveTokens(accounts), [accounts])
  useEffect(() => writeStored(ACCOUNTS_KEY, known), [known])

  const dropToken = useCallback((email: string) => {
    setAccounts((all) => all.filter((a) => a.email !== email))
    for (const key of [...cache.current.keys()]) if (key.startsWith(`${email}|`)) cache.current.delete(key)
  }, [])

  const signInAs = useCallback(async (loginHint?: string) => {
    setError(null)
    try {
      const token = await requestAccessToken(loginHint)
      const calendars = await listCalendars(token)
      const email = primaryEmail(calendars) ?? loginHint ?? 'unknown'
      setListsByAccount((lists) => ({ ...lists, [email]: calendars }))
      setAccounts((all) => [...all.filter((a) => a.email !== email), { email, token }])
      setKnown((all) => (all.includes(email) ? all : [...all, email]))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const removeAccount = useCallback(
    (email: string) => {
      dropToken(email)
      setKnown((all) => all.filter((e) => e !== email))
      setListsByAccount(({ [email]: _, ...rest }) => rest)
    },
    [dropToken],
  )

  // calendar lists for accounts restored from this tab's session
  useEffect(() => {
    for (const account of accounts) {
      if (listsByAccount[account.email]) continue
      listCalendars(account.token)
        .then((calendars) => setListsByAccount((lists) => ({ ...lists, [account.email]: calendars })))
        .catch((e) => (e instanceof SignedOutError ? dropToken(account.email) : setError(String(e))))
    }
  }, [accounts, listsByAccount, dropToken])

  const allCalendars = useMemo<AccountCalendar[]>(() => {
    if (isDemo) return demoCalendars.map((c) => ({ ...c, account: 'demo' }))
    // keep the order accounts were added in
    return mergeCalendars(known.filter((email) => listsByAccount[email]).map((email) => ({ account: email, calendars: listsByAccount[email] })))
  }, [known, listsByAccount])
  const isRulesCalendar = (c: AccountCalendar) => c.summary === RULES_CALENDAR_NAME && c.accessRole === 'owner'
  const calendars = useMemo(() => allCalendars.filter((c) => !isRulesCalendar(c)), [allCalendars])
  const rulesCalendar = useMemo(() => allCalendars.find(isRulesCalendar), [allCalendars])

  const reloadCalendars = useCallback(
    async (email: string) => {
      const account = accounts.find((a) => a.email === email)
      if (!account) return
      const calendars = await listCalendars(account.token)
      setListsByAccount((lists) => ({ ...lists, [email]: calendars }))
    },
    [accounts],
  )

  const visible = useMemo(() => calendars.filter((c) => !hiddenCalendars.includes(c.id)), [calendars, hiddenCalendars])
  const rangeKey = `${range.firstDay}+${range.days}`

  useEffect(() => {
    if (isDemo) {
      setEvents(demoEvents().filter((e) => visible.some((c) => c.id === e.calendarId)))
      return
    }

    let cancelled = false
    const { from, to } = rangeToInstants(range)
    const readable = visible.filter((c) => accounts.some((a) => a.email === c.account))
    setLoading(true)
    Promise.all(
      readable.map(async (calendar) => {
        const key = `${calendar.account}|${calendar.id}|${rangeKey}`
        const cached = cache.current.get(key)
        if (cached) return cached
        const token = accounts.find((a) => a.email === calendar.account)!.token
        try {
          const fetched = await listEvents(token, calendar, from, to)
          cache.current.set(key, fetched)
          return fetched
        } catch (e) {
          if (e instanceof SignedOutError) {
            dropToken(calendar.account)
            return []
          }
          throw e
        }
      }),
    )
      .then((perCalendar) => {
        if (!cancelled) {
          setEvents(perCalendar.flat())
          setError(null)
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // range is captured through rangeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, visible, rangeKey, dropToken])

  const toggleCalendar = useCallback(
    (id: string) => setHiddenCalendars(hiddenCalendars.includes(id) ? hiddenCalendars.filter((h) => h !== id) : [...hiddenCalendars, id]),
    [hiddenCalendars, setHiddenCalendars],
  )

  const expired = known.filter((email) => !accounts.some((a) => a.email === email))

  return {
    accounts,
    expired,
    addAccount: () => signInAs(),
    renewAccount: (email) => signInAs(email),
    removeAccount,
    calendars,
    rulesCalendar,
    reloadCalendars,
    hiddenCalendars,
    toggleCalendar,
    events,
    loading,
    error,
    signedIn: isDemo || accounts.length > 0 || known.length > 0,
  }
}
