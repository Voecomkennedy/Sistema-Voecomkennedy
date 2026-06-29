export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aeroportos: {
        Row: {
          ativo: boolean
          cidade: string
          criado_em: string
          iata: string
          id: string
          nome: string
          pais: string
          timezone: string
        }
        Insert: {
          ativo?: boolean
          cidade: string
          criado_em?: string
          iata: string
          id?: string
          nome: string
          pais?: string
          timezone?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          criado_em?: string
          iata?: string
          id?: string
          nome?: string
          pais?: string
          timezone?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cpf_cnpj: string | null
          criado_em: string
          email: string | null
          endereco: string | null
          id: string
          nascimento: string | null
          nome: string
          observacoes: string | null
          organization_id: string
          passaporte: string | null
          passaporte_venc: string | null
          rg: string | null
          telefone: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cpf_cnpj?: string | null
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nascimento?: string | null
          nome: string
          observacoes?: string | null
          organization_id: string
          passaporte?: string | null
          passaporte_venc?: string | null
          rg?: string | null
          telefone?: string | null
          tipo?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cpf_cnpj?: string | null
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nascimento?: string | null
          nome?: string
          observacoes?: string | null
          organization_id?: string
          passaporte?: string | null
          passaporte_venc?: string | null
          rg?: string | null
          telefone?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          atualizado_em: string
          categoria: string
          criado_em: string
          criado_por: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          id: string
          moeda: string
          organization_id: string
          reserva_id: string | null
          status: string
          tipo: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          categoria: string
          criado_em?: string
          criado_por?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          id?: string
          moeda?: string
          organization_id: string
          reserva_id?: string | null
          status?: string
          tipo: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          criado_por?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          id?: string
          moeda?: string
          organization_id?: string
          reserva_id?: string | null
          status?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fin_criado_por"
            columns: ["organization_id", "criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fk_fin_reserva"
            columns: ["organization_id", "reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organizations: {
        Row: {
          cnpj: string | null
          criado_em: string | null
          email: string | null
          id: string
          logo_url: string | null
          nome: string
          telefone: string | null
        }
        Insert: {
          cnpj?: string | null
          criado_em?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          telefone?: string | null
        }
        Update: {
          cnpj?: string | null
          criado_em?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      passageiros: {
        Row: {
          atualizado_em: string
          cpf: string | null
          criado_em: string
          data_nascimento: string | null
          email: string | null
          id: string
          nacionalidade: string
          nome: string
          observacoes: string | null
          organization_id: string
          passaporte: string | null
          passaporte_venc: string | null
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nacionalidade?: string
          nome: string
          observacoes?: string | null
          organization_id: string
          passaporte?: string | null
          passaporte_venc?: string | null
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nacionalidade?: string
          nome?: string
          observacoes?: string | null
          organization_id?: string
          passaporte?: string | null
          passaporte_venc?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passageiros_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          email: string
          id: string
          nome: string
          organization_id: string
          role: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          email: string
          id: string
          nome: string
          organization_id: string
          role: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          email?: string
          id?: string
          nome?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_counters: {
        Row: {
          organization_id: string
          ultimo_numero: number
        }
        Insert: {
          organization_id: string
          ultimo_numero?: number
        }
        Update: {
          organization_id?: string
          ultimo_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "reserva_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_passageiros: {
        Row: {
          criado_em: string
          id: string
          organization_id: string
          passageiro_id: string
          reserva_id: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          id?: string
          organization_id: string
          passageiro_id: string
          reserva_id: string
          tipo?: string
        }
        Update: {
          criado_em?: string
          id?: string
          organization_id?: string
          passageiro_id?: string
          reserva_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_rp_passageiro"
            columns: ["organization_id", "passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fk_rp_reserva"
            columns: ["organization_id", "reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reserva_passageiros_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_trechos: {
        Row: {
          atualizado_em: string
          classe: string | null
          companhia: string | null
          criado_em: string
          data_chegada: string | null
          data_embarque: string | null
          destino_iata: string | null
          hora_chegada: string | null
          hora_embarque: string | null
          id: string
          localizador: string | null
          numero_voo: string | null
          observacoes: string | null
          ordem: number
          organization_id: string
          origem_iata: string | null
          reserva_id: string
          sentido: string | null
        }
        Insert: {
          atualizado_em?: string
          classe?: string | null
          companhia?: string | null
          criado_em?: string
          data_chegada?: string | null
          data_embarque?: string | null
          destino_iata?: string | null
          hora_chegada?: string | null
          hora_embarque?: string | null
          id?: string
          localizador?: string | null
          numero_voo?: string | null
          observacoes?: string | null
          ordem?: number
          organization_id: string
          origem_iata?: string | null
          reserva_id: string
          sentido?: string | null
        }
        Update: {
          atualizado_em?: string
          classe?: string | null
          companhia?: string | null
          criado_em?: string
          data_chegada?: string | null
          data_embarque?: string | null
          destino_iata?: string | null
          hora_chegada?: string | null
          hora_embarque?: string | null
          id?: string
          localizador?: string | null
          numero_voo?: string | null
          observacoes?: string | null
          ordem?: number
          organization_id?: string
          origem_iata?: string | null
          reserva_id?: string
          sentido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_trecho_reserva"
            columns: ["organization_id", "reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reserva_trechos_destino_iata_fkey"
            columns: ["destino_iata"]
            isOneToOne: false
            referencedRelation: "aeroportos"
            referencedColumns: ["iata"]
          },
          {
            foreignKeyName: "reserva_trechos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_trechos_origem_iata_fkey"
            columns: ["origem_iata"]
            isOneToOne: false
            referencedRelation: "aeroportos"
            referencedColumns: ["iata"]
          },
        ]
      }
      reservas: {
        Row: {
          atualizado_em: string
          cancelado_em: string | null
          cliente_id: string | null
          consultor_id: string | null
          criado_em: string
          data_embarque: string | null
          data_reserva: string
          data_retorno: string | null
          desconto: number
          id: string
          margem_lucro: number | null
          metadados: Json
          motivo_cancelamento: string | null
          numero: number
          observacoes: string | null
          organization_id: string
          status: string
          tipo_reserva: string
          valor_custo: number
          valor_venda: number
        }
        Insert: {
          atualizado_em?: string
          cancelado_em?: string | null
          cliente_id?: string | null
          consultor_id?: string | null
          criado_em?: string
          data_embarque?: string | null
          data_reserva?: string
          data_retorno?: string | null
          desconto?: number
          id?: string
          margem_lucro?: number | null
          metadados?: Json
          motivo_cancelamento?: string | null
          numero: number
          observacoes?: string | null
          organization_id: string
          status?: string
          tipo_reserva?: string
          valor_custo?: number
          valor_venda?: number
        }
        Update: {
          atualizado_em?: string
          cancelado_em?: string | null
          cliente_id?: string | null
          consultor_id?: string | null
          criado_em?: string
          data_embarque?: string | null
          data_reserva?: string
          data_retorno?: string | null
          desconto?: number
          id?: string
          margem_lucro?: number | null
          metadados?: Json
          motivo_cancelamento?: string | null
          numero?: number
          observacoes?: string | null
          organization_id?: string
          status?: string
          tipo_reserva?: string
          valor_custo?: number
          valor_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_reserva_cliente"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fk_reserva_consultor"
            columns: ["organization_id", "consultor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_auth_organization_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ---------------------------------------------------------------------------
// Convenience row-type exports — use these throughout the application
// ---------------------------------------------------------------------------
export type Profile              = Database['public']['Tables']['profiles']['Row']
export type Organization         = Database['public']['Tables']['organizations']['Row']
export type Aeroporto            = Database['public']['Tables']['aeroportos']['Row']
export type Cliente              = Database['public']['Tables']['clientes']['Row']
export type Passageiro           = Database['public']['Tables']['passageiros']['Row']
export type Reserva              = Database['public']['Tables']['reservas']['Row']
export type ReservaTrecho        = Database['public']['Tables']['reserva_trechos']['Row']
export type ReservaPassageiro    = Database['public']['Tables']['reserva_passageiros']['Row']
export type FinanceiroLancamento = Database['public']['Tables']['financeiro_lancamentos']['Row']
