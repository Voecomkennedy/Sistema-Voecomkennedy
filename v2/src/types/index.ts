// Tipos do domínio Voecomkennedy V2.
// Espelham o schema do PLANO_V2_VOECOMKENNEDY.md (seção 6).
// Quando o Supabase for configurado, esses tipos serão substituídos
// pelos gerados via `supabase gen types typescript`.

export type TipoReserva = 'aereo' | 'pacote' | 'hotel' | 'servico' | 'milhas'

export type StatusReserva =
  | 'cotacao'
  | 'confirmada'
  | 'em_operacao'
  | 'concluida'
  | 'cancelada'

export type RoleUsuario = 'admin' | 'operacional' | 'financeiro'

export type TipoLancamento = 'receita' | 'despesa' | 'reembolso' | 'ajuste'

export type StatusLancamento =
  | 'pendente'
  | 'recebido'
  | 'pago'
  | 'em_atraso'
  | 'cancelado'

export type SentidoTrecho = 'ida' | 'volta' | 'conexao'

export type TipoCliente = 'pessoa_fisica' | 'pessoa_juridica'

export type TipoFornecedor = 'companhia_aerea' | 'hotel' | 'operadora' | 'outro'

export type UrgenciaCheckin = 'critico' | 'urgente' | 'atencao' | 'normal'

// Sessão do usuário — será populada pelo hook useAuth() na Fase 2 (Supabase Auth)
export interface UserSession {
  id: string
  email: string
  role: RoleUsuario
  organizationId: string
  organizationName: string
}

// Aeroporto — espelha a tabela `aeroportos` (seed global)
export interface Aeroporto {
  iata: string
  nome: string
  cidade: string
  pais: string
  uf?: string
}

// Reserva — entidade central, espelha a tabela `reservas`
export interface Reserva {
  id: string
  organizationId: string
  numero: number
  tipoReserva: TipoReserva
  status: StatusReserva
  clienteId?: string
  consultorId?: string
  dataReserva: string
  dataEmbarque?: string
  dataRetorno?: string
  valorVenda: number
  valorCusto: number
  margemLucro?: number
  desconto: number
  metadados: Record<string, unknown>
  observacoes?: string
  canceladoEm?: string
  motivoCancelamento?: string
  criadoEm: string
  atualizadoEm: string
}

// Cliente — espelha a tabela `clientes`
export interface Cliente {
  id: string
  organizationId: string
  tipo: TipoCliente
  nome: string
  cpfCnpj?: string
  rg?: string
  email?: string
  telefone?: string
  endereco?: string
  passaporte?: string
  passaporteVenc?: string
  nascimento?: string
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
}

// Lançamento financeiro — espelha `financeiro_lancamentos`
export interface Lancamento {
  id: string
  organizationId: string
  reservaId?: string
  tipo: TipoLancamento
  categoria?: string
  descricao: string
  valor: number
  status: StatusLancamento
  vencimento?: string
  liquidadoEm?: string
  formaPagamento?: string
  criadoPor?: string
  criadoEm: string
  atualizadoEm: string
}
