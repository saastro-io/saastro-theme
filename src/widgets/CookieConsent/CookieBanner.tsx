import { useState, useEffect, useCallback } from "react"
import { editableField, editableSection } from "@saastro/studio/markers"
import { getConsent, setConsent } from "@/lib/cookies"
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
  personalizationLabel: string
  personalizationDescription: string
  alwaysActive: string
}

interface CookieBannerProps {
  translations: CookieBannerTranslations
  cookiesPolicyHref: string
  /** Studio section key — i18n namespace the field markers bind to. */
  fieldPrefix?: string
}

/** ¿Hay algún tracker de analytics ya cargado en esta página? Cubre los flags
 *  que dejan los loaders gateados del theme (Analytics.astro: `gaLoaded` /
 *  `gtmLoaded`; BaseLayout: `__cfBeaconLoaded`) y, como red de seguridad, la
 *  presencia del <script> del beacon de CF aunque lo haya inyectado otro
 *  código (p. ej. auto-inject de Cloudflare). */
function analyticsTrackerLoaded(): boolean {
  const w = window as Window & {
    gaLoaded?: boolean
    gtmLoaded?: boolean
    __cfBeaconLoaded?: boolean
  }
  return Boolean(
    w.gaLoaded ||
      w.gtmLoaded ||
      w.__cfBeaconLoaded ||
      document.querySelector('script[src*="cloudflareinsights.com"]'),
  )
}

export function CookieBanner({ translations: t, cookiesPolicyHref, fieldPrefix = 'cookieBanner' }: CookieBannerProps) {
  const [visible, setVisible] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [personalization, setPersonalization] = useState(false)

  useEffect(() => {
    const consent = getConsent()
    if (!consent) setVisible(true)

    const handleReopen = () => {
      const existing = getConsent()
      if (existing) {
        setAnalytics(existing.analytics)
        setPersonalization(existing.personalization)
      }
      setShowCustomize(true)
      setVisible(true)
    }
    window.addEventListener("cookie-consent-reopen", handleReopen)
    return () => window.removeEventListener("cookie-consent-reopen", handleReopen)
  }, [])

  const save = useCallback(
    (prefs: { analytics: boolean; personalization: boolean }) => {
      const previous = getConsent()
      setConsent(prefs)
      window.dispatchEvent(new CustomEvent("cookie-consent-updated", { detail: prefs }))
      setVisible(false)
      setShowCustomize(false)

      // Revocación EFECTIVA (RGPD): apagar analytics escribe la cookie, pero un
      // tracker YA CARGADO (gtag/GTM/beacon CF) sigue emitiendo — y con
      // ClientRouter (view transitions) sobreviviría toda la sesión SPA. No hay
      // forma fiable de "descargar" esos scripts, así que si analytics pasa de
      // on→off con un tracker vivo, recargamos: al arrancar sin consentimiento,
      // los loaders gateados (Analytics.astro / beacon CF) ya no lo inyectan.
      if (previous?.analytics && !prefs.analytics && analyticsTrackerLoaded()) {
        window.location.reload()
      }
    },
    [],
  )

  if (!visible) return null

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
            <Button variant="outline" size="sm" {...editableField("rejectAll")} onClick={() => save({ analytics: false, personalization: false })}>
              {t.rejectAll}
            </Button>

            {showCustomize ? (
              <Button size="sm" {...editableField("savePreferences")} onClick={() => save({ analytics, personalization })}>
                {t.savePreferences}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" {...editableField("customize")} onClick={() => setShowCustomize(true)}>
                  {t.customize}
                </Button>
                <Button size="sm" {...editableField("acceptAll")} onClick={() => save({ analytics: true, personalization: true })}>
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
