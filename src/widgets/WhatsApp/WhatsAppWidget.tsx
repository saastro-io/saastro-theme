import React from 'react'
import type { Translations } from '../../i18n/types'

// Studio editable-marker helpers, inlined on purpose. Importing them from the
// `@saastro/studio` package ROOT pulls in its main entry, which bundles the
// Node-only Vite plugin (references `__filename`) and 500s the page under the
// workerd SSR runtime. These emit the exact same `data-saastro` markers the
// package helpers do, so the Studio overlay enumerates/binds them identically.
function editableSection(fieldPrefix: string) {
  return fieldPrefix ? { 'data-saastro': `sec:${fieldPrefix}` } : {}
}
function editableSlot(fieldPrefix: string, slotName: string) {
  return fieldPrefix && slotName ? { 'data-saastro': `slot:${fieldPrefix}.${slotName}` } : {}
}

const WA_GREEN = '#25D366'
const WA_GREEN_DEEP = '#1DA851'

function WhatsAppIcon({ size = 26, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51l-.57-.01c-.197 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.064 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.57-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

interface WhatsAppWidgetProps {
  t: NonNullable<Translations['whatsapp']>
  fieldPrefix?: string
}

/**
 * Floating WhatsApp click-to-chat widget. No third-party scripts: the bubble
 * expands into a small greeting card whose CTA deep-links to
 * wa.me/<number>?text=<prefill> (mobile opens the app, desktop opens WhatsApp
 * Web). Texts + number are i18n / Studio-editable. Mount once per page in
 * SiteLayout with `client:idle` — it's non-critical and shouldn't block the LCP.
 *
 * Ported from the antenna-consulting build (proved more effective than inline
 * CTAs: always-visible, warmer, zero third-party tracking). Colors fall back to
 * a white card / dark header when the site doesn't define `--paper`/`--ink`.
 */
export default function WhatsAppWidget({ t, fieldPrefix = 'whatsapp' }: WhatsAppWidgetProps) {
  const [open, setOpen] = React.useState(false)
  // When the widget is opened by clicking one of the page's own WhatsApp links
  // (see the interceptor effect below), carry that link's href — number + its
  // contextual prefilled message — into the card CTA. null = opened directly
  // from the bubble, so fall back to the default greeting prefill.
  const [linkHref, setLinkHref] = React.useState<string | null>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const defaultHref = `https://wa.me/${t.number.replace(/\D/g, '')}?text=${encodeURIComponent(t.prefill)}`
  const href = linkHref ?? defaultHref

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Intercept every WhatsApp link on the page: instead of jumping straight to
  // wa.me, open this widget (warmer — greeting first). We carry the clicked
  // link's full href into the card CTA so the contextual prefill survives
  // (e.g. "Me interesa la categoría X"). The widget's own CTA is excluded so it
  // still navigates. Respects modifier/middle clicks (open-in-new-tab) and any
  // link that already called preventDefault.
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const url = a.getAttribute('href') || ''
      if (!/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(url)) return
      if (rootRef.current?.contains(a)) return // the widget's own CTA navigates
      e.preventDefault()
      setLinkHref(url)
      setOpen(true)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div
      ref={rootRef}
      {...editableSection(fieldPrefix)}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 12,
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      {open && (
        <div
          style={{
            width: 300,
            background: 'var(--paper, #fff)',
            borderRadius: 16,
            boxShadow: '0 24px 48px rgba(14,14,16,0.18), 0 2px 6px rgba(14,14,16,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--ink, #0E0E10)',
              color: 'var(--ink-on-dark, #F5F3EE)',
              padding: '14px 16px',
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: WA_GREEN,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <WhatsAppIcon size={20} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }} {...editableSlot(fieldPrefix, 'name')}>
                {t.name}
              </span>
              <span
                style={{ fontSize: 11, color: 'var(--ink-on-dark-2, #8C8B85)' }}
                {...editableSlot(fieldPrefix, 'role')}
              >
                {t.role}
              </span>
            </span>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: 'var(--ink, #0E0E10)',
                background: 'var(--surface, #F1EEE8)',
                borderRadius: '12px 12px 12px 2px',
                padding: '10px 12px',
              }}
              {...editableSlot(fieldPrefix, 'greeting')}
            >
              {t.greeting}
            </p>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              {...editableSlot(fieldPrefix, 'cta')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: WA_GREEN,
                color: '#fff',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
                padding: '12px 16px',
                borderRadius: 999,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = WA_GREEN_DEEP
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = WA_GREEN
              }}
            >
              <WhatsAppIcon size={16} />
              {t.cta}
            </a>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (!open) setLinkHref(null)
          setOpen(v => !v)
        }}
        aria-label={open ? t.ariaClose : t.ariaOpen}
        aria-expanded={open}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 0,
          cursor: 'pointer',
          background: WA_GREEN,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 32px rgba(29,168,81,0.4), 0 2px 6px rgba(14,14,16,0.12)',
        }}
      >
        {open ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <WhatsAppIcon />
        )}
      </button>
    </div>
  )
}
