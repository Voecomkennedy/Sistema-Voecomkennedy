// Atribuição comercial explícita. Campos ausentes do legado permanecem não informados.
(function(root) {
    'use strict';
    const cliente = {"nao_informado": "Não informado", "indicacao": "Indicação", "grupo_promocoes": "Grupo de promoções", "instagram": "Instagram", "outro": "Outro"};
    const venda = {"nao_informado": "Não informado", "alerta_grupo": "Alerta do grupo", "atendimento_direto": "Atendimento direto", "indicacao": "Indicação", "instagram": "Instagram", "outro": "Outro"};
    const normalizar = valor => valor || 'nao_informado';
    function rotulo(tipo, valor) { return ({cliente, venda}[tipo])[normalizar(valor)] || 'Não informado'; }
    function validar(tipo, valor) {
        if (!Object.hasOwn({cliente, venda}[tipo], valor)) throw new Error('Origem comercial inválida. Selecione uma opção.');
        return valor;
    }
    function filtrar(registros, pessoas, filtros) {
        const contatos = new Map(pessoas.map(p => [String(p.id), p]));
        return registros.filter(v =>
            (!filtros.produto || filtros.produto === 'todos' || (v.tipoVenda === 'pacote' || v.isPacote ? 'pacote' : 'aereo') === filtros.produto) &&
            (!filtros.cliente || filtros.cliente === 'todos' || normalizar(contatos.get(String(v.clienteId))?.origemCliente) === filtros.cliente) &&
            (!filtros.venda || filtros.venda === 'todos' || normalizar(v.origemVenda) === filtros.venda));
    }
    const api = {cliente, venda, normalizar, rotulo, validar, filtrar};
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Atribuicao = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
