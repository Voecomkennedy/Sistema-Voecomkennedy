import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useCreateReserva, useUpdateReserva } from '@/hooks/useReservas'
import { useClientes } from '@/hooks/useClientes'
import { useAuthStore } from '@/store/authStore'
import { calcularMargem, formatarPercentual } from '@/lib/utils'
import type { Reserva } from '@/types/database'

const reservaSchema = z.object({
  tipo_reserva: z.enum(['aereo', 'pacote', 'hotel', 'servico', 'milhas']),
  status: z.enum(['cotacao', 'confirmada', 'em_operacao', 'concluida', 'cancelada']),
  cliente_id: z.string().optional().nullable(),
  data_reserva: z.string().min(1, 'Data da reserva obrigatória'),
  data_embarque: z.string().optional().nullable(),
  data_retorno: z.string().optional().nullable(),
  valor_venda: z.coerce.number().min(0),
  valor_custo: z.coerce.number().min(0),
  desconto: z.coerce.number().min(0),
  observacoes: z.string().optional().nullable(),
})

type ReservaFormValues = z.infer<typeof reservaSchema>

interface ReservaFormProps {
  reserva: Reserva | null
  onCreated: (r: Reserva) => void
  onCancel: () => void
}

function mensagemErro(error: unknown): string {
  const e = error as { code?: string; message?: string }
  switch (e?.code) {
    case '42501':    return 'Sem permissão para realizar esta operação.'
    case 'PGRST116': return 'Registro não encontrado ou acesso negado.'
    case '23505':    return 'Já existe um registro com estes dados.'
    case '23503':    return 'Referência inválida — verifique o cliente selecionado.'
    default:         return e?.message ?? 'Erro inesperado. Tente novamente.'
  }
}

function nullify(values: ReservaFormValues): ReservaFormValues {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]),
  ) as ReservaFormValues
}

const hoje = new Date().toISOString().split('T')[0]

export function ReservaForm({ reserva, onCreated, onCancel }: ReservaFormProps) {
  const profile = useAuthStore((s) => s.profile)
  const clientesQuery = useClientes()
  const createMutation = useCreateReserva()
  const updateMutation = useUpdateReserva()
  const [saved, setSaved] = useState(false)

  const isPending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error || updateMutation.error

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ReservaFormValues>({
    resolver: zodResolver(reservaSchema),
    defaultValues: reserva
      ? {
          tipo_reserva: reserva.tipo_reserva as ReservaFormValues['tipo_reserva'],
          status: reserva.status as ReservaFormValues['status'],
          cliente_id: reserva.cliente_id ?? '',
          data_reserva: reserva.data_reserva ?? hoje,
          data_embarque: reserva.data_embarque ?? '',
          data_retorno: reserva.data_retorno ?? '',
          valor_venda: reserva.valor_venda,
          valor_custo: reserva.valor_custo,
          desconto: reserva.desconto,
          observacoes: reserva.observacoes ?? '',
        }
      : {
          tipo_reserva: 'aereo',
          status: 'cotacao',
          cliente_id: '',
          data_reserva: hoje,
          data_embarque: '',
          data_retorno: '',
          valor_venda: 0,
          valor_custo: 0,
          desconto: 0,
          observacoes: '',
        },
  })

  const valorVenda = Number(watch('valor_venda') ?? 0)
  const valorCusto = Number(watch('valor_custo') ?? 0)
  const margemPct = calcularMargem(valorVenda, valorCusto)

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false)
    try {
      const data = nullify(values)
      const margem_lucro = calcularMargem(
        Number(data.valor_venda ?? 0),
        Number(data.valor_custo ?? 0),
      ) / 100

      if (reserva) {
        await updateMutation.mutateAsync({ id: reserva.id, data: { ...data, margem_lucro } })
        setSaved(true)
      } else {
        const created = await createMutation.mutateAsync({ ...data, margem_lucro })
        onCreated(created)
      }
    } catch {
      // captured in mutationError
    }
  })

  const clienteOptions = [
    { value: '', label: 'Sem cliente definido' },
    ...(clientesQuery.data ?? []).map((c) => ({ value: c.id, label: c.nome })),
  ]

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Tipo *"
          options={[
            { value: 'aereo',   label: 'Aéreo'   },
            { value: 'pacote',  label: 'Pacote'  },
            { value: 'hotel',   label: 'Hotel'   },
            { value: 'servico', label: 'Serviço' },
            { value: 'milhas',  label: 'Milhas'  },
          ]}
          error={errors.tipo_reserva?.message}
          {...register('tipo_reserva')}
        />

        <Select
          label="Status *"
          options={[
            { value: 'cotacao',     label: 'Cotação'     },
            { value: 'confirmada',  label: 'Confirmada'  },
            { value: 'em_operacao', label: 'Em Operação' },
            { value: 'concluida',   label: 'Concluída'   },
            { value: 'cancelada',   label: 'Cancelada'   },
          ]}
          error={errors.status?.message}
          {...register('status')}
        />

        <div className="sm:col-span-2">
          <Select
            label="Cliente"
            options={clienteOptions}
            error={errors.cliente_id?.message}
            {...register('cliente_id')}
          />
        </div>

        <Input
          label="Data da reserva *"
          type="date"
          error={errors.data_reserva?.message}
          {...register('data_reserva')}
        />

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Consultor</p>
          <p className="flex h-9 items-center rounded-lg border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
            {profile?.nome ?? '—'}
          </p>
        </div>

        <Input
          label="Embarque"
          type="date"
          error={errors.data_embarque?.message}
          {...register('data_embarque')}
        />

        <Input
          label="Retorno"
          type="date"
          error={errors.data_retorno?.message}
          {...register('data_retorno')}
        />

        <Input
          label="Valor de venda (R$)"
          type="number"
          min="0"
          step="0.01"
          error={errors.valor_venda?.message}
          {...register('valor_venda')}
        />

        <Input
          label="Valor de custo (R$)"
          type="number"
          min="0"
          step="0.01"
          error={errors.valor_custo?.message}
          {...register('valor_custo')}
        />

        <Input
          label="Desconto (R$)"
          type="number"
          min="0"
          step="0.01"
          error={errors.desconto?.message}
          {...register('desconto')}
        />

        <div className="flex items-end pb-0.5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Margem calculada</p>
            <p
              className={`text-lg font-semibold ${
                margemPct >= 20
                  ? 'text-success'
                  : margemPct > 0
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground'
              }`}
            >
              {margemPct > 0 ? formatarPercentual(margemPct) : '—'}
            </p>
          </div>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Observações</label>
          <textarea
            {...register('observacoes')}
            rows={3}
            placeholder="Observações adicionais…"
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>
      </div>

      {mutationError && (
        <Alert variant="destructive">{mensagemErro(mutationError)}</Alert>
      )}

      {saved && (
        <Alert variant="success">Alterações salvas com sucesso.</Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          {reserva ? 'Fechar' : 'Cancelar'}
        </Button>
        <Button type="submit" size="sm" loading={isPending}>
          {reserva ? 'Salvar alterações' : 'Criar reserva'}
        </Button>
      </div>
    </form>
  )
}
