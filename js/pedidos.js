import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.MONTAE_CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.MONTAE_CONFIG.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ============ ORDEM DAS CAMADAS ============
const LAYER_ORDER = [
  'bun-bottom', 'ketchup', 'maionese', 'molho-especial',
  'lettuce', 'tomato', 'onion',
  'patty', 'extra-patty', 'cheese', 'bacon', 'calabresa', 'egg',
  'straw', 'doritos', 'bun-top'
];

// ============ ESTADO ============
let pedidos = [];
let somLigado = true;
let ultimoPedidoImpresso = null;
let mapaCamadas = {};
let retiradaAtiva = false;
let filtroStatus = 'todos';

// ============ CARREGAR NOMES E CAMADAS ============
async function carregarNomes() {
  const [ing, inc] = await Promise.all([
    supabase.from('ingredientes').select('id, nome, layer, ordem'),
    supabase.from('inclusos').select('id, nome, layer, ordem')
  ]);

  mapaCamadas = {};

  (ing.data || []).forEach(i => {
    mapaCamadas[i.id] = { nome: i.nome, layer: i.layer, ordem: i.ordem || 0 };
  });
  (inc.data || []).forEach(i => {
    mapaCamadas[i.id] = { nome: i.nome, layer: i.layer, ordem: i.ordem || 0 };
  });

  console.log('camadas mapeadas:', Object.keys(mapaCamadas).length);
}

// ============ ORDENAR EXTRAS ============
function ordenarExtras(camadas, inclusos) {
  const lista = [];

  if (camadas) {
    Object.entries(camadas).forEach(([id, q]) => {
      if (!q || q <= 0) return;
      const info = mapaCamadas[id];
      if (!info) return;
      lista.push({ nome: info.nome, layer: info.layer, ordem: info.ordem, qtd: q });
    });
  }

  if (inclusos) {
    Object.entries(inclusos).forEach(([id, marcado]) => {
      if (!marcado) return;
      const info = mapaCamadas[id];
      if (!info) return;
      lista.push({ nome: info.nome, layer: info.layer, ordem: info.ordem, qtd: 1 });
    });
  }

  return lista.sort((a, b) => {
    const ia = LAYER_ORDER.indexOf(a.layer);
    const ib = LAYER_ORDER.indexOf(b.layer);
    const pa = ia === -1 ? 999 : ia;
    const pb = ib === -1 ? 999 : ib;
    if (pa !== pb) return pa - pb;
    return a.ordem - b.ordem;
  });
}

// ============ RETIRADA (configuração) ============
async function carregarRetirada() {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'retirada_ativa')
    .maybeSingle();

  if (error) {
    console.error('Erro ao ler retirada_ativa:', error.message);
    return;
  }

  retiradaAtiva = data ? String(data.valor).trim().toLowerCase() === 'true' : false;
  atualizarBotaoRetirada();
}

function atualizarBotaoRetirada() {
  const btn = $('btnRetirada');
  if (!btn) return;
  btn.textContent = retiradaAtiva ? 'Retirada: ativada' : 'Retirada: desativada';
  btn.classList.toggle('ativo', retiradaAtiva);
}

async function alternarRetirada() {
  const novo = !retiradaAtiva;

  const { error } = await supabase
    .from('configuracoes')
    .upsert(
      { chave: 'retirada_ativa', valor: novo ? 'true' : 'false' },
      { onConflict: 'chave' }
    );

  if (error) {
    console.error('Erro ao salvar retirada_ativa:', error.message);
    alert('Não foi possível alterar a retirada.');
    return;
  }

  retiradaAtiva = novo;
  atualizarBotaoRetirada();
  console.log('Retirada agora:', retiradaAtiva ? 'ativada' : 'desativada');
}

