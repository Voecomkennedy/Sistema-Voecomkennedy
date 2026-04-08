// ===================================================================
// SCRIPT DE DIAGNÓSTICO DO LOCALSTORAGE
// Sistema de Emissão de Passagens - Mais Voo
// ===================================================================
// INSTRUÇÕES:
// 1. Abra o navegador na página do sistema
// 2. Pressione F12 para abrir o Console do Desenvolvedor
// 3. Copie e cole TODO este código no console
// 4. Pressione ENTER
// 5. Leia o relatório completo que será exibido
// ===================================================================

(function diagnosticoLocalStorage() {
    console.clear();
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold; font-size: 14px');
    console.log('%c  DIAGNÓSTICO DO LOCALSTORAGE - SISTEMA MAIS VOO', 'color: #D4AF37; font-weight: bold; font-size: 16px');
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold; font-size: 14px');
    console.log('');

    // Função auxiliar para formatar data
    function formatarData(dataString) {
        if (!dataString) return 'Data inválida';
        try {
            const data = new Date(dataString);
            return data.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return 'Formato inválido';
        }
    }

    // Função auxiliar para formatar valores monetários
    function formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(parseFloat(valor) || 0);
    }

    // 1. VERIFICAR SE EXISTE A CHAVE NO LOCALSTORAGE
    console.log('%c1️⃣ VERIFICANDO EXISTÊNCIA DOS DADOS', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');

    const dadosRaw = localStorage.getItem('emissao_vendas');

    if (!dadosRaw) {
        console.log('%c❌ NENHUM DADO ENCONTRADO!', 'color: #e74c3c; font-weight: bold; font-size: 13px');
        console.log('   A chave "emissao_vendas" não existe no localStorage.');
        console.log('   Isso significa que nenhuma venda foi registrada ainda.');
        console.log('');
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
        console.log('%cDiagnóstico concluído. Não há dados para analisar.', 'color: #95a5a6');
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
        return;
    }

    console.log('%c✅ Dados encontrados no localStorage', 'color: #27ae60; font-weight: bold');
    console.log(`   Tamanho bruto: ${(dadosRaw.length / 1024).toFixed(2)} KB`);
    console.log('');

    // 2. VERIFICAR FORMATO DOS DADOS
    console.log('%c2️⃣ VALIDANDO FORMATO DOS DADOS', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');

    let vendas;
    try {
        vendas = JSON.parse(dadosRaw);
        console.log('%c✅ JSON válido', 'color: #27ae60; font-weight: bold');
    } catch (e) {
        console.log('%c❌ ERRO: Formato JSON inválido!', 'color: #e74c3c; font-weight: bold');
        console.log(`   Erro: ${e.message}`);
        console.log('   Os dados estão corrompidos e não podem ser lidos.');
        console.log('');
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
        return;
    }

    if (!Array.isArray(vendas)) {
        console.log('%c❌ ERRO: Os dados não são um array!', 'color: #e74c3c; font-weight: bold');
        console.log(`   Tipo encontrado: ${typeof vendas}`);
        console.log('');
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
        return;
    }

    console.log('%c✅ Formato de array correto', 'color: #27ae60; font-weight: bold');
    console.log('');

    // 3. CONTAR VENDAS
    console.log('%c3️⃣ CONTAGEM DE VENDAS', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`   Total de vendas registradas: %c${vendas.length}`, 'color: #3498db; font-weight: bold; font-size: 16px');
    console.log('');

    if (vendas.length === 0) {
        console.log('%c⚠️  AVISO: Array vazio', 'color: #f39c12; font-weight: bold');
        console.log('   Existem dados salvos, mas nenhuma venda foi registrada.');
        console.log('');
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
        return;
    }

    // 4. ANALISAR DATAS DAS VENDAS
    console.log('%c4️⃣ ANÁLISE DE DATAS', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');

    const dataAtual = new Date();
    const mesAtual = dataAtual.getMonth();
    const anoAtual = dataAtual.getFullYear();

    let vendasMesAtual = 0;
    let vendasMesesAnteriores = 0;
    let vendasSemData = 0;

    const distribuicaoMensal = {};

    vendas.forEach((venda, index) => {
        const dataString = venda.dataVenda || venda.dataCadastro;

        if (!dataString) {
            vendasSemData++;
            return;
        }

        try {
            const dataVenda = new Date(dataString);
            const mesVenda = dataVenda.getMonth();
            const anoVenda = dataVenda.getFullYear();

            // Chave para distribuição mensal
            const chaveData = `${anoVenda}-${String(mesVenda + 1).padStart(2, '0')}`;
            distribuicaoMensal[chaveData] = (distribuicaoMensal[chaveData] || 0) + 1;

            if (mesVenda === mesAtual && anoVenda === anoAtual) {
                vendasMesAtual++;
            } else {
                vendasMesesAnteriores++;
            }
        } catch (e) {
            vendasSemData++;
        }
    });

    console.log(`   📅 Vendas do mês atual (${dataAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}): %c${vendasMesAtual}`, 'color: #27ae60; font-weight: bold');
    console.log(`   📆 Vendas de meses anteriores: %c${vendasMesesAnteriores}`, 'color: #95a5a6; font-weight: bold');

    if (vendasSemData > 0) {
        console.log(`   ⚠️  Vendas sem data válida: %c${vendasSemData}`, 'color: #f39c12; font-weight: bold');
    }

    console.log('');
    console.log('   Distribuição por mês:');

    const mesesOrdenados = Object.keys(distribuicaoMensal).sort().reverse();
    mesesOrdenados.slice(0, 6).forEach(mes => {
        const [ano, mesNum] = mes.split('-');
        const nomeMes = new Date(ano, parseInt(mesNum) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const quantidade = distribuicaoMensal[mes];
        const barra = '█'.repeat(Math.min(quantidade, 20));
        console.log(`   ${nomeMes.padEnd(25)} ${barra} ${quantidade}`);
    });
    console.log('');

    // 5. VERIFICAR ESTRUTURA E INTEGRIDADE DOS DADOS
    console.log('%c5️⃣ VERIFICAÇÃO DE INTEGRIDADE', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');

    const camposEsperados = ['id', 'nomeCliente', 'valorVenda', 'valorCusto', 'dataCadastro'];
    const camposOpcionais = ['dataVenda', 'valorMilhas', 'nomePassageiro', 'cpfPassageiro', 'destino', 'origem'];

    let vendasCompletas = 0;
    let vendasComProblemas = 0;
    const problemasEncontrados = [];

    vendas.forEach((venda, index) => {
        let temProblema = false;
        const problemas = [];

        // Verificar campos obrigatórios
        camposEsperados.forEach(campo => {
            if (!venda.hasOwnProperty(campo) || venda[campo] === null || venda[campo] === undefined || venda[campo] === '') {
                temProblema = true;
                problemas.push(`Campo "${campo}" ausente ou vazio`);
            }
        });

        // Verificar valores numéricos
        if (venda.valorVenda !== undefined && (isNaN(parseFloat(venda.valorVenda)) || parseFloat(venda.valorVenda) < 0)) {
            temProblema = true;
            problemas.push('Valor de venda inválido');
        }

        if (venda.valorCusto !== undefined && (isNaN(parseFloat(venda.valorCusto)) || parseFloat(venda.valorCusto) < 0)) {
            temProblema = true;
            problemas.push('Valor de custo inválido');
        }

        if (temProblema) {
            vendasComProblemas++;
            problemasEncontrados.push({
                indice: index,
                id: venda.id || 'sem ID',
                cliente: venda.nomeCliente || 'sem nome',
                problemas: problemas
            });
        } else {
            vendasCompletas++;
        }
    });

    console.log(`   ✅ Vendas íntegras: %c${vendasCompletas}`, 'color: #27ae60; font-weight: bold');

    if (vendasComProblemas > 0) {
        console.log(`   ⚠️  Vendas com problemas: %c${vendasComProblemas}`, 'color: #f39c12; font-weight: bold');
        console.log('');
        console.log('   Detalhes dos problemas (primeiras 5):');
        problemasEncontrados.slice(0, 5).forEach(prob => {
            console.log(`   • Venda #${prob.indice} (${prob.cliente}):`);
            prob.problemas.forEach(p => console.log(`     - ${p}`));
        });

        if (problemasEncontrados.length > 5) {
            console.log(`   ... e mais ${problemasEncontrados.length - 5} vendas com problemas`);
        }
    }
    console.log('');

    // 6. ESTATÍSTICAS FINANCEIRAS
    console.log('%c6️⃣ ESTATÍSTICAS FINANCEIRAS (MÊS ATUAL)', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');

    let totalVendas = 0;
    let totalCusto = 0;
    let totalMilhas = 0;
    let vendasContabilizadas = 0;

    vendas.forEach(venda => {
        const dataString = venda.dataVenda || venda.dataCadastro;
        if (!dataString) return;

        try {
            const dataVenda = new Date(dataString);
            if (dataVenda.getMonth() === mesAtual && dataVenda.getFullYear() === anoAtual) {
                totalVendas += parseFloat(venda.valorVenda) || 0;
                totalCusto += parseFloat(venda.valorCusto) || 0;
                totalMilhas += parseFloat(venda.valorMilhas) || 0;
                vendasContabilizadas++;
            }
        } catch (e) {
            // Ignorar vendas com data inválida
        }
    });

    const lucro = totalVendas - totalCusto;
    const margemLucro = totalVendas > 0 ? (lucro / totalVendas * 100) : 0;

    console.log(`   💰 Total em vendas:     ${formatarMoeda(totalVendas)}`);
    console.log(`   💸 Total em custos:     ${formatarMoeda(totalCusto)}`);
    console.log(`   ✈️  Total em milhas:    ${formatarMoeda(totalMilhas)}`);
    console.log(`   📊 Lucro bruto:         ${formatarMoeda(lucro)}`);
    console.log(`   📈 Margem de lucro:     ${margemLucro.toFixed(2)}%`);
    console.log(`   🧮 Vendas contabilizadas: ${vendasContabilizadas}`);
    console.log('');

    // 7. AMOSTRA DE DADOS
    console.log('%c7️⃣ AMOSTRA DE DADOS (ÚLTIMAS 3 VENDAS)', 'color: #2C3E50; font-weight: bold; font-size: 14px');
    console.log('───────────────────────────────────────────────────────────────');

    const ultimasVendas = vendas.slice(-3).reverse();

    ultimasVendas.forEach((venda, index) => {
        console.log(`   Venda #${vendas.length - index}:`);
        console.log(`   • Cliente: ${venda.nomeCliente || 'Não informado'}`);
        console.log(`   • Passageiro: ${venda.nomePassageiro || 'Não informado'}`);
        console.log(`   • Valor: ${formatarMoeda(venda.valorVenda)}`);
        console.log(`   • Data: ${formatarData(venda.dataVenda || venda.dataCadastro)}`);
        console.log(`   • Origem → Destino: ${venda.origem || '?'} → ${venda.destino || '?'}`);
        if (index < ultimasVendas.length - 1) console.log('');
    });
    console.log('');

    // 8. RESUMO FINAL
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
    console.log('%c  RESUMO DO DIAGNÓSTICO', 'color: #D4AF37; font-weight: bold; font-size: 15px');
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
    console.log('');

    const statusGeral = vendasComProblemas === 0 && vendasSemData === 0 ? '✅ EXCELENTE' :
                        vendasComProblemas < vendas.length * 0.1 ? '⚠️  ATENÇÃO' :
                        '❌ CRÍTICO';

    console.log(`   Status Geral: %c${statusGeral}`, 'font-weight: bold; font-size: 14px');
    console.log(`   Total de vendas: ${vendas.length}`);
    console.log(`   Vendas do mês: ${vendasMesAtual}`);
    console.log(`   Integridade: ${((vendasCompletas / vendas.length) * 100).toFixed(1)}%`);
    console.log(`   Faturamento mensal: ${formatarMoeda(totalVendas)}`);
    console.log('');

    // 9. RECOMENDAÇÕES
    if (vendasComProblemas > 0 || vendasSemData > 0) {
        console.log('%c⚠️  RECOMENDAÇÕES:', 'color: #f39c12; font-weight: bold; font-size: 13px');

        if (vendasSemData > 0) {
            console.log('   • Existem vendas sem data válida. Revise o cadastro.');
        }

        if (vendasComProblemas > 0) {
            console.log('   • Algumas vendas estão incompletas. Verifique os dados.');
        }

        console.log('   • Considere fazer um backup antes de qualquer correção.');
        console.log('');
    }

    // 10. DADOS COMPLETOS (OPCIONAL)
    console.log('%c💾 DADOS COMPLETOS', 'color: #7f8c8d; font-style: italic');
    console.log('   Para visualizar todos os dados, execute: console.table(JSON.parse(localStorage.getItem("emissao_vendas")))');
    console.log('   Para exportar os dados, execute: copy(localStorage.getItem("emissao_vendas"))');
    console.log('');

    console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');
    console.log('%cDiagnóstico concluído com sucesso!', 'color: #27ae60; font-weight: bold');
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: #D4AF37; font-weight: bold');

    // Retornar objeto com os dados para uso posterior
    return {
        totalVendas: vendas.length,
        vendasMesAtual,
        vendasMesesAnteriores,
        vendasCompletas,
        vendasComProblemas,
        totalVendas: totalVendas,
        totalCusto: totalCusto,
        lucro: lucro,
        margemLucro: margemLucro,
        dadosCompletos: vendas
    };
})();
