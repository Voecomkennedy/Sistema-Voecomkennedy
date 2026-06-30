import { useState } from 'react'
import { Plus, Pencil, Trash2, Plane } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/skeleton'
import {
  useTrechos,
  useCreateTrecho,
  useUpdateTrecho,
  useDeleteTrecho,
} from '@/hooks/useReservas'
import { formatarData } from '@/lib/utils'
import type { ReservaTrecho } from '@/types/database'

const trechoSchema = z.object({
  sentido: z.string().optional().nullable(),
  origem_iata: z.string().max(3).optional().nullable(),
  destino_iata: z.string().max(3).optional().nullable(),
  data_embarque: z.string().optional().nullable(),
  hora_embarque: z.string().optional().nullable(),
  data_chegada: z.string().optional().nullable(),
  hora_chegada: z.string().optional().nullable(),
  companhia: z.string().optional().nullable(),
  numero_voo: z.string().optional().nullable(),
  localizador: z.string().optional().nullable(),
  classe: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

type TrechoFormValues = z.infer<typeof trechoSchema>

const sentidoLabel: Record<string, string> = {
  ida: 'Ida',
  volta: 'Volta',
  conexao: 'Conexão',
}

function mensagemErroTrecho(error: unknown): string {
  const e = error as { code?: string; message?: string }
  switch (e?.code) {
    case '23503':
      return 'Aeroporto não encontrado na base de dados. O sistema está sendo expandido — enquanto isso, use códigos cadastrados (GRU, MIA). Novos aeroportos serão adicionados em breve.'
    case '42501':
      return 'Sem permissão para realizar esta operação.'
    case 'PGRST116':
      return 'Trecho não encontrado ou acesso negado.'
    default:
      return e?.message ?? 'Erro inesperado. Tente novamente.'
  }
}

function nullifyTrecho(values: TrechoFormValues): TrechoFormValues {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]),
  ) as TrechoFormValues
}

interface TrechoInlineFormProps {
  trecho: ReservaTrecho | null
  reservaId: string
  trechos: ReservaTrecho[]
  onDone: () => void
}

function TrechoInlineForm({ trecho, reservaId, trechos, onDone }: TrechoInlineFormProps) {
  const createMutation = useCreateTrecho()
  const updateMutation = useUpdateTrecho()
  const isPending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error || updateMutation.error

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<TrechoFormValues>({
    resolver: zodResolver(trechoSchema),
    defaultValues: trecho
      ? {
          sentido: trecho.sentido ?? 'ida',
          origem_iata: trecho.origem_iata ?? '',
          destino_iata: trecho.destino_iata ?? '',
          data_embarque: trecho.data_embarque ?? '',
          hora_embarque: trecho.hora_embarque ?? '',
          data_chegada: trecho.data_chegada ?? '',
          hora_chegada: trecho.hora_chegada ?? '',
          companhia: trecho.companhia ?? '',
          numero_voo: trecho.numero_voo ?? '',
          localizador: trecho.localizador ?? '',
          classe: trecho.classe ?? '',
          observacoes: trecho.observacoes ?? '',
        }
      : {
          sentido: 'ida',
          origem_iata: '',
          destino_iata: '',
          data_embarque: '',
          hora_embarque: '',
          data_chegada: '',
          hora_chegada: '',
          companhia: '',
          numero_voo: '',
          localizador: '',
          classe: '',
          observacoes: '',
        },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const data = nullifyTrecho(values)
      if (trecho) {
        await updateMutation.mutateAsync({ id: trecho.id, reservaId, data })
      } else {
        const ordemProxima =
          trechos.length > 0 ? Math.max(...trechos.map((t) => t.ordem)) + 1 : 1
        await createMutation.mutateAsync({ reservaId, data: { ...data, ordem: ordemProxima } })
      }
      onDone()
    } catch {
      // captured in mutationError
    }
  })

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border bg-muted/30 p-4 space-y-4"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Sentido"
          options={[
            { value: 'ida',     label: 'Ida'     },
            { value: 'volta',   label: 'Volta'   },
            { value: 'conexao', label: 'Conexão' },
          ]}
          error={errors.sentido?.message}
          {...register('sentido')}
        />

        <Input
          label="Origem (IATA)"
          maxLength={3}
          placeholder="GRU"
          error={errors.origem_iata?.message}
          {...register('origem_iata', {
            onChange: (e) => setValue('origem_iata', e.target.value.toUpperCase()),
          })}
        />

        <Input
          label="Destino (IATA)"
          maxLength={3}
          placeholder="MIA"
          error={errors.destino_iata?.message}
          {...register('destino_iata', {
            onChange: (e) => setValue('destino_iata', e.target.value.toUpperCase()),
          })}
        />

        <Input
          label="Localizador"
          error={errors.localizador?.message}
          {...register('localizador', {
            onChange: (e) => setValue('localizador', e.target.value.toUpperCase()),
          })}
        />

        <Input
          label="Embarque"
          type="date"
          error={errors.data_embarque?.message}
          {...register('data_embarque')}
        />

        <Input
          label="Hora embarque"
          type="time"
          error={errors.hora_embarque?.message}
          {...register('hora_embarque')}
        />

        <Input
          label="Chegada"
          type="date"
          error={errors.data_chegada?.message}
          {...register('data_chegada')}
        />

        <Input
          label="Hora chegada"
          type="time"
          error={errors.hora_chegada?.message}
          {...register('hora_chegada')}
        />

        <Input
          label="Companhia"
          error={errors.companhia?.message}
          {...register('companhia')}
        />

        <Input
          label="Nº do voo"
          error={errors.numero_voo?.message}
          {...register('numero_voo')}
        />

        <Select
          label="Classe"
          options={[
            { value: '',          label: 'Não informado' },
            { value: 'economica', label: 'Econômica'     },
            { value: 'executiva', label: 'Executiva'     },
            { value: 'primeira',  label: '1ª Classe'     },
          ]}
          error={errors.classe?.message}
          {...register('classe')}
        />

        <Input
          label="Observações"
          error={errors.observacoes?.message}
          {...register('observacoes')}
        />
      </div>

      {mutationError && (
        <Alert variant="destructive">{mensagemErroTrecho(mutationError)}</Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDone}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={isPending}>
          {trecho ? 'Salvar trecho' : 'Adicionar trecho'}
        </Button>
      </div>
    </form>
  )
}

