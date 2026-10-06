import { argbToCss } from '../google/events'

/** A context's background tint: the colour at low strength, like the phone's stripes. */
export function tint(argb: number, alpha = 0.18): string {
  const rgb = argb >>> 0
  return `rgba(${(rgb >> 16) & 0xff}, ${(rgb >> 8) & 0xff}, ${rgb & 0xff}, ${alpha})`
}

/** Black or white text, whichever reads better on [argb] (WCAG relative luminance). */
export function textOn(argb: number): string {
  const rgb = argb >>> 0
  const channel = (shift: number) => {
    const c = ((rgb >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  return luminance > 0.4 ? '#1b1b1f' : '#ffffff'
}

export { argbToCss }
