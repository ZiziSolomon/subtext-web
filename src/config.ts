// The OAuth client for this app. A browser app's client id is public by design (it ships in
// the page); only allowed origins can use it. There is no client secret.
export const GOOGLE_CLIENT_ID = '187268777272-9fhqpd31mcm2mt1fk1qou3aai6gdmprb.apps.googleusercontent.com'

// Least privilege (LAPTOP_PLAN.md): edit events, list calendars, and create the app's own
// rules calendar, but not share or delete whole calendars.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
].join(' ')
