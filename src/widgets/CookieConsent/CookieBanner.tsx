import { useState, useEffect, useCallback } from "react"
import { editableField, editableSection } from "@saastro/studio/markers"
import { consentRevoked, getConsent, setConsent, type ConsentPrefs } from "@/lib/cookies"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"

interface CookieBannerTranslations {
  title: string
  description: string
  policyLinkText: string
  acceptAll: string
  rejectAll: string
  customize: string
  savePreferences: string
  essentialLabel: string
  essentialDescription: string
  analyticsLabel: string
  analyticsDescription: string
  /** Opcionales: los i18n de los descendientes son `merge=ours` y no reciben
   *  claves nuevas solas — sin ellas se usa el texto por defecto de abajo. */
  marketingLabel?: string
  marketingDescription?: string
  personalizationLabel: string
  personalizationDescription: string
  alwaysActive: string
}

interface CookieBannerProps {
  translations: CookieBannerTranslations
  cookiesPolicyHref: string
  /** Muestra la categoría «marketing». Solo si el site tiene algún píxel de
   *  anuncios encendido: un interruptor sin nada detrás confunde y obliga a
   *  describir en la política algo que no ocurre. */
  showMarketing?: boolean
  /** Studio section key — i18n namespace the field markers bind to. */
  fieldPrefix?: string
}

/** ¿Hay algún tracker CONDICIONADO AL CONSENTIMIENTO ya cargado en esta página?
 *  Solo los flags de los loaders gateados (Analytics.astro: `gaLoaded` /
 *  `gtmLoaded`).
 *
 *  El beacon de Cloudflare NO cuenta a propósito: no está gateado (es cookieless
 *  — ver la nota de decisión en BaseLayout), así que recargar por él sería
 *  inútil: volvería a cargar igual tras el reload. Incluirlo solo provocaría una
 *  recarga sin efecto cada vez que alguien apaga analytics en un site con beacon. */
function analyticsTrackerLoaded(): boolean {
  const w = window as Window & { gaLoaded?: boolean; gtmLoaded?: boolean; trackersLoaded?: boolean }
  return Boolean(w.gaLoaded || w.gtmLoaded || w.trackersLoaded)
}

/** El beacon de Gen en modo `consent="required"` lee `localStorage['gen-consent']`,
 *  no la cookie del banner: sin este espejo nunca arrancaba (ni se apagaba al
 *  retirar). Se alinea con la categoría `analytics`. */
function mirrorGenConsent(analytics: boolean): void {
  try {
    if (analytics) {
      localStorage.setItem('gen-consent', 'granted')
      window.dispatchEvent(new Event('gen:consent-granted'))
    } else {
      localStorage.removeItem('gen-consent')
    }
  } catch {
    /* storage bloqueado: el beacon simplemente no arranca */
  }
}

