import { useEffect, useMemo, useState } from 'react'
import { RuleEvaluator, regexError } from '../core/evaluator'
import { groupMatches } from '../core/matchGroups'
import { regexPortabilityProblem, type PortabilityProblem } from '../core/regexPortability'
import { regexRisk } from '../core/regexRisk'
import { describeRule } from '../core/ruleText'
import { FORMAT_VERSION, isReadOnly, toRule, type SharedRule } from '../core/sharedRule'
import type { MatchType } from '../core/types'
import { argbToCss, hexToArgb, type AppEvent } from '../google/events'
import type { StoredRule } from '../google/rulesCalendar'
import type { AccountCalendar } from './accounts'
import { formatTime, zone } from './dates'
import type { RulesState } from './useRules'
import { newRuleId, nowIso } from './useRules'
import { PREVIEW_MONTHS_AHEAD, PREVIEW_MONTHS_BACK, startOf } from './usePreviewEvents'

const TYPE_LABELS: Record<Exclude<MatchType, 'event'>, string> = {
  title_contains: 'Title contains',
  title_regex: 'Title matches regex',
  duration_over: 'Longer than (hours)',
  all: 'Every event in a calendar',
}

const PORTABILITY_TEXT: Record<PortabilityProblem, string> = {
  ATOMIC_GROUP: '(?>…) groups',
  POSSESSIVE_QUANTIFIER: 'possessive quantifiers like a++',
  INLINE_FLAGS: 'inline flags like (?i) (matching already ignores case)',
  CLASS_SET_OPERATION: '[…] inside […], or &&',
  JAVA_ONLY_ESCAPE: 'this backslash escape',
}

/** What the editor is working on: a new rule (maybe prefilled), or an existing one. */
export interface EditTarget {
  existing?: StoredRule
  draft: SharedRule
}

export function blankRule(partial: Partial<SharedRule> = {}): SharedRule {
  return { version: FORMAT_VERSION, uuid: newRuleId(), updated: nowIso(), enabled: true, type: 'title_contains', pattern: '', extra: {}, ...partial }
}

interface PanelProps {
  rules: RulesState
  calendars: AccountCalendar[]
  accounts: string[]
  previewEvents: AppEvent[]
  previewLoading: boolean
  editing: EditTarget | null
  setEditing: (target: EditTarget | null) => void
  onDraftChange: (rule: SharedRule | null) => void
  onOpenEvent: (event: AppEvent) => void
  onClose: () => void
}

export function RulesPanel({ rules, calendars, accounts, previewEvents, previewLoading, editing, setEditing, onDraftChange, onOpenEvent, onClose }: PanelProps) {
  return (
    <aside className="rules-panel" aria-label="Contextual rules">
      <div className="rules-panel-head">
        <h2>{editing ? (editing.existing ? 'Edit rule' : 'New rule') : 'Contextual rules'}</h2>
        <button className="icon" aria-label="Close rules" onClick={onClose}>
          ✕
        </button>
      </div>
      {editing ? (
        <RuleEditor
          key={editing.existing?.eventId ?? editing.draft.uuid}
          target={editing}
          rules={rules}
          calendars={calendars}
          previewEvents={previewEvents}
          previewLoading={previewLoading}
          onDraftChange={onDraftChange}
          onOpenEvent={onOpenEvent}
          onDone={() => setEditing(null)}
        />
      ) : (
        <RuleList rules={rules} calendars={calendars} accounts={accounts} previewEvents={previewEvents} onEdit={(existing) => setEditing({ existing, draft: existing.rule })} onNew={() => setEditing({ draft: blankRule() })} />
      )}
    </aside>
  )
}

function RuleList({ rules, calendars, accounts, previewEvents, onEdit, onNew }: { rules: RulesState; calendars: AccountCalendar[]; accounts: string[]; previewEvents: AppEvent[]; onEdit: (s: StoredRule) => void; onNew: () => void }) {
  const [createIn, setCreateIn] = useState(accounts.find((a) => a.startsWith('marthaonwheels')) ?? accounts[0] ?? '')

  if (rules.status === 'missing') {
    return (
      <div className="rules-body">
        <p>Your rules are shared between phone and laptop through a calendar called “Subtext rules” in one of your Google accounts. It doesn't exist yet.</p>
        <label className="field">
          <span>Create it in</span>
          <select aria-label="Create it in" value={createIn} onChange={(e) => setCreateIn(e.target.value)}>
            {accounts.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => rules.createCalendar(createIn)}>
          Create the rules calendar
        </button>
        {rules.error && <p className="error small">{rules.error}</p>}
      </div>
    )
  }
  if (rules.status === 'signed-out') return <div className="rules-body"><p className="muted">Sign in again to {rules.account ?? 'the account with your rules'} (in the sidebar) to see your rules.</p></div>
  if (rules.status === 'loading') return <div className="rules-body"><p className="muted">Loading rules…</p></div>

  return (
    <div className="rules-body">
      <button className="primary full" onClick={onNew}>
        + New rule
      </button>
      {rules.error && <p className="error small">{rules.error}</p>}
      {rules.stored.length === 0 && <p className="muted">No rules yet. A rule makes matching events contextual: background, not commitments.</p>}
      <ul className="rule-list">
        {rules.stored.map((stored) => (
          <RuleRow key={stored.eventId} stored={stored} rules={rules} calendars={calendars} previewEvents={previewEvents} onEdit={onEdit} />
        ))}
      </ul>
      {rules.unreadable > 0 && <p className="muted small">{rules.unreadable} event(s) in the rules calendar aren't rules this app can read; they're left alone.</p>}
      {rules.account && <p className="muted small">Stored in “Subtext rules”, {rules.account}.</p>}
    </div>
  )
}

