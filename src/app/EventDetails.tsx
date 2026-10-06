import { useEffect, useRef, useState } from 'react'
import type { RuleEvaluator } from '../core/evaluator'
import { describeRule } from '../core/ruleText'
import type { CalEvent } from '../core/types'
import { argbToCss, type AppEvent } from '../google/events'
import type { StoredRule } from '../google/rulesCalendar'
import { formatTime, zone } from './dates'

/** What the details dialog can do with rules; absent until the rules have loaded. */
export interface RuleActions {
  markedBy: (event: CalEvent) => StoredRule | undefined
  mark: (event: AppEvent) => Promise<boolean>
  unmark: (stored: StoredRule) => Promise<void>
  ruleFromTitle: (event: AppEvent) => void
}

/** Details, why it's a context, and the rule actions. Editing the event itself arrives in phase 20. */
export function EventDetails({ event, contextual, evaluator, actions, onClose }: { event: AppEvent; contextual: boolean; evaluator: RuleEvaluator; actions?: RuleActions; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const when = event.allDay
    ? event.startDate.equals(event.endDate)
      ? event.startDate.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${event.startDate.toLocaleString(undefined, { day: 'numeric', month: 'short' })} – ${event.endDate.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${event.start.toZonedDateTimeISO(zone).toPlainDate().toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTime(event.start)} – ${formatTime(event.end)}`

  const reasons = contextual ? evaluator.matchingRules(event).map((rule) => (rule.type === 'event' ? 'marked directly' : describeRule(rule).toLowerCase())) : []
  const mark = actions?.markedBy(event)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    await action()
    setBusy(false)
    dialog.current?.close()
  }

  return (
    <dialog ref={dialog} className="details" onClose={onClose} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
      <div className="details-body">
        <div className="details-title">
          <span className="key-swatch" style={{ background: argbToCss(event.color) }} />
          <h2>{event.title || '(No title)'}</h2>
        </div>
        <p>{when}</p>
        {event.google.location && <p className="muted">{event.google.location}</p>}
        <p className="muted">{event.calendar.summaryOverride ?? event.calendar.summary}</p>
        {contextual && <p className="context-reason">Context: {reasons.join('; ')}</p>}

        {actions && (
          <div className="details-rule-actions">
            {mark ? (
              <button disabled={busy} onClick={() => run(() => actions.unmark(mark))}>
                Unmark as contextual
              </button>
            ) : (
              <button disabled={busy} onClick={() => run(() => actions.mark(event))}>
                Mark as contextual{event.seriesId ? ' (every occurrence)' : ''}
              </button>
            )}
            <button
              disabled={busy || !event.title}
              onClick={() => {
                actions.ruleFromTitle(event)
                dialog.current?.close()
              }}
            >
              Make a rule from this title
            </button>
          </div>
        )}

        <div className="details-actions">
          {event.google.htmlLink && (
            <a href={event.google.htmlLink} target="_blank" rel="noreferrer">
              Open in Google Calendar
            </a>
          )}
          <button onClick={() => dialog.current?.close()}>Close</button>
        </div>
      </div>
    </dialog>
  )
}
