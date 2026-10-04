// O mesmo domínio puro serve à prévia no navegador e ao planejamento no backend.
// Este import local precisa acompanhar o bundle da Edge Function na futura implantação.
import * as shared from "../../../../js/messages-domain.mjs";
import type { Domain } from "./types.ts";

export const domain: Domain = shared as unknown as Domain;
