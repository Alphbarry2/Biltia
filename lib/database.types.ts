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
      knowledge_documents: {
        Row: {
          id: string
          tenant_id: string | null
          title: string
          source_url: string | null
          source_type: string
          license: string
          trade_ids: string[]
          checksum: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          title: string
          source_url?: string | null
          source_type?: string
          license?: string
          trade_ids?: string[]
          checksum?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          title?: string
          source_url?: string | null
          source_type?: string
          license?: string
          trade_ids?: string[]
          checksum?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          id: string
          document_id: string
          tenant_id: string | null
          content: string
          embedding: string | number[]
          trade_ids: string[]
          chunk_index: number
          token_count: number | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          tenant_id?: string | null
          content: string
          embedding: string | number[]
          trade_ids?: string[]
          chunk_index?: number
          token_count?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          tenant_id?: string | null
          content?: string
          embedding?: string | number[]
          trade_ids?: string[]
          chunk_index?: number
          token_count?: number | null
          created_at?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          action: string
          agent: string | null
          app_id: string | null
          cached_input_tokens: number
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          prompt_type: string | null
          sector: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          agent?: string | null
          app_id?: string | null
          cached_input_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          prompt_type?: string | null
          sector?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          agent?: string | null
          app_id?: string | null
          cached_input_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          prompt_type?: string | null
          sector?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_events: {
        Row: {
          agent: string | null
          app_id: string | null
          app_type: string | null
          created_at: string
          event_type: string
          format: string | null
          id: string
          metadata: Json
          prompt_length: number | null
          sector: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          agent?: string | null
          app_id?: string | null
          app_type?: string | null
          created_at?: string
          event_type: string
          format?: string | null
          id?: string
          metadata?: Json
          prompt_length?: number | null
          sector?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          agent?: string | null
          app_id?: string | null
          app_type?: string | null
          created_at?: string
          event_type?: string
          format?: string | null
          id?: string
          metadata?: Json
          prompt_length?: number | null
          sector?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_events_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_members: {
        Row: {
          app_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_members_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          app_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          resource: string | null
          resource_id: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          app_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          resource?: string | null
          resource_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          app_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          resource?: string | null
          resource_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chantiers: {
        Row: {
          adresse: string | null
          avancement: number | null
          budget: number | null
          budget_engage: number | null
          chef_chantier_id: string | null
          client_id: string | null
          code_postal: string | null
          created_at: string
          date_debut: string | null
          date_fin_prevue: string | null
          date_fin_reelle: string | null
          description: string | null
          id: string
          nom: string
          statut: Database["public"]["Enums"]["chantier_statut"]
          tenant_id: string
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          avancement?: number | null
          budget?: number | null
          budget_engage?: number | null
          chef_chantier_id?: string | null
          client_id?: string | null
          code_postal?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin_prevue?: string | null
          date_fin_reelle?: string | null
          description?: string | null
          id?: string
          nom: string
          statut?: Database["public"]["Enums"]["chantier_statut"]
          tenant_id: string
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          avancement?: number | null
          budget?: number | null
          budget_engage?: number | null
          chef_chantier_id?: string | null
          client_id?: string | null
          code_postal?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin_prevue?: string | null
          date_fin_reelle?: string | null
          description?: string | null
          id?: string
          nom?: string
          statut?: Database["public"]["Enums"]["chantier_statut"]
          tenant_id?: string
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chantiers_chef_chantier_id_fkey"
            columns: ["chef_chantier_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          adresse: string | null
          code_postal: string | null
          created_at: string
          email: string | null
          id: string
          nom: string
          notes: string | null
          siret: string | null
          tel: string | null
          tenant_id: string
          type: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          siret?: string | null
          tel?: string | null
          tenant_id: string
          type?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          siret?: string | null
          tel?: string | null
          tenant_id?: string
          type?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_entities: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          entity_type: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          entity_type: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          entity_type?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          chantier_id: string | null
          client_id: string | null
          created_at: string
          employee_id: string | null
          expires_at: string | null
          id: string
          nom: string
          notes: string | null
          statut: string | null
          storage_path: string | null
          tenant_id: string
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          expires_at?: string | null
          id?: string
          nom: string
          notes?: string | null
          statut?: string | null
          storage_path?: string | null
          tenant_id: string
          type: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          expires_at?: string | null
          id?: string
          nom?: string
          notes?: string | null
          statut?: string | null
          storage_path?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          corps_metier: string | null
          created_at: string
          date_embauche: string | null
          email: string | null
          id: string
          nom: string
          notes: string | null
          prenom: string | null
          role: string | null
          statut: string | null
          taux_horaire: number | null
          tel: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          corps_metier?: string | null
          created_at?: string
          date_embauche?: string | null
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          prenom?: string | null
          role?: string | null
          statut?: string | null
          taux_horaire?: number | null
          tel?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          corps_metier?: string | null
          created_at?: string
          date_embauche?: string | null
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          prenom?: string | null
          role?: string | null
          statut?: string | null
          taux_horaire?: number | null
          tel?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          chantier_id: string | null
          created_at: string
          date_achat: string | null
          id: string
          marque: string | null
          nom: string
          notes: string | null
          numero_serie: string | null
          prochain_controle: string | null
          reference: string | null
          statut: string
          tenant_id: string
          type: string | null
          updated_at: string
        }
        Insert: {
          chantier_id?: string | null
          created_at?: string
          date_achat?: string | null
          id?: string
          marque?: string | null
          nom: string
          notes?: string | null
          numero_serie?: string | null
          prochain_controle?: string | null
          reference?: string | null
          statut?: string
          tenant_id: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          chantier_id?: string | null
          created_at?: string
          date_achat?: string | null
          id?: string
          marque?: string | null
          nom?: string
          notes?: string | null
          numero_serie?: string | null
          prochain_controle?: string | null
          reference?: string | null
          statut?: string
          tenant_id?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          name: string
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          type: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          name: string
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          type?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          name?: string
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          type?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string
          credentials: Json | null
          id: string
          last_sync_at: string | null
          provider: string
          settings: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json | null
          id?: string
          last_sync_at?: string | null
          provider: string
          settings?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          settings?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          chantier_id: string | null
          client_id: string | null
          created_at: string
          date_prevue: string | null
          date_reelle: string | null
          description: string | null
          duree_heures: number | null
          employee_id: string | null
          equipment_id: string | null
          id: string
          rapport: string | null
          statut: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string
          date_prevue?: string | null
          date_reelle?: string | null
          description?: string | null
          duree_heures?: number | null
          employee_id?: string | null
          equipment_id?: string | null
          id?: string
          rapport?: string | null
          statut?: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string
          date_prevue?: string | null
          date_reelle?: string | null
          description?: string | null
          duree_heures?: number | null
          employee_id?: string | null
          equipment_id?: string | null
          id?: string
          rapport?: string | null
          statut?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          categorie: string | null
          chantier_id: string | null
          created_at: string
          date_retour: string | null
          id: string
          nom: string
          notes: string | null
          quantite: number | null
          reference: string | null
          statut: string | null
          tenant_id: string
          unite: string | null
          updated_at: string
        }
        Insert: {
          categorie?: string | null
          chantier_id?: string | null
          created_at?: string
          date_retour?: string | null
          id?: string
          nom: string
          notes?: string | null
          quantite?: number | null
          reference?: string | null
          statut?: string | null
          tenant_id: string
          unite?: string | null
          updated_at?: string
        }
        Update: {
          categorie?: string | null
          chantier_id?: string | null
          created_at?: string
          date_retour?: string | null
          id?: string
          nom?: string
          notes?: string | null
          quantite?: number | null
          reference?: string | null
          statut?: string | null
          tenant_id?: string
          unite?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      module_versions: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          module_id: string
          prompt: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          module_id: string
          prompt?: string | null
          tenant_id: string
          version: number
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          module_id?: string
          prompt?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "module_versions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string | null
          created_by: string | null
          deployment_url: string | null
          description: string
          format: string
          html_content: string
          icon: string | null
          id: string
          is_public: boolean
          name: string
          slug: string | null
          status: Database["public"]["Enums"]["app_status"]
          tenant_id: string | null
          updated_at: string | null
          user_id: string
          vercel_project_id: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deployment_url?: string | null
          description?: string
          format?: string
          html_content: string
          icon?: string | null
          id?: string
          is_public?: boolean
          name: string
          slug?: string | null
          status?: Database["public"]["Enums"]["app_status"]
          tenant_id?: string | null
          updated_at?: string | null
          user_id: string
          vercel_project_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deployment_url?: string | null
          description?: string
          format?: string
          html_content?: string
          icon?: string | null
          id?: string
          is_public?: boolean
          name?: string
          slug?: string | null
          status?: Database["public"]["Enums"]["app_status"]
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
          vercel_project_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "apps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          sent_at: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          tenant_id: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string
          created_at: string
          full_name: string
          sector: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string
          created_at?: string
          full_name?: string
          sector?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string
          full_name?: string
          sector?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          adresse: string | null
          code_postal: string | null
          created_at: string
          email: string | null
          id: string
          nom: string
          notes: string | null
          siret: string | null
          tel: string | null
          tenant_id: string
          type: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          siret?: string | null
          tel?: string | null
          tenant_id: string
          type?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          siret?: string | null
          tel?: string | null
          tenant_id?: string
          type?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          chantier_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done_at: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          chantier_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          chantier_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_public: boolean
          name: string
          preview_data: Json | null
          prompt: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_public?: boolean
          name: string
          preview_data?: Json | null
          prompt?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_public?: boolean
          name?: string
          preview_data?: Json | null
          prompt?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          steps: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          steps?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          steps?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_analytics: { Args: never; Returns: Json }
      deduct_credits: { Args: { p_amount: number }; Returns: boolean }
      get_workspace_context: { Args: { p_tenant_id: string }; Returns: Json }
      is_app_member: { Args: { p_app_id: string }; Returns: boolean }
      log_activity: {
        Args: {
          p_action: string
          p_description?: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_tenant_id: string
        }
        Returns: undefined
      }
      log_audit: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_app_id: string
          p_ip_address?: unknown
          p_new_data?: Json
          p_old_data?: Json
          p_resource: string
          p_resource_id?: string
          p_tenant_id: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      match_knowledge: {
        Args: {
          query_embedding: string | number[]
          match_count?: number
          p_tenant_id?: string | null
          p_trade_ids?: string[] | null
        }
        Returns: {
          id: string
          document_id: string
          content: string
          title: string
          source_url: string | null
          source_type: string
          trade_ids: string[]
          similarity: number
        }[]
      }
      my_tenant_role: {
        Args: { p_tenant_id: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      refund_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_status: "active" | "archived" | "suspended"
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "permission_change"
        | "login"
        | "logout"
        | "export"
        | "invite"
        | "revoke"
      chantier_statut:
        | "en_attente"
        | "en_cours"
        | "en_retard"
        | "termine"
        | "annule"
      member_role: "owner" | "admin" | "manager" | "member" | "viewer"
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
      app_status: ["active", "archived", "suspended"],
      audit_action: [
        "create",
        "update",
        "delete",
        "permission_change",
        "login",
        "logout",
        "export",
        "invite",
        "revoke",
      ],
      chantier_statut: [
        "en_attente",
        "en_cours",
        "en_retard",
        "termine",
        "annule",
      ],
      member_role: ["owner", "admin", "manager", "member", "viewer"],
    },
  },
} as const
