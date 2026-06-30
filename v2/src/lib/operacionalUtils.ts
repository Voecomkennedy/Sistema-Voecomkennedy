import type { ReservaTrecho } from '@/types/database'

// ── Helpers de data local ──────────────────────────────────────

/** Retorna "YYYY-MM-DD" usando o relógio local do browser (não UTC). */
export function hojeLocalISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Retorna "YYYY-MM-DD" para hoje + N dias, em horário local. */
export function addDiasLocalISO(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ── Cálculo de check-in ────────────────────────────────────────

/** Interpreta data local de voo como Date local (sem conversão de tz). */
export function parseEmbarqueLocal(data: string, hora?: string | null): Date {
  const [h = '00', m = '00'] = (hora ?? '').split(':')
  return new Date(`${data}T${h}:${m}:00`)
}

export interface DatasCheckin {
  embarque: Date
  checkin_recomendado_em: Date     // embarque - 48h
  chegada_aeroporto: Date          // embarque - 2h
}

/** Calcula datas de check-in a partir do trecho representativo. Não persistir — calcular em runtime. */
export function calcularCheckin(data: string, hora?: string | null): DatasCheckin {
  const embarque = parseEmbarqueLocal(data, hora)
  return {
    embarque,
    checkin_recomendado_em: new Date(embarque.getTime() - 48 * 60 * 60 * 1000),
    chegada_aeroporto:      new Date(embarque.getTime() -  2 * 60 * 60 * 1000),
  }
}

// ── Seleção de trecho representativo ──────────────────────────

/**
 * Dado um array de trechos de uma reserva (já filtrados para o futuro e ordenados),
 * retorna:
 *   a) O primeiro com sentido = 'ida'
 *   b) Se não houver, o primeiro trecho disponível
 */
export function getPrimeiroTrechoRepresentativo<T extends ReservaTrecho>(trechos: T[]): T | null {
  if (trechos.length === 0) return null
  return trechos.find((t) => t.sentido === 'ida') ?? trechos[0]
}

// ── Labels e variantes de status ──────────────────────────────

export type CheckinStatus = 'pendente' | 'lembrar' | 'feito' | 'dispensado'

export const CHECKIN_STATUS_LABELS: Record<CheckinStatus, string> = {
  pendente:   'Pendente',
  lembrar:    'Lembrar',
  feito:      'Feito',
  dispensado: 'Dispensado',
}

export type CheckinBadgeVariant = 'default' | 'warning' | 'success' | 'outline'

export function statusCheckinVariant(status: CheckinStatus | undefined): CheckinBadgeVariant {
  switch (status) {
    case 'lembrar':    return 'warning'
    case 'feito':      return 'success'
    case 'dispensado': return 'outline'
    default:           return 'default'   // pendente ou ausente
  }
}

export function statusCheckinLabel(status: CheckinStatus | undefined): string {
  return status ? CHECKIN_STATUS_LABELS[status] : 'Pendente'
}

// ── Formatação de Date → string pt-BR ─────────────────────────

/** Formata Date para "DD/MM/AAAA às HH:MM" sem conversão de tz. */
export function formatarDataHoraLocal(d: Date): string {
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const min  = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} às ${hh}:${min}`
}
