-- Vinted Pro as a third marketplace. Enum values are added in their own
-- migration: PostgreSQL cannot use a new enum value in the same transaction.
alter type public.order_source add value if not exists 'vinted';
alter type public.integration_provider add value if not exists 'vinted';
