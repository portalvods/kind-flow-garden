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
      ai_analyses: {
        Row: {
          admin_user_id: string | null
          applied_count: number
          auto_applied: boolean
          created_at: string
          extracted_count: number
          id: string
          matched_count: number
          notified_count: number
          template_excerpt: string
        }
        Insert: {
          admin_user_id?: string | null
          applied_count?: number
          auto_applied?: boolean
          created_at?: string
          extracted_count?: number
          id?: string
          matched_count?: number
          notified_count?: number
          template_excerpt: string
        }
        Update: {
          admin_user_id?: string | null
          applied_count?: number
          auto_applied?: boolean
          created_at?: string
          extracted_count?: number
          id?: string
          matched_count?: number
          notified_count?: number
          template_excerpt?: string
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          kind: string
          source_id: string
          stream_url: string | null
          title: string
          title_normalized: string
          tmdb_id: number | null
          year: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          kind: string
          source_id: string
          stream_url?: string | null
          title: string
          title_normalized: string
          tmdb_id?: number | null
          year?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          kind?: string
          source_id?: string
          stream_url?: string | null
          title?: string
          title_normalized?: string
          tmdb_id?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "m3u_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      m3u_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_error: string | null
          last_status: string | null
          last_synced_at: string | null
          movies_count: number
          name: string
          series_count: number
          sync_interval_hours: number
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          movies_count?: number
          name: string
          series_count?: number
          sync_interval_hours?: number
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          movies_count?: number
          name?: string
          series_count?: number
          sync_interval_hours?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          content: string
          id: string
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          id?: string
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          payload: Json | null
          purpose: string
          whatsapp: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          payload?: Json | null
          purpose: string
          whatsapp: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json | null
          purpose?: string
          whatsapp?: string
        }
        Relationships: []
      }
      password_resets: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
          whatsapp: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
          whatsapp: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
          whatsapp?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          blocked: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          key: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          key: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          key?: string
        }
        Relationships: []
      }
      request_logs: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["request_status"] | null
          id: string
          note: string | null
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          note?: string | null
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          note?: string | null
          request_id?: string
          to_status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "request_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          format: string | null
          id: string
          notes: string | null
          overview: string | null
          poster_path: string | null
          rated_at: string | null
          rating: number | null
          rating_comment: string | null
          rejection_reason: string | null
          request_kind: Database["public"]["Enums"]["request_kind"]
          status: Database["public"]["Enums"]["request_status"]
          title: string
          tmdb_id: number | null
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string
          format?: string | null
          id?: string
          notes?: string | null
          overview?: string | null
          poster_path?: string | null
          rated_at?: string | null
          rating?: number | null
          rating_comment?: string | null
          rejection_reason?: string | null
          request_kind?: Database["public"]["Enums"]["request_kind"]
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          tmdb_id?: number | null
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          format?: string | null
          id?: string
          notes?: string | null
          overview?: string | null
          poster_path?: string | null
          rated_at?: string | null
          rating?: number | null
          rating_comment?: string | null
          rejection_reason?: string | null
          request_kind?: Database["public"]["Enums"]["request_kind"]
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          tmdb_id?: number | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_duplicate_requests: {
        Args: never
        Returns: {
          content_type: string
          count: number
          normalized_title: string
          request_ids: string[]
          request_kind: string
          sample_title: string
          user_ids: string[]
          year: number
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          blocked: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          whatsapp: string
        }[]
      }
      admin_set_user_blocked: {
        Args: { _blocked: boolean; _user_id: string }
        Returns: undefined
      }
      admin_soft_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_top_clients: {
        Args: { _limit?: number }
        Returns: {
          completed: number
          full_name: string
          last_request: string
          pending: number
          rejected: number
          total: number
          user_id: string
          whatsapp: string
        }[]
      }
      admin_update_user: {
        Args: {
          _email: string
          _full_name: string
          _user_id: string
          _whatsapp: string
        }
        Returns: undefined
      }
      bot_config_by_secret: {
        Args: { _secret: string }
        Returns: {
          enabled: boolean
          message: string
        }[]
      }
      bot_create_request: {
        Args: {
          _content_type?: string
          _request_kind?: string
          _secret: string
          _title: string
          _whatsapp: string
        }
        Returns: Json
      }
      bot_try_hit: {
        Args: { _key: string; _secret: string; _ttl_seconds?: number }
        Returns: boolean
      }
      complete_wa_password_reset: {
        Args: { _code_hash: string; _new_password: string; _token_hash: string }
        Returns: undefined
      }
      email_by_whatsapp: { Args: { _whatsapp: string }; Returns: string }
      find_profile_by_wa: { Args: { _phone: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked: { Args: { _user_id: string }; Returns: boolean }
      rate_limit_check_and_hit: {
        Args: { _bucket: string; _key: string; _window_seconds: number }
        Returns: number
      }
      request_timeline: {
        Args: { _request_id: string }
        Returns: {
          created_at: string
          from_status: string
          note: string
          to_status: string
        }[]
      }
      request_wa_password_reset: {
        Args: {
          _code_hash: string
          _token_hash: string
          _ttl_seconds: number
          _whatsapp: string
        }
        Returns: undefined
      }
      whatsapp_exists: { Args: { _whatsapp: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "revendedor" | "cliente"
      content_type: "movie" | "tv"
      request_kind: "adicao" | "atualizacao" | "conserto"
      request_status:
        | "pending"
        | "processing"
        | "added"
        | "rejected"
        | "analyzing"
        | "approved"
        | "completed"
        | "fixed"
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
      app_role: ["admin", "revendedor", "cliente"],
      content_type: ["movie", "tv"],
      request_kind: ["adicao", "atualizacao", "conserto"],
      request_status: [
        "pending",
        "processing",
        "added",
        "rejected",
        "analyzing",
        "approved",
        "completed",
        "fixed",
      ],
    },
  },
} as const
