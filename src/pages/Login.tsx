import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { isOffline } from '@/lib/errors'
import { AuthLayout, InkAlert, InkField, inkFieldClasses } from '@/components/AuthLayout'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
})

type Values = z.infer<typeof schema>

/**
 * Anmeldung — `/login` (Spec §4.1).
 *
 * AK-1: Bei falschem Passwort und bei nicht existierender E-Mail erscheint
 * exakt dieselbe Meldung. Die Unterscheidung waere ein Weg, gueltige
 * E-Mail-Adressen abzufragen.
 *
 * AK-2 (bereits angemeldet -> nie das Formular sehen) erledigt
 * `PublicOnlyRoute` in `App.tsx`.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: Values) => {
    setFormError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    })

    if (error) {
      console.error('[gym-tracker] Anmeldung fehlgeschlagen:', error)
      setFormError(
        isOffline(error)
          ? 'Keine Verbindung. Prüfe dein Netz und versuche es erneut.'
          : 'Ungültige Anmeldedaten. Bitte überprüfe E-Mail und Passwort.'
      )
      return
    }

    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/login' ? from : '/', { replace: true })
  }

  return (
    <AuthLayout
      title={
        <>
          Weiter
          <br />
          <span className="text-accent">machen.</span>
        </>
      }
      description="Melde dich an und setze dein Training fort."
      footer={
        <>
          Noch kein Konto?{' '}
          <Link to="/register" className="font-extrabold text-accent hover:underline">
            Registrieren
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

        <InkField
          label="Passwort"
          error={errors.password?.message}
          aside={
            <Link
              to="/forgot-password"
              className="text-[12.5px] font-bold text-accent hover:underline"
            >
              Vergessen?
            </Link>
          }
        >
          {({ id, invalid }) => (
            <input
              id={id}
              className={inkFieldClasses(invalid)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
            />
          )}
        </InkField>

        <Button type="submit" size="lg" block loading={isSubmitting} className="mt-2">
          {isSubmitting ? 'Anmelden …' : 'Anmelden'}
        </Button>
      </form>
    </AuthLayout>
  )
}