export function CookieBanner({ translations: t, cookiesPolicyHref, showMarketing = false, fieldPrefix = 'cookieBanner' }: CookieBannerProps) {
  const [visible, setVisible] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [personalization, setPersonalization] = useState(false)

  useEffect(() => {
    const consent = getConsent()
    if (!consent) setVisible(true)
    // Quien ya eligió antes de que existiera el espejo no pasa por `save`.
    else mirrorGenConsent(consent.analytics)

    const w = window as Window & { __cookieReopenPending?: boolean }
    const handleReopen = () => {
      // Consume SIEMPRE el pending-flag (el script del Footer lo marca en cada
      // click): si quedara a true, una remontada de la isla tras un swap de
      // ClientRouter reabriría el banner espuriamente.
      delete w.__cookieReopenPending
      const existing = getConsent()
      if (existing) {
        setAnalytics(existing.analytics)
        setMarketing(existing.marketing)
        setPersonalization(existing.personalization)
      }
      setShowCustomize(true)
      setVisible(true)
    }
    window.addEventListener("cookie-consent-reopen", handleReopen)

    // Race click-antes-de-hidratar: la isla es client:idle — un click en
    // #manage-cookies-btn antes de que este listener exista perdería el evento.
    // El script delegado del Footer deja además window.__cookieReopenPending;
    // aquí se consume al montar y se abre el banner.
    if (w.__cookieReopenPending) handleReopen()

    return () => window.removeEventListener("cookie-consent-reopen", handleReopen)
  }, [])

  const save = useCallback(
    (input: Omit<ConsentPrefs, 'marketing'> & { marketing?: boolean }) => {
      // Sin la categoría a la vista no hay consentimiento que dar: nunca se
      // guarda un `marketing: true` que el visitante no pudo ver ni decidir.
      const prefs: ConsentPrefs = { ...input, marketing: showMarketing && input.marketing === true }
      const previous = getConsent()
      setConsent(prefs)
      mirrorGenConsent(prefs.analytics)
      window.dispatchEvent(new CustomEvent("cookie-consent-updated", { detail: prefs }))
      setVisible(false)
      setShowCustomize(false)

      // Revocación EFECTIVA (RGPD): apagar analytics escribe la cookie, pero un
      // tracker YA CARGADO (gtag/GTM/beacon CF) sigue emitiendo — y con
      // ClientRouter (view transitions) sobreviviría toda la sesión SPA. No hay
      // forma fiable de "descargar" esos scripts, así que si analytics pasa de
      // on→off con un tracker vivo, recargamos: al arrancar sin consentimiento,
      // los loaders gateados (Analytics.astro / beacon CF) ya no lo inyectan.
      if (consentRevoked(previous, prefs) && analyticsTrackerLoaded()) {
        window.location.reload()
      }
    },
    [showMarketing],
  )

  if (!visible) return <></>

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-lg animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-label={t.title}
      {...editableSection(fieldPrefix)}
    >
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-semibold text-sm" {...editableField("title")}>{t.title}</p>
            <p className="text-sm text-muted-foreground mt-1">
              <span {...editableField("description")}>{t.description}</span>{" "}
              <a href={cookiesPolicyHref} className="underline underline-offset-4 hover:text-foreground transition-colors" {...editableField("policyLinkText")}>
                {t.policyLinkText}
              </a>
            </p>
          </div>

          {showCustomize && (
            <>
              <Separator />
              <div className="space-y-4">
                {/* Essential */}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium" {...editableField("essentialLabel")}>{t.essentialLabel}</Label>
                    <p className="text-xs text-muted-foreground" {...editableField("essentialDescription")}>{t.essentialDescription}</p>
                  </div>
                  <span className="text-xs text-muted-foreground" {...editableField("alwaysActive")}>{t.alwaysActive}</span>
                </div>

                {/* Analytics */}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="cookie-analytics" className="text-sm font-medium" {...editableField("analyticsLabel")}>{t.analyticsLabel}</Label>
                    <p className="text-xs text-muted-foreground" {...editableField("analyticsDescription")}>{t.analyticsDescription}</p>
                  </div>
                  <Switch
                    id="cookie-analytics"
                    checked={analytics}
                    onCheckedChange={setAnalytics}
                  />
                </div>

                {/* Marketing */}
                {showMarketing && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="cookie-marketing" className="text-sm font-medium" {...editableField("marketingLabel")}>{t.marketingLabel ?? "Marketing"}</Label>
                      <p className="text-xs text-muted-foreground" {...editableField("marketingDescription")}>{t.marketingDescription ?? "Measure our advertising and show you relevant offers on other sites."}</p>
                    </div>
                    <Switch
                      id="cookie-marketing"
                      checked={marketing}
                      onCheckedChange={setMarketing}
                    />
                  </div>
                )}

                {/* Personalization */}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="cookie-personalization" className="text-sm font-medium" {...editableField("personalizationLabel")}>{t.personalizationLabel}</Label>
                    <p className="text-xs text-muted-foreground" {...editableField("personalizationDescription")}>{t.personalizationDescription}</p>
                  </div>
                  <Switch
                    id="cookie-personalization"
                    checked={personalization}
                    onCheckedChange={setPersonalization}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" {...editableField("rejectAll")} onClick={() => save({ analytics: false, marketing: false, personalization: false })}>
              {t.rejectAll}
            </Button>

            {showCustomize ? (
              <Button size="sm" {...editableField("savePreferences")} onClick={() => save({ analytics, marketing, personalization })}>
                {t.savePreferences}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" {...editableField("customize")} onClick={() => setShowCustomize(true)}>
                  {t.customize}
                </Button>
                <Button size="sm" {...editableField("acceptAll")} onClick={() => save({ analytics: true, marketing: true, personalization: true })}>
                  {t.acceptAll}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
