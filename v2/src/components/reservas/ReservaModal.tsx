import { useState, useEffect } from 'react'
import { FileText, Plane, Users } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { ReservaForm } from '@/components/reservas/ReservaForm'
import { TrechoForm } from '@/components/reservas/TrechoForm'
import { PassageirosReserva } from '@/components/reservas/PassageirosReserva'
import type { Reserva } from '@/types/database'

type Aba = 'dados' | 'trechos' | 'passageiros'

interface AbaConfig {
  key: Aba
  label: string
  icon: React.ReactNode
}

const abas: AbaConfig[] = [
  { key: 'dados',       label: 'Dados',       icon: <FileText className="h-3.5 w-3.5" /> },
  { key: 'trechos',     label: 'Trechos',     icon: <Plane className="h-3.5 w-3.5" /> },
  { key: 'passageiros', label: 'Passageiros', icon: <Users className="h-3.5 w-3.5" /> },
]

interface ReservaModalProps {
  open: boolean
  onClose: () => void
  reservaInicial: Reserva | null
}

export function ReservaModal({ open, onClose, reservaInicial }: ReservaModalProps) {
  const [reservaAtiva, setReservaAtiva] = useState<Reserva | null>(reservaInicial)
  const [aba, setAba] = useState<Aba>('dados')

  useEffect(() => {
    if (open) {
      setReservaAtiva(reservaInicial)
      setAba('dados')
    }
  }, [open, reservaInicial])

  const modoEdicao = Boolean(reservaAtiva)
  const titulo = reservaAtiva ? `Reserva #${reservaAtiva.numero}` : 'Nova Reserva'

  return (
    <Modal open={open} onClose={onClose} title={titulo} size="xl">
      {/* Tab bar — visível apenas em modo edição */}
      {modoEdicao && (
        <div className="-mx-6 -mt-5 mb-5 flex border-b border-border">
          {abas.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setAba(key)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                aba === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Aba Dados — sempre renderizada quando ativa */}
      {aba === 'dados' && (
        <ReservaForm
          reserva={reservaAtiva}
          onCreated={(r) => setReservaAtiva(r)}
          onCancel={onClose}
        />
      )}

      {/* Aba Trechos — apenas em modo edição */}
      {modoEdicao && aba === 'trechos' && (
        <TrechoForm reservaId={reservaAtiva!.id} />
      )}

      {/* Aba Passageiros — apenas em modo edição */}
      {modoEdicao && aba === 'passageiros' && (
        <PassageirosReserva reservaId={reservaAtiva!.id} />
      )}
    </Modal>
  )
}
