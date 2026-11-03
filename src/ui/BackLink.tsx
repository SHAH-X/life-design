import { Icon } from './Icon'

/** "‹ More" at the top of a sub-page. Its name says where it goes ("Back to More"), so it can't be mistaken for the tab of that name. */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="back-link" href={href} aria-label={`Back to ${children}`}>
      <Icon name="chevron-left" size={16} />
      {children}
    </a>
  )
}
