REVOKE EXECUTE ON FUNCTION public.approve_user(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid) TO authenticated;