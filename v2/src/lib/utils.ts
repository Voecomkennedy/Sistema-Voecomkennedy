import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utilitário padrão para composição de classes Tailwind.
// Compatível com shadcn/ui. Use em todos os componentes.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Calcula margem de lucro como percentual.
// NÃO usar GENERATED ALWAYS AS no banco — ver AGENTS.md seção 5.
export function calcularMargem(valorVenda: number, valorCusto: number): number {
  if (valorVenda <= 0) return 0
  return ((valorVenda - valorCusto) / valorVenda) * 100
}

// Formata valor em BRL
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

// Formata data ISO para DD/MM/AAAA sem bug de fuso horário.
// Portado de parseLocalDate em utils.js do V1.
export function formatarData(isoDate: string): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

// Formata percentual com 1 casa decimal
export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(1)}%`
}

// Valida CPF brasileiro.
// Portado de validarCPF em utils.js do V1.
export function validarCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, '')
  if (nums.length !== 11 || /^(\d)\1+$/.test(nums)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i)
  let digito = 11 - (soma % 11)
  if (digito > 9) digito = 0
  if (digito !== parseInt(nums[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i)
  digito = 11 - (soma % 11)
  if (digito > 9) digito = 0
  return digito === parseInt(nums[10])
}

// Determina urgência de check-in com base em horas até o embarque.
// Portado da lógica de checkin.html do V1.
export function calcularUrgencia(dataEmbarque: string): 'critico' | 'urgente' | 'atencao' | 'normal' {
  const embarque = new Date(dataEmbarque + 'T00:00:00')
  const agora = new Date()
  const horas = (embarque.getTime() - agora.getTime()) / (1000 * 60 * 60)

  if (horas < 0) return 'normal'
  if (horas <= 24) return 'critico'
  if (horas <= 48) return 'urgente'
  if (horas <= 168) return 'atencao'
  return 'normal'
}
