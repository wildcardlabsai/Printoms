
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
                    "business_name": string,"contact_email": string | null,"created_at": string,"currency": string,"default_dispatch_days": number,"default_filament_cost_per_kg": number,"default_packaging_cost": number,"etsy_fee_percent": number,"etsy_fixed_fee": number,"id": string,"logo_path": string | null,"new_order_alert_email": string | null,"new_order_alerts_enabled": boolean,"new_order_alerts_since": string | null,"packing_checklist": (string)[],"return_address": string | null,"shopify_fee_percent": number,"shopify_fixed_fee": number,"singleton": boolean,"slip_message": string,"slip_show_prices": boolean,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_name"?: string,"contact_email"?: string | null,"created_at"?: string,"currency"?: string,"default_dispatch_days"?: number,"default_filament_cost_per_kg"?: number,"default_packaging_cost"?: number,"etsy_fee_percent"?: number,"etsy_fixed_fee"?: number,"id"?: string,"logo_path"?: string | null,"new_order_alert_email"?: string | null,"new_order_alerts_enabled"?: boolean,"new_order_alerts_since"?: string | null,"packing_checklist"?: (string)[],"return_address"?: string | null,"shopify_fee_percent"?: number,"shopify_fixed_fee"?: number,"singleton"?: boolean,"slip_message"?: string,"slip_show_prices"?: boolean,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "business_name"?: string,"contact_email"?: string | null,"created_at"?: string,"currency"?: string,"default_dispatch_days"?: number,"default_filament_cost_per_kg"?: number,"default_packaging_cost"?: number,"etsy_fee_percent"?: number,"etsy_fixed_fee"?: number,"id"?: string,"logo_path"?: string | null,"new_order_alert_email"?: string | null,"new_order_alerts_enabled"?: boolean,"new_order_alerts_since"?: string | null,"packing_checklist"?: (string)[],"return_address"?: string | null,"shopify_fee_percent"?: number,"shopify_fixed_fee"?: number,"singleton"?: boolean,"slip_message"?: string,"slip_show_prices"?: boolean,"timezone"?: string,"updated_at"?: string
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
                },"fulfilment_submissions": {
                  Row: {
                    "attempt": number,"created_at": string,"error_category": string | null,"error_message": string | null,"external_fulfilment_id": string | null,"finished_at": string | null,"http_status": number | null,"id": string,"order_id": string,"provider": Database["public"]['Enums']["integration_provider"],"request": Json | null,"response": Json | null,"retryable": boolean | null,"shipment_id": string,"started_at": string,"status": string,"submitted_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt": number,"created_at"?: string,"error_category"?: string | null,"error_message"?: string | null,"external_fulfilment_id"?: string | null,"finished_at"?: string | null,"http_status"?: number | null,"id"?: string,"order_id": string,"provider": Database["public"]['Enums']["integration_provider"],"request"?: Json | null,"response"?: Json | null,"retryable"?: boolean | null,"shipment_id": string,"started_at"?: string,"status"?: string,"submitted_by"?: string | null
                  }
                  Update: {
                    "attempt"?: number,"created_at"?: string,"error_category"?: string | null,"error_message"?: string | null,"external_fulfilment_id"?: string | null,"finished_at"?: string | null,"http_status"?: number | null,"id"?: string,"order_id"?: string,"provider"?: Database["public"]['Enums']["integration_provider"],"request"?: Json | null,"response"?: Json | null,"retryable"?: boolean | null,"shipment_id"?: string,"started_at"?: string,"status"?: string,"submitted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fulfilment_submissions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fulfilment_submissions_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fulfilment_submissions_submitted_by_fkey"
      columns: ["submitted_by"]
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
                    "connected_at": string | null,"connected_by": string | null,"consecutive_failures": number,"created_at": string,"customer_data_access": string,"customer_data_checked_at": string | null,"display_name": string | null,"external_shop_id": string | null,"id": string,"initial_import_days": number,"last_error": string | null,"last_error_at": string | null,"last_successful_sync_at": string | null,"last_sync_finished_at": string | null,"last_sync_started_at": string | null,"next_sync_at": string | null,"provider": Database["public"]['Enums']["integration_provider"],"scopes": (string)[],"settings": NonNullable<Json>,"shop_domain": string | null,"status": Database["public"]['Enums']["integration_status"],"sync_cursor": string | null,"sync_enabled": boolean,"sync_interval_minutes": number,"sync_locked_until": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connected_at"?: string | null,"connected_by"?: string | null,"consecutive_failures"?: number,"created_at"?: string,"customer_data_access"?: string,"customer_data_checked_at"?: string | null,"display_name"?: string | null,"external_shop_id"?: string | null,"id"?: string,"initial_import_days"?: number,"last_error"?: string | null,"last_error_at"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_finished_at"?: string | null,"last_sync_started_at"?: string | null,"next_sync_at"?: string | null,"provider": Database["public"]['Enums']["integration_provider"],"scopes"?: (string)[],"settings"?: NonNullable<Json>,"shop_domain"?: string | null,"status"?: Database["public"]['Enums']["integration_status"],"sync_cursor"?: string | null,"sync_enabled"?: boolean,"sync_interval_minutes"?: number,"sync_locked_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "connected_at"?: string | null,"connected_by"?: string | null,"consecutive_failures"?: number,"created_at"?: string,"customer_data_access"?: string,"customer_data_checked_at"?: string | null,"display_name"?: string | null,"external_shop_id"?: string | null,"id"?: string,"initial_import_days"?: number,"last_error"?: string | null,"last_error_at"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_finished_at"?: string | null,"last_sync_started_at"?: string | null,"next_sync_at"?: string | null,"provider"?: Database["public"]['Enums']["integration_provider"],"scopes"?: (string)[],"settings"?: NonNullable<Json>,"shop_domain"?: string | null,"status"?: Database["public"]['Enums']["integration_status"],"sync_cursor"?: string | null,"sync_enabled"?: boolean,"sync_interval_minutes"?: number,"sync_locked_until"?: string | null,"updated_at"?: string
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
                },"order_fees": {
                  Row: {
                    "amount": number,"counted": boolean,"created_at": string,"currency": string,"external_ref": string,"id": string,"kind": string,"label": string,"order_id": string,"raw": NonNullable<Json>,"source": Database["public"]['Enums']["integration_provider"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"counted"?: boolean,"created_at"?: string,"currency": string,"external_ref": string,"id"?: string,"kind": string,"label": string,"order_id": string,"raw"?: NonNullable<Json>,"source": Database["public"]['Enums']["integration_provider"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"counted"?: boolean,"created_at"?: string,"currency"?: string,"external_ref"?: string,"id"?: string,"kind"?: string,"label"?: string,"order_id"?: string,"raw"?: NonNullable<Json>,"source"?: Database["public"]['Enums']["integration_provider"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_fees_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"external_line_item_id": string | null,"external_listing_id": string | null,"external_variant_id": string | null,"id": string,"internal_notes": string | null,"marketplace_options": Json | null,"marketplace_status": string,"order_id": string,"personalisation": string | null,"personalisation_changed_at": string | null,"product_id": string | null,"quantity": number,"removed_at": string | null,"sku": string | null,"title": string,"total_price": number,"unit_price": number,"updated_at": string,"variant_details": NonNullable<Json>,"variant_title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"external_line_item_id"?: string | null,"external_listing_id"?: string | null,"external_variant_id"?: string | null,"id"?: string,"internal_notes"?: string | null,"marketplace_options"?: Json | null,"marketplace_status"?: string,"order_id": string,"personalisation"?: string | null,"personalisation_changed_at"?: string | null,"product_id"?: string | null,"quantity": number,"removed_at"?: string | null,"sku"?: string | null,"title": string,"total_price"?: number,"unit_price"?: number,"updated_at"?: string,"variant_details"?: NonNullable<Json>,"variant_title"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"external_line_item_id"?: string | null,"external_listing_id"?: string | null,"external_variant_id"?: string | null,"id"?: string,"internal_notes"?: string | null,"marketplace_options"?: Json | null,"marketplace_status"?: string,"order_id"?: string,"personalisation"?: string | null,"personalisation_changed_at"?: string | null,"product_id"?: string | null,"quantity"?: number,"removed_at"?: string | null,"sku"?: string | null,"title"?: string,"total_price"?: number,"unit_price"?: number,"updated_at"?: string,"variant_details"?: NonNullable<Json>,"variant_title"?: string | null
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
                },"order_reviews": {
                  Row: {
                    "created_at": string,"details": NonNullable<Json>,"detected_at": string,"fingerprint": string,"id": string,"kind": string,"message": string,"order_id": string,"order_item_id": string | null,"production_job_id": string | null,"resolution": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"severity": string,"source": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: NonNullable<Json>,"detected_at"?: string,"fingerprint": string,"id"?: string,"kind": string,"message": string,"order_id": string,"order_item_id"?: string | null,"production_job_id"?: string | null,"resolution"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity": string,"source"?: string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: NonNullable<Json>,"detected_at"?: string,"fingerprint"?: string,"id"?: string,"kind"?: string,"message"?: string,"order_id"?: string,"order_item_id"?: string | null,"production_job_id"?: string | null,"resolution"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"source"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_reviews_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_reviews_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_reviews_production_job_id_fkey"
      columns: ["production_job_id"]
isOneToOne: false
      referencedRelation: "production_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_reviews_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "carrier": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"customer_data_restricted_fields": (string)[],"customer_data_status": string,"customer_email": string | null,"customer_id": string | null,"customer_name": string,"customer_note": string | null,"discount_total": number,"dispatch_by": string | null,"dispatched_at": string | null,"external_order_id": string | null,"external_order_number": string | null,"fee_basis": string | null,"fees_synced_at": string | null,"id": string,"is_sample": boolean,"last_synced_at": string | null,"marketplace_amended_at": string | null,"marketplace_cancelled_at": string | null,"marketplace_dispatch_by": string | null,"marketplace_fulfilment_status": string | null,"marketplace_status": string | null,"marketplace_updated_at": string | null,"new_order_alert_sent_at": string | null,"order_date": string,"order_number": string,"payment_status": Database["public"]['Enums']["payment_status"],"priority": Database["public"]['Enums']["priority_level"],"production_notes": string | null,"requires_review": boolean,"search_text": string | null,"shipping_address": NonNullable<Json>,"shipping_method": string | null,"shipping_total": number,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"subtotal": number,"tax_total": number,"total": number,"tracking_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_data_restricted_fields"?: (string)[],"customer_data_status"?: string,"customer_email"?: string | null,"customer_id"?: string | null,"customer_name": string,"customer_note"?: string | null,"discount_total"?: number,"dispatch_by"?: string | null,"dispatched_at"?: string | null,"external_order_id"?: string | null,"external_order_number"?: string | null,"fee_basis"?: string | null,"fees_synced_at"?: string | null,"id"?: string,"is_sample"?: boolean,"last_synced_at"?: string | null,"marketplace_amended_at"?: string | null,"marketplace_cancelled_at"?: string | null,"marketplace_dispatch_by"?: string | null,"marketplace_fulfilment_status"?: string | null,"marketplace_status"?: string | null,"marketplace_updated_at"?: string | null,"new_order_alert_sent_at"?: string | null,"order_date"?: string,"order_number"?: string,"payment_status"?: Database["public"]['Enums']["payment_status"],"priority"?: Database["public"]['Enums']["priority_level"],"production_notes"?: string | null,"requires_review"?: boolean,"search_text"?: never,"shipping_address"?: NonNullable<Json>,"shipping_method"?: string | null,"shipping_total"?: number,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_total"?: number,"total"?: number,"tracking_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "carrier"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_data_restricted_fields"?: (string)[],"customer_data_status"?: string,"customer_email"?: string | null,"customer_id"?: string | null,"customer_name"?: string,"customer_note"?: string | null,"discount_total"?: number,"dispatch_by"?: string | null,"dispatched_at"?: string | null,"external_order_id"?: string | null,"external_order_number"?: string | null,"fee_basis"?: string | null,"fees_synced_at"?: string | null,"id"?: string,"is_sample"?: boolean,"last_synced_at"?: string | null,"marketplace_amended_at"?: string | null,"marketplace_cancelled_at"?: string | null,"marketplace_dispatch_by"?: string | null,"marketplace_fulfilment_status"?: string | null,"marketplace_status"?: string | null,"marketplace_updated_at"?: string | null,"new_order_alert_sent_at"?: string | null,"order_date"?: string,"order_number"?: string,"payment_status"?: Database["public"]['Enums']["payment_status"],"priority"?: Database["public"]['Enums']["priority_level"],"production_notes"?: string | null,"requires_review"?: boolean,"search_text"?: never,"shipping_address"?: NonNullable<Json>,"shipping_method"?: string | null,"shipping_total"?: number,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_total"?: number,"total"?: number,"tracking_number"?: string | null,"updated_at"?: string
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
                },"print_run_units": {
                  Row: {
                    "created_at": string,"outcome": string,"print_run_id": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"outcome"?: string,"print_run_id": string,"unit_id": string
                  }
                  Update: {
                    "created_at"?: string,"outcome"?: string,"print_run_id"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_run_units_print_run_id_fkey"
      columns: ["print_run_id"]
isOneToOne: false
      referencedRelation: "print_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_run_units_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "production_units"
      referencedColumns: ["id"]
    }
                  ]
                },"print_runs": {
                  Row: {
                    "attempt_number": number,"created_at": string,"ended_at": string | null,"ended_by": string | null,"estimated_minutes": number | null,"failure_reason": string | null,"filament_recorded": boolean,"id": string,"notes": string | null,"printer_id": string | null,"production_job_id": string,"quantity": number,"quantity_failed": number | null,"quantity_succeeded": number | null,"started_at": string,"started_by": string | null,"status": Database["public"]['Enums']["print_run_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_number"?: number,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"estimated_minutes"?: number | null,"failure_reason"?: string | null,"filament_recorded"?: boolean,"id"?: string,"notes"?: string | null,"printer_id"?: string | null,"production_job_id": string,"quantity"?: number,"quantity_failed"?: number | null,"quantity_succeeded"?: number | null,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["print_run_status"],"updated_at"?: string
                  }
                  Update: {
                    "attempt_number"?: number,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"estimated_minutes"?: number | null,"failure_reason"?: string | null,"filament_recorded"?: boolean,"id"?: string,"notes"?: string | null,"printer_id"?: string | null,"production_job_id"?: string,"quantity"?: number,"quantity_failed"?: number | null,"quantity_succeeded"?: number | null,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["print_run_status"],"updated_at"?: string
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
                    "attempt_count": number,"board_position": number,"cancellation_reason": string | null,"cancelled_at": string | null,"colour": string | null,"completed_at": string | null,"created_at": string,"due_date": string | null,"estimated_filament_g": number | null,"estimated_print_minutes": number | null,"failed_attempts": number,"id": string,"is_sample": boolean,"job_number": string,"material": string | null,"notes": string | null,"order_id": string,"order_item_id": string,"print_requirements": string | null,"printer_id": string | null,"priority": Database["public"]['Enums']["priority_level"],"product_id": string | null,"quantity": number,"quantity_passed": number,"quantity_pending": number,"quantity_printed": number,"quantity_printing": number,"quantity_surplus": number,"stage": Database["public"]['Enums']["production_stage"],"stage_before_hold": Database["public"]['Enums']["production_stage"] | null,"stage_changed_at": string,"started_at": string | null,"units_failed": number,"updated_at": string,"job_has_physical_work": boolean | null
                  }
                  ComputedFields: "job_has_physical_work"
                  Insert: {
                    "attempt_count"?: number,"board_position"?: number,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"colour"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"estimated_filament_g"?: number | null,"estimated_print_minutes"?: number | null,"failed_attempts"?: number,"id"?: string,"is_sample"?: boolean,"job_number"?: string,"material"?: string | null,"notes"?: string | null,"order_id": string,"order_item_id": string,"print_requirements"?: string | null,"printer_id"?: string | null,"priority"?: Database["public"]['Enums']["priority_level"],"product_id"?: string | null,"quantity": number,"quantity_passed"?: number,"quantity_pending"?: number,"quantity_printed"?: number,"quantity_printing"?: number,"quantity_surplus"?: number,"stage"?: Database["public"]['Enums']["production_stage"],"stage_before_hold"?: Database["public"]['Enums']["production_stage"] | null,"stage_changed_at"?: string,"started_at"?: string | null,"units_failed"?: number,"updated_at"?: string
                  }
                  Update: {
                    "attempt_count"?: number,"board_position"?: number,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"colour"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"estimated_filament_g"?: number | null,"estimated_print_minutes"?: number | null,"failed_attempts"?: number,"id"?: string,"is_sample"?: boolean,"job_number"?: string,"material"?: string | null,"notes"?: string | null,"order_id"?: string,"order_item_id"?: string,"print_requirements"?: string | null,"printer_id"?: string | null,"priority"?: Database["public"]['Enums']["priority_level"],"product_id"?: string | null,"quantity"?: number,"quantity_passed"?: number,"quantity_pending"?: number,"quantity_printed"?: number,"quantity_printing"?: number,"quantity_surplus"?: number,"stage"?: Database["public"]['Enums']["production_stage"],"stage_before_hold"?: Database["public"]['Enums']["production_stage"] | null,"stage_changed_at"?: string,"started_at"?: string | null,"units_failed"?: number,"updated_at"?: string
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
                },"production_units": {
                  Row: {
                    "completed_without_print": boolean,"created_at": string,"failed_attempts": number,"id": string,"last_print_run_id": string | null,"passed_at": string | null,"printed_at": string | null,"printed_personalisation": string | null,"printed_variant": string | null,"production_job_id": string,"status": Database["public"]['Enums']["unit_status"],"status_reason": string | null,"unit_number": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_without_print"?: boolean,"created_at"?: string,"failed_attempts"?: number,"id"?: string,"last_print_run_id"?: string | null,"passed_at"?: string | null,"printed_at"?: string | null,"printed_personalisation"?: string | null,"printed_variant"?: string | null,"production_job_id": string,"status"?: Database["public"]['Enums']["unit_status"],"status_reason"?: string | null,"unit_number": number,"updated_at"?: string
                  }
                  Update: {
                    "completed_without_print"?: boolean,"created_at"?: string,"failed_attempts"?: number,"id"?: string,"last_print_run_id"?: string | null,"passed_at"?: string | null,"printed_at"?: string | null,"printed_personalisation"?: string | null,"printed_variant"?: string | null,"production_job_id"?: string,"status"?: Database["public"]['Enums']["unit_status"],"status_reason"?: string | null,"unit_number"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_units_last_print_run_id_fkey"
      columns: ["last_print_run_id"]
isOneToOne: false
      referencedRelation: "print_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_units_production_job_id_fkey"
      columns: ["production_job_id"]
isOneToOne: false
      referencedRelation: "production_jobs"
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
                    "carrier": string | null,"checklist": NonNullable<Json>,"created_at": string,"dispatched_at": string | null,"dispatched_by": string | null,"external_fulfilment_id": string | null,"id": string,"marketplace_push_attempts": number,"marketplace_push_error": string | null,"marketplace_push_error_category": string | null,"marketplace_push_last_attempt_at": string | null,"marketplace_push_status": Database["public"]['Enums']["marketplace_push_status"],"marketplace_pushed_at": string | null,"order_id": string,"packaging_notes": string | null,"packed_at": string | null,"packed_by": string | null,"shipping_cost": number | null,"shipping_method": string | null,"status": Database["public"]['Enums']["shipment_status"],"tracking_number": string | null,"tracking_url": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"dispatched_at"?: string | null,"dispatched_by"?: string | null,"external_fulfilment_id"?: string | null,"id"?: string,"marketplace_push_attempts"?: number,"marketplace_push_error"?: string | null,"marketplace_push_error_category"?: string | null,"marketplace_push_last_attempt_at"?: string | null,"marketplace_push_status"?: Database["public"]['Enums']["marketplace_push_status"],"marketplace_pushed_at"?: string | null,"order_id": string,"packaging_notes"?: string | null,"packed_at"?: string | null,"packed_by"?: string | null,"shipping_cost"?: number | null,"shipping_method"?: string | null,"status"?: Database["public"]['Enums']["shipment_status"],"tracking_number"?: string | null,"tracking_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "carrier"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"dispatched_at"?: string | null,"dispatched_by"?: string | null,"external_fulfilment_id"?: string | null,"id"?: string,"marketplace_push_attempts"?: number,"marketplace_push_error"?: string | null,"marketplace_push_error_category"?: string | null,"marketplace_push_last_attempt_at"?: string | null,"marketplace_push_status"?: Database["public"]['Enums']["marketplace_push_status"],"marketplace_pushed_at"?: string | null,"order_id"?: string,"packaging_notes"?: string | null,"packed_at"?: string | null,"packed_by"?: string | null,"shipping_cost"?: number | null,"shipping_method"?: string | null,"status"?: Database["public"]['Enums']["shipment_status"],"tracking_number"?: string | null,"tracking_url"?: string | null,"updated_at"?: string
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
                },"sync_failure_events": {
                  Row: {
                    "actor_id": string | null,"actor_label": string | null,"created_at": string,"error": string | null,"event": string,"failure_id": string,"id": string,"note": string | null,"sync_log_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"error"?: string | null,"event": string,"failure_id": string,"id"?: string,"note"?: string | null,"sync_log_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"error"?: string | null,"event"?: string,"failure_id"?: string,"id"?: string,"note"?: string | null,"sync_log_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_failure_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_failure_events_failure_id_fkey"
      columns: ["failure_id"]
isOneToOne: false
      referencedRelation: "sync_failures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_failure_events_sync_log_id_fkey"
      columns: ["sync_log_id"]
isOneToOne: false
      referencedRelation: "sync_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_failures": {
                  Row: {
                    "attempts": number,"created_at": string,"dismiss_reason": string | null,"dismissed_at": string | null,"dismissed_by": string | null,"external_order_id": string,"first_failed_at": string,"id": string,"integration_id": string | null,"last_error": string,"last_failed_at": string,"last_sync_log_id": string | null,"marketplace_updated_at": string | null,"payload": NonNullable<Json>,"provider": Database["public"]['Enums']["integration_provider"],"reopened_at": string | null,"reopened_by": string | null,"resolved_at": string | null,"resolved_sync_log_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"dismiss_reason"?: string | null,"dismissed_at"?: string | null,"dismissed_by"?: string | null,"external_order_id": string,"first_failed_at"?: string,"id"?: string,"integration_id"?: string | null,"last_error": string,"last_failed_at"?: string,"last_sync_log_id"?: string | null,"marketplace_updated_at"?: string | null,"payload": NonNullable<Json>,"provider": Database["public"]['Enums']["integration_provider"],"reopened_at"?: string | null,"reopened_by"?: string | null,"resolved_at"?: string | null,"resolved_sync_log_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"dismiss_reason"?: string | null,"dismissed_at"?: string | null,"dismissed_by"?: string | null,"external_order_id"?: string,"first_failed_at"?: string,"id"?: string,"integration_id"?: string | null,"last_error"?: string,"last_failed_at"?: string,"last_sync_log_id"?: string | null,"marketplace_updated_at"?: string | null,"payload"?: NonNullable<Json>,"provider"?: Database["public"]['Enums']["integration_provider"],"reopened_at"?: string | null,"reopened_by"?: string | null,"resolved_at"?: string | null,"resolved_sync_log_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_failures_dismissed_by_fkey"
      columns: ["dismissed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_failures_integration_id_fkey"
      columns: ["integration_id"]
isOneToOne: false
      referencedRelation: "integrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_failures_last_sync_log_id_fkey"
      columns: ["last_sync_log_id"]
isOneToOne: false
      referencedRelation: "sync_logs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_failures_reopened_by_fkey"
      columns: ["reopened_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_failures_resolved_sync_log_id_fkey"
      columns: ["resolved_sync_log_id"]
isOneToOne: false
      referencedRelation: "sync_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_logs": {
                  Row: {
                    "created_at": string,"cursor_from": string | null,"cursor_to": string | null,"duration_ms": number | null,"error_details": Json | null,"error_message": string | null,"failures_outstanding": number,"finished_at": string | null,"id": string,"integration_id": string | null,"orders_created": number,"orders_failed": number,"orders_fetched": number,"orders_recovered": number,"orders_retried": number,"orders_updated": number,"pages_fetched": number,"provider": Database["public"]['Enums']["integration_provider"],"started_at": string,"status": Database["public"]['Enums']["sync_status"],"trigger": Database["public"]['Enums']["sync_trigger"],"triggered_by": string | null,"warnings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cursor_from"?: string | null,"cursor_to"?: string | null,"duration_ms"?: number | null,"error_details"?: Json | null,"error_message"?: string | null,"failures_outstanding"?: number,"finished_at"?: string | null,"id"?: string,"integration_id"?: string | null,"orders_created"?: number,"orders_failed"?: number,"orders_fetched"?: number,"orders_recovered"?: number,"orders_retried"?: number,"orders_updated"?: number,"pages_fetched"?: number,"provider": Database["public"]['Enums']["integration_provider"],"started_at"?: string,"status"?: Database["public"]['Enums']["sync_status"],"trigger": Database["public"]['Enums']["sync_trigger"],"triggered_by"?: string | null,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"cursor_from"?: string | null,"cursor_to"?: string | null,"duration_ms"?: number | null,"error_details"?: Json | null,"error_message"?: string | null,"failures_outstanding"?: number,"finished_at"?: string | null,"id"?: string,"integration_id"?: string | null,"orders_created"?: number,"orders_failed"?: number,"orders_fetched"?: number,"orders_recovered"?: number,"orders_retried"?: number,"orders_updated"?: number,"pages_fetched"?: number,"provider"?: Database["public"]['Enums']["integration_provider"],"started_at"?: string,"status"?: Database["public"]['Enums']["sync_status"],"trigger"?: Database["public"]['Enums']["sync_trigger"],"triggered_by"?: string | null,"warnings"?: NonNullable<Json>
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
"apply_order_cancellation":
{ Args: { "p_actor_label"?: string,"p_order_id": string,"p_reason"?: string,"p_source": string }; Returns: Json
                           },
"assert_can_write":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"assert_order_shippable":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"assign_job_to_printer":
{ Args: { "p_job_id": string,"p_printer_id": string }; Returns: undefined
                           },
"begin_fulfilment_submission":
{ Args: { "p_provider": Database["public"]['Enums']["integration_provider"],"p_request": Json,"p_shipment_id": string,"p_user": string }; Returns: Json
                           },
"can_write":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"claim_new_order_alerts":
{ Args: { "p_limit"?: number }; Returns: string[]
                           },
"close_unstarted_job":
{ Args: { "p_job_id": string,"p_reason": string }; Returns: undefined
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
"dismiss_sync_failure":
{ Args: { "p_failure_id": string,"p_reason": string }; Returns: undefined
                           },
"finish_fulfilment_submission":
{ Args: { "p_error_category"?: string,"p_error_message"?: string,"p_external_id"?: string,"p_http_status"?: number,"p_response"?: Json,"p_retryable"?: boolean,"p_status": string,"p_submission_id": string }; Returns: undefined
                           },
"finish_print_run":
{ Args: { "p_failed_count"?: number,"p_failed_unit_ids"?: (string)[],"p_failure_reason"?: string,"p_notes"?: string,"p_requeue"?: boolean,"p_run_id": string,"p_succeeded": boolean }; Returns: undefined
                           },
"import_marketplace_listing":
{ Args: { "p_action": string,"p_listing": Json,"p_product_id"?: string,"p_source": Database["public"]['Enums']["integration_provider"] }; Returns: Json
                           },
"ingest_marketplace_order":
{ Args: { "p_actor_label"?: string,"p_force"?: boolean,"p_items": Json,"p_order": Json,"p_source": Database["public"]['Enums']["order_source"] }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_team_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"job_has_physical_work":
{ Args: { "p_job": Omit<Database["public"]['Tables']["production_jobs"]['Row'], Database["public"]['Tables']["production_jobs"]['ComputedFields']> }; Returns: boolean
                           },
"job_outstanding_units":
{ Args: { "p_job_id": string }; Returns: number
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
"marketplace_order_fingerprint":
{ Args: { "p_order_id": string }; Returns: string
                           },
"merge_customers":
{ Args: { "p_source": string,"p_target": string }; Returns: undefined
                           },
"purge_sample_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"raise_order_review":
{ Args: { "p_actor_label"?: string,"p_details": Json,"p_fingerprint": string,"p_item_id": string,"p_job_id": string,"p_kind": string,"p_message": string,"p_order_id": string,"p_severity": string,"p_source"?: string,"p_title": string }; Returns: boolean
                           },
"record_order_fees":
{ Args: { "p_basis": string,"p_lines": Json,"p_order_id": string }; Returns: undefined
                           },
"record_qc_failure":
{ Args: { "p_count"?: number,"p_job_id": string,"p_reason": string,"p_unit_ids"?: (string)[] }; Returns: number
                           },
"record_sync_failure":
{ Args: { "p_actor_id"?: string,"p_actor_label"?: string,"p_error": string,"p_external_order_id": string,"p_marketplace_updated_at": string,"p_payload": Json,"p_provider": Database["public"]['Enums']["integration_provider"],"p_sync_log_id": string }; Returns: Json
                           },
"refresh_job_unit_counts":
{ Args: { "p_job_id": string }; Returns: undefined
                           },
"refresh_order_status":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"release_new_order_alerts":
{ Args: { "p_order_ids": (string)[] }; Returns: undefined
                           },
"reopen_cancelled_order":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"reopen_sync_failure":
{ Args: { "p_failure_id": string,"p_note"?: string }; Returns: undefined
                           },
"resolve_order_review":
{ Args: { "p_note"?: string,"p_resolution": string,"p_review_id": string }; Returns: Json
                           },
"resolve_sync_failure":
{ Args: { "p_actor_id"?: string,"p_actor_label"?: string,"p_external_order_id": string,"p_provider": Database["public"]['Enums']["integration_provider"],"p_sync_log_id": string }; Returns: boolean
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
{ Args: { "p_job_id": string,"p_printer_id": string,"p_quantity"?: number,"p_unit_ids"?: (string)[] }; Returns: string
                           },
"sync_job_units":
{ Args: { "p_job_id": string,"p_reason"?: string }; Returns: Json
                           }
          }
          Enums: {
            "filament_usage_kind": "print"|"failed_print"|"adjustment"|"waste","integration_provider": "etsy"|"shopify"|"vinted","integration_status": "not_connected"|"connected"|"error"|"disabled","marketplace_push_status": "not_required"|"pending"|"sent"|"failed","order_source": "etsy"|"shopify"|"manual"|"vinted","order_status": "new"|"in_production"|"ready_to_pack"|"packed"|"dispatched"|"completed"|"on_hold"|"cancelled","payment_status": "pending"|"paid"|"partially_paid"|"partially_refunded"|"refunded"|"voided"|"unknown","print_run_status": "printing"|"succeeded"|"failed"|"cancelled","printer_status": "available"|"printing"|"paused"|"maintenance"|"offline","priority_level": "low"|"normal"|"high"|"urgent","production_stage": "new_order"|"awaiting_preparation"|"ready_to_print"|"printing"|"quality_check"|"ready_to_pack"|"dispatched"|"completed"|"on_hold","queue_status": "queued"|"active"|"done"|"removed","shipment_status": "pending"|"packed"|"dispatched"|"delivered"|"returned"|"cancelled","sync_status": "running"|"success"|"partial"|"failed","sync_trigger": "scheduled"|"manual"|"initial"|"webhook"|"resync","unit_status": "pending"|"printing"|"printed"|"passed"|"cancelled"|"surplus","user_role": "owner"|"admin"|"staff"|"viewer"
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
            "filament_usage_kind": ["print", "failed_print", "adjustment", "waste"],"integration_provider": ["etsy", "shopify", "vinted"],"integration_status": ["not_connected", "connected", "error", "disabled"],"marketplace_push_status": ["not_required", "pending", "sent", "failed"],"order_source": ["etsy", "shopify", "manual", "vinted"],"order_status": ["new", "in_production", "ready_to_pack", "packed", "dispatched", "completed", "on_hold", "cancelled"],"payment_status": ["pending", "paid", "partially_paid", "partially_refunded", "refunded", "voided", "unknown"],"print_run_status": ["printing", "succeeded", "failed", "cancelled"],"printer_status": ["available", "printing", "paused", "maintenance", "offline"],"priority_level": ["low", "normal", "high", "urgent"],"production_stage": ["new_order", "awaiting_preparation", "ready_to_print", "printing", "quality_check", "ready_to_pack", "dispatched", "completed", "on_hold"],"queue_status": ["queued", "active", "done", "removed"],"shipment_status": ["pending", "packed", "dispatched", "delivered", "returned", "cancelled"],"sync_status": ["running", "success", "partial", "failed"],"sync_trigger": ["scheduled", "manual", "initial", "webhook", "resync"],"unit_status": ["pending", "printing", "printed", "passed", "cancelled", "surplus"],"user_role": ["owner", "admin", "staff", "viewer"]
          }
        }
} as const
