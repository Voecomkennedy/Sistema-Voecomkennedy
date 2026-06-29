import { useEffect } from 'react'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useCriarLancamento, useAtualizarLancamento } from '@/hooks/useFinanceiro'
import { useReservas } from '@/hooks/useReservas'
import { hojeLocalISO } from '@/lib/operacionalUtils'
import { STATUS_POR_TIPO } from '@/services/financeiroService'
import type { FinanceiroLancamento } from '@/types/database'
import type { TipoLancamento, StatusLancamento } from '@/types'
import type { ReservaComCliente } from '@/services/reservaService'

// ── Schema Zod ─────────────────────────────────────────────────

const lancamentoSchema = z
  .object({
    tipo:            z.enum(['receita', 'despesa', 'reembolso', 'ajuste']),
    categoria:       z.string().min(1, 'Categoria obrigatória'),
    descricao:       z.string().min(1, 'Descrição obrigatória'),
    valor:           z.coerce.number({ invalid_type_error: 'Valor inválido' }).positive('Valor deve ser maior que zero'),
    data_vencimento: z.string().min(1, 'Data de vencimento obrigatória'),
    data_pagamento:  z.string().optional().nullable(),
    reserva_id:      z.string().optional().nullable(),
    status:          z.enum(['pendente', 'recebido', 'pago', 'cancelado']).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.status) return
    const permitidos = STATUS_POR_TIPO[val.tipo]
    if (!permitidos.includes(val.status)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: `Status "${val.status}" não é válido para tipo "${val.tipo}"`,
      })
    }
  })

type LancamentoFormValues = z.infer<typeof lancamentoSchema>

// ── Opções de select ───────────────────────────────────────────

const TIPO_OPTIONS = [
  { value: 'receita',   label: 'Receita' },
  { value: 'despesa',   label: 'Despesa' },
  { value: 'reembolso', label: 'Reembolso' },
  { value: 'ajuste',    label: 'Ajuste' },
]

const STATUS_LABELS: Record<StatusLancamento, string> = {
  pendente:   'Pendente',
  recebido:   'Recebido',
  pago:       'Pago',
  em_atraso:  'Em Atraso',
  cancelado:  'Cancelado',
}

// ── Helpers ─────────────────────────────────────────────────────

function mensagemErro(error: unknown): string {
  const e = error as { code?: string; message?: string }
  switch (e?.code) {
    case '42501':    return 'Sem permissão para realizar esta operação.'
    case 'PGRST116': return 'Registro não encontrado ou acesso negado.'
    case '23503':    return 'Referência inválida — verifique a reserva selecionada.'
    default:         return e?.message ?? 'Erro inesperado. Tente novamente.'
  }
}

function aplicarRegraPagamento(
  status: StatusLancamento | undefined,
  dataAtual: string | null | undefined,
): string | null {
  if (status === 'recebido' || status === 'pago') {
    return dataAtual || hojeLocalISO()
  }
  if (status === 'pendente') return null
  // cancelado: manter como estava (string vazia vira null)
  return dataAtual || null
}

// ── Props ──────────────────────────────────────────────────────

interface LancamentoFormProps {
  lancamento?: FinanceiroLancamento | null
  onSaved: () => void
  onCancel: () => void
}

// ── Componente ─────────────────────────────────────────────────

