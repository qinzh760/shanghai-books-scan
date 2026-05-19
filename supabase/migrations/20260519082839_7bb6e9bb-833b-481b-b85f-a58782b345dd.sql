DROP POLICY IF EXISTS "Authenticated view verifications" ON public.verifications;
CREATE POLICY "Members view verifications" ON public.verifications
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'viewer'::app_role]));

DROP POLICY IF EXISTS "Authenticated view lines" ON public.verification_lines;
CREATE POLICY "Members view lines" ON public.verification_lines
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'viewer'::app_role]));

DROP POLICY IF EXISTS "Authenticated view receipts" ON public.receipts;
CREATE POLICY "Members view receipts" ON public.receipts
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'viewer'::app_role]));

DROP POLICY IF EXISTS "Authenticated view accounts" ON public.accounts;
CREATE POLICY "Members view accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'viewer'::app_role]));

DROP POLICY IF EXISTS "Authenticated view receipt files" ON storage.objects;
CREATE POLICY "Members view receipt files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'viewer'::app_role]));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;