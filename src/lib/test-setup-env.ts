/**
 * Setup de vitest: los tests no deben depender del entorno de quien los corre. Si el
 * shell o un .env trae PUBLIC_TRACKING_* o PUBLIC_WHATSAPP_NUMBER, `resolveTracking` y
 * el widget los verían y los tests de settings darían rojo por una variable ajena.
 * Se vacían todas (los nombres, derivados del catálogo); los tests que las quieren las
 * pasan explícitamente (`opts.env`) o con vi.stubEnv.
 */
import { vi } from 'vitest';
import { ENV_WHATSAPP } from './whatsapp';
import { PROVIDERS, envVarName } from './tracking';

for (const key of [...PROVIDERS.map((p) => p.key), 'googleAdsConversionLabel']) vi.stubEnv(envVarName(key), '');
vi.stubEnv(ENV_WHATSAPP, '');
