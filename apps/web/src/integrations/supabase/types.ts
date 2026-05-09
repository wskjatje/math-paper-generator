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
          is_featured: boolean;
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
          is_featured?: boolean;
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
          is_featured?: boolean;
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
      questions: {
        Row: {
          answer: string;
          content: string;
          created_at: string;
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
