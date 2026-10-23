-- Keep the invoice sequence in sync when a service is created directly as FACTURADO
-- with a manually entered numeric invoice number.
CREATE OR REPLACE FUNCTION public.servicios_avanzar_consecutivo_factura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secuencia_actual bigint;
  secuencia_llamada boolean;
  factura_numerica bigint;
BEGIN
  IF NEW.factura IS NULL
     OR btrim(NEW.factura) !~ '^[0-9]+$'
     OR length(btrim(NEW.factura)) > 18 THEN
    RETURN NEW;
  END IF;

  factura_numerica := btrim(NEW.factura)::bigint;

  SELECT last_value, is_called
    INTO secuencia_actual, secuencia_llamada
  FROM public.servicios_factura_seq;

  IF factura_numerica > secuencia_actual
     OR (factura_numerica = secuencia_actual AND NOT secuencia_llamada) THEN
    PERFORM setval(
      'public.servicios_factura_seq'::regclass,
      factura_numerica,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servicios_avanzar_consecutivo_factura_insert ON public.servicios;

CREATE TRIGGER servicios_avanzar_consecutivo_factura_insert
AFTER INSERT ON public.servicios
FOR EACH ROW
EXECUTE FUNCTION public.servicios_avanzar_consecutivo_factura();
