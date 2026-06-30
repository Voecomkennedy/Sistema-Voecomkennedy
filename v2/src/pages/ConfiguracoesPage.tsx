import { Settings } from 'lucide-react'

const CONFIG_FUTURA = [
  { label: 'Dados da empresa', desc: 'Nome, CNPJ, endereço, telefone, logo' },
  { label: 'Usuários e permissões', desc: 'Gerenciar consultores, papéis e acessos' },
  { label: 'Personalização de documentos', desc: 'Logo no voucher, rodapé personalizado' },
  { label: 'Integrações', desc: 'Companhias aéreas, sistemas de emissão' },
  { label: 'Notificações', desc: 'Alertas de check-in, vencimentos, cobranças' },
]

export function ConfiguracoesPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Settings className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Módulo planejado para uma próxima fase. Em desenvolvimento.
      </p>

      <div className="mt-8 max-w-sm w-full text-left space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          O que será configurável:
        </p>
        {CONFIG_FUTURA.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-muted/30 px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
