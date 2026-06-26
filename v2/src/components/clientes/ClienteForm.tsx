import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useCreateCliente, useUpdateCliente } from '@/hooks/useClientes'
import type { Cliente } from '@/types/database'

const clienteSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  tipo: z.enum(['pessoa_fisica', 'pessoa_juridica']),
  cpf_cnpj: z.string().optional().nullable(),
  rg: z.string().optional().nullable(),
  email: z
    .string()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'E-mail inválido' })
    .optional()
    .nullable(),
  telefone: z.string().optional().nullable(),
  nascimento: z.string().optional().nullable(),
  passaporte: z.string().optional().nullable(),
  passaporte_venc: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

type ClienteFormValues = z.infer<typeof clienteSchema>

interface ClienteFormProps {
  cliente?: Cliente | null
  onSuccess: () => void
  onCancel: () => void
}

function mensagemErro(error: unknown): string {
  const e = error as { code?: string; message?: string }
  switch (e?.code) {
    case '42501':    return 'Sem permissão para realizar esta operação.'
    case 'PGRST116': return 'Registro não encontrado ou acesso negado.'
    case '23505':    return 'Já existe um registro com estes dados.'
    case '23503':    return 'Este registro está vinculado a uma reserva e não pode ser removido.'
    default:         return e?.message ?? 'Erro inesperado. Tente novamente.'
  }
}

function nullify(values: ClienteFormValues): ClienteFormValues {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]),
  ) as ClienteFormValues
}

export function ClienteForm({ cliente, onSuccess, onCancel }: ClienteFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente
      ? {
          nome: cliente.nome,
          tipo: cliente.tipo as 'pessoa_fisica' | 'pessoa_juridica',
          cpf_cnpj: cliente.cpf_cnpj ?? '',
          rg: cliente.rg ?? '',
          email: cliente.email ?? '',
          telefone: cliente.telefone ?? '',
          nascimento: cliente.nascimento ?? '',
          passaporte: cliente.passaporte ?? '',
          passaporte_venc: cliente.passaporte_venc ?? '',
          endereco: cliente.endereco ?? '',
          observacoes: cliente.observacoes ?? '',
        }
      : { tipo: 'pessoa_fisica' },
  })

  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()
  const isPending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error || updateMutation.error

  const tipo = watch('tipo')

  const onSubmit = handleSubmit(async (values) => {
    try {
      const data = nullify(values)
      if (cliente) {
        await updateMutation.mutateAsync({ id: cliente.id, data })
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
      {/* Tipo */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            value="pessoa_fisica"
            {...register('tipo')}
            className="accent-primary"
          />
          Pessoa Física
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            value="pessoa_juridica"
            {...register('tipo')}
            className="accent-primary"
          />
          Pessoa Jurídica
        </label>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Nome completo *"
            error={errors.nome?.message}
            {...register('nome')}
          />
        </div>

        <Input
          label={tipo === 'pessoa_juridica' ? 'CNPJ' : 'CPF'}
          error={errors.cpf_cnpj?.message}
          {...register('cpf_cnpj')}
        />

        {tipo === 'pessoa_fisica' && (
          <Input label="RG" error={errors.rg?.message} {...register('rg')} />
        )}

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

        {tipo === 'pessoa_fisica' && (
          <>
            <Input
              label="Data de nascimento"
              type="date"
              error={errors.nascimento?.message}
              {...register('nascimento')}
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
          </>
        )}

        <div className="sm:col-span-2">
          <Input
            label="Endereço"
            error={errors.endereco?.message}
            {...register('endereco')}
          />
        </div>

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
          {cliente ? 'Salvar alterações' : 'Criar cliente'}
        </Button>
      </div>
    </form>
  )
}
