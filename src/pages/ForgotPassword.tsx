import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { isTransientAuthError } from '@/lib/errors'
import { AuthLayout, InkAlert, InkField, inkFieldClasses } from '@/components/AuthLayout'
import { Button, LinkButton } from '@/components/ui/Button'
import { IconCheck } from '@/components/ui/Icons'

const schema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
})
type Values = z.infer<typeof schema>

const CONFIRMATION =
  'Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir einen Link zum ' +
  'Zurücksetzen deines Passworts geschickt. Schau auch im Spam-Ordner nach.'

/**
 * Mindestlaufzeit fuer den Absendevorgang.
 *
 * Spec §4.3 verlangt, dass sich eine unbekannte E-Mail-Adresse von einer
 * bekannten "weder im Text noch in der Antwortzeit" unterscheidet. Ohne diese
 * Angleichung waere ein sofortiger Fehlschlag messbar schneller als ein
 * tatsaechlicher Mailversand — und damit ein Weg, Konten aufzuspueren.
 */
const MIN_DURATION_MS = 900

async function withMinDuration<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    new Promise((resolve) => setTimeout(resolve, MIN_DURATION_MS)),
  ])
  return result
}

/** Passwort vergessen — `/forgot-password` (Spec §4.3). */
export default function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: Values) => {
    setFormError(null)

    const { error } = await withMinDuration(
      supabase.auth.resetPasswordForEmail(values.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
    )

    // NUR voruebergehende Fehler werden angezeigt. Alles andere — insbesondere
    // "Nutzer existiert nicht" — wird verschluckt und fuehrt zur immer gleichen
    // Bestaetigung.
    if (error && isTransientAuthError(error)) {
      console.error('[gym-tracker] Reset-Link fehlgeschlagen (vorübergehend):', error)
      setFormError(
        'Das hat gerade nicht geklappt — zu viele Anfragen oder der Dienst ist kurz nicht erreichbar. Bitte versuche es in ein paar Minuten erneut.'
      )
      return
    }
    if (error) {
      console.error('[gym-tracker] Reset-Link fehlgeschlagen (verschluckt):', error)
    }

    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout
        title={
          <>
            E-Mail
            <br />
            <span className="text-accent">unterwegs.</span>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <span className="animate-pop grid size-14 place-items-center rounded-full bg-accent text-[26px] text-accent-ink">
            <IconCheck />
          </span>
          <p className="text-[14.5px] leading-relaxed font-medium text-on-ink-muted text-pretty">
            {CONFIRMATION}
          </p>
          <LinkButton to="/login" variant="on-ink" size="lg" block>
            Zurück zur Anmeldung
          </LinkButton>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={
        <>
          Passwort
          <br />
          <span className="text-accent">zurücksetzen.</span>
        </>
      }
      description="Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum Zurücksetzen."
      footer={
        <Link to="/login" className="font-extrabold text-accent hover:underline">
          Zurück zur Anmeldung
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {formError && <InkAlert>{formError}</InkAlert>}

        <InkField label="E-Mail" error={errors.email?.message}>
          {({ id, invalid }) => (
            <input
              id={id}
              className={inkFieldClasses(invalid)}
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="du@beispiel.de"
              {...register('email')}
            />
          )}
        </InkField>

        <Button type="submit" size="lg" block loading={isSubmitting} className="mt-2">
          {isSubmitting ? 'Wird gesendet …' : 'Link anfordern'}
        </Button>
      </form>
    </AuthLayout>
  )
}
