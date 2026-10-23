-- Assign automatic consecutive invoice numbers to new service records.
-- Existing invoice values are preserved; the next number follows the highest numeric value.
CREATE SEQUENCE IF NOT EXISTS public.servicios_factura_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  NO CYCLE;

DO $$
DECLARE
  max_factura bigint;
BEGIN
  SELECT COALESCE(
    MAX(btrim(factura)::bigint) FILTER (WHERE btrim(factura) ~ '^[0-9]+$'),
    0
  )
  INTO max_factura
  FROM public.servicios;

  PERFORM setval(
    'public.servicios_factura_seq'::regclass,
    GREATEST(max_factura + 1, 1),
    false
  );
END
$$;

CREATE OR REPLACE FUNCTION public.servicios_asignar_consecutivo_factura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.factura IS NULL OR btrim(NEW.factura) = '' THEN
    NEW.factura := nextval('public.servicios_factura_seq'::regclass)::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servicios_asignar_consecutivo_factura ON public.servicios;

CREATE TRIGGER servicios_asignar_consecutivo_factura
BEFORE INSERT ON public.servicios
FOR EACH ROW
EXECUTE FUNCTION public.servicios_asignar_consecutivo_factura();
