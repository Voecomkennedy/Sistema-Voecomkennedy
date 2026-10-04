(function (root) {
    'use strict';
    function apiError(status = 0) {
        const message = status === 409
            ? 'As preferências mudaram em outra sessão. Suas edições foram mantidas; recarregue a versão atual antes de salvar novamente.'
            : status === 401 || status === 403
                ? 'Sua sessão não permite acessar a central. Entre novamente na sua conta.'
                : status === 400 || status === 422
                    ? 'Não foi possível aplicar esta ação. Confira os dados, as regras e a validade da tarefa.'
                    : 'Central indisponível neste ambiente. A integração de simulação pode não estar instalada ou a conexão falhou. Seus dados editados foram mantidos.';
        return Object.assign(new Error(message), { status });
    }
    function createMessagesApi(client) {
        async function request(acao, fields = {}) {
            if (!client?.functions?.invoke) throw apiError(503);
            let result;
            try { result = await client.functions.invoke('central-mensagens', { body: { acao, ...fields } }); }
            catch { throw apiError(); }
            if (!result) throw apiError(503);
            if (result.error) throw apiError(Number(result.error.context?.status || result.error.status) || 0);
            const data = result.data;
            if (!data || data.modo !== 'simulacao' || !data.preferencias || !Array.isArray(data.tarefas) || !Array.isArray(data.historico) || !Array.isArray(data.vendas)) throw apiError(503);
            return data;
        }
        return {
            listar: () => request('listar'),
            salvar: preferencias => request('salvar', { preferencias }),
            preparar: () => request('preparar'),
            controlar: (id, comando) => request('controlar', { id, comando }),
            simular: id => request('simular', { id })
        };
    }
    if (typeof module === 'object' && module.exports) module.exports = { createMessagesApi };
    else root.createMessagesApi = createMessagesApi;
})(typeof globalThis === 'undefined' ? this : globalThis);
