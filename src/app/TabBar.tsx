import type { ReactNode } from 'react'
import { hashFor, type Tab } from '../lib/route'

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const ITEMS: { tab: Tab; label: string; icon: ReactNode }[] = [
  {
    tab: 'today',
    label: 'Today',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    tab: 'entries',
    label: 'Logs',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M8 6h12M8 12h12M8 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </svg>
    ),
  },
  {
    tab: 'ask',
    label: 'Ask',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        <path d="M10 9.5a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M12 16h.01" />
      </svg>
    ),
  },
  {
    tab: 'money',
    label: 'Money',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H19a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 17.5Z" />
        <path d="M4 7.5 15.5 4v2M15 12.5h5M17 12.5h.01" />
      </svg>
    ),
  },
  {
    tab: 'insights',
    label: 'Insights',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    tab: 'more',
    label: 'More',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="19" cy="12" r="1.2" />
      </svg>
    ),
  },
]

export function TabBar({ current }: { current: Tab }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {ITEMS.map(({ tab, label, icon }) => (
        <a key={tab} href={hashFor(tab)} aria-current={tab === current ? 'page' : undefined}>
          {icon}
          <span>{label}</span>
        </a>
      ))}
    </nav>
  )
}
