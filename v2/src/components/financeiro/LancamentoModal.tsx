import { Modal } from '@/components/ui/modal'
import { LancamentoForm } from '@/components/financeiro/LancamentoForm'
import type { FinanceiroLancamento } from '@/types/database'

interface LancamentoModalProps {
  open: boolean
  onClose: () => void
  lancamento?: FinanceiroLancamento | null
}

export function LancamentoModal({ open, onClose, lancamento }: LancamentoModalProps) {
  const titulo = lancamento ? `Editar lançamento` : 'Novo Lançamento'

  return (
    <Modal open={open} onClose={onClose} title={titulo} size="md">
      <LancamentoForm
        lancamento={lancamento}
        onSaved={onClose}
        onCancel={onClose}
      />
    </Modal>
  )
}
