export interface BuildInfo {
  version: string
  commit: string
  builtAt: string
}

export const buildInfo: BuildInfo = {
  version: __APP_VERSION__,
  commit: __COMMIT__,
  builtAt: __BUILD_TIME__,
}

/** "v0.1.0 · abc1234 · 21 Oct 2026, 14:03": lets you confirm on the phone which build is running. */
export function formatBuildInfo(info: BuildInfo, locale?: string): string {
  const builtAt = new Date(info.builtAt)
  const when = Number.isNaN(builtAt.getTime())
    ? 'unknown date'
    : builtAt.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `v${info.version} · ${info.commit} · ${when}`
}
