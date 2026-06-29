import { useState } from 'react'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { formatarDataHoraLocal } from '@/lib/operacionalUtils'
import type {
  DocumentoData,
  TrechoDocumento,
} from '@/services/documentoService'

// ── Labels ────────────────────────────────────────────────────

const TIPO_RESERVA_LABELS: Record<string, string> = {
  aereo:       'Aéreo',
  hotel:       'Hotel',
  pacote:      'Pacote',
  servico:     'Serviço',
  outros:      'Outros',
}

const STATUS_LABELS: Record<string, string> = {
  cotacao:     'Cotação',
  confirmada:  'Confirmada',
  em_operacao: 'Em Operação',
  concluida:   'Concluída',
  cancelada:   'Cancelada',
}

const SENTIDO_LABELS: Record<string, string> = {
  ida:    'Ida',
  volta:  'Volta',
  escala: 'Escala',
}

const TIPO_PASSAGEIRO_LABELS: Record<string, string> = {
  adulto:  'Adulto',
  crianca: 'Criança',
  bebe:    'Bebê',
}

// ── Helpers ───────────────────────────────────────────────────

function fmtData(d: string | null): string {
  if (!d) return '—'
  return formatarData(d)
}

function fmtHora(h: string | null): string {
  if (!h) return ''
  return h.slice(0, 5)
}

function aeroportoLabel(iata: string | null, nome: string | null, cidade: string | null): string {
  const partes: string[] = []
  if (iata)   partes.push(iata)
  if (cidade) partes.push(cidade)
  if (nome)   partes.push(`(${nome})`)
  return partes.length > 0 ? partes.join(' – ') : '—'
}

function agruparTrechos(trechos: TrechoDocumento[]): { ida: TrechoDocumento[]; volta: TrechoDocumento[]; outros: TrechoDocumento[] } {
  return {
    ida:    trechos.filter((t) => t.sentido === 'ida'),
    volta:  trechos.filter((t) => t.sentido === 'volta'),
    outros: trechos.filter((t) => t.sentido !== 'ida' && t.sentido !== 'volta'),
  }
}

// ── Sub-componentes ───────────────────────────────────────────

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="documento-secao text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1 mb-3">
      {children}
    </h3>
  )
}

function CaixaVazia({ texto }: { texto: string }) {
  return (
    <p className="text-sm text-muted-foreground italic">{texto}</p>
  )
}

function LogoOuNome({ nome, logoUrl }: { nome: string; logoUrl: string | null }) {
  const [imgError, setImgError] = useState(false)

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={nome}
        className="h-12 max-w-[180px] object-contain"
        onError={() => setImgError(true)}
      />
    )
  }
  return <span className="text-xl font-bold text-foreground">{nome}</span>
}

// ── Componente principal ──────────────────────────────────────

interface DocumentoReservaProps {
  data: DocumentoData
}

