import {normalizeZapi} from '../../../../js/atendimento-adapters.mjs';
// Não aceita credenciais/configuração de envio. Habilitação real exige outra liberação.
export function createDisabledZapi({instance,connectedPhone}){
    return {mode:'desativado',normalize:payload=>normalizeZapi(payload,{instance,connectedPhone}),send(){throw Object.assign(new Error('Z-API real não disponível nesta fatia.'),{status:403});}};
}
