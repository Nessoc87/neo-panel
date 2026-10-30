-- Add detailed, independently priced concept lines to a service.
-- Existing records remain valid through the [] default and legacy single-line fallback.
ALTER TABLE public.servicios
ADD COLUMN IF NOT EXISTS conceptos_detalle jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.servicios
ADD CONSTRAINT servicios_conceptos_detalle_es_array
CHECK (jsonb_typeof(conceptos_detalle) = 'array');

COMMENT ON COLUMN public.servicios.conceptos_detalle IS
'Partidas de concepto del servicio, con cantidad, precio unitario, IVA y retencion por partida.';
