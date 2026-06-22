import { useState, useEffect, useCallback } from "react"
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
}

export function CookieBanner({ translations: t, cookiesPolicyHref }: CookieBannerProps) {
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
      setConsent(prefs)
      window.dispatchEvent(new CustomEvent("cookie-consent-updated", { detail: prefs }))
      setVisible(false)
      setShowCustomize(false)
    },
    [],
  )

  if (!visible) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-lg animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-label={t.title}
      data-saastro="sec:cookieBanner"
    >
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-semibold text-sm" data-saastro-field="title">{t.title}</p>
            <p className="text-sm text-muted-foreground mt-1">
              <span data-saastro-field="description">{t.description}</span>{" "}
              <a href={cookiesPolicyHref} className="underline underline-offset-4 hover:text-foreground transition-colors" data-saastro-field="policyLinkText">
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
                    <Label className="text-sm font-medium" data-saastro-field="essentialLabel">{t.essentialLabel}</Label>
                    <p className="text-xs text-muted-foreground" data-saastro-field="essentialDescription">{t.essentialDescription}</p>
                  </div>
                  <span className="text-xs text-muted-foreground" data-saastro-field="alwaysActive">{t.alwaysActive}</span>
                </div>

                {/* Analytics */}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="cookie-analytics" className="text-sm font-medium" data-saastro-field="analyticsLabel">{t.analyticsLabel}</Label>
                    <p className="text-xs text-muted-foreground" data-saastro-field="analyticsDescription">{t.analyticsDescription}</p>
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
                    <Label htmlFor="cookie-personalization" className="text-sm font-medium" data-saastro-field="personalizationLabel">{t.personalizationLabel}</Label>
                    <p className="text-xs text-muted-foreground" data-saastro-field="personalizationDescription">{t.personalizationDescription}</p>
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
            <Button variant="outline" size="sm" data-saastro-field="rejectAll" onClick={() => save({ analytics: false, personalization: false })}>
              {t.rejectAll}
            </Button>

            {showCustomize ? (
              <Button size="sm" data-saastro-field="savePreferences" onClick={() => save({ analytics, personalization })}>
                {t.savePreferences}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" data-saastro-field="customize" onClick={() => setShowCustomize(true)}>
                  {t.customize}
                </Button>
                <Button size="sm" data-saastro-field="acceptAll" onClick={() => save({ analytics: true, personalization: true })}>
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
