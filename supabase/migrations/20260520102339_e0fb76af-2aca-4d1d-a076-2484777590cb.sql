
-- Set search_path on remaining functions
alter function public.touch_updated_at() set search_path = public;
alter function public.cleanup_old_search_requests() set search_path = public;

-- Revoke public/anon execute on SECURITY DEFINER functions
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
