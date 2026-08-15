import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { isOffline } from '@/lib/errors'
import { AuthLayout, InkAlert, InkField, inkFieldClasses } from '@/components/AuthLayout'
import { Button, LinkButton } from '@/components/ui/Button'
import { IconCheck } from '@/components/ui/Icons'

/**
 * Registrierung — `/register` (Spec §4.2).
 *
 * Aenderung gegenueber v1: Bestaetigungsfeld und Mindestlaenge 8 statt 6. Ohne
 * zweites Feld fuehrte ein Tippfehler im Passwort zu einem Konto, in das man
 * sich nicht mehr einloggen konnte.
 */
const schema = z
  .object({
    email: z.string().email('Ungültige E-Mail-Adresse'),
    password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
    confirm: z.string().min(1, 'Bitte Passwort bestätigen'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Die Passwörter stimmen nicht überein',
    path: ['confirm'],
  })

type Values = z.infer<typeof schema>

export default function Register() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', confirm: '' },
  })

  const onSubmit = async (values: Values) => {
    setFormError(null)
    const { data, error } = await supabase.auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })

    if (error) {
      console.error('[gym-tracker] Registrierung fehlgeschlagen:', error)
      if (isOffline(error)) {
        setFormError('Keine Verbindung. Prüfe dein Netz und versuche es erneut.')
      } else if (error.status === 429) {
        setFormError('Zu viele Versuche. Bitte warte einen Moment.')
      } else if (/already registered|already exists/i.test(error.message)) {
        setFormError('Für diese E-Mail-Adresse existiert bereits ein Konto.')
      } else {
        setFormError('Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.')
      }
      return
    }

    // Kommt keine Session zurueck, ist die E-Mail-Bestaetigung aktiv. Dann
    // NICHT ins Dashboard schicken — dort waere der Nutzer nicht angemeldet.
    if (!data.session) {
      setNeedsConfirmation(true)
      return
    }
    navigate('/', { replace: true })
  }

  if (needsConfirmation) {
    return (
      <AuthLayout
        title={
          <>
            E-Mail
            <br />
            <span className="text-accent">bestätigen.</span>
          </>
        }
        description="Wir haben dir einen Bestätigungslink geschickt. Öffne ihn, um dein Konto zu aktivieren."
      >
        <div className="flex flex-col gap-6">
          <span className="animate-pop grid size-14 place-items-center rounded-full bg-accent text-[26px] text-accent-ink">
            <IconCheck />
          </span>
          <p className="text-[14.5px] leading-relaxed font-medium text-on-ink-muted">
            Schau auch im Spam-Ordner nach. Nach der Bestätigung kannst du dich anmelden.
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
          Stärker.
          <br />
          Jeden <span className="text-accent">Tag.</span>
        </>
      }
      description="Ein Konto, ein Trainingstagebuch. Keine Weitergabe, keine sozialen Funktionen."
      footer={
        <>
          Schon registriert?{' '}
          <Link to="/login" className="font-extrabold text-accent hover:underline">
            Anmelden
          </Link>
        </>
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

        <InkField label="Passwort" error={errors.password?.message}>
          {({ id, invalid }) => (
            <input
              id={id}
              className={inkFieldClasses(invalid)}
              type="password"
              autoComplete="new-password"
              placeholder="Mindestens 8 Zeichen"
              {...register('password')}
            />
          )}
        </InkField>

        <InkField label="Passwort bestätigen" error={errors.confirm?.message}>
          {({ id, invalid }) => (
            <input
              id={id}
              className={inkFieldClasses(invalid)}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('confirm')}
            />
          )}
        </InkField>

        <Button type="submit" size="lg" block loading={isSubmitting} className="mt-2">
          {isSubmitting ? 'Registrieren …' : "Los geht's"}
        </Button>
      </form>
    </AuthLayout>
  )
}
