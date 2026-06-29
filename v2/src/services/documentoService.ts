import { supabase } from '@/lib/supabase'

// ── Tipos de saída ─────────────────────────────────────────────

export interface OrganizacaoDocumento {
  nome: string
  email: string | null
  telefone: string | null
  logo_url: string | null
  cnpj: string | null
}

export interface ClienteDocumento {
  nome: string
  cpf_cnpj: string | null
  rg: string | null
  email: string | null
  telefone: string | null
  passaporte: string | null
  passaporte_venc: string | null
}

export interface AeroportoMinimo {
  iata: string
  nome: string
  cidade: string
}

export interface TrechoDocumento {
  id: string
  ordem: number
  sentido: string | null
  companhia: string | null
  numero_voo: string | null
  classe: string | null
  localizador: string | null
  origem_iata: string | null
  destino_iata: string | null
  data_embarque: string | null
  hora_embarque: string | null
  data_chegada: string | null
  hora_chegada: string | null
  observacoes: string | null
  origem: AeroportoMinimo | null
  destino: AeroportoMinimo | null
}

export interface PassageiroDocumento {
  tipo: string
  nome: string
  cpf: string | null
  passaporte: string | null
  passaporte_venc: string | null
  data_nascimento: string | null
}

export interface ReservaDocumento {
  id: string
  numero: number
  status: string
  tipo_reserva: string
  data_reserva: string
  data_embarque: string | null
  data_retorno: string | null
  valor_venda: number
  observacoes: string | null
  metadados: Record<string, unknown> | null
  clientes: ClienteDocumento | null
}

export interface DocumentoData {
  reserva: ReservaDocumento
  trechos: TrechoDocumento[]
  passageiros: PassageiroDocumento[]
  organizacao: OrganizacaoDocumento
}

// ── Fallback de organização ────────────────────────────────────

const FALLBACK_ORG: OrganizacaoDocumento = {
  nome: 'Voecomkennedy',
  email: null,
  telefone: null,
  logo_url: null,
  cnpj: null,
}

// ── Tipo interno de join de passageiros ────────────────────────

type PassageiroRaw = {
  tipo: string
  passageiros: {
    nome: string
    cpf: string | null
    passaporte: string | null
    passaporte_venc: string | null
    data_nascimento: string | null
  } | null
}

// ── Query principal ────────────────────────────────────────────

export async function buscarDocumentoReserva(
  reservaId: string,
  orgId: string,
): Promise<DocumentoData> {
  const [resResult, trechosResult, passResult, orgResult] = await Promise.all([

    // 1. Reserva + cliente completo
    supabase
      .from('reservas')
      .select(`
        id, numero, status, tipo_reserva, data_reserva,
        data_embarque, data_retorno, valor_venda,
        observacoes, metadados,
        clientes!fk_reserva_cliente(
          nome, cpf_cnpj, rg, email, telefone,
          passaporte, passaporte_venc
        )
      `)
      .eq('id', reservaId)
      .eq('organization_id', orgId)
      .single(),

    // 2. Trechos + nomes de aeroportos via FKs confirmadas em database.ts
    supabase
      .from('reserva_trechos')
      .select(`
        id, ordem, sentido, companhia, numero_voo, classe,
        localizador, origem_iata, destino_iata,
        data_embarque, hora_embarque, data_chegada, hora_chegada,
        observacoes,
        origem:aeroportos!reserva_trechos_origem_iata_fkey(iata, nome, cidade),
        destino:aeroportos!reserva_trechos_destino_iata_fkey(iata, nome, cidade)
      `)
      .eq('reserva_id', reservaId)
      .eq('organization_id', orgId)
      .order('ordem'),

    // 3. Passageiros vinculados com dados completos
    supabase
      .from('reserva_passageiros')
      .select(`
        tipo,
        passageiros!fk_rp_passageiro(
          nome, cpf, passaporte, passaporte_venc, data_nascimento
        )
      `)
      .eq('reserva_id', reservaId)
      .eq('organization_id', orgId),

    // 4. Organização para o cabeçalho
    // Campos confirmados em database.ts: nome (NOT NULL), email|null, telefone|null,
    // logo_url|null, cnpj|null — fallback gracioso se a query falhar
    supabase
      .from('organizations')
      .select('nome, email, telefone, logo_url, cnpj')
      .eq('id', orgId)
      .single(),
  ])

  if (resResult.error)     throw resResult.error
  if (trechosResult.error) throw trechosResult.error
  if (passResult.error)    throw passResult.error

  // Mapear join passageiros → shape plana
  const passageiros: PassageiroDocumento[] = (
    (passResult.data ?? []) as unknown as PassageiroRaw[]
  ).map((rp) => ({
    tipo:            rp.tipo,
    nome:            rp.passageiros?.nome            ?? '',
    cpf:             rp.passageiros?.cpf             ?? null,
    passaporte:      rp.passageiros?.passaporte      ?? null,
    passaporte_venc: rp.passageiros?.passaporte_venc ?? null,
    data_nascimento: rp.passageiros?.data_nascimento ?? null,
  }))

  return {
    reserva:      resResult.data    as unknown as ReservaDocumento,
    trechos:      (trechosResult.data ?? []) as unknown as TrechoDocumento[],
    passageiros,
    organizacao:  orgResult.error   ? FALLBACK_ORG : (orgResult.data as OrganizacaoDocumento),
  }
}
