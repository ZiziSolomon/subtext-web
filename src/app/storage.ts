import { useEffect, useState } from 'react'

/**
 * Per-browser conveniences only (which view, which calendars are ticked). Storage can be
 * missing or blocked, so every access is guarded and the app works without it. Anything that
 * must follow Zizi between devices (rules) lives in her Google account instead.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private window or blocked storage: the setting just won't persist
  }
}

export function useStored<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))
  useEffect(() => writeStored(key, value), [key, value])
  return [value, setValue]
}
