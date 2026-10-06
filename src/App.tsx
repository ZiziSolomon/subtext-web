import { Temporal } from '@js-temporal/polyfill'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { contextColor } from './app/contextColors'
import { formatTitle, step, today, visibleRange, zone, type ViewKind } from './app/dates'
import { demoRules } from './app/demo'
import { EventDetails } from './app/EventDetails'
import { useStored } from './app/storage'
import { isDemo, useCalendarData } from './app/useCalendarData'
import { MonthGrid } from './app/views/MonthGrid'
import { TimeGrid } from './app/views/TimeGrid'
import { RuleEvaluator } from './core/evaluator'
import { keyEntries, lanesForColumns } from './core/layout'
import { buildStripes } from './core/stripes'
import type { EvaluatedEvent, Rule } from './core/types'
import { argbToCss, type AppEvent } from './google/events'

const FALLBACK_COLOR = 0xff7986cb | 0
const NO_RULES: Rule[] = []

export default function App() {
  const [view, setView] = useStored<ViewKind>('subtext.view', 'week')
  const [weekDays] = useStored<number>('subtext.weekDays', 7)
  const [anchorText, setAnchorText] = useState(() => today().toString())
  const anchor = Temporal.PlainDate.from(anchorText)
  const setAnchor = (date: Temporal.PlainDate) => setAnchorText(date.toString())
  const range = useMemo(() => visibleRange(view, anchor, weekDays), [view, anchorText, weekDays]) // eslint-disable-line react-hooks/exhaustive-deps
  const data = useCalendarData(range)
  const [opened, setOpened] = useState<AppEvent | null>(null)

  // rules arrive from the Google rules calendar in phase 19; until then only the demo has any
  const rules = isDemo ? demoRules : NO_RULES
  const evaluator = useMemo(() => new RuleEvaluator(rules), [rules])

  const { commitments, contexts } = useMemo(() => {
    const evaluated = data.events.map((event) => evaluator.evaluate(event))
    return {
      commitments: evaluated.filter((e) => !e.contextual).map((e) => e.event),
      contexts: evaluated.filter((e) => e.contextual) as EvaluatedEvent<AppEvent>[],
    }
  }, [data.events, evaluator])

  const stripes = useMemo(
    () => lanesForColumns(buildStripes(contexts, range.firstDay, range.days, zone, FALLBACK_COLOR, contextColor)),
    [contexts, range],
  )
  const contextById = useMemo(() => new Map(contexts.map((c) => [c.event.id, c.event])), [contexts])
  const key = useMemo(() => keyEntries(stripes), [stripes])

  const go = useCallback((direction: 1 | -1) => setAnchor(step(view, anchor, direction, weekDays)), [view, anchorText, weekDays]) // eslint-disable-line react-hooks/exhaustive-deps

  // laptop shortcuts: d/w/m switch views, t today, arrows (or j/k) move
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey || opened) return
      const actions: Record<string, () => void> = {
        d: () => setView('day'),
        w: () => setView('week'),
        m: () => setView('month'),
        t: () => setAnchor(today()),
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

  if (!data.signedIn) {
    return (
      <main className="welcome">
        <h1>Subtext</h1>
        <p>Your Google calendar, with routine context kept in the background.</p>
        <button className="primary" onClick={data.signIn}>
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
    <div className="app">
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
        {isDemo ? <span className="badge">Demo data</span> : <button onClick={data.signOut}>Sign out</button>}
      </header>

      <aside className="sidebar">
        <section>
          <h3>Contexts in view</h3>
          {key.length === 0 && <p className="muted small">{rules.length === 0 ? 'No rules yet. Shared rules from your phone arrive in the next step.' : 'None in this range.'}</p>}
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
        <section>
          <h3>Calendars</h3>
          <ul className="calendar-list">
            {data.calendars.map((calendar) => (
              <li key={calendar.id}>
                <label>
                  <input type="checkbox" checked={!data.hiddenCalendars.includes(calendar.id)} onChange={() => data.toggleCalendar(calendar.id)} style={{ accentColor: calendar.backgroundColor }} />
                  {calendar.summaryOverride ?? calendar.summary}
                </label>
              </li>
            ))}
          </ul>
        </section>
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
            onOpen={setOpened}
            onOpenDay={(day) => {
              setAnchor(day)
              setView('day')
            }}
          />
        ) : (
          <TimeGrid range={range} commitments={commitments} stripes={stripes} contextById={contextById} onOpen={setOpened} />
        )}
      </main>

      {opened && <EventDetails event={opened} contextual={contextById.has(opened.id)} evaluator={evaluator} onClose={() => setOpened(null)} />}
    </div>
  )
}
