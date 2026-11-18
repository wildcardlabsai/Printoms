
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_label": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"message": string,"metadata": NonNullable<Json>,"order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"message": string,"metadata"?: NonNullable<Json>,"order_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"message"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_log_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"business_settings": {
                  Row: {
                    "business_name": string,"created_at": string,"currency": string,"default_dispatch_days": number,"default_filament_cost_per_kg": number,"default_packaging_cost": number,"etsy_fee_percent": number,"etsy_fixed_fee": number,"id": string,"packing_checklist": (string)[],"shopify_fee_percent": number,"shopify_fixed_fee": number,"singleton": boolean,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_name"?: string,"created_at"?: string,"currency"?: string,"default_dispatch_days"?: number,"default_filament_cost_per_kg"?: number,"default_packaging_cost"?: number,"etsy_fee_percent"?: number,"etsy_fixed_fee"?: number,"id"?: string,"packing_checklist"?: (string)[],"shopify_fee_percent"?: number,"shopify_fixed_fee"?: number,"singleton"?: boolean,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "business_name"?: string,"created_at"?: string,"currency"?: string,"default_dispatch_days"?: number,"default_filament_cost_per_kg"?: number,"default_packaging_cost"?: number,"etsy_fee_percent"?: number,"etsy_fixed_fee"?: number,"id"?: string,"packing_checklist"?: (string)[],"shopify_fee_percent"?: number,"shopify_fixed_fee"?: number,"singleton"?: boolean,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer_addresses": {
                  Row: {
                    "city": string | null,"country_code": string | null,"created_at": string,"customer_id": string,"fingerprint": string | null,"id": string,"last_used_at": string,"line1": string | null,"line2": string | null,"name": string | null,"phone": string | null,"postal_code": string | null,"region": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"country_code"?: string | null,"created_at"?: string,"customer_id": string,"fingerprint"?: never,"id"?: string,"last_used_at"?: string,"line1"?: string | null,"line2"?: string | null,"name"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"country_code"?: string | null,"created_at"?: string,"customer_id"?: string,"fingerprint"?: never,"id"?: string,"last_used_at"?: string,"line1"?: string | null,"line2"?: string | null,"name"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_addresses_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_addresses_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_identities": {
                  Row: {
                    "created_at": string,"customer_id": string,"external_customer_id": string,"id": string,"source": Database["public"]['Enums']["order_source"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id": string,"external_customer_id": string,"id"?: string,"source": Database["public"]['Enums']["order_source"]
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"external_customer_id"?: string,"id"?: string,"source"?: Database["public"]['Enums']["order_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_identities_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_identities_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string | null,"first_source": Database["public"]['Enums']["order_source"] | null,"id": string,"is_sample": boolean,"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"email"?: string | null,"first_source"?: Database["public"]['Enums']["order_source"] | null,"id"?: string,"is_sample"?: boolean,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string | null,"first_source"?: Database["public"]['Enums']["order_source"] | null,"id"?: string,"is_sample"?: boolean,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"filament_stock": {
                  Row: {
                    "brand": string,"colour": string,"colour_hex": string | null,"created_at": string,"id": string,"is_archived": boolean,"is_sample": boolean,"low_stock_threshold_g": number,"material": string,"notes": string | null,"purchase_date": string | null,"purchase_price": number | null,"remaining_g": number,"spool_weight_g": number,"supplier": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand": string,"colour": string,"colour_hex"?: string | null,"created_at"?: string,"id"?: string,"is_archived"?: boolean,"is_sample"?: boolean,"low_stock_threshold_g"?: number,"material": string,"notes"?: string | null,"purchase_date"?: string | null,"purchase_price"?: number | null,"remaining_g": number,"spool_weight_g": number,"supplier"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string,"colour"?: string,"colour_hex"?: string | null,"created_at"?: string,"id"?: string,"is_archived"?: boolean,"is_sample"?: boolean,"low_stock_threshold_g"?: number,"material"?: string,"notes"?: string | null,"purchase_date"?: string | null,"purchase_price"?: number | null,"remaining_g"?: number,"spool_weight_g"?: number,"supplier"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"filament_usage": {
                  Row: {
                    "cost": number | null,"created_at": string,"filament_stock_id": string,"grams": number,"id": string,"kind": Database["public"]['Enums']["filament_usage_kind"],"note": string | null,"print_run_id": string | null,"production_job_id": string | null,"recorded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cost"?: number | null,"created_at"?: string,"filament_stock_id": string,"grams": number,"id"?: string,"kind"?: Database["public"]['Enums']["filament_usage_kind"],"note"?: string | null,"print_run_id"?: string | null,"production_job_id"?: string | null,"recorded_by"?: string | null
                  }
                  Update: {
                    "cost"?: number | null,"created_at"?: string,"filament_stock_id"?: string,"grams"?: number,"id"?: string,"kind"?: Database["public"]['Enums']["filament_usage_kind"],"note"?: string | null,"print_run_id"?: string | null,"production_job_id"?: string | null,"recorded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "filament_usage_filament_stock_id_fkey"
      columns: ["filament_stock_id"]
isOneToOne: false
      referencedRelation: "filament_stock"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_usage_filament_stock_id_fkey"
      columns: ["filament_stock_id"]
isOneToOne: false
      referencedRelation: "filament_stock_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_usage_print_run_id_fkey"
      columns: ["print_run_id"]
isOneToOne: false
      referencedRelation: "print_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_usage_production_job_id_fkey"
      columns: ["production_job_id"]
isOneToOne: false
      referencedRelation: "production_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_usage_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_credentials": {
                  Row: {
                    "access_token_encrypted": string | null,"access_token_expires_at": string | null,"created_at": string,"id": string,"integration_id": string,"refresh_token_encrypted": string | null,"refresh_token_expires_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_encrypted"?: string | null,"access_token_expires_at"?: string | null,"created_at"?: string,"id"?: string,"integration_id": string,"refresh_token_encrypted"?: string | null,"refresh_token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_token_encrypted"?: string | null,"access_token_expires_at"?: string | null,"created_at"?: string,"id"?: string,"integration_id"?: string,"refresh_token_encrypted"?: string | null,"refresh_token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_credentials_integration_id_fkey"
      columns: ["integration_id"]
isOneToOne: true
      referencedRelation: "integrations"
      referencedColumns: ["id"]
    }
                  ]
                },"integrations": {
                  Row: {
                    "connected_at": string | null,"connected_by": string | null,"consecutive_failures": number,"created_at": string,"display_name": string | null,"external_shop_id": string | null,"id": string,"initial_import_days": number,"last_error": string | null,"last_error_at": string | null,"last_successful_sync_at": string | null,"last_sync_finished_at": string | null,"last_sync_started_at": string | null,"next_sync_at": string | null,"provider": Database["public"]['Enums']["integration_provider"],"scopes": (string)[],"settings": NonNullable<Json>,"shop_domain": string | null,"status": Database["public"]['Enums']["integration_status"],"sync_cursor": string | null,"sync_enabled": boolean,"sync_interval_minutes": number,"sync_locked_until": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connected_at"?: string | null,"connected_by"?: string | null,"consecutive_failures"?: number,"created_at"?: string,"display_name"?: string | null,"external_shop_id"?: string | null,"id"?: string,"initial_import_days"?: number,"last_error"?: string | null,"last_error_at"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_finished_at"?: string | null,"last_sync_started_at"?: string | null,"next_sync_at"?: string | null,"provider": Database["public"]['Enums']["integration_provider"],"scopes"?: (string)[],"settings"?: NonNullable<Json>,"shop_domain"?: string | null,"status"?: Database["public"]['Enums']["integration_status"],"sync_cursor"?: string | null,"sync_enabled"?: boolean,"sync_interval_minutes"?: number,"sync_locked_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "connected_at"?: string | null,"connected_by"?: string | null,"consecutive_failures"?: number,"created_at"?: string,"display_name"?: string | null,"external_shop_id"?: string | null,"id"?: string,"initial_import_days"?: number,"last_error"?: string | null,"last_error_at"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_finished_at"?: string | null,"last_sync_started_at"?: string | null,"next_sync_at"?: string | null,"provider"?: Database["public"]['Enums']["integration_provider"],"scopes"?: (string)[],"settings"?: NonNullable<Json>,"shop_domain"?: string | null,"status"?: Database["public"]['Enums']["integration_status"],"sync_cursor"?: string | null,"sync_enabled"?: boolean,"sync_interval_minutes"?: number,"sync_locked_until"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integrations_connected_by_fkey"
      columns: ["connected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"external_line_item_id": string | null,"external_listing_id": string | null,"external_variant_id": string | null,"id": string,"internal_notes": string | null,"order_id": string,"personalisation": string | null,"product_id": string | null,"quantity": number,"sku": string | null,"title": string,"total_price": number,"unit_price": number,"updated_at": string,"variant_details": NonNullable<Json>,"variant_title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"external_line_item_id"?: string | null,"external_listing_id"?: string | null,"external_variant_id"?: string | null,"id"?: string,"internal_notes"?: string | null,"order_id": string,"personalisation"?: string | null,"product_id"?: string | null,"quantity": number,"sku"?: string | null,"title": string,"total_price"?: number,"unit_price"?: number,"updated_at"?: string,"variant_details"?: NonNullable<Json>,"variant_title"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"external_line_item_id"?: string | null,"external_listing_id"?: string | null,"external_variant_id"?: string | null,"id"?: string,"internal_notes"?: string | null,"order_id"?: string,"personalisation"?: string | null,"product_id"?: string | null,"quantity"?: number,"sku"?: string | null,"title"?: string,"total_price"?: number,"unit_price"?: number,"updated_at"?: string,"variant_details"?: NonNullable<Json>,"variant_title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "carrier": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"customer_email": string | null,"customer_id": string | null,"customer_name": string,"customer_note": string | null,"discount_total": number,"dispatch_by": string | null,"dispatched_at": string | null,"external_order_id": string | null,"external_order_number": string | null,"id": string,"is_sample": boolean,"last_synced_at": string | null,"marketplace_cancelled_at": string | null,"marketplace_dispatch_by": string | null,"marketplace_fulfilment_status": string | null,"marketplace_status": string | null,"marketplace_updated_at": string | null,"order_date": string,"order_number": string,"payment_status": Database["public"]['Enums']["payment_status"],"priority": Database["public"]['Enums']["priority_level"],"production_notes": string | null,"search_text": string | null,"shipping_address": NonNullable<Json>,"shipping_method": string | null,"shipping_total": number,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"subtotal": number,"tax_total": number,"total": number,"tracking_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_email"?: string | null,"customer_id"?: string | null,"customer_name": string,"customer_note"?: string | null,"discount_total"?: number,"dispatch_by"?: string | null,"dispatched_at"?: string | null,"external_order_id"?: string | null,"external_order_number"?: string | null,"id"?: string,"is_sample"?: boolean,"last_synced_at"?: string | null,"marketplace_cancelled_at"?: string | null,"marketplace_dispatch_by"?: string | null,"marketplace_fulfilment_status"?: string | null,"marketplace_status"?: string | null,"marketplace_updated_at"?: string | null,"order_date"?: string,"order_number"?: string,"payment_status"?: Database["public"]['Enums']["payment_status"],"priority"?: Database["public"]['Enums']["priority_level"],"production_notes"?: string | null,"search_text"?: never,"shipping_address"?: NonNullable<Json>,"shipping_method"?: string | null,"shipping_total"?: number,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_total"?: number,"total"?: number,"tracking_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "carrier"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_email"?: string | null,"customer_id"?: string | null,"customer_name"?: string,"customer_note"?: string | null,"discount_total"?: number,"dispatch_by"?: string | null,"dispatched_at"?: string | null,"external_order_id"?: string | null,"external_order_number"?: string | null,"id"?: string,"is_sample"?: boolean,"last_synced_at"?: string | null,"marketplace_cancelled_at"?: string | null,"marketplace_dispatch_by"?: string | null,"marketplace_fulfilment_status"?: string | null,"marketplace_status"?: string | null,"marketplace_updated_at"?: string | null,"order_date"?: string,"order_number"?: string,"payment_status"?: Database["public"]['Enums']["payment_status"],"priority"?: Database["public"]['Enums']["priority_level"],"production_notes"?: string | null,"search_text"?: never,"shipping_address"?: NonNullable<Json>,"shipping_method"?: string | null,"shipping_total"?: number,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_total"?: number,"total"?: number,"tracking_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"print_queue": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"printer_id": string,"production_job_id": string,"status": Database["public"]['Enums']["queue_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"position"?: number,"printer_id": string,"production_job_id": string,"status"?: Database["public"]['Enums']["queue_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"printer_id"?: string,"production_job_id"?: string,"status"?: Database["public"]['Enums']["queue_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_queue_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_queue_production_job_id_fkey"
      columns: ["production_job_id"]
isOneToOne: false
      referencedRelation: "production_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"print_runs": {
                  Row: {
                    "attempt_number": number,"created_at": string,"ended_at": string | null,"ended_by": string | null,"estimated_minutes": number | null,"failure_reason": string | null,"filament_recorded": boolean,"id": string,"notes": string | null,"printer_id": string | null,"production_job_id": string,"quantity": number,"started_at": string,"started_by": string | null,"status": Database["public"]['Enums']["print_run_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_number"?: number,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"estimated_minutes"?: number | null,"failure_reason"?: string | null,"filament_recorded"?: boolean,"id"?: string,"notes"?: string | null,"printer_id"?: string | null,"production_job_id": string,"quantity"?: number,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["print_run_status"],"updated_at"?: string
                  }
                  Update: {
                    "attempt_number"?: number,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"estimated_minutes"?: number | null,"failure_reason"?: string | null,"filament_recorded"?: boolean,"id"?: string,"notes"?: string | null,"printer_id"?: string | null,"production_job_id"?: string,"quantity"?: number,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["print_run_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_runs_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_runs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_runs_production_job_id_fkey"
      columns: ["production_job_id"]
isOneToOne: false
      referencedRelation: "production_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"printers": {
                  Row: {
                    "build_volume_x_mm": number | null,"build_volume_y_mm": number | null,"build_volume_z_mm": number | null,"created_at": string,"current_job_id": string | null,"current_print_run_id": string | null,"estimated_completion_at": string | null,"has_multi_material": boolean,"id": string,"is_active": boolean,"maintenance_notes": string | null,"manufacturer": string,"model": string,"monitoring_source": string,"name": string,"nozzle_size_mm": number | null,"printer_type": string,"sort_order": number,"status": Database["public"]['Enums']["printer_status"],"supported_materials": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "build_volume_x_mm"?: number | null,"build_volume_y_mm"?: number | null,"build_volume_z_mm"?: number | null,"created_at"?: string,"current_job_id"?: string | null,"current_print_run_id"?: string | null,"estimated_completion_at"?: string | null,"has_multi_material"?: boolean,"id"?: string,"is_active"?: boolean,"maintenance_notes"?: string | null,"manufacturer": string,"model": string,"monitoring_source"?: string,"name": string,"nozzle_size_mm"?: number | null,"printer_type"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["printer_status"],"supported_materials"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "build_volume_x_mm"?: number | null,"build_volume_y_mm"?: number | null,"build_volume_z_mm"?: number | null,"created_at"?: string,"current_job_id"?: string | null,"current_print_run_id"?: string | null,"estimated_completion_at"?: string | null,"has_multi_material"?: boolean,"id"?: string,"is_active"?: boolean,"maintenance_notes"?: string | null,"manufacturer"?: string,"model"?: string,"monitoring_source"?: string,"name"?: string,"nozzle_size_mm"?: number | null,"printer_type"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["printer_status"],"supported_materials"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "printers_current_job_fk"
      columns: ["current_job_id"]
isOneToOne: false
      referencedRelation: "production_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "printers_current_run_fk"
      columns: ["current_print_run_id"]
isOneToOne: false
      referencedRelation: "print_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"product_listings": {
                  Row: {
                    "created_at": string,"external_listing_id": string,"external_sku": string | null,"external_variant_id": string | null,"id": string,"is_active": boolean,"product_id": string,"source": Database["public"]['Enums']["integration_provider"],"title": string | null,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"external_listing_id": string,"external_sku"?: string | null,"external_variant_id"?: string | null,"id"?: string,"is_active"?: boolean,"product_id": string,"source": Database["public"]['Enums']["integration_provider"],"title"?: string | null,"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"external_listing_id"?: string,"external_sku"?: string | null,"external_variant_id"?: string | null,"id"?: string,"is_active"?: boolean,"product_id"?: string,"source"?: Database["public"]['Enums']["integration_provider"],"title"?: string | null,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_listings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"production_jobs": {
                  Row: {
                    "attempt_count": number,"board_position": number,"colour": string | null,"completed_at": string | null,"created_at": string,"due_date": string | null,"estimated_filament_g": number | null,"estimated_print_minutes": number | null,"failed_attempts": number,"id": string,"is_sample": boolean,"job_number": string,"material": string | null,"notes": string | null,"order_id": string,"order_item_id": string,"print_requirements": string | null,"printer_id": string | null,"priority": Database["public"]['Enums']["priority_level"],"product_id": string | null,"quantity": number,"stage": Database["public"]['Enums']["production_stage"],"stage_before_hold": Database["public"]['Enums']["production_stage"] | null,"stage_changed_at": string,"started_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count"?: number,"board_position"?: number,"colour"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"estimated_filament_g"?: number | null,"estimated_print_minutes"?: number | null,"failed_attempts"?: number,"id"?: string,"is_sample"?: boolean,"job_number"?: string,"material"?: string | null,"notes"?: string | null,"order_id": string,"order_item_id": string,"print_requirements"?: string | null,"printer_id"?: string | null,"priority"?: Database["public"]['Enums']["priority_level"],"product_id"?: string | null,"quantity": number,"stage"?: Database["public"]['Enums']["production_stage"],"stage_before_hold"?: Database["public"]['Enums']["production_stage"] | null,"stage_changed_at"?: string,"started_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attempt_count"?: number,"board_position"?: number,"colour"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"estimated_filament_g"?: number | null,"estimated_print_minutes"?: number | null,"failed_attempts"?: number,"id"?: string,"is_sample"?: boolean,"job_number"?: string,"material"?: string | null,"notes"?: string | null,"order_id"?: string,"order_item_id"?: string,"print_requirements"?: string | null,"printer_id"?: string | null,"priority"?: Database["public"]['Enums']["priority_level"],"product_id"?: string | null,"quantity"?: number,"stage"?: Database["public"]['Enums']["production_stage"],"stage_before_hold"?: Database["public"]['Enums']["production_stage"] | null,"stage_changed_at"?: string,"started_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_jobs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_jobs_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: true
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_jobs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_jobs_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "base_price": number | null,"category": string | null,"created_at": string,"default_colour": string | null,"default_printer_id": string | null,"description": string | null,"estimated_filament_g": number | null,"estimated_print_minutes": number | null,"id": string,"image_path": string | null,"is_active": boolean,"is_sample": boolean,"labour_cost": number | null,"material": string | null,"material_cost": number | null,"model_file_ref": string | null,"name": string,"other_cost": number | null,"packaging_cost": number | null,"production_instructions": string | null,"sku": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_price"?: number | null,"category"?: string | null,"created_at"?: string,"default_colour"?: string | null,"default_printer_id"?: string | null,"description"?: string | null,"estimated_filament_g"?: number | null,"estimated_print_minutes"?: number | null,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"is_sample"?: boolean,"labour_cost"?: number | null,"material"?: string | null,"material_cost"?: number | null,"model_file_ref"?: string | null,"name": string,"other_cost"?: number | null,"packaging_cost"?: number | null,"production_instructions"?: string | null,"sku": string,"updated_at"?: string
                  }
                  Update: {
                    "base_price"?: number | null,"category"?: string | null,"created_at"?: string,"default_colour"?: string | null,"default_printer_id"?: string | null,"description"?: string | null,"estimated_filament_g"?: number | null,"estimated_print_minutes"?: number | null,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"is_sample"?: boolean,"labour_cost"?: number | null,"material"?: string | null,"material_cost"?: number | null,"model_file_ref"?: string | null,"name"?: string,"other_cost"?: number | null,"packaging_cost"?: number | null,"production_instructions"?: string | null,"sku"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_default_printer_id_fkey"
      columns: ["default_printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"is_active": boolean,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shipments": {
                  Row: {
                    "carrier": string | null,"checklist": NonNullable<Json>,"created_at": string,"dispatched_at": string | null,"dispatched_by": string | null,"external_fulfilment_id": string | null,"id": string,"marketplace_push_error": string | null,"marketplace_push_status": Database["public"]['Enums']["marketplace_push_status"],"marketplace_pushed_at": string | null,"order_id": string,"packaging_notes": string | null,"packed_at": string | null,"packed_by": string | null,"shipping_cost": number | null,"shipping_method": string | null,"status": Database["public"]['Enums']["shipment_status"],"tracking_number": string | null,"tracking_url": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"dispatched_at"?: string | null,"dispatched_by"?: string | null,"external_fulfilment_id"?: string | null,"id"?: string,"marketplace_push_error"?: string | null,"marketplace_push_status"?: Database["public"]['Enums']["marketplace_push_status"],"marketplace_pushed_at"?: string | null,"order_id": string,"packaging_notes"?: string | null,"packed_at"?: string | null,"packed_by"?: string | null,"shipping_cost"?: number | null,"shipping_method"?: string | null,"status"?: Database["public"]['Enums']["shipment_status"],"tracking_number"?: string | null,"tracking_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "carrier"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"dispatched_at"?: string | null,"dispatched_by"?: string | null,"external_fulfilment_id"?: string | null,"id"?: string,"marketplace_push_error"?: string | null,"marketplace_push_status"?: Database["public"]['Enums']["marketplace_push_status"],"marketplace_pushed_at"?: string | null,"order_id"?: string,"packaging_notes"?: string | null,"packed_at"?: string | null,"packed_by"?: string | null,"shipping_cost"?: number | null,"shipping_method"?: string | null,"status"?: Database["public"]['Enums']["shipment_status"],"tracking_number"?: string | null,"tracking_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipments_dispatched_by_fkey"
      columns: ["dispatched_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shipments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shipments_packed_by_fkey"
      columns: ["packed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_logs": {
                  Row: {
                    "created_at": string,"cursor_from": string | null,"cursor_to": string | null,"duration_ms": number | null,"error_details": Json | null,"error_message": string | null,"finished_at": string | null,"id": string,"integration_id": string | null,"orders_created": number,"orders_failed": number,"orders_fetched": number,"orders_updated": number,"pages_fetched": number,"provider": Database["public"]['Enums']["integration_provider"],"started_at": string,"status": Database["public"]['Enums']["sync_status"],"trigger": Database["public"]['Enums']["sync_trigger"],"triggered_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cursor_from"?: string | null,"cursor_to"?: string | null,"duration_ms"?: number | null,"error_details"?: Json | null,"error_message"?: string | null,"finished_at"?: string | null,"id"?: string,"integration_id"?: string | null,"orders_created"?: number,"orders_failed"?: number,"orders_fetched"?: number,"orders_updated"?: number,"pages_fetched"?: number,"provider": Database["public"]['Enums']["integration_provider"],"started_at"?: string,"status"?: Database["public"]['Enums']["sync_status"],"trigger": Database["public"]['Enums']["sync_trigger"],"triggered_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"cursor_from"?: string | null,"cursor_to"?: string | null,"duration_ms"?: number | null,"error_details"?: Json | null,"error_message"?: string | null,"finished_at"?: string | null,"id"?: string,"integration_id"?: string | null,"orders_created"?: number,"orders_failed"?: number,"orders_fetched"?: number,"orders_updated"?: number,"pages_fetched"?: number,"provider"?: Database["public"]['Enums']["integration_provider"],"started_at"?: string,"status"?: Database["public"]['Enums']["sync_status"],"trigger"?: Database["public"]['Enums']["sync_trigger"],"triggered_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_logs_integration_id_fkey"
      columns: ["integration_id"]
isOneToOne: false
      referencedRelation: "integrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_logs_triggered_by_fkey"
      columns: ["triggered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "customer_summaries": {
                  Row: {
                    "created_at": string,"currency": string | null,"display_name": string,"email": string | null,"first_source": Database["public"]['Enums']["order_source"] | null,"id": string,"is_sample": boolean,"last_order_at": string | null,"order_count": number | null,"phone": string | null,"sources": (Database["public"]['Enums']["order_source"])[] | null,"total_spend": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"filament_stock_overview": {
                  Row: {
                    "brand": string,"colour": string,"colour_hex": string | null,"cost_per_kg": number | null,"created_at": string,"id": string,"is_archived": boolean,"is_low_stock": boolean | null,"is_sample": boolean,"low_stock_threshold_g": number,"material": string,"notes": string | null,"purchase_date": string | null,"purchase_price": number | null,"remaining_g": number,"remaining_percent": number | null,"spool_weight_g": number,"supplier": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                           "brand"?: string | null,"colour"?: string | null,"colour_hex"?: string | null,"cost_per_kg"?: never,"created_at"?: string | null,"id"?: string | null,"is_archived"?: boolean | null,"is_low_stock"?: never,"is_sample"?: boolean | null,"low_stock_threshold_g"?: number | null,"material"?: string | null,"notes"?: string | null,"purchase_date"?: string | null,"purchase_price"?: number | null,"remaining_g"?: number | null,"remaining_percent"?: never,"spool_weight_g"?: number | null,"supplier"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "brand"?: string | null,"colour"?: string | null,"colour_hex"?: string | null,"cost_per_kg"?: never,"created_at"?: string | null,"id"?: string | null,"is_archived"?: boolean | null,"is_low_stock"?: never,"is_sample"?: boolean | null,"low_stock_threshold_g"?: number | null,"material"?: string | null,"notes"?: string | null,"purchase_date"?: string | null,"purchase_price"?: number | null,"remaining_g"?: number | null,"remaining_percent"?: never,"spool_weight_g"?: number | null,"supplier"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "acquire_sync_lock":
{ Args: { "p_provider": Database["public"]['Enums']["integration_provider"],"p_seconds"?: number }; Returns: boolean
                           },
"analytics_period_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"analytics_report":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"assert_can_write":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"assign_job_to_printer":
{ Args: { "p_job_id": string,"p_printer_id": string }; Returns: undefined
                           },
"can_write":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"create_manual_order":
{ Args: { "p_items": Json,"p_order": Json }; Returns: string
                           },
"current_role_rank":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"dashboard_metrics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"finish_print_run":
{ Args: { "p_failure_reason"?: string,"p_notes"?: string,"p_requeue"?: boolean,"p_run_id": string,"p_succeeded": boolean }; Returns: undefined
                           },
"ingest_marketplace_order":
{ Args: { "p_actor_label"?: string,"p_items": Json,"p_order": Json,"p_source": Database["public"]['Enums']["order_source"] }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_team_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_activity":
{ Args: { "p_action": string,"p_actor_label"?: string,"p_entity_id": string,"p_entity_type": string,"p_message": string,"p_metadata"?: Json,"p_order_id": string }; Returns: undefined
                           },
"mark_order_completed":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"mark_order_dispatched":
{ Args: { "p_carrier": string,"p_dispatched_at"?: string,"p_order_id": string,"p_shipping_cost"?: number,"p_shipping_method"?: string,"p_tracking_number": string,"p_tracking_url"?: string }; Returns: string
                           },
"mark_order_packed":
{ Args: { "p_checklist": Json,"p_order_id": string,"p_packaging_notes"?: string }; Returns: string
                           },
"merge_customers":
{ Args: { "p_source": string,"p_target": string }; Returns: undefined
                           },
"purge_sample_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"refresh_order_status":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"set_order_hold":
{ Args: { "p_hold": boolean,"p_order_id": string,"p_reason"?: string }; Returns: undefined
                           },
"setup_required":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"stage_label":
{ Args: { "p": Database["public"]['Enums']["production_stage"] }; Returns: string
                           },
"start_print_run":
{ Args: { "p_job_id": string,"p_printer_id": string,"p_quantity"?: number }; Returns: string
                           }
          }
          Enums: {
            "filament_usage_kind": "print"|"failed_print"|"adjustment"|"waste","integration_provider": "etsy"|"shopify","integration_status": "not_connected"|"connected"|"error"|"disabled","marketplace_push_status": "not_required"|"pending"|"sent"|"failed","order_source": "etsy"|"shopify"|"manual","order_status": "new"|"in_production"|"ready_to_pack"|"packed"|"dispatched"|"completed"|"on_hold"|"cancelled","payment_status": "pending"|"paid"|"partially_paid"|"partially_refunded"|"refunded"|"voided"|"unknown","print_run_status": "printing"|"succeeded"|"failed"|"cancelled","printer_status": "available"|"printing"|"paused"|"maintenance"|"offline","priority_level": "low"|"normal"|"high"|"urgent","production_stage": "new_order"|"awaiting_preparation"|"ready_to_print"|"printing"|"quality_check"|"ready_to_pack"|"dispatched"|"completed"|"on_hold","queue_status": "queued"|"active"|"done"|"removed","shipment_status": "pending"|"packed"|"dispatched"|"delivered"|"returned"|"cancelled","sync_status": "running"|"success"|"partial"|"failed","sync_trigger": "scheduled"|"manual"|"initial"|"webhook","user_role": "owner"|"admin"|"staff"|"viewer"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "filament_usage_kind": ["print", "failed_print", "adjustment", "waste"],"integration_provider": ["etsy", "shopify"],"integration_status": ["not_connected", "connected", "error", "disabled"],"marketplace_push_status": ["not_required", "pending", "sent", "failed"],"order_source": ["etsy", "shopify", "manual"],"order_status": ["new", "in_production", "ready_to_pack", "packed", "dispatched", "completed", "on_hold", "cancelled"],"payment_status": ["pending", "paid", "partially_paid", "partially_refunded", "refunded", "voided", "unknown"],"print_run_status": ["printing", "succeeded", "failed", "cancelled"],"printer_status": ["available", "printing", "paused", "maintenance", "offline"],"priority_level": ["low", "normal", "high", "urgent"],"production_stage": ["new_order", "awaiting_preparation", "ready_to_print", "printing", "quality_check", "ready_to_pack", "dispatched", "completed", "on_hold"],"queue_status": ["queued", "active", "done", "removed"],"shipment_status": ["pending", "packed", "dispatched", "delivered", "returned", "cancelled"],"sync_status": ["running", "success", "partial", "failed"],"sync_trigger": ["scheduled", "manual", "initial", "webhook"],"user_role": ["owner", "admin", "staff", "viewer"]
          }
        }
} as const
