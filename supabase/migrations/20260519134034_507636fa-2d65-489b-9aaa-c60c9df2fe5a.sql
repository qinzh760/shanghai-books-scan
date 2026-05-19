-- Add approval columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Existing users (any with a role) should be considered approved
UPDATE public.profiles p
SET approval_status = 'approved', approved_at = now()
WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id);

-- Replace handle_new_user: first user becomes admin+approved, others start pending with no role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;

  INSERT INTO public.profiles (id, email, full_name, approval_status, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    CASE WHEN user_count = 0 THEN 'approved' ELSE 'pending' END,
    CASE WHEN user_count = 0 THEN now() ELSE NULL END
  );

  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admins can view all profiles (already allowed via existing policy via has_role OR id), keep as-is.

-- Approve user RPC
CREATE OR REPLACE FUNCTION public.approve_user(target_user_id uuid, new_role app_role DEFAULT 'viewer')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;

  UPDATE public.profiles
  SET approval_status = 'approved',
      approved_at = now(),
      approved_by = auth.uid()
  WHERE id = target_user_id;

  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, new_role);
END $$;

-- Reject user RPC
CREATE OR REPLACE FUNCTION public.reject_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject users';
  END IF;

  UPDATE public.profiles
  SET approval_status = 'rejected',
      approved_at = now(),
      approved_by = auth.uid()
  WHERE id = target_user_id;

  DELETE FROM public.user_roles WHERE user_id = target_user_id;
END $$;