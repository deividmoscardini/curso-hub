
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tem_papel(uuid, public.papel_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_papel(uuid, public.papel_enum) TO authenticated, service_role;
