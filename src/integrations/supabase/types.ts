export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string;
          active: boolean;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          id: string;
          institution: string | null;
          internal_ref: string | null;
          manager_id: string | null;
          name: string;
          notes: string | null;
          opening_balance: number | null;
          opening_date: string | null;
          opening_validated: boolean;
        };
        Insert: {
          account_type: string;
          active?: boolean;
          created_at?: string;
          currency: Database["public"]["Enums"]["currency_code"];
          id?: string;
          institution?: string | null;
          internal_ref?: string | null;
          manager_id?: string | null;
          name: string;
          notes?: string | null;
          opening_balance?: number | null;
          opening_date?: string | null;
          opening_validated?: boolean;
        };
        Update: {
          account_type?: string;
          active?: boolean;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          id?: string;
          institution?: string | null;
          internal_ref?: string | null;
          manager_id?: string | null;
          name?: string;
          notes?: string | null;
          opening_balance?: number | null;
          opening_date?: string | null;
          opening_validated?: boolean;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json | null;
          id: number;
          object_id: string | null;
          object_type: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json | null;
          id?: number;
          object_id?: string | null;
          object_type?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json | null;
          id?: number;
          object_id?: string | null;
          object_type?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          operation_id: string;
          recipient_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          operation_id: string;
          recipient_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          operation_id?: string;
          recipient_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "operations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_ai_access: {
        Row: {
          blocked_at: string;
          id: string;
          message: string;
          status: number;
        };
        Insert: {
          blocked_at?: string;
          id: string;
          message: string;
          status: number;
        };
        Update: {
          blocked_at?: string;
          id?: string;
          message?: string;
          status?: number;
        };
        Relationships: [];
      };
      document_ai_analyses: {
        Row: {
          analyzed_at: string;
          analyzed_by: string;
          document_id: string;
          model: string;
          result: Json;
        };
        Insert: {
          analyzed_at?: string;
          analyzed_by: string;
          document_id: string;
          model: string;
          result: Json;
        };
        Update: {
          analyzed_at?: string;
          analyzed_by?: string;
          document_id?: string;
          model?: string;
          result?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "document_ai_analyses_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          comment: string | null;
          doc_type: string;
          id: string;
          operation_id: string;
          received_at: string;
          status: Database["public"]["Enums"]["doc_status"];
          storage_path: string;
          uploaded_by: string;
          verified_at: string | null;
          verified_by: string | null;
          via_qr: boolean;
        };
        Insert: {
          comment?: string | null;
          doc_type: string;
          id?: string;
          operation_id: string;
          received_at?: string;
          status?: Database["public"]["Enums"]["doc_status"];
          storage_path: string;
          uploaded_by?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          via_qr?: boolean;
        };
        Update: {
          comment?: string | null;
          doc_type?: string;
          id?: string;
          operation_id?: string;
          received_at?: string;
          status?: Database["public"]["Enums"]["doc_status"];
          storage_path?: string;
          uploaded_by?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          via_qr?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "documents_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "operations";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          account_id: string;
          amount: number;
          created_at: string;
          id: number;
          operation_id: string;
        };
        Insert: {
          account_id: string;
          amount: number;
          created_at?: string;
          id?: number;
          operation_id: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          created_at?: string;
          id?: number;
          operation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "operations";
            referencedColumns: ["id"];
          },
        ];
      };
      operations: {
        Row: {
          account_id: string;
          amount: number;
          beneficiary: string | null;
          category: string | null;
          created_at: string;
          created_by: string;
          currency: Database["public"]["Enums"]["currency_code"];
          decided_at: string | null;
          decided_by: string | null;
          decision_comment: string | null;
          dest_account_id: string | null;
          dest_amount: number | null;
          effective_date: string;
          exchange_rate: number | null;
          executed_at: string | null;
          executed_by: string | null;
          fees: number | null;
          id: string;
          motif: string;
          op_type: Database["public"]["Enums"]["op_type"];
          overdraft_override: boolean;
          override_reason: string | null;
          period: string;
          reference: string;
          status: Database["public"]["Enums"]["op_status"];
          submitted_at: string | null;
        };
        Insert: {
          account_id: string;
          amount: number;
          beneficiary?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string;
          currency: Database["public"]["Enums"]["currency_code"];
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          dest_account_id?: string | null;
          dest_amount?: number | null;
          effective_date?: string;
          exchange_rate?: number | null;
          executed_at?: string | null;
          executed_by?: string | null;
          fees?: number | null;
          id?: string;
          motif: string;
          op_type: Database["public"]["Enums"]["op_type"];
          overdraft_override?: boolean;
          override_reason?: string | null;
          period?: string;
          reference?: string;
          status?: Database["public"]["Enums"]["op_status"];
          submitted_at?: string | null;
        };
        Update: {
          account_id?: string;
          amount?: number;
          beneficiary?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          dest_account_id?: string | null;
          dest_amount?: number | null;
          effective_date?: string;
          exchange_rate?: number | null;
          executed_at?: string | null;
          executed_by?: string | null;
          fees?: number | null;
          id?: string;
          motif?: string;
          op_type?: Database["public"]["Enums"]["op_type"];
          overdraft_override?: boolean;
          override_reason?: string | null;
          period?: string;
          reference?: string;
          status?: Database["public"]["Enums"]["op_status"];
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "operations_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operations_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operations_dest_account_id_fkey";
            columns: ["dest_account_id"];
            isOneToOne: false;
            referencedRelation: "account_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operations_dest_account_id_fkey";
            columns: ["dest_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      upload_tokens: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          operation_id: string;
          revoked: boolean;
          token: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          operation_id: string;
          revoked?: boolean;
          token?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          operation_id?: string;
          revoked?: boolean;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upload_tokens_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "operations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_type: string | null;
          active: boolean | null;
          balance: number | null;
          committed: number | null;
          currency: Database["public"]["Enums"]["currency_code"] | null;
          id: string | null;
          name: string | null;
          opening_balance: number | null;
        };
        Insert: {
          account_type?: string | null;
          active?: boolean | null;
          balance?: never;
          committed?: never;
          currency?: Database["public"]["Enums"]["currency_code"] | null;
          id?: string | null;
          name?: string | null;
          opening_balance?: never;
        };
        Update: {
          account_type?: string | null;
          active?: boolean | null;
          balance?: never;
          committed?: never;
          currency?: Database["public"]["Enums"]["currency_code"] | null;
          id?: string | null;
          name?: string | null;
          opening_balance?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_upload_token: {
        Args: { _op: string };
        Returns: {
          expires_at: string;
          token: string;
        }[];
      };
      decide_operation: {
        Args: {
          _approve: boolean;
          _comment: string;
          _id: string;
          _override?: boolean;
          _override_reason?: string;
        };
        Returns: undefined;
      };
      defer_operation: {
        Args: { _comment: string; _id: string };
        Returns: undefined;
      };
      execute_operation: { Args: { _id: string }; Returns: undefined };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
      log_audit: {
        Args: { _action: string; _details?: Json; _id: string; _type: string };
        Returns: undefined;
      };
      register_qr_document: {
        Args: { _doc_type: string; _path: string; _token: string };
        Returns: string;
      };
      resolve_upload_token: {
        Args: { _token: string };
        Returns: {
          amount: number;
          currency: Database["public"]["Enums"]["currency_code"];
          expires_at: string;
          motif: string;
          operation_id: string;
          reference: string;
        }[];
      };
      review_document: {
        Args: { _comment: string; _id: string; _ok: boolean };
        Returns: undefined;
      };
      resubmit_operation: { Args: { _id: string }; Returns: undefined };
      revoke_upload_token: { Args: { _token: string }; Returns: undefined };
      set_opening_balance: {
        Args: { _account: string; _amount: number; _date: string };
        Returns: undefined;
      };
      submit_operation: { Args: { _id: string }; Returns: undefined };
      validate_opening_balance: {
        Args: { _account: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "dg" | "financier" | "admin";
      currency_code: "USD" | "CDF";
      doc_status: "attendu" | "recu" | "verifie" | "rejete" | "manquant";
      op_status:
        | "brouillon"
        | "soumise"
        | "en_attente_complement"
        | "approuvee"
        | "rejetee"
        | "executee"
        | "annulee";
      op_type: "recette" | "depense" | "transfert" | "change" | "ouverture" | "correction";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["dg", "financier", "admin"],
      currency_code: ["USD", "CDF"],
      doc_status: ["attendu", "recu", "verifie", "rejete", "manquant"],
      op_status: [
        "brouillon",
        "soumise",
        "en_attente_complement",
        "approuvee",
        "rejetee",
        "executee",
        "annulee",
      ],
      op_type: ["recette", "depense", "transfert", "change", "ouverture", "correction"],
    },
  },
} as const;
