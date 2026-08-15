import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { isOffline } from '@/lib/errors'
import { DISPLAY_NAME_KEY, MAX_NAME_LENGTH } from '@/lib/profile'
import { InkAlert, InkField, inkFieldClasses } from '@/components/AuthLayout'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/Button'
import { IconArrowRight } from '@/components/ui/Icons'

/**
 * Onboarding — einmalig nach der ersten Anmeldung (Screen 01 des Designs).
 *
 * Fragt genau eine Sache: wie der Nutzer angesprochen werden will. Alles
 * andere lernt die App im Betrieb.
 *
 * Bewusst kein Schritt im Registrierungsformular: Wer sich anmeldet, will
 * anfangen, nicht Felder ausfüllen. Und bestehende Konten ohne Namen — etwa
 * nach dem Neubau — kommen so ebenfalls einmal hier vorbei.
 */
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte gib einen Namen ein')
    .max(MAX_NAME_LENGTH, `Höchstens ${MAX_NAME_LENGTH} Zeichen`),
})

type Values = z.infer<typeof schema>

export default function Onboarding({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  })

  const onSubmit = async (values: Values) => {
    setFormError(null)
    const { error } = await supabase.auth.updateUser({
      data: { [DISPLAY_NAME_KEY]: values.name.trim() },
    })

    if (error) {
      console.error('[gym-tracker] Name konnte nicht gespeichert werden:', error)
      setFormError(
        isOffline(error)
          ? 'Keine Verbindung. Prüfe dein Netz und versuche es erneut.'
          : 'Der Name konnte nicht gespeichert werden. Bitte versuche es erneut.'
      )
      return
    }

    // Der AuthContext hört auf `onAuthStateChange` und bekommt das aktualisierte
    // Nutzerobjekt von selbst — die Ansicht wechselt dadurch ohne Zutun.
    onDone?.()
  }

  return (
    <div className="on-ink relative flex min-h-dvh flex-col bg-ink text-on-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[260px]"
        style={{
          background:
            'radial-gradient(120% 100% at 80% 0%, rgb(198 242 78 / 0.26), transparent 60%)',
        }}
      />

      <main className="relative flex flex-1 items-center justify-center px-6 py-10">
        <div className="animate-rise w-full max-w-sm">
          <BrandMark size={56} />

          <h1 className="font-display mt-6 text-[40px] leading-[0.95] uppercase">
            Stärker.
            <br />
            Jeden <span className="text-accent">Tag.</span>
          </h1>

          <p className="mt-4 text-[15px] leading-relaxed font-medium text-on-ink-muted text-pretty">
            Eine Frage noch, dann kann es losgehen: Wie sollen wir dich nennen?
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-4">
            {formError && <InkAlert>{formError}</InkAlert>}

            <InkField label="Dein Name" error={errors.name?.message}>
              {({ id, invalid }) => (
                <input
                  id={id}
                  className={inkFieldClasses(invalid)}
                  type="text"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  autoFocus
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="z. B. Leo"
                  {...register('name')}
                />
              )}
            </InkField>

            <p className="text-[13px] leading-snug text-on-ink-subtle">
              Nur für die Begrüßung. Du kannst ihn jederzeit im Konto ändern.
            </p>

            <Button
              type="submit"
              size="lg"
              block
              loading={isSubmitting}
              className="mt-2"
              iconRight={<IconArrowRight />}
            >
              {isSubmitting ? 'Wird gespeichert …' : "Los geht's"}
            </Button>
          </form>

          {user?.email && (
            <p className="mt-6 text-center text-[13px] font-medium text-on-ink-subtle">
              Angemeldet als {user.email}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