// ============ CARREGAR PEDIDOS ============
async function carregarPedidos() {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      id, total, status, criado_em, endereco_snapshot, user_id,
      pedido_itens ( nome, quantidade, preco_unitario, tipo, camadas, inclusos, observacao )
    `)
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    console.error('ERRO pedidos:', error.message);
    $('corpoTabela').innerHTML = `<tr><td colspan="8" class="empty-state">Erro ao carregar: ${esc(error.message)}</td></tr>`;
    return;
  }

  const ids = [...new Set((data || []).map(p => p.user_id))];
  let perfis = {};
  if (ids.length) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, nome, telefone')
      .in('id', ids);
    (prof || []).forEach(p => { perfis[p.id] = p; });
  }

  pedidos = (data || []).map(p => ({ ...p, perfil: perfis[p.user_id] || {} }));
  renderTabela();
  atualizarFiltros();
  atualizarKpis();
}

// ============ FILTROS ============
function atualizarFiltros() {
  document.querySelectorAll('.filtro-chip').forEach(btn => {
    const f = btn.dataset.filtro;
    const qtd = f === 'todos'
      ? pedidos.length
      : pedidos.filter(p => p.status === f).length;

    const label = btn.dataset.label || f;
    btn.innerHTML = `${label}<span class="contador">${qtd}</span>`;
    btn.classList.toggle('active', f === filtroStatus);
  });
}

// ============ RENDER DA TABELA ============
function renderTabela() {
  const corpo = $('corpoTabela');

  const lista = filtroStatus === 'todos'
    ? pedidos
    : pedidos.filter(p => p.status === filtroStatus);

  if (!lista.length) {
    corpo.innerHTML = `<tr><td colspan="8" class="empty-state">${
      pedidos.length ? 'Nenhum pedido com este status.' : 'Nenhum pedido ainda.'
    }</td></tr>`;
    return;
  }

  corpo.innerHTML = lista.map(p => {
    const itens = (p.pedido_itens || []).map(i => {
      const extras = ordenarExtras(i.camadas, i.inclusos);
      const nomes = extras.map(e => e.qtd > 1 ? `${e.nome} (${e.qtd})` : e.nome);
      const detalhe = nomes.length
        ? `<br><span style="color:var(--text-muted);font-size:0.72rem">${esc(nomes.join(', '))}</span>`
        : '';
      return `<li><span class="qtd">${i.quantidade}×</span> ${esc(i.nome)}${detalhe}</li>`;
    }).join('');

    const end = p.endereco_snapshot || {};
    const isRetirada = end.tipo === 'retirada';

    const enderecoHtml = isRetirada
      ? `<div class="rotulo" style="color:var(--accent-text)">Retirada no local</div><span style="font-size:0.75rem">Cliente busca no balcão</span>`
      : `<div class="rotulo">${esc(end.rotulo || 'Casa')}</div>
         ${esc(end.rua || '')}, ${esc(end.numero || '')}<br>
         ${esc(end.bairro || '')} — ${esc(end.cidade || '')}/${esc(end.estado || '')}`;

    const hora = new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tel = (p.perfil?.telefone || '').replace(/\D/g, '');

    return `
      <tr>
        <td class="pedido-id">#${p.id.slice(0, 6)}</td>
        <td>
          <div class="cliente-nome">${esc(p.perfil?.nome || 'Cliente')}</div>
          <div class="cliente-tel">${esc(p.perfil?.telefone || '—')}</div>
        </td>
        <td><ul class="itens-lista">${itens || '<li>—</li>'}</ul></td>
        <td class="total-cell">${fmt(p.total)}</td>
        <td class="endereco-cell">${enderecoHtml}</td>
        <td>
          <select class="status-select status-${esc(p.status)}" data-status-sel="${p.id}">
            <option value="pendente" ${p.status === 'pendente' ? 'selected' : ''}>Pendente</option>
            <option value="preparando" ${p.status === 'preparando' ? 'selected' : ''}>Preparando</option>
            <option value="entrega" ${p.status === 'entrega' ? 'selected' : ''}>Em entrega</option>
            <option value="entregue" ${p.status === 'entregue' ? 'selected' : ''}>Entregue</option>
            <option value="cancelado" ${p.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </td>
        <td>${hora}</td>
        <td>
          <div class="acoes">
            <button class="btn-wa" data-wa="${p.id}" title="Enviar confirmação no WhatsApp" ${tel ? '' : 'disabled'}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z"/>
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/>
              </svg>
            </button>
            <button class="btn-mini" data-print="${p.id}" title="Reimprimir">🖨</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============ KPIs ============
function atualizarKpis() {
  const hoje = new Date().toDateString();
  const doDia = pedidos.filter(p => new Date(p.criado_em).toDateString() === hoje);
  const faturamento = doDia.reduce((s, p) => s + Number(p.total || 0), 0);
  const pendentes = pedidos.filter(p => p.status === 'pendente').length;

  $('kpiHoje').textContent = doDia.length;
  $('kpiFaturamento').textContent = fmt(faturamento);
  $('kpiPendentes').textContent = pendentes;
}

// ============ WHATSAPP ============
function montarMensagem(p) {
  const end = p.endereco_snapshot || {};
  const linhas = [];

  linhas.push(`*Pedido #${p.id.slice(0, 6)} — montaí*`);
  linhas.push('');
  linhas.push('*Itens:*');

  (p.pedido_itens || []).forEach(i => {
    linhas.push(`• ${i.quantidade}× ${i.nome} — ${fmt(Number(i.preco_unitario) * i.quantidade)}`);

    const extras = ordenarExtras(i.camadas, i.inclusos);
    const nomes = extras.map(e => e.qtd > 1 ? `${e.nome} (${e.qtd})` : e.nome);
    if (nomes.length) linhas.push(`   _${nomes.join(', ')}_`);
    if (i.observacao) linhas.push(`   Obs: ${i.observacao}`);
  });

  linhas.push('');
  linhas.push(`*Total: ${fmt(p.total)}*`);
  linhas.push('');
  linhas.push('*Entrega:*');

  if (end.tipo === 'retirada') {
    linhas.push('Retirada no local — cliente busca no balcão');
  } else {
    linhas.push(`${end.rotulo || 'Casa'} — ${end.rua || ''}, ${end.numero || ''}`);
    if (end.complemento) linhas.push(end.complemento);
    linhas.push(`${end.bairro || ''} — ${end.cidade || ''}/${end.estado || ''}`);
    linhas.push(`CEP ${end.cep || ''}`);
  }

  linhas.push('');
  linhas.push('*Qual será a forma de pagamento?*');
  linhas.push('Pix, cartão ou dinheiro?');

  return linhas.join('\n');
}

function abrirWhatsApp(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;

  const tel = (p.perfil?.telefone || '').replace(/\D/g, '');
  if (!tel) { alert('Cliente sem telefone cadastrado.'); return; }

  const numero = tel.startsWith('55') ? tel : '55' + tel;
  const msg = encodeURIComponent(montarMensagem(p));
  window.open(`https://wa.me/${numero}?text=${msg}`, '_blank');
}

// ============ IMPRESSÃO ============
function imprimirCupom(p) {
  const end = p.endereco_snapshot || {};

  const itens = (p.pedido_itens || []).map(i => {
    const extras = ordenarExtras(i.camadas, i.inclusos);
    const nomes = extras.map(e => e.qtd > 1 ? `${e.nome} (${e.qtd})` : e.nome).join(', ');
    const linhaExtras = nomes ? `<div style="font-size:9px;padding-left:8px">${esc(nomes)}</div>` : '';
    return `<div class="cupom-item"><span>${i.quantidade}× ${esc(i.nome)}</span><span>${fmt(Number(i.preco_unitario) * i.quantidade)}</span></div>${linhaExtras}`;
  }).join('');

  const entregaHtml = end.tipo === 'retirada'
    ? '<div><strong>RETIRADA NO LOCAL</strong></div><div>Cliente busca no balcão</div>'
    : `<div><strong>ENTREGA</strong></div>
       <div>${esc(end.rotulo || 'Casa')}</div>
       <div>${esc(end.rua || '')}, ${esc(end.numero || '')}</div>
       <div>${esc(end.bairro || '')}</div>
       <div>${esc(end.cidade || '')}/${esc(end.estado || '')}</div>`;

  $('cupomArea').innerHTML = `
    <div class="cupom-titulo">montaí</div>
    <div style="text-align:center;font-size:10px">Pedido #${p.id.slice(0, 6)}</div>
    <div style="text-align:center;font-size:10px">${new Date(p.criado_em).toLocaleString('pt-BR')}</div>
    <div class="cupom-linha"></div>
    <div><strong>${esc(p.perfil?.nome || 'Cliente')}</strong></div>
    <div>${esc(p.perfil?.telefone || '')}</div>
    <div class="cupom-linha"></div>
    ${itens}
    <div class="cupom-linha"></div>
    <div class="cupom-item cupom-total"><span>TOTAL</span><span>${fmt(p.total)}</span></div>
    <div class="cupom-linha"></div>
    ${entregaHtml}
    <div class="cupom-linha"></div>
    <div style="text-align:center;font-size:10px">Obrigado!</div>
  `;

  window.print();
}

// ============ SOM ============
function tocarAlerta() {
  if (!somLigado) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

// ============ REALTIME ============
function assinarRealtime() {
  supabase
    .channel('pedidos-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, async (payload) => {
      console.log('Novo pedido:', payload.new.id);
      await carregarPedidos();

      const novo = pedidos.find(p => p.id === payload.new.id);
      if (novo && novo.id !== ultimoPedidoImpresso) {
        ultimoPedidoImpresso = novo.id;
        tocarAlerta();
        imprimirCupom(novo);
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, async () => {
      await carregarPedidos();
    })
    .subscribe((status) => {
      console.log('Realtime:', status);
      $('liveStatus').textContent = status === 'SUBSCRIBED' ? 'ao vivo' : 'reconectando...';
    });
}

// ============ EVENTOS ============
document.addEventListener('click', (e) => {
  const wa = e.target.closest('[data-wa]');
  if (wa) { abrirWhatsApp(wa.dataset.wa); return; }

  const pr = e.target.closest('[data-print]');
  if (pr) {
    const p = pedidos.find(x => x.id === pr.dataset.print);
    if (p) imprimirCupom(p);
    return;
  }
});

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-status-sel]');
  if (!sel) return;

  const { error } = await supabase
    .from('pedidos')
    .update({ status: sel.value })
    .eq('id', sel.dataset.statusSel);

  if (error) {
    console.error('Erro ao atualizar status:', error.message);
    alert('Não foi possível atualizar o status.');
    return;
  }

  sel.className = 'status-select status-' + sel.value;
});

$('filtrosBar').addEventListener('click', (e) => {
  const chip = e.target.closest('.filtro-chip');
  if (!chip) return;
  filtroStatus = chip.dataset.filtro;
  renderTabela();
  atualizarFiltros();
});

$('btnSom').addEventListener('click', () => {
  somLigado = !somLigado;
  $('btnSom').textContent = somLigado ? '🔔 Som: ligado' : '🔕 Som: desligado';
});

$('btnRetirada').addEventListener('click', alternarRetirada);

// ============ INIT ============
(async () => {
  await carregarNomes();
  await carregarRetirada();
  await carregarPedidos();
  assinarRealtime();
})();
