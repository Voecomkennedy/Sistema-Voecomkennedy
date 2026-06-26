import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useCreatePassageiro, useUpdatePassageiro } from '@/hooks/usePassageiros'
import type { Passageiro } from '@/types/database'

const passageiroSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  nacionalidade: z.string().min(1, 'Nacionalidade obrigatória'),
  cpf: z.string().optional().nullable(),
  data_nascimento: z.string().optional().nullable(),
  passaporte: z.string().optional().nullable(),
  passaporte_venc: z.string().optional().nullable(),
  email: z
    .string()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'E-mail inválido' })
    .optional()
    .nullable(),
  telefone: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

type PassageiroFormValues = z.infer<typeof passageiroSchema>

interface PassageiroFormProps {
  passageiro?: Passageiro | null
  onSuccess: () => void
  onCancel: () => void
}

function mensagemErro(error: unknown): string {
  const e = error as { code?: string; message?: string }
  switch (e?.code) {
    case '42501':    return 'Sem permissão para realizar esta operação.'
    case 'PGRST116': return 'Registro não encontrado ou acesso negado.'
    case '23505':    return 'Já existe um registro com estes dados.'
    case '23503':    return 'Este passageiro está vinculado a uma reserva e não pode ser removido.'
    default:         return e?.message ?? 'Erro inesperado. Tente novamente.'
  }
}

function nullify(values: PassageiroFormValues): PassageiroFormValues {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]),
  ) as PassageiroFormValues
}

export function PassageiroForm({ passageiro, onSuccess, onCancel }: PassageiroFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PassageiroFormValues>({
    resolver: zodResolver(passageiroSchema),
    defaultValues: passageiro
      ? {
          nome: passageiro.nome,
          nacionalidade: passageiro.nacionalidade,
          cpf: passageiro.cpf ?? '',
          data_nascimento: passageiro.data_nascimento ?? '',
          passaporte: passageiro.passaporte ?? '',
          passaporte_venc: passageiro.passaporte_venc ?? '',
          email: passageiro.email ?? '',
          telefone: passageiro.telefone ?? '',
          observacoes: passageiro.observacoes ?? '',
        }
      : { nacionalidade: 'Brasileira' },
  })

  const createMutation = useCreatePassageiro()
  const updateMutation = useUpdatePassageiro()
  const isPending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error || updateMutation.error

  const onSubmit = handleSubmit(async (values) => {
    try {
      const data = nullify(values)
      if (passageiro) {
        await updateMutation.mutateAsync({ id: passageiro.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
      onSuccess()
    } catch {
      // error captured in mutation.error — Alert below will show it
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Nome completo *"
            error={errors.nome?.message}
            {...register('nome')}
          />
        </div>

        <Input
          label="Nacionalidade"
          error={errors.nacionalidade?.message}
          {...register('nacionalidade')}
        />

        <Input
          label="CPF"
          error={errors.cpf?.message}
          {...register('cpf')}
        />

        <Input
          label="Data de nascimento"
          type="date"
          error={errors.data_nascimento?.message}
          {...register('data_nascimento')}
        />

        <Input
          label="Passaporte"
          error={errors.passaporte?.message}
          {...register('passaporte')}
        />

        <Input
          label="Validade do passaporte"
          type="date"
          error={errors.passaporte_venc?.message}
          {...register('passaporte_venc')}
        />

        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Telefone"
          type="tel"
          error={errors.telefone?.message}
          {...register('telefone')}
        />

        <div className="sm:col-span-2 space-y-1.5">
          <label className="block text-sm font-medium text-foreground">
            Observações
          </label>
          <textarea
            {...register('observacoes')}
            rows={3}
            placeholder="Observações adicionais…"
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>
      </div>

      {/* Mutation error */}
      {mutationError && (
        <Alert variant="destructive">{mensagemErro(mutationError)}</Alert>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={isPending}>
          {passageiro ? 'Salvar alterações' : 'Criar passageiro'}
        </Button>
      </div>
    </form>
  )
}