export function LancamentoForm({ lancamento, onSaved, onCancel }: LancamentoFormProps) {
  const isEdicao = Boolean(lancamento)
  const criarMutation    = useCriarLancamento()
  const atualizarMutation = useAtualizarLancamento()
  const reservasQuery    = useReservas()

  const isPending = criarMutation.isPending || atualizarMutation.isPending
  const mutationError = criarMutation.error || atualizarMutation.error

  // Reservas elegíveis para vinculação
  const reservasElegiveis = ((reservasQuery.data ?? []) as ReservaComCliente[]).filter(
    (r) => r.status === 'confirmada' || r.status === 'em_operacao',
  )

  const reservaOptions = [
    { value: '', label: '— Nenhuma (lançamento avulso) —' },
    ...reservasElegiveis.map((r) => ({
      value: r.id,
      label: `#${r.numero}${r.clientes?.nome ? ` — ${r.clientes.nome}` : ''}`,
    })),
  ]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<LancamentoFormValues>({
    resolver: zodResolver(lancamentoSchema),
    defaultValues: lancamento
      ? {
          tipo:            lancamento.tipo as TipoLancamento,
          categoria:       lancamento.categoria,
          descricao:       lancamento.descricao,
          valor:           lancamento.valor,
          data_vencimento: lancamento.data_vencimento,
          data_pagamento:  lancamento.data_pagamento ?? '',
          reserva_id:      lancamento.reserva_id ?? '',
          // em_atraso nunca é gravado no banco — status real é sempre um dos 4 editáveis
          status:          lancamento.status as Exclude<StatusLancamento, 'em_atraso'>,
        }
      : {
          tipo:            'receita',
          categoria:       '',
          descricao:       '',
          valor:           undefined,
          data_vencimento: '',
          data_pagamento:  '',
          reserva_id:      '',
          status:          undefined,
        },
  })

  const tipoAtual   = watch('tipo')
  const statusAtual = watch('status')

  // Reset status quando tipo muda e o status atual fica inválido
  useEffect(() => {
    if (!statusAtual) return
    const permitidos = STATUS_POR_TIPO[tipoAtual]
    if (!permitidos.includes(statusAtual)) {
      setValue('status', 'pendente')
      setValue('data_pagamento', null)
    }
  }, [tipoAtual, statusAtual, setValue])

  // Opções de status filtradas pelo tipo atual (sem em_atraso)
  const statusOptions = STATUS_POR_TIPO[tipoAtual].map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  }))

  const onSubmit: SubmitHandler<LancamentoFormValues> = async (values) => {
    const dataVencimento = values.data_vencimento

    // Aplicar regra de data_pagamento conforme status
    const dataPagamento = aplicarRegraPagamento(
      values.status,
      values.data_pagamento,
    )

    if (isEdicao && lancamento) {
      await atualizarMutation.mutateAsync({
        id: lancamento.id,
        patch: {
          tipo:            values.tipo,
          categoria:       values.categoria,
          descricao:       values.descricao,
          valor:           values.valor,
          data_vencimento: dataVencimento,
          data_pagamento:  dataPagamento,
          reserva_id:      values.reserva_id || null,
          status:          values.status ?? lancamento.status,
        },
      })
    } else {
      await criarMutation.mutateAsync({
        tipo:            values.tipo,
        categoria:       values.categoria,
        descricao:       values.descricao,
        valor:           values.valor,
        data_vencimento: dataVencimento,
        data_pagamento:  dataPagamento,
        reserva_id:      values.reserva_id || null,
      })
    }

    onSaved()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Tipo + Categoria */}
      <div className="grid grid-cols-2 gap-4">
        <Controller
          name="tipo"
          control={control}
          render={({ field }) => (
            <Select
              label="Tipo"
              options={TIPO_OPTIONS}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              error={errors.tipo?.message}
            />
          )}
        />
        <Input
          label="Categoria"
          placeholder="Ex: Passagem aérea, Hotel…"
          error={errors.categoria?.message}
          {...register('categoria')}
        />
      </div>

      {/* Descrição */}
      <Input
        label="Descrição"
        placeholder="Ex: Reserva #2847 — voo GRU/MIA"
        error={errors.descricao?.message}
        {...register('descricao')}
      />

      {/* Valor + Vencimento */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Valor (R$)"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0,00"
          error={errors.valor?.message}
          hint="Sempre positivo — o tipo define a direção"
          {...register('valor')}
        />
        <Input
          label="Vencimento"
          type="date"
          error={errors.data_vencimento?.message}
          {...register('data_vencimento')}
        />
      </div>

      {/* Status (somente edição) + Pagamento */}
      {isEdicao && (
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select
                label="Status"
                options={statusOptions}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value as StatusLancamento)}
                error={errors.status?.message}
              />
            )}
          />
          <Input
            label="Data de Pagamento"
            type="date"
            error={errors.data_pagamento?.message}
            {...register('data_pagamento')}
          />
        </div>
      )}

      {/* Reserva vinculada */}
      <Controller
        name="reserva_id"
        control={control}
        render={({ field }) => (
          <Select
            label="Reserva vinculada"
            options={reservaOptions}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value || null)}
            error={errors.reserva_id?.message}
            hint={tipoAtual === 'reembolso' || tipoAtual === 'ajuste'
              ? 'Reembolso e ajuste não entram nos KPIs desta versão'
              : undefined}
          />
        )}
      />

      {/* Erro de mutation */}
      {mutationError && (
        <Alert variant="destructive">
          {mensagemErro(mutationError)}
        </Alert>
      )}

      {/* Ações */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={isPending} disabled={isPending}>
          {isEdicao ? 'Salvar alterações' : 'Criar lançamento'}
        </Button>
      </div>
    </form>
  )
}