function RuleRow({ stored, rules, calendars, previewEvents, onEdit }: { stored: StoredRule; rules: RulesState; calendars: AccountCalendar[]; previewEvents: AppEvent[]; onEdit: (s: StoredRule) => void }) {
  const { rule } = stored
  const count = useMemo(() => {
    const evaluator = new RuleEvaluator([{ ...toRule(rule), enabled: true }])
    return previewEvents.filter((e) => evaluator.isContextual(e)).length
  }, [rule, previewEvents])
  const scope = rule.calendar ? calendars.find((c) => c.id === rule.calendar!.id)?.summary ?? rule.calendar.name ?? 'a calendar not signed in' : 'All calendars'

  return (
    <li className={`rule-row${rule.enabled ? '' : ' is-disabled'}`}>
      <button className="rule-main" onClick={() => onEdit(stored)}>
        <span className="rule-title">
          {rule.keyColor !== undefined && <span className="key-swatch" style={{ background: argbToCss(rule.keyColor) }} />}
          {describeRule(rule, rule.event?.title)}
        </span>
        <span className="rule-sub">
          {rule.keyName ? `Key: ${rule.keyName} · ` : ''}
          {scope} · {count === 0 ? <strong className="warn">Matches no events</strong> : `${count} event${count === 1 ? '' : 's'}`}
        </span>
      </button>
      <input
        type="checkbox"
        aria-label={rule.enabled ? 'Turn off' : 'Turn on'}
        checked={rule.enabled}
        disabled={isReadOnly(rule)}
        onChange={() => rules.save({ ...rule, enabled: !rule.enabled }, stored)}
      />
    </li>
  )
}

// --- the editor ---

interface EditorProps {
  target: EditTarget
  rules: RulesState
  calendars: AccountCalendar[]
  previewEvents: AppEvent[]
  previewLoading: boolean
  onDraftChange: (rule: SharedRule | null) => void
  onOpenEvent: (event: AppEvent) => void
  onDone: () => void
}

