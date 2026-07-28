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
      disciplinas_solicitadas: {
        Row: {
          carga_horaria: number
          criado_em: string
          data_fim_captacao: string
          data_inicio_aulas: string
          data_inicio_captacao: string
          dia_semana_live: Database["public"]["Enums"]["dia_semana_enum"]
          dias_lives: number
          duracao_captacao_dias: number
          duracao_disciplina_dias: number
          id: string
          nome_disciplina: string
          semana_live: number
          sequencia_oferta: number
          solicitacao_id: string
          tipo: Database["public"]["Enums"]["tipo_disciplina_enum"]
        }
        Insert: {
          carga_horaria: number
          criado_em?: string
          data_fim_captacao: string
          data_inicio_aulas: string
          data_inicio_captacao: string
          dia_semana_live: Database["public"]["Enums"]["dia_semana_enum"]
          dias_lives: number
          duracao_captacao_dias: number
          duracao_disciplina_dias: number
          id?: string
          nome_disciplina: string
          semana_live: number
          sequencia_oferta: number
          solicitacao_id: string
          tipo: Database["public"]["Enums"]["tipo_disciplina_enum"]
        }
        Update: {
          carga_horaria?: number
          criado_em?: string
          data_fim_captacao?: string
          data_inicio_aulas?: string
          data_inicio_captacao?: string
          dia_semana_live?: Database["public"]["Enums"]["dia_semana_enum"]
          dias_lives?: number
          duracao_captacao_dias?: number
          duracao_disciplina_dias?: number
          id?: string
          nome_disciplina?: string
          semana_live?: number
          sequencia_oferta?: number
          solicitacao_id?: string
          tipo?: Database["public"]["Enums"]["tipo_disciplina_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "disciplinas_solicitadas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_abertura_curso"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          area: string
          criado_em: string
          email: string
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_enum"]
          tipo_area: Database["public"]["Enums"]["tipo_area_enum"]
        }
        Insert: {
          area?: string
          criado_em?: string
          email?: string
          id: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_enum"]
          tipo_area?: Database["public"]["Enums"]["tipo_area_enum"]
        }
        Update: {
          area?: string
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_enum"]
          tipo_area?: Database["public"]["Enums"]["tipo_area_enum"]
        }
        Relationships: []
      }
      solicitacoes_abertura_curso: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          arquivo_nome_original: string | null
          arquivo_url: string | null
          atualizado_em: string
          criado_em: string
          email_solicitante: string
          id: string
          instituicao: string
          justificativa: string | null
          motivo_rejeicao: string | null
          nome_curso: string
          nome_solicitante: string
          solicitante_id: string
          status: Database["public"]["Enums"]["status_solicitacao_enum"]
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivo_nome_original?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          criado_em?: string
          email_solicitante: string
          id?: string
          instituicao: string
          justificativa?: string | null
          motivo_rejeicao?: string | null
          nome_curso: string
          nome_solicitante: string
          solicitante_id: string
          status?: Database["public"]["Enums"]["status_solicitacao_enum"]
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivo_nome_original?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          criado_em?: string
          email_solicitante?: string
          id?: string
          instituicao?: string
          justificativa?: string | null
          motivo_rejeicao?: string | null
          nome_curso?: string
          nome_solicitante?: string
          solicitante_id?: string
          status?: Database["public"]["Enums"]["status_solicitacao_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_abertura_curso_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_abertura_curso_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      tem_papel: {
        Args: {
          _papel: Database["public"]["Enums"]["papel_enum"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      dia_semana_enum:
        | "segunda"
        | "terca"
        | "quarta"
        | "quinta"
        | "sexta"
        | "sabado"
      papel_enum: "solicitante" | "aprovador"
      status_solicitacao_enum: "pendente" | "aprovado" | "rejeitado"
      tipo_area_enum: "interna" | "externa"
      tipo_disciplina_enum: "com_pre_requisito" | "sem_pre_requisito"
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
    Enums: {
      dia_semana_enum: [
        "segunda",
        "terca",
        "quarta",
        "quinta",
        "sexta",
        "sabado",
      ],
      papel_enum: ["solicitante", "aprovador"],
      status_solicitacao_enum: ["pendente", "aprovado", "rejeitado"],
      tipo_area_enum: ["interna", "externa"],
      tipo_disciplina_enum: ["com_pre_requisito", "sem_pre_requisito"],
    },
  },
} as const
