import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../config'

// Just the parts of Google Identity Services' token model that we use.
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }): TokenClient
        }
      }
    }
  }
}

let scriptLoad: Promise<void> | null = null

function loadIdentityScript(): Promise<void> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(script)
  })
  return scriptLoad
}

export interface AccessToken {
  token: string
  expiresAt: number
}

/**
 * Opens Google's popup and resolves with an access token. Tokens last about an hour; there's no
 * refresh token in the browser model, so callers ask again when one expires. Must be called from
 * a click, or browsers block the popup.
 *
 * With no [loginHint], Google shows its account chooser (otherwise it silently reuses whichever
 * account the browser is signed into, so a second account could never be added). With one, it
 * renews that account, without asking if the grant still stands.
 */
export async function requestAccessToken(loginHint?: string): Promise<AccessToken> {
  await loadIdentityScript()
  const oauth2 = window.google?.accounts.oauth2
  if (!oauth2) {
    throw new Error('Google sign-in did not initialise')
  }

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? 'Sign-in failed'))
          return
        }
        resolve({ token: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 })
      },
      error_callback: (error) => reject(new Error(error.message ?? error.type)),
    })
    client.requestAccessToken(loginHint ? { login_hint: loginHint, prompt: '' } : { prompt: 'select_account' })
  })
}