function RuleEditor({ target, rules, calendars, previewEvents, previewLoading, onDraftChange, onOpenEvent, onDone }: EditorProps) {
  const [draft, setDraft] = useState<SharedRule>(target.draft)
  // durations are typed in hours, stored in minutes, as on the phone
  const [hours, setHours] = useState(() => (target.draft.type === 'duration_over' && target.draft.pattern ? String(+(Number(target.draft.pattern) / 60).toFixed(2)) : ''))
  const [saving, setSaving] = useState(false)
  const readOnly = isReadOnly(draft)
  const isMark = draft.type === 'event'

  const effective: SharedRule = draft.type === 'duration_over' ? { ...draft, pattern: hours.trim() === '' ? '' : String(Math.round(Number(hours) * 60)) } : draft
  const problem = validate(effective)

  const matches = useMemo(() => {
    if (problem) return []
    const evaluator = new RuleEvaluator([{ ...toRule(effective), enabled: true }])
    return previewEvents.filter((e) => evaluator.isContextual(e))
    // effective is derived from draft and hours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, hours, previewEvents, problem])
  const groups = useMemo(() => groupMatches(matches, Date.now(), startOf, (e) => (e.allDay ? startOf(e) + 86_400_000 * (e.startDate.until(e.endDate).days + 1) : e.end.epochMilliseconds)), [matches])

  const update = (patch: Partial<SharedRule>) => setDraft((d) => ({ ...d, ...patch }))

  // tell the views what to outline; nothing once the editor closes
  useEffect(() => {
    onDraftChange(problem ? null : effective)
    // effective is derived from draft and hours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, hours, problem, onDraftChange])
  useEffect(() => () => onDraftChange(null), [onDraftChange])

  async function save() {
    if (problem || readOnly) return
    setSaving(true)
    const ok = await rules.save(effective, target.existing)
    setSaving(false)
    if (ok) onDone()
  }

  async function remove() {
    if (!target.existing) return
    await rules.remove(target.existing)
    onDone()
  }

  return (
    <div className="rules-body editor">
      {readOnly && <p className="notice">This rule was made by a newer version of Subtext, so it can't be edited here.</p>}

      {isMark ? (
        <p>
          Marks one event{draft.event?.title ? ` (“${draft.event.title}”)` : ''} as contextual, every occurrence if it repeats.
        </p>
      ) : (
        <>
          <label className="field">
            <span>Match</span>
            <select aria-label="Match" value={draft.type} disabled={readOnly} onChange={(e) => update({ type: e.target.value as MatchType })}>
              {Object.entries(TYPE_LABELS).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {draft.type === 'duration_over' ? (
            <label className="field">
              <span>Longer than this many hours</span>
              <input type="number" min="0" step="0.5" value={hours} disabled={readOnly} onChange={(e) => setHours(e.target.value)} />
            </label>
          ) : draft.type !== 'all' ? (
            <label className="field">
              <span>{draft.type === 'title_regex' ? 'Regular expression' : 'Text in the title'}</span>
              <input value={draft.pattern} disabled={readOnly} autoFocus spellCheck={false} onChange={(e) => update({ pattern: e.target.value })} />
            </label>
          ) : null}

          <label className="field">
            <span>Calendar</span>
            <select
              aria-label="Calendar"
              value={draft.calendar?.id ?? ''}
              disabled={readOnly}
              onChange={(e) => {
                const calendar = calendars.find((c) => c.id === e.target.value)
                update({ calendar: calendar ? { id: calendar.id, name: calendar.summaryOverride ?? calendar.summary } : undefined })
              }}
            >
              <option value="">All calendars</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summaryOverride ?? c.summary} ({c.account})
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="field">
        <span>Name in the key (optional)</span>
        <input value={draft.keyName ?? ''} disabled={readOnly} placeholder="Uses each event's title" onChange={(e) => update({ keyName: e.target.value === '' ? undefined : e.target.value })} />
      </label>

      <div className="field">
        <span>Colour</span>
        <div className="color-row">
          <label>
            <input type="radio" checked={draft.keyColor === undefined} disabled={readOnly} onChange={() => update({ keyColor: undefined })} /> Automatic
          </label>
          <label>
            <input type="radio" checked={draft.keyColor !== undefined} disabled={readOnly} onChange={() => update({ keyColor: draft.keyColor ?? hexToArgb('#43a047') })} /> Custom
          </label>
          {draft.keyColor !== undefined && (
            <input type="color" value={argbToCss(draft.keyColor)} disabled={readOnly} onChange={(e) => update({ keyColor: hexToArgb(e.target.value) })} />
          )}
        </div>
      </div>

      {problem && <p className="error small">{problem}</p>}
      {rules.error && <p className="error small">{rules.error}</p>}

      <div className="editor-actions">
        {target.existing && !readOnly && (
          <button className="danger" onClick={remove}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button onClick={onDone}>Cancel</button>
        <button className="primary" disabled={!!problem || readOnly || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <section className="matches">
        <h3>
          {previewLoading
            ? 'Finding matches…'
            : problem
              ? 'Matches'
              : `${matches.length} matching event${matches.length === 1 ? '' : 's'}${groups.length !== matches.length ? `, ${groups.length} series` : ''}`}
        </h3>
        <p className="muted small">
          From {PREVIEW_MONTHS_BACK} month back to {PREVIEW_MONTHS_AHEAD} months ahead, in every calendar. Matches are outlined in the calendar.
        </p>
        <ul className="match-list">
          {groups.map((group) => {
            const event = group.next as AppEvent
            return (
              <li key={group.key}>
                <button onClick={() => onOpenEvent(event)}>
                  <span className="key-swatch" style={{ background: argbToCss(event.color) }} />
                  <span className="match-title">{group.title || '(No title)'}</span>
                  <span className="match-when">
                    {whenText(event)}
                    {group.count > 1 ? ` · ×${group.count}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function whenText(event: AppEvent): string {
  if (event.allDay) return event.startDate.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const date = event.start.toZonedDateTimeISO(zone).toPlainDate()
  return `${date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${formatTime(event.start)}`
}

/** Why the draft can't be saved, in words, or null. Same checks and wording as the phone. */
export function validate(rule: SharedRule): string | null {
  switch (rule.type) {
    case 'title_contains':
      return rule.pattern.trim() === '' ? 'Type some text to look for in titles.' : null
    case 'title_regex': {
      if (rule.pattern.trim() === '') return 'Type a regular expression.'
      const error = regexError(rule.pattern)
      if (error) return `Not a valid regex: ${error}`
      switch (regexRisk(rule.pattern)) {
        case 'NESTED_QUANTIFIER':
          return 'Nested repeats like (a+)+ can freeze the app on some titles. Simplify the pattern.'
        case 'QUANTIFIED_ALTERNATION':
          return 'A repeated choice like (a|b)+ can freeze the app on some titles. Try a character class like [ab]+.'
        case 'BACKREFERENCE':
          return 'Backreferences like \\1 aren’t allowed: they can freeze the app.'
      }
      const portability = regexPortabilityProblem(rule.pattern)
      return portability ? `The phone reads ${PORTABILITY_TEXT[portability]} differently, so rules can’t use it.` : null
    }
    case 'duration_over':
      return rule.pattern === '' || !(Number(rule.pattern) >= 0) ? 'Type a number of hours.' : null
    case 'all':
      // an unscoped "every event" would make everything background
      return rule.calendar ? null : 'Choose the calendar whose events are all contextual.'
    case 'event':
      return rule.event ? null : 'This mark has lost its event.'
  }
}

