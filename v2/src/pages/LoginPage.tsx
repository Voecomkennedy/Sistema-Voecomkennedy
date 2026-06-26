import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PlaneTakeoff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { session } = useAuthStore()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  if (session) return <Navigate to="/" replace />

  async function onSubmit(data: LoginForm) {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.senha,
    })
    if (error) {
      setAuthError('E-mail ou senha incorretos.')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--sidebar))] p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Marca */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <PlaneTakeoff className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[hsl(var(--sidebar-foreground))]">
            Voecomkennedy
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--sidebar-muted-foreground))]">
            Sistema de Reservas V2
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-muted))] p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--sidebar-foreground))]">
              E-mail
            </label>
            <input
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              {...register('email')}
              className="w-full rounded-lg border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-3 py-2 text-sm text-[hsl(var(--sidebar-foreground))] placeholder-[hsl(var(--sidebar-muted-foreground))] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--sidebar-foreground))]">
              Senha
            </label>
            <input
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('senha')}
              className="w-full rounded-lg border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-3 py-2 text-sm text-[hsl(var(--sidebar-foreground))] placeholder-[hsl(var(--sidebar-muted-foreground))] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.senha && (
              <p className="text-xs text-destructive">{errors.senha.message}</p>
            )}
          </div>

          {authError && (
            <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Entrar
          </button>
        </form>

        <p className="text-center text-xs text-[hsl(var(--sidebar-muted-foreground))]">
          Sistema V1 disponível em{' '}
          <span className="text-[hsl(var(--sidebar-foreground))]">
            sistema.voecomkennedy.tur.br
          </span>
        </p>
      </div>
    </div>
  )
}
