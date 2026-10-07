-- Hardening: RLS on every table, partial unique indexes, Payment CHECK, append-only audit triggers.
-- The app connects as the table owner / BYPASSRLS Postgres role via DATABASE_URL, so Prisma is unaffected by RLS.
-- supabase-js (anon/authenticated) must read nothing: RLS on with NO policies + privileges revoked.

-- 1. RLS on every table in public (no policies = deny for non-bypass roles)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Defence in depth: the Supabase public roles get no privileges at all on app tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END $$;

-- 2. Unique among NON-DELETED rows (same index names as Prisma's @unique/@@unique so the schema stays in sync).
DO $$
DECLARE
  d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('GstRegistration_gstin_key',                       'GstRegistration',        '"gstin"'),
    ('User_email_key',                                  'User',                   '"email"'),
    ('Employee_code_key',                               'Employee',               '"code"'),
    ('Tender_organisationId_tenderNo_key',              'Tender',                 '"organisationId", "tenderNo"'),
    ('Site_code_key',                                   'Site',                   '"code"'),
    ('Project_code_key',                                'Project',                '"code"'),
    ('Project_tenderId_key',                            'Project',                '"tenderId"'),
    ('BoqItem_projectId_itemNo_key',                    'BoqItem',                '"projectId", "itemNo"'),
    ('DailyWorkReport_siteId_projectId_reportDate_key', 'DailyWorkReport',        '"siteId", "projectId", "reportDate"'),
    ('SubcontractorWorkOrder_workOrderNo_key',          'SubcontractorWorkOrder', '"workOrderNo"'),
    ('SubcontractorBill_workOrderId_billNo_key',        'SubcontractorBill',      '"workOrderId", "billNo"'),
    ('Invoice_gstRegistrationId_invoiceNo_key',         'Invoice',                '"gstRegistrationId", "invoiceNo"'),
    ('Attendance_employeeId_date_siteId_key',           'Attendance',             '"employeeId", "date", "siteId"'),
    ('PayrollRun_periodMonth_regionId_key',             'PayrollRun',             '"periodMonth", "regionId"'),
    ('Payslip_payrollRunId_employeeId_key',             'Payslip',                '"payrollRunId", "employeeId"'),
    ('PurchaseRequest_requestNo_key',                   'PurchaseRequest',        '"requestNo"'),
    ('PurchaseOrder_poNo_key',                          'PurchaseOrder',          '"poNo"'),
    ('VendorInvoice_vendorId_invoiceNo_key',            'VendorInvoice',          '"vendorId", "invoiceNo"')
  ) AS t(idx, tbl, cols)
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', d.idx);
    EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (%s) WHERE "deletedAt" IS NULL', d.idx, d.tbl, d.cols);
  END LOOP;
END $$;

-- 3. A payment settles at most one target (salary / expense / tax / PF payments have none).
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_one_allocation_target_chk" CHECK (
  (("invoiceId" IS NOT NULL)::int
 + ("subcontractorBillId" IS NOT NULL)::int
 + ("vendorInvoiceId" IS NOT NULL)::int
 + ("securityInstrumentId" IS NOT NULL)::int) <= 1
);

-- 4. Append-only audit tables. Only the guarded test-reset script sets app.allow_audit_reset = 'on'
--    (transaction-local); normal application code never does.
CREATE OR REPLACE FUNCTION public.block_append_only_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.allow_audit_reset', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER "AuditLog_append_only_row" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_change();
CREATE TRIGGER "AuditLog_append_only_truncate" BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_append_only_change();
CREATE TRIGGER "ApprovalAction_append_only_row" BEFORE UPDATE OR DELETE ON "ApprovalAction"
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_change();
CREATE TRIGGER "ApprovalAction_append_only_truncate" BEFORE TRUNCATE ON "ApprovalAction"
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_append_only_change();
