import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.MONTAE_CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.MONTAE_CONFIG.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let pedidos = [];
let somLigado = true;
let ultimoPedidoImpresso = null;
let nomesIngredientes = {};
let nomesInclusos = {};

async function carregarNomes() {
  const [ing, inc] = await Promise.all([
    supabase.from('ingredientes').select('id, nome'),
    supabase.from('inclusos').select('id, nome')
  ]);
  (ing.data || []).forEach(i => { nomesIngredientes[i.id] = i.nome; });
  (inc.data || []).forEach(i => { nomesInclusos[i.id] = i.nome; });
}

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
  atualizarKpis();
}

function renderTabela() {
  const corpo = $('corpoTabela');

  if (!pedidos.length) {
    corpo.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum pedido ainda.</td></tr>';
    return;
  }

  corpo.innerHTML = pedidos.map(p => {
    const itens = (p.pedido_itens || []).map(i => {
      const extras = [];
      if (i.camadas) {
        Object.entries(i.camadas).forEach(([id, q]) => {
          if (q > 0) extras.push(nomesIngredientes[id] || id);
        });
      }
      if (i.inclusos) {
        Object.entries(i.inclusos).forEach(([id, marcado]) => {
          if (marcado) extras.push(nomesInclusos[id] || id);
        });
      }
      const detalhe = extras.length ? `<br><span style="color:var(--text-muted);font-size:0.72rem">${esc(extras.join(', '))}</span>` : '';
      return `<li><span class="qtd">${i.quantidade}×</span> ${esc(i.nome)}${detalhe}</li>`;
    }).join('');

    const end = p.endereco_snapshot || {};
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
        <td class="endereco-cell">
          <div class="rotulo">${esc(end.rotulo || 'Casa')}</div>
          ${esc(end.rua || '')}, ${esc(end.numero || '')}<br>
          ${esc(end.bairro || '')} — ${esc(end.cidade || '')}/${esc(end.estado || '')}
        </td>
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

function atualizarKpis() {
  const hoje = new Date().toDateString();
  const doDia = pedidos.filter(p => new Date(p.criado_em).toDateString() === hoje);
  const faturamento = doDia.reduce((s, p) => s + Number(p.total || 0), 0);
  const pendentes = pedidos.filter(p => p.status === 'pendente').length;

  $('kpiHoje').textContent = doDia.length;
  $('kpiFaturamento').textContent = fmt(faturamento);
  $('kpiPendentes').textContent = pendentes;
}

function montarMensagem(p) {
  const end = p.endereco_snapshot || {};
  const linhas = [];

  linhas.push(`*Pedido #${p.id.slice(0, 6)} — montaê*`);
  linhas.push('');
  linhas.push('*Itens:*');

  (p.pedido_itens || []).forEach(i => {
    linhas.push(`• ${i.quantidade}× ${i.nome} — ${fmt(Number(i.preco_unitario) * i.quantidade)}`);
    const extras = [];
    if (i.camadas) {
      Object.entries(i.camadas).forEach(([id, q]) => {
        if (q > 0) extras.push(nomesIngredientes[id] || id);
      });
    }
    if (i.inclusos) {
      Object.entries(i.inclusos).forEach(([id, m]) => {
        if (m) extras.push(nomesInclusos[id] || id);
      });
    }
    if (extras.length) linhas.push(`   _${extras.join(', ')}_`);
    if (i.observacao) linhas.push(`   Obs: ${i.observacao}`);
  });

  linhas.push('');
  linhas.push(`*Total: ${fmt(p.total)}*`);
  linhas.push('');
  linhas.push('*Entrega:*');
  linhas.push(`${end.rotulo || 'Casa'} — ${end.rua || ''}, ${end.numero || ''}`);
  if (end.complemento) linhas.push(end.complemento);
  linhas.push(`${end.bairro || ''} — ${end.cidade || ''}/${end.estado || ''}`);
  linhas.push(`CEP ${end.cep || ''}`);
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

function imprimirCupom(p) {
  const end = p.endereco_snapshot || {};
  const itens = (p.pedido_itens || []).map(i =>
    `<div class="cupom-item"><span>${i.quantidade}× ${esc(i.nome)}</span><span>${fmt(Number(i.preco_unitario) * i.quantidade)}</span></div>`
  ).join('');

  $('cupomArea').innerHTML = `
    <div class="cupom-titulo">montaê</div>
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
    <div><strong>ENTREGA</strong></div>
    <div>${esc(end.rotulo || 'Casa')}</div>
    <div>${esc(end.rua || '')}, ${esc(end.numero || '')}</div>
    <div>${esc(end.bairro || '')}</div>
    <div>${esc(end.cidade || '')}/${esc(end.estado || '')}</div>
    <div class="cupom-linha"></div>
    <div style="text-align:center;font-size:10px">Obrigado!</div>
  `;

  window.print();
}

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

document.addEventListener('click', async (e) => {
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

$('btnSom').addEventListener('click', () => {
  somLigado = !somLigado;
  $('btnSom').textContent = somLigado ? '🔔 Som: ligado' : '🔕 Som: desligado';
});

(async () => {
  await carregarNomes();
  await carregarPedidos();
  assinarRealtime();
})();