export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      examples: {
        Row: {
          answer: string;
          content: string;
          created_at: string;
          difficulty: string;
          exam_id: string;
          id: string;
          question_id: string | null;
          solution_steps: Json;
          subject: string;
          type: string;
        };
        Insert: {
          answer: string;
          content: string;
          created_at?: string;
          difficulty?: string;
          exam_id: string;
          id?: string;
          question_id?: string | null;
          solution_steps?: Json;
          subject: string;
          type: string;
        };
        Update: {
          answer?: string;
          content?: string;
          created_at?: string;
          difficulty?: string;
          exam_id?: string;
          id?: string;
          question_id?: string | null;
          solution_steps?: Json;
          subject?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "examples_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "examples_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          difficulty: string;
          duration_min: number;
          generation_duration_sec: number | null;
          id: string;
          import_parse_quality: Json | null;
          figure_registry: Json | null;
          import_review_status: string | null;
          is_featured: boolean;
          offline_import_media: Json | null;
          source: string;
          subjects: string[];
          subtitle: string | null;
          title: string;
          total_score: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          difficulty: string;
          duration_min?: number;
          generation_duration_sec?: number | null;
          id?: string;
          import_parse_quality?: Json | null;
          figure_registry?: Json | null;
          import_review_status?: string | null;
          is_featured?: boolean;
          offline_import_media?: Json | null;
          source?: string;
          subjects?: string[];
          subtitle?: string | null;
          title: string;
          total_score?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          difficulty?: string;
          duration_min?: number;
          generation_duration_sec?: number | null;
          id?: string;
          import_parse_quality?: Json | null;
          figure_registry?: Json | null;
          import_review_status?: string | null;
          is_featured?: boolean;
          offline_import_media?: Json | null;
          source?: string;
          subjects?: string[];
          subtitle?: string | null;
          title?: string;
          total_score?: number;
        };
        Relationships: [];
      };
      ai_settings: {
        Row: {
          workspace_key: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          workspace_key?: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          workspace_key?: string;
          updated_at?: string;
          settings?: Json;
        };
        Relationships: [];
      };
      education_agents: {
        Row: {
          agent_kind: string;
          created_at: string;
          id: string;
          label: string | null;
          owner_user_id: string;
          state: Json;
          updated_at: string;
        };
        Insert: {
          agent_kind: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          owner_user_id: string;
          state?: Json;
          updated_at?: string;
        };
        Update: {
          agent_kind?: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          owner_user_id?: string;
          state?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "education_agents_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_habits: {
        Row: {
          workspace_key: string;
          habits: Json;
          updated_at: string;
        };
        Insert: {
          workspace_key?: string;
          habits?: Json;
          updated_at?: string;
        };
        Update: {
          workspace_key?: string;
          habits?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      learning_events: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          payload: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          payload?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learning_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      os_question_documents: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          payload: Json;
          schema_version: string;
          source: string;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          payload: Json;
          schema_version?: string;
          source?: string;
          visibility?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          payload?: Json;
          schema_version?: string;
          source?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "os_question_documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          metadata: Json;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          metadata?: Json;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          metadata?: Json;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          answer: string;
          content: string;
          created_at: string;
          diagram_schema: Json | null;
          figure_dependency: Json | null;
          raster_figures: Json | null;
          visual_geometry_evidence: Json | null;
          figure_refs: Json | null;
          exam_id: string;
          id: string;
          knowledge_tags: string[];
          options: Json | null;
          order_index: number;
          points: number;
          solution_steps: Json;
          subject: string;
          type: string;
          type_label: string | null;
        };
        Insert: {
          answer: string;
          content: string;
          created_at?: string;
          diagram_schema?: Json | null;
          figure_dependency?: Json | null;
          raster_figures?: Json | null;
          visual_geometry_evidence?: Json | null;
          figure_refs?: Json | null;
          exam_id: string;
          id?: string;
          knowledge_tags?: string[];
          options?: Json | null;
          order_index?: number;
          points?: number;
          solution_steps?: Json;
          subject: string;
          type: string;
          type_label?: string | null;
        };
        Update: {
          answer?: string;
          content?: string;
          created_at?: string;
          diagram_schema?: Json | null;
          figure_dependency?: Json | null;
          raster_figures?: Json | null;
          visual_geometry_evidence?: Json | null;
          figure_refs?: Json | null;
          exam_id?: string;
          id?: string;
          knowledge_tags?: string[];
          options?: Json | null;
          order_index?: number;
          points?: number;
          solution_steps?: Json;
          subject?: string;
          type?: string;
          type_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      tutor_sessions: {
        Row: {
          created_at: string;
          exam_id: string | null;
          id: string;
          messages: Json;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          exam_id?: string | null;
          id?: string;
          messages?: Json;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          exam_id?: string | null;
          id?: string;
          messages?: Json;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tutor_sessions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tutor_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      wrong_book_entries: {
        Row: {
          created_at: string;
          exam_id: string | null;
          id: string;
          knowledge_points: string[];
          mistake_kind: string | null;
          question_document_id: string | null;
          snapshot: Json | null;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          exam_id?: string | null;
          id?: string;
          knowledge_points?: string[];
          mistake_kind?: string | null;
          question_document_id?: string | null;
          snapshot?: Json | null;
          student_id: string;
        };
        Update: {
          created_at?: string;
          exam_id?: string | null;
          id?: string;
          knowledge_points?: string[];
          mistake_kind?: string | null;
          question_document_id?: string | null;
          snapshot?: Json | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wrong_book_entries_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wrong_book_entries_question_document_id_fkey";
            columns: ["question_document_id"];
            isOneToOne: false;
            referencedRelation: "os_question_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wrong_book_entries_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_math_repair_rules: {
        Row: {
          id: string;
          find: string;
          replacement: string;
          flags: string;
          enabled: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          find: string;
          replacement: string;
          flags?: string;
          enabled?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          find?: string;
          replacement?: string;
          flags?: string;
          enabled?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      remote_import_jobs: {
        Row: {
          id: string;
          workspace_key: string;
          job: Json;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_key?: string;
          job: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_key?: string;
          job?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_settings: {
        Row: {
          workspace_key: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          workspace_key?: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          workspace_key?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      ocr_repair_lexicon: {
        Row: {
          id: string;
          match_kind: string;
          pattern: string;
          replacement: string;
          priority: number;
          enabled: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_kind?: string;
          pattern: string;
          replacement: string;
          priority?: number;
          enabled?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          match_kind?: string;
          pattern?: string;
          replacement?: string;
          priority?: number;
          enabled?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