interface TrechoFormProps {
  reservaId: string
}

export function TrechoForm({ reservaId }: TrechoFormProps) {
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const trechosQuery = useTrechos(reservaId)
  const deleteMutation = useDeleteTrecho()
  const trechos = trechosQuery.data ?? []

  const handleDelete = async (t: ReservaTrecho) => {
    const rotulo = [t.origem_iata, t.destino_iata].filter(Boolean).join(' → ') || `trecho ${t.ordem}`
    if (!window.confirm(`Excluir ${rotulo}?`)) return
    try {
      await deleteMutation.mutateAsync({ id: t.id, reservaId })
    } catch {
      // silently — row remains visible if delete failed
    }
  }

  if (trechosQuery.isLoading) return <LoadingState rows={3} />

  if (trechosQuery.error) {
    return (
      <Alert variant="destructive" title="Erro ao carregar trechos">
        {(trechosQuery.error as Error).message}
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      {trechos.length === 0 && !showNew ? (
        <EmptyState
          icon={<Plane className="h-6 w-6" />}
          title="Nenhum trecho cadastrado"
          description="Adicione os voos ou trechos desta reserva."
          action={
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar trecho
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {trechos.map((t) =>
              editingId === t.id ? (
                <TrechoInlineForm
                  key={t.id}
                  trecho={t}
                  reservaId={reservaId}
                  trechos={trechos}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground w-5">
                    {t.ordem}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">
                      {t.origem_iata ?? '???'} → {t.destino_iata ?? '???'}
                    </span>
                    {t.sentido && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {sentidoLabel[t.sentido] ?? t.sentido}
                      </span>
                    )}
                    {t.data_embarque && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatarData(t.data_embarque)}
                        {t.hora_embarque ? ` ${t.hora_embarque}` : ''}
                      </span>
                    )}
                    {t.companhia && (
                      <span className="ml-2 text-xs text-muted-foreground">{t.companhia}</span>
                    )}
                    {t.numero_voo && (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {t.numero_voo}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      onClick={() => {
                        setShowNew(false)
                        setEditingId(t.id)
                      }}
                      aria-label={`Editar trecho ${t.ordem}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={() => handleDelete(t)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Excluir trecho ${t.ordem}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>

          {showNew && editingId === null && (
            <TrechoInlineForm
              trecho={null}
              reservaId={reservaId}
              trechos={trechos}
              onDone={() => setShowNew(false)}
            />
          )}

          {!showNew && editingId === null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNew(true)}
              className="w-full"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar trecho
            </Button>
          )}
        </>
      )}
    </div>
  )
}
