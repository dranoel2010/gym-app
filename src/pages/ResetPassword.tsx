import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { mapPasswordUpdateError } from '@/lib/errors'
import { AuthLayout, InkAlert, InkField, inkFieldClasses } from '@/components/AuthLayout'
import { Button, LinkButton } from '@/components/ui/Button'
import { IconAlert, IconCheck } from '@/components/ui/Icons'

/* ---------------------------------------------------------------------------
   (a) URL-Parameter synchron beim Modul-Import einsammeln (Spec §4.4a)

   Der Supabase-Client leert `location.hash`, sobald er die Sitzung aus dem Link
   uebernommen hat — und das passiert, bevor React-Effekte laufen. Wer erst im
   `useEffect` liest, findet nichts mehr und kann den Fehlerfall nicht mehr von
   einem abgelaufenen Link unterscheiden.
   --------------------------------------------------------------------------- */

const capturedUrlParams: Record<string, string> = {}

if (typeof window !== 'undefined') {
  const collect = (s: string) => {
    new URLSearchParams(s).forEach((v, k) => {
      capturedUrlParams[k] = v
    })
  }
  collect(window.location.hash.replace(/^#/, ''))
  collect(window.location.search.replace(/^\?/, '')) // Query gewinnt bei Kollision
}

/** (c) Fehlerursache aus der URL ableiten (Spec §4.4c). */
function messageFromUrl(): string {
  const errorCode = capturedUrlParams.error_code ?? ''
  const description = capturedUrlParams.error_description ?? ''
  const error = capturedUrlParams.error ?? ''

  if (errorCode === 'otp_expired' || /expired/i.test(description)) {
    return 'Dieser Link ist abgelaufen. Links zum Zurücksetzen sind nur kurze Zeit gültig – fordere bitte einen neuen an.'
  }
  if (error === 'access_denied') {
    return 'Dieser Link ist ungültig oder wurde bereits verwendet. Bitte fordere einen neuen an.'
  }
  return 'Dieser Link ist nicht mehr gültig. Bitte fordere einen neuen Link zum Zurücksetzen an.'
}

/* -------------------------------------------------------------------------- */

const schema = z
  .object({
    password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
    confirm: z.string().min(1, 'Bitte Passwort bestätigen'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Die Passwörter stimmen nicht überein',
    path: ['confirm'],
  })

type Values = z.infer<typeof schema>
type Status = 'checking' | 'invalid' | 'ready' | 'done'

/** Neues Passwort setzen — `/reset-password` (Spec §4.4). */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [formError, setFormError] = useState<string | null>(null)

  /* (b) Race-freie Link-Pruefung (Spec §4.4b)

     Parallel auf `onAuthStateChange` hoeren UND `getSession()` aufrufen. Kein
     Wall-Clock-Timeout — der waere entweder zu kurz (falscher Fehler) oder zu
     lang (unnoetige Wartezeit). Eine spaet eintreffende Sitzung korrigiert ein
     bereits gemeldetes "ungueltig" nachtraeglich. */
  useEffect(() => {
    let active = true

    const markReady = () => {
      if (!active) return
      setStatus((prev) => (prev === 'done' ? prev : 'ready'))
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady()
    })

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        if (data.session) markReady()
        else setStatus((prev) => (prev === 'checking' ? 'invalid' : prev))
      })
      .catch((error) => {
        console.error('[gym-tracker] Sitzungsprüfung fehlgeschlagen:', error)
        if (active) setStatus((prev) => (prev === 'checking' ? 'invalid' : prev))
      })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = async (values: Values) => {
    setFormError(null)
    const { error } = await supabase.auth.updateUser({ password: values.password })

    if (error) {
      console.error('[gym-tracker] Passwortänderung fehlgeschlagen:', error)
      setFormError(mapPasswordUpdateError(error))
      return
    }

    setStatus('done')
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  if (status === 'checking') {
    return (
      <AuthLayout title="Moment …">
        <div className="flex items-center gap-3 text-[15px] font-semibold text-on-ink-muted">
          <span className="animate-spin-slow inline-block size-5 rounded-full border-[2.5px] border-[var(--ink-line)] border-t-[var(--accent)]" />
          Link wird geprüft …
        </div>
      </AuthLayout>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthLayout
        title={
          <>
            Link nicht
            <br />
            <span className="text-accent">gültig.</span>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <span className="grid size-14 place-items-center rounded-full bg-[color-mix(in_oklab,var(--danger)_20%,transparent)] text-[24px] text-[var(--danger-hi)]">
            <IconAlert />
          </span>
          <p className="text-[14.5px] leading-relaxed font-medium text-on-ink-muted text-pretty">
            {messageFromUrl()}
          </p>
          <LinkButton to="/forgot-password" size="lg" block>
            Neuen Link anfordern
          </LinkButton>
          <Link
            to="/login"
            className="text-center text-[14px] font-bold text-on-ink-muted hover:text-on-ink"
          >
            Zurück zur Anmeldung
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (status === 'done') {
    return (
      <AuthLayout
        title={
          <>
            Passwort
            <br />
            <span className="text-accent">geändert.</span>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <span className="animate-pop grid size-14 place-items-center rounded-full bg-accent text-[26px] text-accent-ink">
            <IconCheck />
          </span>
          <p className="text-[14.5px] font-medium text-on-ink-muted">Du wirst weitergeleitet …</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={
        <>
          Neues
          <br />
          <span className="text-accent">Passwort.</span>
        </>
      }
      description="Wähle ein Passwort mit mindestens 8 Zeichen."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {formError && <InkAlert>{formError}</InkAlert>}

        <InkField label="Neues Passwort" error={errors.password?.message}>
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
          {isSubmitting ? 'Wird gespeichert …' : 'Passwort ändern'}
        </Button>
      </form>
    </AuthLayout>
  )
}
