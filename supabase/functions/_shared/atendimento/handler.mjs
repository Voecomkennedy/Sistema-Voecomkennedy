// Candidato sem entrypoint publicável. Auth e fonte injetados para testes locais.
export function createHandler({ enabled = false, verifyUser, serviceFor, allowedOrigin }) {
    return async request => {
        const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
        if (!enabled) return response(503, { erro: 'Atendimento desativado.' });
        if (request.headers.get('origin') !== allowedOrigin) return response(403, { erro: 'Origem inválida.' });
        if (request.method !== 'POST') return response(405, { erro: 'Método inválido.' });
        try {
            const user = await verifyUser(request.headers.get('authorization'));
            if (!user?.id) return response(401, { erro: 'Sessão inválida.' });
            const body = await request.json();
            if (Object.keys(body).some(k => !['acao', 'search'].includes(k)) || body.acao !== 'listar' || (body.search !== undefined && typeof body.search !== 'string')) return response(422, { erro: 'Ação inválida.' });
            const service = await serviceFor(user.id); // Proprietário vem exclusivamente de Auth.
            if (service?.mode !== 'sintetico') return response(503, { erro: 'Modo de atendimento indisponível.' });
            return response(200, { mode: 'sintetico', conversas: service.list(user.id, { search: body.search || '' }) });
        } catch { return response(401, { erro: 'Não foi possível validar a sessão ou atender a ação.' }); }
    };
}

// Reutiliza validação do Auth existente; não cria sessão ou credencial persistente.
export function verifyWithExistingAuth(client) {
    return async authorization => {
        const match = typeof authorization === 'string' && /^Bearer ([^\s]+)$/.exec(authorization);
        if (!match) return null;
        const result = await client.auth.getUser(match[1]);
        return result.error || !result.data?.user?.id ? null : { id:result.data.user.id };
    };
}
