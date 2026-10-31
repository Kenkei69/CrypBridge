-- Browser clients authenticate through Supabase, but application data is served
-- exclusively by the authenticated Fastify API. Table owners retain access.
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_payment_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_merchant_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_migrations ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE role_name text; table_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'profiles','conversations','messages','merchants','products',
        'purchase_intents','approval_snapshots','guardian_decisions',
        'payment_attempts','settlement_records','audit_events','app_migrations',
        'product_payment_options','payment_executions','mock_merchant_resources',
        'guardian_policies','spending_reservations','simulation_controls'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END $$;
