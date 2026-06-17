// ============================================
// Configuração da conexão com a nuvem (Supabase)
// ============================================
// Estas são as credenciais PÚBLICAS do projeto.
// A chave "publishable" é segura para ficar no front-end:
// o acesso aos dados é protegido por RLS (Row Level Security)
// configurado no Supabase.

const SUPABASE_CONFIG = {
    url: 'https://qryobmqrkzddcvlvgfrp.supabase.co',
    anonKey: 'sb_publishable_8hru3nmJDq2rBd0cCGFjCQ_ntunnzlX'
};

// Cria o cliente Supabase (a biblioteca é carregada via CDN antes deste arquivo)
let supabaseClient = null;

function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (typeof window.supabase === 'undefined') {
        console.error('Biblioteca Supabase não carregada. Verifique a tag <script> do CDN.');
        return null;
    }
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return supabaseClient;
}

// Disponibiliza globalmente
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
window.getSupabaseClient = getSupabaseClient;
