import { useState } from 'react'
import { requestAccessToken } from './google/auth'
import { listCalendars, type CalendarListEntry } from './google/calendarApi'

// A connection check until the calendar views land (LAPTOP_PLAN.md phase 18): sign in and
// list the account's calendars. Nothing is stored; the list lives only in this page.
export default function App() {
  const [calendars, setCalendars] = useState<CalendarListEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const token = await requestAccessToken()
      setCalendars(await listCalendars(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="placeholder">
      <h1>Subtext</h1>
      <p>A calendar that keeps routine context in the background. Coming together.</p>
      <button onClick={signIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && <p className="error">{error}</p>}
      {calendars && (
        <ul className="calendars">
          {calendars.map((calendar) => (
            <li key={calendar.id}>
              <span className="swatch" style={{ background: calendar.backgroundColor }} />
              {calendar.summaryOverride ?? calendar.summary}
              <span className="role">{calendar.accessRole}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
