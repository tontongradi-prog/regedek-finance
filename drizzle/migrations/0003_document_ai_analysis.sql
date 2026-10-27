CREATE TABLE public.document_ai_analyses (
 document_id uuid PRIMARY KEY REFERENCES public.documents(id),
 result jsonb NOT NULL,
 model text NOT NULL,
 analyzed_by uuid NOT NULL,
 analyzed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_ai_analyses TO authenticated;
GRANT ALL ON public.document_ai_analyses TO service_role;
ALTER TABLE public.document_ai_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read document analysis" ON public.document_ai_analyses FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TABLE public.document_ai_access (
 id text PRIMARY KEY,
 message text NOT NULL,
 status integer NOT NULL,
 blocked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.document_ai_access TO service_role;
ALTER TABLE public.document_ai_access ENABLE ROW LEVEL SECURITY;