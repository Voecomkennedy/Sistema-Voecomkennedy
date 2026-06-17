# Sistema de Emissão de Passagens (Voecomkennedy)

## Visão Geral do Projeto
- **Nome**: Sistema de Emissão de Passagens
- **Objetivo**: Gerenciar a operação de uma agência de viagens — vendas de passagens aéreas, pacotes turísticos, cotações, cadastro de pessoas (clientes, passageiros e fornecedores) e alertas de check-in.
- **Tipo**: Aplicação web 100% estática (frontend), com persistência de dados no **LocalStorage** do navegador (sem backend/servidor).

## Funcionalidades Implementadas
- ✅ **Dashboard** (`/` ou `/index.html`): estatísticas do mês (vendas, faturamento, lucro, margem), alertas de check-in com contagem regressiva em tempo real e vendas recentes.
- ✅ **Vendas** (`/vendas.html`): cadastro/edição/exclusão de vendas, filtros por período/texto, mini-dashboard de estatísticas e autocomplete de aeroportos (IATA).
- ✅ **Pacotes** (`/pacotes.html`): cadastro de pacotes turísticos com voos (ida/volta), acomodação, passageiros, voucher e autocomplete de aeroportos.
- ✅ **Cotações** (`/cotacoes.html`): criação de cotações, status, geração de texto para envio e conversão de cotação em venda.
- ✅ **Pessoas** (`/pessoas.html`): cadastro unificado de clientes, passageiros e fornecedores.
- ✅ **Clientes** (`/clientes.html`): tela específica de clientes.
- ✅ **Check-in** (`/checkin.html`): acompanhamento de check-ins por proximidade da data de embarque.
- ✅ **Backup** (`/backup.html`): exportação e importação de todos os dados em JSON.

## URLs / Rotas Funcionais
| Caminho | Descrição |
|---|---|
| `/` ou `/index.html` | Dashboard |
| `/vendas.html` | Gestão de vendas |
| `/pacotes.html` | Pacotes turísticos |
| `/cotacoes.html` | Cotações |
| `/pessoas.html` | Pessoas (clientes/passageiros/fornecedores) |
| `/clientes.html` | Clientes |
| `/checkin.html` | Check-ins |
| `/backup.html` | Backup / Restauração |
| `/css/style.css` | Estilos |
| `/js/storage.js` | Camada de dados (LocalStorage) |
| `/js/utils.js` | Funções utilitárias |
| `/js/aeroportos.js` / `/js/aeroportos-data.js` | Base de aeroportos IATA + busca |

## Arquitetura de Dados
- **Modelos de dados** (chaves no LocalStorage):
  - `emissao_vendas` — vendas de passagens
  - `emissao_pessoas` — clientes, passageiros e fornecedores (campo `tipo`)
  - `emissao_pacotes` — pacotes turísticos
  - `emissao_cotacoes` — cotações
- **Serviço de armazenamento**: **LocalStorage do navegador** (sem banco de dados/servidor). Toda a lógica de dados está em `js/storage.js` (`StorageManager`).
- **Fluxo de dados**: as páginas leem/escrevem diretamente no LocalStorage via `StorageManager`; cotações podem ser convertidas em vendas (`converterCotacaoParaVenda`).

## Guia do Usuário
1. Acesse o **Dashboard** para ver o resumo do mês e os alertas de check-in.
2. Use **Pessoas/Clientes** para cadastrar clientes e fornecedores.
3. Em **Vendas**, registre as passagens vendidas (com origem/destino via autocomplete de aeroportos).
4. Em **Cotações**, crie orçamentos e converta em venda quando fechados.
5. Em **Pacotes**, monte pacotes turísticos completos.
6. Em **Check-in**, acompanhe os embarques próximos.
7. Em **Backup**, exporte/importe seus dados (arquivo JSON) — importante, pois os dados ficam apenas no navegador.

## Correções em relação ao site de origem
- **Marca atualizada** para **Voecomkennedy** em todas as páginas (navbar e PDF gerado).
- Adicionadas funções ausentes em `js/utils.js`: `parseLocalDate`, `formatarData`, `filtrarPorPeriodoEmbarque`.
- Adicionadas funções ausentes em `js/storage.js`: CRUD de **Pacotes** e **Cotações**, `addCliente/updateCliente/deleteCliente`, `calcularStatsPeriodo`, `converterCotacaoParaVenda` (e inclusão de pacotes/cotações em export/import/clearAll).
- Criado `js/aeroportos.js` (ausente no original) expondo `AEROPORTOS_IATA` e `AeroportosDB.buscar()`.
- **Cache-busting** (`?v=2`) em todos os JS/CSS para evitar que o navegador use versões antigas em cache (causa de divergências como "venda some do Dashboard").
- Dashboard reforçado: atualização periódica (5s), atualização ao focar/retornar à aba e proteção contra erros, garantindo que as vendas recentes sempre apareçam.

## Implantação
- **Plataforma**: Cloudflare Pages (site estático).
- **Status**: ✅ Ativo no sandbox de desenvolvimento.
- **Stack**: HTML + Bootstrap 5 + JavaScript (LocalStorage). Servido via Wrangler/Cloudflare Pages.
- **Build**: `npm run build` (copia `public/` → `dist/`).
- **Dev local**: `pm2 start ecosystem.config.cjs` → http://localhost:3000
- **Última atualização**: 2026-06-17

## Próximos Passos Recomendados
- (Opcional) Migrar a persistência para Cloudflare D1/KV caso seja necessário compartilhar dados entre dispositivos.
- (Opcional) Adicionar autenticação de acesso.
- (Opcional) Relatórios/gráficos consolidados por período.