export function DocumentoReserva({ data }: DocumentoReservaProps) {
  const { reserva, trechos, passageiros, organizacao } = data
  const { ida, volta, outros } = agruparTrechos(trechos)
  const emitidoEm = formatarDataHoraLocal(new Date())

  return (
    <div className="space-y-6 text-sm text-foreground">

      {/* Cabeçalho da organização */}
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
        <LogoOuNome nome={organizacao.nome} logoUrl={organizacao.logo_url} />
        <div className="text-right text-xs text-muted-foreground space-y-0.5">
          {organizacao.cnpj && <p>CNPJ: {organizacao.cnpj}</p>}
          {organizacao.email && <p>{organizacao.email}</p>}
          {organizacao.telefone && <p>{organizacao.telefone}</p>}
        </div>
      </div>

      {/* Título do documento */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">Voucher de Reserva #{reserva.numero}</p>
          <p className="text-xs text-muted-foreground">
            {TIPO_RESERVA_LABELS[reserva.tipo_reserva] ?? reserva.tipo_reserva}
            {' · '}
            {STATUS_LABELS[reserva.status] ?? reserva.status}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Emitido em {emitidoEm}</p>
          <p>Reserva em {fmtData(reserva.data_reserva)}</p>
        </div>
      </div>

      {/* Dados do cliente */}
      <div>
        <SecaoTitulo>Cliente</SecaoTitulo>
        {reserva.clientes ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <span className="text-xs text-muted-foreground">Nome</span>
              <p className="font-medium">{reserva.clientes.nome}</p>
            </div>
            {reserva.clientes.cpf_cnpj && (
              <div>
                <span className="text-xs text-muted-foreground">CPF / CNPJ</span>
                <p>{reserva.clientes.cpf_cnpj}</p>
              </div>
            )}
            {reserva.clientes.rg && (
              <div>
                <span className="text-xs text-muted-foreground">RG</span>
                <p>{reserva.clientes.rg}</p>
              </div>
            )}
            {reserva.clientes.email && (
              <div>
                <span className="text-xs text-muted-foreground">E-mail</span>
                <p>{reserva.clientes.email}</p>
              </div>
            )}
            {reserva.clientes.telefone && (
              <div>
                <span className="text-xs text-muted-foreground">Telefone</span>
                <p>{reserva.clientes.telefone}</p>
              </div>
            )}
            {reserva.clientes.passaporte && (
              <div>
                <span className="text-xs text-muted-foreground">Passaporte</span>
                <p className="font-mono">{reserva.clientes.passaporte}</p>
              </div>
            )}
            {reserva.clientes.passaporte_venc && (
              <div>
                <span className="text-xs text-muted-foreground">Validade do passaporte</span>
                <p>{fmtData(reserva.clientes.passaporte_venc)}</p>
              </div>
            )}
          </div>
        ) : (
          <CaixaVazia texto="Nenhum cliente vinculado." />
        )}
      </div>

      {/* Trechos — Ida */}
      {ida.length > 0 && (
        <div>
          <SecaoTitulo>Trechos — Ida</SecaoTitulo>
          <div className="space-y-3">
            {ida.map((t) => <BlocoTrecho key={t.id} trecho={t} />)}
          </div>
        </div>
      )}

      {/* Trechos — Volta */}
      {volta.length > 0 && (
        <div>
          <SecaoTitulo>Trechos — Volta</SecaoTitulo>
          <div className="space-y-3">
            {volta.map((t) => <BlocoTrecho key={t.id} trecho={t} />)}
          </div>
        </div>
      )}

      {/* Trechos — Outros (escala ou sem sentido) */}
      {outros.length > 0 && (
        <div>
          <SecaoTitulo>Trechos</SecaoTitulo>
          <div className="space-y-3">
            {outros.map((t) => <BlocoTrecho key={t.id} trecho={t} />)}
          </div>
        </div>
      )}

      {/* Fallback sem trechos */}
      {trechos.length === 0 && (
        <div>
          <SecaoTitulo>Trechos</SecaoTitulo>
          <CaixaVazia texto="Nenhum trecho cadastrado." />
        </div>
      )}

      {/* Passageiros */}
      <div>
        <SecaoTitulo>Passageiros</SecaoTitulo>
        {passageiros.length > 0 ? (
          <div className="space-y-2">
            {passageiros.map((p, i) => (
              <div
                key={i}
                className="documento-bloco-passageiro flex flex-wrap items-center gap-x-4 gap-y-0.5 rounded border border-border bg-muted/30 px-3 py-2"
              >
                <span className="font-medium">{p.nome || '—'}</span>
                <span className="text-xs text-muted-foreground">
                  {TIPO_PASSAGEIRO_LABELS[p.tipo] ?? p.tipo}
                </span>
                {p.cpf && <span className="text-xs text-muted-foreground">CPF: {p.cpf}</span>}
                {p.passaporte && (
                  <span className="font-mono text-xs text-muted-foreground">
                    Passaporte: {p.passaporte}
                    {p.passaporte_venc ? ` (val. ${fmtData(p.passaporte_venc)})` : ''}
                  </span>
                )}
                {p.data_nascimento && (
                  <span className="text-xs text-muted-foreground">
                    Nasc.: {fmtData(p.data_nascimento)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <CaixaVazia texto="Nenhum passageiro vinculado." />
        )}
      </div>

      {/* Informações financeiras — somente valor_venda se > 0 */}
      {reserva.valor_venda > 0 && (
        <div>
          <SecaoTitulo>Informações Financeiras</SecaoTitulo>
          <div className="flex items-center justify-between rounded border border-border bg-muted/30 px-4 py-3">
            <span className="text-sm">Valor da reserva</span>
            <span className="font-semibold">{formatarMoeda(reserva.valor_venda)}</span>
          </div>
        </div>
      )}

      {/* Observações */}
      {reserva.observacoes && (
        <div>
          <SecaoTitulo>Observações</SecaoTitulo>
          <p className="whitespace-pre-wrap rounded border border-border bg-muted/30 px-4 py-3">
            {reserva.observacoes}
          </p>
        </div>
      )}

      {/* Rodapé */}
      <div className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
        <p>
          Este voucher é um documento interno e não substitui o bilhete aéreo emitido pela companhia.
        </p>
      </div>
    </div>
  )
}

// ── Bloco de trecho ───────────────────────────────────────────

function BlocoTrecho({ trecho: t }: { trecho: TrechoDocumento }) {
  return (
    <div className="documento-bloco-trecho rounded border border-border bg-muted/20 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-mono text-base">
            {t.origem_iata ?? '???'} → {t.destino_iata ?? '???'}
          </span>
          {t.sentido && (
            <span className="text-xs text-muted-foreground">
              ({SENTIDO_LABELS[t.sentido] ?? t.sentido})
            </span>
          )}
        </div>
        {t.localizador && (
          <span className="font-mono text-xs bg-background border border-border rounded px-2 py-0.5">
            {t.localizador}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {/* Origem */}
        <div>
          <span className="text-muted-foreground">Embarque</span>
          <p>
            {aeroportoLabel(t.origem_iata, t.origem?.nome ?? null, t.origem?.cidade ?? null)}
          </p>
          <p className="font-medium">
            {fmtData(t.data_embarque)}
            {t.hora_embarque ? ` às ${fmtHora(t.hora_embarque)}` : ''}
          </p>
        </div>

        {/* Destino */}
        <div>
          <span className="text-muted-foreground">Chegada</span>
          <p>
            {aeroportoLabel(t.destino_iata, t.destino?.nome ?? null, t.destino?.cidade ?? null)}
          </p>
          <p className="font-medium">
            {fmtData(t.data_chegada)}
            {t.hora_chegada ? ` às ${fmtHora(t.hora_chegada)}` : ''}
          </p>
        </div>

        {/* Companhia / voo / classe */}
        {(t.companhia || t.numero_voo) && (
          <div>
            <span className="text-muted-foreground">Voo</span>
            <p>
              {[t.companhia, t.numero_voo].filter(Boolean).join(' ')}
              {t.classe ? ` — Classe ${t.classe}` : ''}
            </p>
          </div>
        )}

        {/* Observações do trecho */}
        {t.observacoes && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Obs.</span>
            <p className="whitespace-pre-wrap">{t.observacoes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
