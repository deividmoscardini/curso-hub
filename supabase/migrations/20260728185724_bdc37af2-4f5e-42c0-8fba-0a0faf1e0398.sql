
CREATE POLICY "solic_arq_select_dono_ou_aprovador" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'solicitacoes-arquivos'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.tem_papel(auth.uid(), 'aprovador'))
);

CREATE POLICY "solic_arq_insert_dono" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'solicitacoes-arquivos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "solic_arq_delete_dono" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'solicitacoes-arquivos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
