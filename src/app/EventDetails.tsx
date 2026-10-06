import { useEffect, useRef } from 'react'
import type { RuleEvaluator } from '../core/evaluator'
import type { Rule } from '../core/types'
import { argbToCss, type AppEvent } from '../google/events'
import { formatTime, zone } from './dates'

function describeRule(rule: Rule): string {
  switch (rule.type) {
    case 'all':
      return 'every event in this calendar'
    case 'title_contains':
      return `title contains "${rule.pattern}"`
    case 'title_regex':
      return `title matches /${rule.pattern}/`
    case 'duration_over':
      return `longer than ${Math.round(Number(rule.pattern) / 60)} hours`
    case 'event':
      return 'marked directly'
  }
}

/** Read-only details for now; editing arrives in phase 20. */
export function EventDetails({ event, contextual, evaluator, onClose }: { event: AppEvent; contextual: boolean; evaluator: RuleEvaluator; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const when = event.allDay
    ? event.startDate.equals(event.endDate)
      ? event.startDate.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${event.startDate.toLocaleString(undefined, { day: 'numeric', month: 'short' })} – ${event.endDate.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${event.start.toZonedDateTimeISO(zone).toPlainDate().toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTime(event.start)} – ${formatTime(event.end)}`

  const reasons = contextual ? evaluator.matchingRules(event).map(describeRule) : []

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
