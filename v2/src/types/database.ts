export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          nome: string
          cnpj: string | null
          email: string | null
          telefone: string | null
          logo_url: string | null
          criado_em: string
        }
        Insert: {
          id?: string
          nome: string
          cnpj?: string | null
          email?: string | null
          telefone?: string | null
          logo_url?: string | null
          criado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          cnpj?: string | null
          email?: string | null
          telefone?: string | null
          logo_url?: string | null
          criado_em?: string
        }
      }
      profiles: {
        Row: {
          id: string
          organization_id: string
          nome: string
          email: string
          role: 'admin' | 'operacional' | 'financeiro'
          ativo: boolean
          criado_em: string
        }
        Insert: {
          id: string
          organization_id: string
          nome: string
          email: string
          role: 'admin' | 'operacional' | 'financeiro'
          ativo?: boolean
          criado_em?: string
        }
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
