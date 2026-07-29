UPDATE public.perfis
SET papel = 'aprovador', tipo_area = 'interna', area = CASE WHEN area = '' THEN '+A Educação' ELSE area END
WHERE email = 'dmartins@maisaedu.com.br';