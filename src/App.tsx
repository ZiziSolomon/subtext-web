import { Temporal } from '@js-temporal/polyfill'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountCalendar } from './app/accounts'
import { contextColorer } from './app/contextColors'
import { formatTitle, step, today, visibleRange, zone, type ViewKind } from './app/dates'
import { EventDetails, type RuleActions } from './app/EventDetails'
import { blankRule, RulesPanel, type EditTarget } from './app/RulesPanel'
import { useStored } from './app/storage'
import { isDemo, useCalendarData } from './app/useCalendarData'
import { usePreviewEvents } from './app/usePreviewEvents'
import { useRules } from './app/useRules'
import { MonthGrid } from './app/views/MonthGrid'
import { TimeGrid } from './app/views/TimeGrid'
import { RuleEvaluator } from './core/evaluator'
import { keyEntries, lanesForColumns } from './core/layout'
import { toRule, type SharedRule } from './core/sharedRule'
import { buildStripes } from './core/stripes'
import type { CalEvent, EvaluatedEvent } from './core/types'
import { argbToCss, type AppEvent } from './google/events'

const FALLBACK_COLOR = 0xff7986cb | 0

export default function App() {
  const [view, setView] = useStored<ViewKind>('subtext.view', 'week')
  const [weekDays] = useStored<number>('subtext.weekDays', 7)
  const [anchorText, setAnchorText] = useState(() => today().toString())
  const anchor = Temporal.PlainDate.from(anchorText)
  const setAnchor = (date: Temporal.PlainDate) => setAnchorText(date.toString())
  const range = useMemo(() => visibleRange(view, anchor, weekDays), [view, anchorText, weekDays]) // eslint-disable-line react-hooks/exhaustive-deps
  const data = useCalendarData(range)
  const rules = useRules(data)
  const [opened, setOpened] = useState<AppEvent | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  // the rule as currently typed in the editor (null when none, or when it isn't valid yet)
  const [liveDraft, setLiveDraft] = useState<SharedRule | null>(null)
  const preview = usePreviewEvents(data, rulesOpen)

  const evaluator = useMemo(() => new RuleEvaluator(rules.rules), [rules.rules])

  const { commitments, contexts } = useMemo(() => {
    const evaluated = data.events.map((event) => evaluator.evaluate(event))
    return {
      commitments: evaluated.filter((e) => !e.contextual).map((e) => e.event),
      contexts: evaluated.filter((e) => e.contextual) as EvaluatedEvent<AppEvent>[],
    }
  }, [data.events, evaluator])

  // colours: shared slots from the rules calendar; any new ones are saved after rendering
  const { stripes, newSlots } = useMemo(() => {
    const colorer = contextColorer(rules.colorSlots)
    const built = lanesForColumns(buildStripes(contexts, range.firstDay, range.days, zone, FALLBACK_COLOR, colorer.color))
    return { stripes: built, newSlots: colorer.newSlots() }
  }, [contexts, range, rules.colorSlots])
  const { recordColorSlots } = rules
  useEffect(() => {
    if (newSlots) recordColorSlots(newSlots)
  }, [newSlots, recordColorSlots])

  const contextById = useMemo(() => new Map(contexts.map((c) => [c.event.id, c.event])), [contexts])
  const key = useMemo(() => keyEntries(stripes), [stripes])

  // while a rule is being edited, the events it would catch are outlined in the views
  const highlight = useMemo(() => {
    if (!liveDraft) return undefined
    const draft = new RuleEvaluator([{ ...toRule(liveDraft), enabled: true }])
    return (event: CalEvent) => draft.isContextual(event)
  }, [liveDraft])

  const go = useCallback((direction: 1 | -1) => setAnchor(step(view, anchor, direction, weekDays)), [view, anchorText, weekDays]) // eslint-disable-line react-hooks/exhaustive-deps

  // laptop shortcuts: d/w/m switch views, t today, arrows (or j/k) move, r rules
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey || opened) return
      const actions: Record<string, () => void> = {
        d: () => setView('day'),
        w: () => setView('week'),
        m: () => setView('month'),
        t: () => setAnchor(today()),
        r: () => setRulesOpen((open) => !open),
        ArrowLeft: () => go(-1),
        ArrowRight: () => go(1),
        k: () => go(-1),
        j: () => go(1),
      }
      actions[e.key]?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, opened, setView])

  const ruleActions: RuleActions | undefined =
    rules.status === 'ready'
      ? {
          markedBy: (event) => rules.stored.find((s) => s.rule.type === 'event' && s.rule.event?.calendarId === event.calendarId && s.rule.event?.eventId === (event.seriesId ?? event.id)),
          mark: (event) =>
            rules.save(
              blankRule({
                type: 'event',
                event: { calendarId: event.calendarId, eventId: event.seriesId ?? event.id, title: event.title },
                calendar: undefined,
              }),
            ),
          unmark: (stored) => rules.remove(stored),
          ruleFromTitle: (event) => {
            setRulesOpen(true)
            setEditing({ draft: blankRule({ type: 'title_contains', pattern: event.title, calendar: { id: event.calendarId, name: event.calendar.summary } }) })
          },
        }
      : undefined

  if (!data.signedIn) {
    return (
      <main className="welcome">
        <h1>Subtext</h1>
        <p>Your Google calendar, with routine context kept in the background.</p>
        <button className="primary" onClick={data.addAccount}>
          Sign in with Google
        </button>
        {data.error && <p className="error">{data.error}</p>}
        <p className="muted">
          Or <a href="?demo">look around with made-up data</a>.
        </p>
      </main>
    )
  }

  return (
    <div className={`app${rulesOpen ? ' has-panel' : ''}`}>
      <header className="topbar">
        <h1 className="brand">Subtext</h1>
        <button onClick={() => setAnchor(today())}>Today</button>
        <div className="nav">
          <button aria-label="Previous" onClick={() => go(-1)}>‹</button>
          <button aria-label="Next" onClick={() => go(1)}>›</button>
        </div>
        <h2 className="range-title">{formatTitle(view, anchor, range)}</h2>
        {data.loading && <span className="muted">Loading…</span>}
        <div className="spacer" />
        <div className="segmented" role="tablist">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'is-selected' : ''} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button className={rulesOpen ? 'is-selected' : ''} aria-pressed={rulesOpen} onClick={() => setRulesOpen(!rulesOpen)}>
          Rules
        </button>
        {isDemo && <span className="badge">Demo data</span>}
      </header>

      <aside className="sidebar">
        <section>
          <h3>Contexts in view</h3>
          {key.length === 0 && <p className="muted small">{rules.rules.length === 0 ? 'No rules yet. Open Rules (r) to make one.' : 'None in this range.'}</p>}
          <ul className="key-list">
            {key.map((entry) => (
              <li key={`${entry.title}/${entry.color}`}>
                <button onClick={() => contextById.get(entry.eventId) && setOpened(contextById.get(entry.eventId)!)}>
                  <span className="key-swatch" style={{ background: argbToCss(entry.color) }} />
                  {entry.title || 'Untitled context'}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {isDemo ? (
          <section>
            <h3>Calendars</h3>
            <CalendarList calendars={data.calendars} hidden={data.hiddenCalendars} onToggle={data.toggleCalendar} />
          </section>
        ) : (
          <>
            {data.accounts.map((account) => (
              <section key={account.email} className="account">
                <h3 title={account.email}>{account.email}</h3>
                <CalendarList calendars={data.calendars.filter((c) => c.account === account.email)} hidden={data.hiddenCalendars} onToggle={data.toggleCalendar} />
                <button className="link" onClick={() => data.removeAccount(account.email)}>
                  Remove this account
                </button>
              </section>
            ))}
            {data.expired.map((email) => (
              <section key={email} className="account is-expired">
                <h3 title={email}>{email}</h3>
                <p className="muted small">Signed out after an hour, as Google requires.</p>
                <button onClick={() => data.renewAccount(email)}>Sign in again</button>
                <button className="link" onClick={() => data.removeAccount(email)}>
                  Remove
                </button>
              </section>
            ))}
            <button className="add-account" onClick={data.addAccount}>
              + Add another Google account
            </button>
          </>
        )}
        {data.error && <p className="error small">{data.error}</p>}
      </aside>

      <main className="view">
        {view === 'month' ? (
          <MonthGrid
            range={range}
            month={anchor.month}
            commitments={commitments}
            stripes={stripes}
            contextById={contextById}
            highlight={highlight}
            onOpen={setOpened}
            onOpenDay={(day) => {
              setAnchor(day)
              setView('day')
            }}
          />
        ) : (
          <TimeGrid range={range} commitments={commitments} stripes={stripes} contextById={contextById} highlight={highlight} onOpen={setOpened} />
        )}
      </main>

      {rulesOpen && (
        <RulesPanel
          rules={rules}
          calendars={data.calendars}
          accounts={data.accounts.map((a) => a.email)}
          previewEvents={preview.events}
          previewLoading={preview.loading}
          editing={editing}
          setEditing={setEditing}
          onDraftChange={setLiveDraft}
          onOpenEvent={setOpened}
          onClose={() => {
            setRulesOpen(false)
            setEditing(null)
          }}
        />
      )}

      {opened && (
        <EventDetails event={opened} contextual={evaluator.isContextual(opened)} evaluator={evaluator} actions={ruleActions} onClose={() => setOpened(null)} />
      )}
    </div>
  )
}

function CalendarList({ calendars, hidden, onToggle }: { calendars: AccountCalendar[]; hidden: string[]; onToggle: (id: string) => void }) {
  return (
    <ul className="calendar-list">
      {calendars.map((calendar) => (
        <li key={calendar.id}>
          <label>
            <input type="checkbox" checked={!hidden.includes(calendar.id)} onChange={() => onToggle(calendar.id)} style={{ accentColor: calendar.backgroundColor }} />
            {calendar.summaryOverride ?? calendar.summary}
          </label>
        </li>
      ))}
    </ul>
  )
}
