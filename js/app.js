import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 
const SUPABASE_URL = window.MONTAE_CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.MONTAE_CONFIG.SUPABASE_ANON_KEY;
 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
});
 
// ============ ESTADO ============
const catalogo = { categorias: [], ingredientes: [], inclusos: [], receitas: [], bebidas: [], extras: [] };
const montagem = { camadas: {}, inclusos: {}, observacao: '' };
const carrinho = { itens: [] };
 
let usuario = null;
let catAtiva = 'all';
let modoCadastro = false;
 
let enderecos = [];
let enderecoSelecionado = null;
let bairros = [];
 
let etapaCheckout = 'extras';
let qtdBatata = 0;
let batataSelecionada = null;
let bebidasSelecionadas = [];
let extrasNoCarrinho = [];
let receitasSelecionadas = [];
let itensCardapioNoCarrinho = [];
 
let precoBase = 12.00;
let inclusosPadrao = ['alface', 'tomate', 'cebola', 'ketchup', 'maionese'];
let idsFixo = ['pao-baixo', 'pao-cima', 'carne'];
let itensNaBase = ['pao-baixo', 'pao-cima', 'carne', 'alface', 'tomate', 'cebola', 'ketchup', 'maionese'];
let precosReceita = {};
 
let retiradaAtiva = false;
let tipoEntrega = 'entrega';
let pedidoEmFechamento = false;
let cupomAplicado = null;
 
let taxaPadrao = 5.00;
let cidadeFixa = 'Paulo Afonso';
let estadoFixo = 'BA';
const HORARIO_FUNCIONAMENTO = 'Quinta a domingo, 19h às 23:30';
const HORARIO_OBSERVACAO = 'Você pode fazer seu pedido antes da abertura';
 
const IMG_VERSION = Date.now();
 
const LAYER_ORDER = [
  'bun-bottom', 'ketchup', 'maionese', 'molho-especial',
  'patty', 'extra-patty', 'cheese', 'bacon', 'calabresa', 'egg',
 'lettuce', 'tomato', 'onion',
  'straw', 'doritos', 'bun-top'
];
 
// ============ HELPERS ============
const $ = (id) => document.getElementById(id);
const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 
function imgUrl(url) {
  if (!url) return '';
  return url + (url.includes('?') ? '&' : '?') + 'v=' + IMG_VERSION;
}
 
function emailInterno(telefone) {
  const digits = String(telefone).replace(/\D/g, '');
  return `${digits}@montae.local`;
}
 
function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}
 
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  $('toastHost').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 1800);
  setTimeout(() => el.remove(), 2200);
}
 
// ============ WHATSAPP ============
const WHATSAPP_NUMERO = '5575992227704';
function abrirWhatsApp(mensagem) {
  const texto = encodeURIComponent(mensagem || '');
  window.open('https://wa.me/' + WHATSAPP_NUMERO + '?text=' + texto, '_blank');
}
// ============ CATÁLOGO ============
async function carregarCatalogo() {
  const consultas = await Promise.all([
    supabase.from('categorias').select('*').order('ordem'),
    supabase.from('ingredientes').select('*').eq('ativo', true).order('ordem'),
    supabase.from('inclusos').select('*').eq('ativo', true).order('ordem'),
    supabase.from('receitas').select('*').order('nome'),
    supabase.from('bebidas').select('*').eq('ativo', true).order('ordem'),
    supabase.from('adicionais_extras').select('*').eq('ativo', true).order('ordem')
  ]);
 
  const nomes = ['categorias', 'ingredientes', 'inclusos', 'receitas', 'bebidas', 'extras'];
  consultas.forEach((r, i) => {
    if (r.error) console.error(`ERRO em ${nomes[i]}:`, r.error.message);
    else console.log(`${nomes[i]}: ${r.data?.length || 0} registros`);
  });
 
  catalogo.categorias = consultas[0].data || [];
  catalogo.ingredientes = consultas[1].data || [];
  catalogo.inclusos = consultas[2].data || [];
  catalogo.receitas = consultas[3].data || [];
  catalogo.bebidas = consultas[4].data || [];
  catalogo.extras = consultas[5].data || [];
}
 
async function carregarConfiguracoes() {
  const { data, error } = await supabase.from('configuracoes').select('*');
  if (error) { console.error('ERRO em configuracoes:', error.message); return; }
  (data || []).forEach(c => {
    if (c.chave === 'preco_base') precoBase = Number(c.valor);
    if (c.chave === 'inclusos_padrao') inclusosPadrao = c.valor.split(',').map(s => s.trim());
    if (c.chave === 'ids_fixos') idsFixo = c.valor.split(',').map(s => s.trim());
    if (c.chave === 'itens_na_base') itensNaBase = c.valor.split(',').map(s => s.trim());
    if (c.chave === 'retirada_ativa') {
      const v = String(c.valor).trim().toLowerCase();
      retiradaAtiva = (v === 'true' || v === '1' || v === 'sim');
    }
    if (c.chave === 'taxa_entrega_padrao') taxaPadrao = Number(c.valor) || 5.00;
    if (c.chave === 'cidade_fixa') cidadeFixa = c.valor;
    if (c.chave === 'estado_fixo') estadoFixo = c.valor;
  });
  // Retirada na loja sempre disponível (taxa 0,00)
  retiradaAtiva = true;
 
 
  if ($('endCidade')) $('endCidade').value = cidadeFixa;
  if ($('endEstado')) $('endEstado').value = estadoFixo;
 
  console.log('precoBase:', precoBase, '| retiradaAtiva:', retiradaAtiva, '| taxaPadrao:', taxaPadrao);
}
 
// ============ BAIRROS ============
async function carregarBairros() {
  const { data, error } = await supabase
    .from('bairros')
    .select('id, nome, taxa_entrega')
    .eq('ativo', true)
    .order('ordem');
 
  if (error) { console.error('ERRO em bairros:', error.message); return; }
 
  bairros = data || [];
 
  const sel = $('endBairro');
  if (sel) {
    sel.innerHTML = '<option value="">Selecione o bairro</option>' +
      bairros.map(b => `<option value="${b.id}">${esc(b.nome)} — ${fmt(b.taxa_entrega)}</option>`).join('');
  }
 
  console.log('bairros:', bairros.length);
}
 
function taxaDoBairro(nomeBairro) {
  const b = bairros.find(x => x.nome === nomeBairro);
  return b ? Number(b.taxa_entrega) : taxaPadrao;
}
 
async function carregarPrecosReceitas() {
  const { data, error } = await supabase
    .from('receita_itens')
    .select('receita_id, ingrediente_id, incluso_id, quantidade');
 
  if (error) { console.error('ERRO em receita_itens:', error.message); return; }
 
  const precoIng = {};
  catalogo.ingredientes.forEach(i => { precoIng[i.id] = Number(i.preco) || 0; });
 
  precosReceita = {};
 
  (data || []).forEach(it => {
    if (!it.ingrediente_id) return;
    if (itensNaBase.includes(it.ingrediente_id)) return;
    const preco = precoIng[it.ingrediente_id] || 0;
    const qtd = Number(it.quantidade) || 1;
    precosReceita[it.receita_id] = (precosReceita[it.receita_id] || 0) + preco * qtd;
  });
 
  console.log('precosReceita (só adicionais):', precosReceita);
}
 
function precoReceita(id) {
  return precoBase + (precosReceita[id] || 0);
}
 
// ============ ENDEREÇOS ============
async function carregarEnderecos() {
  if (!usuario) { enderecos = []; enderecoSelecionado = null; return; }
 
  const { data, error } = await supabase
    .from('enderecos')
    .select('*')
    .eq('user_id', usuario.id)
    .order('principal', { ascending: false })
    .order('criado_em', { ascending: false });
 
  if (error) {
    console.error('ERRO em enderecos:', error.message);
    enderecos = [];
    enderecoSelecionado = null;
    return;
  }
 
  enderecos = data || [];
  if (!enderecos.some(e => e.id === enderecoSelecionado)) {
    enderecoSelecionado = enderecos[0]?.id || null;
  }
  console.log('enderecos:', enderecos.length);
}
 
function renderEnderecosModal() {
  const host = $('listaEnderecos');
  if (!host) return;
 
  let html = '';
 
  if (retiradaAtiva) {
    html += `
      <label class="endereco-card retirada-compacta ${tipoEntrega === 'retirada' ? 'selected' : ''}">
        <input type="radio" name="tipoEntrega" value="retirada" ${tipoEntrega === 'retirada' ? 'checked' : ''}>
              <div>
        <div class="endereco-rotulo">Retirada na loja</div>
        <div class="meta" style="color:var(--accent-text)">Taxa: R$ 0,00</div>
      </div>
      </label>
    `;
  }
 
  if (!enderecos.length) {
    html += '<p class="empty-state">Nenhum endereço salvo. Cadastre o primeiro abaixo.</p>';
  } else {
    html += enderecos.map(e => {
      const taxa = taxaDoBairro(e.bairro);
      return `
        <label class="endereco-card ${tipoEntrega === 'entrega' && enderecoSelecionado === e.id ? 'selected' : ''}">
          <input type="radio" name="tipoEntrega" value="${e.id}" ${tipoEntrega === 'entrega' && enderecoSelecionado === e.id ? 'checked' : ''}>
          <div>
            <div class="endereco-rotulo">${esc(e.rotulo || 'Casa')}</div>
            <div class="meta">${esc(e.rua || '')}, ${esc(e.numero || '')} — ${esc(e.bairro || '')}</div>
            <div class="meta">${esc(e.cidade || cidadeFixa)}/${esc(e.estado || estadoFixo)}</div>
            <div class="meta" style="color:var(--accent-text)">Taxa: ${fmt(taxa)}</div>
          </div>
        </label>
      `;
    }).join('');
  }
 
  host.innerHTML = html;
 
  const form = $('formNovoEndereco');
  if (form) form.style.display = enderecos.length ? 'none' : 'block';
 
  const btnNovo = $('btnNovoEndereco');
  if (btnNovo) btnNovo.style.display = enderecos.length ? 'inline-flex' : 'none';
 
  atualizarTaxaEndereco();
  atualizarResumoCheckout();
}
 
function atualizarTaxaEndereco() {
  const label = $('taxaEnderecoLabel');
  if (!label) return;
 
  if (tipoEntrega === 'retirada') {
    label.textContent = 'Retirada no local — sem taxa de entrega';
    return;
  }
 
  const end = enderecos.find(x => x.id === enderecoSelecionado);
  if (!end) { label.textContent = ''; return; }
 
  const taxa = taxaDoBairro(end.bairro);
  label.textContent = `Taxa de entrega (${end.bairro}): ${fmt(taxa)}`;
}
 
// ============ RESUMO DE VALORES NO CHECKOUT ============
function calcularTaxaAtual() {
  if (tipoEntrega === 'retirada') return 0;
  const end = enderecos.find(x => x.id === enderecoSelecionado);
  if (!end) return 0;
  return taxaDoBairro(end.bairro);
}
 
function atualizarResumoCheckout() {
  const subEl = $('resumoSubtotal');
  const taxaEl = $('resumoTaxa');
  const totEl = $('resumoTotal');
  if (!subEl || !taxaEl || !totEl) return;
  const subtotal = carrinho.itens.reduce((s, i) => s + i.preco, 0);
  const taxa = calcularTaxaAtual();
  const base = subtotal + taxa;
  const desconto = calcularDesconto(base);
  subEl.textContent = fmt(subtotal);
  taxaEl.textContent = tipoEntrega === 'retirada'
    ? 'Grátis'
    : (taxa > 0 ? fmt(taxa) : 'A confirmar');
  const linhaDesc = $('linhaDesconto');
  const elDesc = $('resumoDesconto');
  if (linhaDesc && elDesc) {
    if (desconto > 0) {
      linhaDesc.style.display = 'flex';
      elDesc.textContent = '-' + fmt(desconto);
    } else {
      linhaDesc.style.display = 'none';
    }
  }
  totEl.textContent = fmt(Math.max(0, base - desconto));
}
 
async function salvarEndereco() {
  if (!usuario) { abrirLogin(); return; }
 
  const rotulo = ($('endRotulo')?.value || '').trim() || 'Casa';
  const rua = ($('endRua')?.value || '').trim();
  const numero = ($('endNumero')?.value || '').trim();
  const bairroId = $('endBairro')?.value || '';
 
  if (!rua || !numero || !bairroId) {
    toast('Preencha rua, número e bairro.');
    return;
  }
 
  const bairro = bairros.find(b => b.id === bairroId);
  if (!bairro) { toast('Bairro inválido.'); return; }
 
  const { data, error } = await supabase.from('enderecos').insert({
    user_id: usuario.id,
    rotulo, rua, numero,
    complemento: ($('endComplemento')?.value || '').trim(),
    bairro: bairro.nome,
    cidade: cidadeFixa,
    estado: estadoFixo,
    principal: enderecos.length === 0
  }).select().single();
 
  if (error) { toast('Erro ao salvar endereço: ' + error.message); return; }
 
  await carregarEnderecos();
  enderecoSelecionado = data.id;
  tipoEntrega = 'entrega';
  renderEnderecosModal();
  toast('Endereço salvo!');
}
 
// ============ CHECKOUT EM ETAPAS ============
function abrirCheckout() {
  etapaCheckout = 'extras';
  qtdBatata = 0;
  batataSelecionada = null;
  bebidasSelecionadas = [];
  extrasNoCarrinho = [];
  tipoEntrega = 'entrega';
  renderEtapa();
  $('checkoutOverlay').classList.add('open');
}
 
function renderEtapa() {
  const passos = ['extras', 'endereco'];
  const mapa = { extras: 'etapaExtras', endereco: 'etapaEndereco' };
 
  passos.forEach(p => {
    const el = $(mapa[p]);
    if (el) el.style.display = (p === etapaCheckout) ? 'block' : 'none';
  });
 
  const idx = passos.indexOf(etapaCheckout);
  document.querySelectorAll('.step-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
    d.classList.toggle('done', i < idx);
  });
 
  if (etapaCheckout === 'extras') {
    renderBatata();
    renderBebidas();
  }
  if (etapaCheckout === 'endereco') {
    renderCheckoutItens();
    renderEnderecosModal();
    atualizarResumoCheckout();
  }
}
 
function renderBatata() {
  const host = $('listaBatata');
  if (!host) return;
 
  if (!catalogo.extras.length) {
    host.innerHTML = '<p class="empty-state">Nenhum adicional disponível.</p>';
    return;
  }
 
  host.innerHTML = catalogo.extras.map(x => `
    <div class="upsell-card">
      ${x.imagem_url ? `<img src="${imgUrl(x.imagem_url)}" alt="${esc(x.nome)}" class="upsell-img">` : ''}
      <div class="upsell-info">
        <div class="upsell-nome">${esc(x.nome)}</div>
        ${x.descricao ? `<div class="upsell-desc">${esc(x.descricao)}</div>` : ''}
        <div class="upsell-preco">${fmt(x.preco)}</div>
      </div>
      <div class="upsell-ctrl">
        <div class="qty-control">
          <button type="button" data-bat-dec="${x.id}">−</button>
          <span id="batQtd-${x.id}">${qtdBatata}</span>
          <button type="button" data-bat-inc="${x.id}">+</button>
        </div>
      </div>
    </div>
  `).join('');
 
  atualizarQtdBatata();
}
 
function atualizarQtdBatata() {
  const label = $('batataTotal');
  if (label) label.textContent = qtdBatata > 0
    ? `${qtdBatata} porção${qtdBatata > 1 ? 'ões' : ''}`
    : '';
}
 
function renderBebidas() {
  const host = $('listaBebidas');
  if (!host) return;
  if (!catalogo.bebidas.length) {
    host.innerHTML = '<p class="empty-state">Nenhuma bebida disponível.</p>';
    return;
  }
  host.innerHTML = catalogo.bebidas.map(b => `
    <label class="bebida-card ${bebidasSelecionadas.includes(b.id) ? 'selected' : ''}">
      <input type="checkbox" name="bebSel" value="${b.id}" ${bebidasSelecionadas.includes(b.id) ? 'checked' : ''}>
      ${b.imagem_url ? `<img src="${imgUrl(b.imagem_url)}" alt="${esc(b.nome)}" class="bebida-img">` : ''}
      <div class="bebida-info">
        <div class="bebida-nome">${esc(b.nome)}</div>
        ${b.tamanho ? `<div class="bebida-tam">${esc(b.tamanho)}</div>` : ''}
        <div class="bebida-preco">${fmt(b.preco)}</div>
      </div>
    </label>
  `).join('');
}
 
function irParaEtapa(etapa) {
  etapaCheckout = etapa;
  renderEtapa();
}
 
function confirmarExtras() {
  if (!usuario) { abrirLogin(); return; }
  // Remove os itens de extras que foram adicionados numa confirmação anterior
  if (extrasNoCarrinho.length) {
    carrinho.itens = carrinho.itens.filter(i => !extrasNoCarrinho.includes(i));
    extrasNoCarrinho = [];
  }
  if (qtdBatata > 0) {
    const batata = batataSelecionada
      ? catalogo.extras.find(x => x.id === batataSelecionada)
      : catalogo.extras[0];
    if (batata) {
      const item = {
        nome: batata.nome,
        tipo: 'adicional',
        camadas: {},
        inclusos: {},
        observacao: '',
        preco: Number(batata.preco) * qtdBatata,
        quantidade: qtdBatata
      };
      carrinho.itens.push(item);
      extrasNoCarrinho.push(item);
    }
  }
  bebidasSelecionadas.forEach(idBebida => {
    const b = catalogo.bebidas.find(x => x.id === idBebida);
    if (!b) return;
    const item = {
      nome: b.nome + (b.tamanho ? ' ' + b.tamanho : ''),
      tipo: 'bebida',
      camadas: {},
      inclusos: {},
      observacao: '',
      preco: Number(b.preco),
      quantidade: 1
    };
    carrinho.itens.push(item);
    extrasNoCarrinho.push(item);
  });
  renderCarrinho();
  irParaEtapa('endereco');
}
 
// ============ MONTAGEM ============
function montagemPadrao() {
  montagem.camadas = {};
  montagem.inclusos = {};
  catalogo.inclusos.forEach(i => { montagem.inclusos[i.id] = false; });
  // Marca como selecionados os inclusos com padrao = true na tabela inclusos
  catalogo.inclusos.forEach(i => {
    if (i.padrao === true) montagem.inclusos[i.id] = true;
  });
  // Mantém compatibilidade com a lista da tabela configuracoes
  inclusosPadrao.forEach(id => {
    if (catalogo.inclusos.some(i => i.id === id)) montagem.inclusos[id] = true;
  });
  const paoBaixo = catalogo.ingredientes.find(i => i.layer === 'bun-bottom');
  const carne = catalogo.ingredientes.find(i => i.id === 'carne' || i.layer === 'patty');
  const paoCima = catalogo.ingredientes.find(i => i.layer === 'bun-top');
  if (paoBaixo) montagem.camadas[paoBaixo.id] = 1;
  if (carne) montagem.camadas[carne.id] = 1;
  if (paoCima) montagem.camadas[paoCima.id] = 1;
  montagem.observacao = '';
  $('obsText').value = '';
  $('obsCounter').textContent = '0/200';
}
 
function setQtd(id, qtd) {
  if (qtd <= 0) delete montagem.camadas[id];
  else montagem.camadas[id] = qtd;
  renderIngredientes();
  renderBurger();
  renderResumo();
  atualizarTotais();
}
 
function precoMontagem() {
  let total = precoBase;
 
  Object.entries(montagem.camadas).forEach(([id, q]) => {
    if (itensNaBase.includes(id)) return;
    const ing = catalogo.ingredientes.find(i => i.id === id);
    if (ing) total += Number(ing.preco) * q;
  });
 
  catalogo.inclusos.forEach(inc => {
    if (!montagem.inclusos[inc.id]) return;
    if (itensNaBase.includes(inc.id)) return;
    const preco = Number(inc.preco) || 0;
    if (preco > 0) total += preco;
  });
 
  return total;
}
 
function camadasVisuais() {
  const lista = [];
 
  catalogo.inclusos.forEach(inc => {
    if (montagem.inclusos[inc.id] && inc.imagem_url) {
      lista.push({ layer: inc.layer, url: inc.imagem_url, nome: inc.nome });
    }
  });
 
  Object.entries(montagem.camadas).forEach(([id, q]) => {
    const ing = catalogo.ingredientes.find(i => i.id === id);
    if (!ing || !ing.imagem_url) return;
    for (let n = 0; n < q; n++) {
      lista.push({ layer: ing.layer, url: ing.imagem_url, nome: ing.nome });
    }
  });
 
  return lista.sort((a, b) => {
    const ia = LAYER_ORDER.indexOf(a.layer);
    const ib = LAYER_ORDER.indexOf(b.layer);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}
 
// ============ RENDER ============
function renderChips() {
  const html = ['<button class="chip active" data-cat="all">Todos</button>']
    .concat(catalogo.categorias.map(c => `<button class="chip" data-cat="${c.id}">${esc(c.nome)}</button>`));
  const host = $('chipsCategoria');
  if (!host) return;
  host.innerHTML = html.join('');
}
 
function renderInclusos() {
  $('listaInclusos').innerHTML = catalogo.inclusos.map(i => `
    <label class="incluso-chip ${montagem.inclusos[i.id] ? 'selected' : ''}">
      <input type="checkbox" data-incluso="${i.id}" ${montagem.inclusos[i.id] ? 'checked' : ''}>
      <span class="chip-check">
        <svg viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5 L5 9 L10 3" stroke="#0A0A0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span>${esc(i.nome)}</span>
    </label>
  `).join('');
}
 
function renderIngredientes() {
  const cats = catalogo.categorias.filter(c => catAtiva === 'all' || c.id === catAtiva);
 
  $('listaIngredientes').innerHTML = cats.map(cat => {
    const itens = catalogo.ingredientes.filter(i =>
      i.categoria_id === cat.id && !idsFixo.includes(i.id)
    );
    if (!itens.length) return '';
 
    return `
      <div class="section-head"><h2>${esc(cat.nome)}</h2></div>
      ${itens.map(item => {
        const q = montagem.camadas[item.id] || 0;
        const ctrl = q === 0
          ? `<button class="add-btn" data-add="${item.id}">+</button>`
          : `<div class="qty-control">
               <button data-dec="${item.id}">−</button>
               <span>${q}</span>
               <button data-inc="${item.id}">+</button>
             </div>`;
        return `
          <div class="ingredient-row">
            <div class="ingredient-info">
              <span class="ingredient-name">${esc(item.nome)}</span>
              <span class="ingredient-desc">${esc(item.descricao || '')}</span>
            </div>
            <div class="ingredient-right">
              <span class="ingredient-price">${fmt(item.preco)}</span>
              ${ctrl}
            </div>
          </div>`;
      }).join('')}
    `;
  }).join('');
}
 
function renderBurger() {
  const camadas = camadasVisuais();
  const stack = $('burgerStack');
  const empty = $('emptyStage');
 
  if (!camadas.length) {
    stack.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  stack.innerHTML = camadas.map(c => `
    <div class="layer" data-layer="${c.layer}">
      <img src="${imgUrl(c.url)}" alt="${esc(c.nome)}">
    </div>
  `).join('');
}
 
function renderResumo() {
  const itens = [];
  catalogo.inclusos.forEach(i => {
    if (montagem.inclusos[i.id]) itens.push(`<li class="incluso">${esc(i.nome)}</li>`);
  });
  Object.entries(montagem.camadas).forEach(([id, q]) => {
    const ing = catalogo.ingredientes.find(i => i.id === id);
    if (ing) itens.push(`<li>${q}× ${esc(ing.nome)}</li>`);
  });
  $('summaryList').innerHTML = itens.length ? itens.join('') : '<li class="incluso">Nenhum item ainda</li>';
  $('burgerPrice').textContent = fmt(precoMontagem());
}
 
function renderCarrinho() {
  const lista = $('listaCarrinho');
  if (!carrinho.itens.length) {
    lista.innerHTML = '<li class="empty-state">Seu carrinho está vazio.</li>';
  } else {
    const itensOrdenados = ordenarItensPorTipo(carrinho.itens);
    lista.innerHTML = itensOrdenados.map((i, idx) => `
      <li class="drawer-item">
        <div>
          <div>${esc(i.nome)}</div>
          <div class="meta">${i.tipo === 'montagem'
            ? Object.values(i.camadas).reduce((s, q) => s + q, 0) + ' complementos'
            : (i.quantidade > 1 ? i.quantidade + '×' : 'Item extra')}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span>${fmt(i.preco)}</span>
          <button class="btn-ghost" data-remove-item="${idx}" style="padding:4px 8px;">×</button>
        </div>
      </li>
    `).join('');
  }
  $('cartCount').textContent = carrinho.itens.length;
  const totalCarrinho = carrinho.itens.reduce((s, i) => s + i.preco, 0);
  const elTotal = $('carrinhoTotal');
  if (elTotal) elTotal.textContent = fmt(totalCarrinho);
  atualizarTotais();
}
 
function renderReceitas() {
  const host = $('listaReceitas');
  if (!host) return;
  if (!catalogo.receitas.length) {
    host.innerHTML = '<p class="empty-state">Nenhuma receita cadastrada.</p>';
    return;
  }
  host.innerHTML = catalogo.receitas.map(r => {
    const sel = receitasSelecionadas.find(x => x.id === r.id);
    const qtd = sel ? sel.quantidade : 0;
    const ctrl = qtd === 0
      ? `<button type="button" class="add-btn" data-rec-add="${r.id}">+</button>`
      : `<div class="qty-control">
           <button type="button" data-rec-dec="${r.id}">−</button>
           <span>${qtd}</span>
           <button type="button" data-rec-inc="${r.id}">+</button>
         </div>`;
    return `
      <div class="drawer-item" style="margin-bottom:8px;">
        <div style="min-width:0;">
          <h1 class="receita-nome">${esc(r.nome)}</h1>
          <div class="meta">${esc(r.descricao || '')}</div>
          <div class="meta" style="color:var(--accent-text); margin-top:4px;">${fmt(precoReceita(r.id))}</div>
        </div>
        <div style="flex-shrink:0;">${ctrl}</div>
      </div>
    `;
  }).join('');
}
 
function setQtdReceita(id, qtd) {
  const idx = receitasSelecionadas.findIndex(x => x.id === id);
  if (qtd <= 0) {
    if (idx >= 0) receitasSelecionadas.splice(idx, 1);
  } else if (idx >= 0) {
    receitasSelecionadas[idx].quantidade = qtd;
  } else {
    receitasSelecionadas.push({ id: id, quantidade: qtd });
  }
  renderReceitas();
}
 
async function concluirCardapio() {
  if (!receitasSelecionadas.length) {
    toast('Escolha pelo menos uma receita.');
    return;
  }
  if (itensCardapioNoCarrinho.length) {
    carrinho.itens = carrinho.itens.filter(i => !itensCardapioNoCarrinho.includes(i));
    itensCardapioNoCarrinho = [];
  }
  for (const sel of receitasSelecionadas) {
    const r = catalogo.receitas.find(x => x.id === sel.id);
    if (!r) continue;
    const camadas = {};
    const inclusos = {};
    const { data } = await supabase
      .from('receita_itens')
      .select('ingrediente_id, incluso_id, quantidade')
      .eq('receita_id', r.id);
    (data || []).forEach(it => {
      if (it.ingrediente_id) {
        camadas[it.ingrediente_id] = (camadas[it.ingrediente_id] || 0) + (Number(it.quantidade) || 1);
      }
      if (it.incluso_id) inclusos[it.incluso_id] = true;
    });
    const item = {
      nome: r.nome,
      tipo: 'receita',
      camadas: camadas,
      inclusos: inclusos,
      observacao: '',
      preco: precoReceita(r.id) * sel.quantidade,
      quantidade: sel.quantidade
    };
    carrinho.itens.push(item);
    itensCardapioNoCarrinho.push(item);
  }
  receitasSelecionadas = [];
  $('receitasOverlay').classList.remove('open');
  renderCarrinho();
  pedidoEmFechamento = true;
  atualizarTotais();
  await carregarEnderecos();
  abrirCheckout();
}
 
async function renderSalvos() {
  if (!usuario) {
    $('listaSalvos').innerHTML = '<li class="empty-state">Entre para ver seus hambúrgueres salvos.</li>';
    return;
  }
  const { data, error } = await supabase.from('hamburgueres_salvos').select('*').order('criado_em', { ascending: false });
  if (error) { console.error('ERRO salvos:', error.message); return; }
  if (!data || !data.length) {
    $('listaSalvos').innerHTML = '<li class="empty-state">Nenhum hambúrguer salvo ainda.</li>';
    return;
  }
  $('listaSalvos').innerHTML = data.map(b => `
    <li class="drawer-item">
      <div>
        <div>${esc(b.nome)}</div>
        <div class="meta">${fmt(b.preco)}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn-outline" style="padding:6px 10px;" data-load="${b.id}">Abrir</button>
        <button class="btn-ghost" style="padding:6px 8px;" data-del="${b.id}">×</button>
      </div>
    </li>
  `).join('');
}
 
function atualizarTotais() {
  const totalCarrinho = carrinho.itens.reduce((s, i) => s + i.preco, 0);
  const total = pedidoEmFechamento ? totalCarrinho : precoMontagem() + totalCarrinho;
  $('footTotal').textContent = fmt(total);
}
 
function renderTudo() {
  renderInclusos();
  renderIngredientes();
  renderBurger();
  renderResumo();
  renderCarrinho();
}
 
// ============ AUTH ============
function abrirLogin(cadastro = false) {
  modoCadastro = cadastro;
  $('loginTitle').textContent = cadastro ? 'Criar conta' : 'Entrar';
  $('loginSubtitle').textContent = cadastro
    ? 'Informe seu nome, telefone e crie uma senha.'
    : 'Use seu telefone e senha para acessar.';
  $('loginSubmit').textContent = cadastro ? 'Criar conta' : 'Entrar';
 
  if ($('nomeField')) $('nomeField').style.display = cadastro ? 'flex' : 'none';
  if ($('telefoneField')) $('telefoneField').style.display = 'flex';
  if ($('emailField')) $('emailField').style.display = 'none';
 
  $('toggleModo').textContent = cadastro ? 'Já tenho conta' : 'Criar conta';
  $('loginError').classList.remove('show');
  if ($('loginSenha')) $('loginSenha').value = '';
  if ($('loginNome')) $('loginNome').value = '';
  if ($('loginTelefone')) $('loginTelefone').value = '';
  $('loginOverlay').classList.add('open');
}
 
async function telefoneJaCadastrado(digits) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('telefone', digits)
    .maybeSingle();
 
  if (error) {
    console.error('Erro ao verificar telefone:', error.message);
    return false;
  }
  return !!data;
}
 
async function processarLogin(e) {
  e.preventDefault();
 
  const senha = $('loginSenha').value;
  const nome = ($('loginNome')?.value || '').trim();
  const telefone = ($('loginTelefone')?.value || '').trim();
  const digits = soDigitos(telefone);
  const err = $('loginError');
 
  $('loginTelefone').style.borderColor = '';
  $('loginSenha').style.borderColor = '';
  if ($('loginNome')) $('loginNome').style.borderColor = '';
 
  if (digits.length < 10) {
    err.textContent = 'O telefone é obrigatório. Informe com DDD.';
    err.classList.add('show');
    $('loginTelefone').style.borderColor = '#E8806F';
    $('loginTelefone').focus();
    return;
  }
 
  if (modoCadastro && !nome) {
    err.textContent = 'Informe seu nome.';
    err.classList.add('show');
    $('loginNome').style.borderColor = '#E8806F';
    $('loginNome').focus();
    return;
  }
 
  if (senha.length < 6) {
    err.textContent = 'A senha precisa ter no mínimo 6 caracteres.';
    err.classList.add('show');
    $('loginSenha').style.borderColor = '#E8806F';
    $('loginSenha').focus();
    return;
  }
 
  const email = emailInterno(digits);
 
  if (modoCadastro) {
    const existe = await telefoneJaCadastrado(digits);
    if (existe) {
      err.textContent = 'Este telefone já está cadastrado. Faça login.';
      err.classList.add('show');
      $('loginTelefone').style.borderColor = '#E8806F';
      $('loginTelefone').focus();
      return;
    }
 
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome, telefone: digits } }
    });
 
    if (error) {
      if (error.code === '23505' || /already|registered|exists|duplicate/i.test(error.message)) {
        err.textContent = 'Este telefone já está cadastrado. Faça login.';
      } else {
        err.textContent = error.message;
      }
      err.classList.add('show');
      return;
    }
 
    usuario = data.user;
    $('loginOverlay').classList.remove('open');
    toast('Conta criada!');
    await carregarEnderecos();
    renderSalvos();
    return;
  }
 
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
 
  if (error) {
    err.textContent = 'Telefone ou senha incorretos.';
    err.classList.add('show');
    return;
  }
 
  usuario = data.user;
  $('loginOverlay').classList.remove('open');
  toast('Bem-vindo de volta!');
  await carregarEnderecos();
  renderSalvos();
}
 
async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession();
  usuario = session?.user ?? null;
  supabase.auth.onAuthStateChange(async (_e, s) => {
    usuario = s?.user ?? null;
    await carregarEnderecos();
    renderSalvos();
  });
}
 
// ============ PERFIL ============
async function abrirPerfil() {
  if (!usuario) { abrirLogin(); return; }
 
  const meta = usuario.user_metadata || {};
  if ($('perfilNome')) $('perfilNome').textContent = meta.nome || 'Cliente';
  if ($('perfilTelefone')) $('perfilTelefone').textContent = meta.telefone || '';
 
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, total, status, criado_em, endereco_snapshot')
    .eq('user_id', usuario.id)
    .order('criado_em', { ascending: false })
    .limit(5);
 
  if (error) console.error('ERRO pedidos:', error.message);
 
  const host = $('listaPedidos');
  if (host) {
    if (!data || !data.length) {
      host.innerHTML = '<li class="empty-state">Nenhum pedido ainda.</li>';
    } else {
      host.innerHTML = data.map(p => {
        const dt = new Date(p.criado_em).toLocaleDateString('pt-BR');
        const end = p.endereco_snapshot || {};
        const rot = end.tipo === 'retirada' ? 'Retirada no local' : (end.rotulo || 'Endereço');
        return `
          <li class="drawer-item pedido-card" data-pedido="${p.id}">
            <div>
              <div>${fmt(p.total)}</div>
              <div class="meta">${dt} · ${esc(rot)}</div>
            </div>
            <span class="status-badge status-${esc(p.status)}">${esc(p.status)}</span>
          </li>`;
      }).join('');
    }
  }
 
  $('perfilOverlay').classList.add('open');
}
 
// ============ AÇÕES ============
function adicionarAoCarrinho(nome) {
  if (!Object.keys(montagem.camadas).length) {
    toast('Adicione pelo menos um ingrediente.');
    return;
  }
  carrinho.itens.push({
    nome: nome || 'Meu montaí',
    tipo: 'montagem',
    camadas: { ...montagem.camadas },
    inclusos: { ...montagem.inclusos },
    observacao: montagem.observacao,
    preco: precoMontagem(),
    quantidade: 1
  });
  montagemPadrao();
  renderTudo();
  toast('Adicionado ao carrinho');
}
 
async function salvarHamburguer() {
  if (!usuario) { abrirLogin(); return; }
  if (!Object.keys(montagem.camadas).length) { toast('Monte algo antes de salvar.'); return; }
  const nome = prompt('Nome do hambúrguer:', 'Meu montaí');
  if (!nome) return;
 
  const { error } = await supabase.from('hamburgueres_salvos').insert({
    user_id: usuario.id,
    nome: nome.slice(0, 40),
    camadas: montagem.camadas,
    inclusos: montagem.inclusos,
    observacao: montagem.observacao,
    preco: precoMontagem()
  });
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  toast('Hambúrguer salvo!');
  renderSalvos();
}
 
async function carregarReceita(id) {
  const { data, error } = await supabase
    .from('receita_itens')
    .select('*, ingrediente:ingredientes(*), incluso:inclusos(*)')
    .eq('receita_id', id);
 
  if (error) { toast('Erro ao carregar receita'); return; }
 
  montagemPadrao();
 
  (data || []).forEach(item => {
    if (item.ingrediente_id) {
      montagem.camadas[item.ingrediente_id] = (montagem.camadas[item.ingrediente_id] || 0) + item.quantidade;
    }
    if (item.incluso_id) montagem.inclusos[item.incluso_id] = true;
  });
 
  const receita = catalogo.receitas.find(r => r.id === id);
  if (receita?.observacao_padrao) {
    montagem.observacao = receita.observacao_padrao;
    $('obsText').value = receita.observacao_padrao;
  }
  $('receitasOverlay').classList.remove('open');
  renderTudo();
  toast((receita?.nome || 'Receita') + ' carregada');
}
 
async function carregarSalvo(id) {
  const { data } = await supabase.from('hamburgueres_salvos').select('*').eq('id', id).single();
  if (!data) return;
  montagem.camadas = { ...data.camadas };
  montagem.inclusos = { ...data.inclusos };
  montagem.observacao = data.observacao || '';
  $('obsText').value = montagem.observacao;
  $('salvosDrawer').classList.remove('open');
  $('drawerBackdrop').classList.remove('open');
  renderTudo();
  toast('Montagem carregada');
}
 
async function finalizarPedido(e) {
  e.preventDefault();
  if (!usuario) { $('checkoutOverlay').classList.remove('open'); abrirLogin(); return; }
  if (!carrinho.itens.length) { toast('Carrinho vazio.'); return; }
 
  let endereco = null;
  let taxa = 0;
 
  if (tipoEntrega === 'retirada') {
    endereco = { rotulo: 'Retirada no local', tipo: 'retirada' };
    taxa = 0;
  } else {
    if (!enderecoSelecionado) { toast('Escolha ou cadastre um endereço.'); return; }
    const end = enderecos.find(x => x.id === enderecoSelecionado);
    if (!end) { toast('Endereço inválido.'); return; }
 
    endereco = {
      rotulo: end.rotulo,
      rua: end.rua, numero: end.numero,
      complemento: end.complemento, bairro: end.bairro,
      cidade: end.cidade || cidadeFixa,
      estado: end.estado || estadoFixo,
      tipo: 'entrega'
    };
 
    taxa = taxaDoBairro(end.bairro);
  }
 
  const subtotal = carrinho.itens.reduce((s, i) => s + i.preco, 0);
  const desconto = calcularDesconto(subtotal + taxa);
  const total = Math.max(0, subtotal + taxa - desconto);
 
  const { data: pedido, error: errPed } = await supabase.from('pedidos').insert({
    user_id: usuario.id,
    endereco_snapshot: endereco,
    subtotal,
    taxa_entrega: taxa,
    total,
    status: 'pendente',
    cupom_codigo: cupomAplicado ? cupomAplicado.codigo : null,
    desconto: desconto,
  }).select().single();
 
  if (errPed) {
    if ($('endError')) { $('endError').textContent = errPed.message; $('endError').classList.add('show'); }
    return;
  }
 
  const itens = carrinho.itens.map(i => ({
    pedido_id: pedido.id,
    tipo: i.tipo || 'montagem',
    nome: i.nome,
    quantidade: i.quantidade || 1,
    preco_unitario: i.quantidade > 1 ? i.preco / i.quantidade : i.preco,
    camadas: i.camadas || null,
    inclusos: i.inclusos || null,
    observacao: i.observacao || null
  }));
 
  const { error: errItens } = await supabase.from('pedido_itens').insert(itens);
  if (errItens) {
    if ($('endError')) { $('endError').textContent = errItens.message; $('endError').classList.add('show'); }
    return;
  }
 
  carrinho.itens = [];
  extrasNoCarrinho = [];
  itensCardapioNoCarrinho = [];
  pedidoEmFechamento = false;
  cupomAplicado = null;
  $('checkoutOverlay').classList.remove('open');
  if ($('enderecoForm')) $('enderecoForm').reset();
  if ($('endCidade')) $('endCidade').value = cidadeFixa;
  if ($('endEstado')) $('endEstado').value = estadoFixo;
  if ($('cupomInput')) $('cupomInput').value = '';
  if ($('cupomMsg')) { $('cupomMsg').textContent = ''; $('cupomMsg').className = 'cupom-msg'; }
  renderCarrinho();
  toast('Pedido realizado!');
}
 
function calcularDesconto(base) {
  if (!cupomAplicado) return 0;
  let d = 0;
  if (cupomAplicado.tipo === 'percentual') {
    d = base * (Number(cupomAplicado.valor) / 100);
  } else {
    d = Number(cupomAplicado.valor);
  }
  return Math.min(d, base);
}
 
async function aplicarCupom() {
  const inp = $('cupomInput');
  const msg = $('cupomMsg');
  if (!inp || !msg) return;
  const codigo = (inp.value || '').trim().toUpperCase();
  msg.className = 'cupom-msg';
  msg.textContent = '';
  if (!codigo) { msg.textContent = 'Digite um código.'; msg.className = 'cupom-msg err'; return; }
  const { data, error } = await supabase
    .from('cupons')
    .select('*')
    .eq('codigo', codigo)
    .eq('ativo', true)
    .maybeSingle();
  if (error) { msg.textContent = 'Erro ao validar cupom.'; msg.className = 'cupom-msg err'; return; }
  if (!data) { msg.textContent = 'Cupom inválido ou expirado.'; msg.className = 'cupom-msg err'; cupomAplicado = null; atualizarResumoCheckout(); return; }
  if (data.valido_ate) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const fim = new Date(data.valido_ate + 'T23:59:59');
    if (fim < hoje) { msg.textContent = 'Cupom expirado.'; msg.className = 'cupom-msg err'; cupomAplicado = null; atualizarResumoCheckout(); return; }
  }
  const subtotal = carrinho.itens.reduce((s, i) => s + i.preco, 0);
  const base = subtotal + calcularTaxaAtual();
  if (data.valor_minimo && base < Number(data.valor_minimo)) {
    msg.textContent = 'Pedido mínimo de ' + fmt(data.valor_minimo) + ' para este cupom.';
    msg.className = 'cupom-msg err'; cupomAplicado = null; atualizarResumoCheckout(); return;
  }
  cupomAplicado = data;
  const d = calcularDesconto(base);
  msg.textContent = 'Cupom aplicado: -' + fmt(d);
  msg.className = 'cupom-msg ok';
  atualizarResumoCheckout();
}
 
function nomesIngredientesDoItem(i) {
  const nomes = [];
  if (i.inclusos) {
    Object.keys(i.inclusos).forEach(id => {
      if (!i.inclusos[id]) return;
      const inc = catalogo.inclusos.find(x => x.id === id);
      if (inc) nomes.push(inc.nome);
    });
  }
  if (i.camadas) {
    Object.keys(i.camadas).forEach(id => {
      const q = i.camadas[id];
      if (!q) return;
      const ing = catalogo.ingredientes.find(x => x.id === id);
      if (!ing) return;
      nomes.push(q > 1 ? ing.nome + ' (' + q + 'x)' : ing.nome);
    });
  }
  return nomes;
}
 
function ordenarItensPorTipo(itens) {
  const peso = { montagem: 0, receita: 0, adicional: 1, bebida: 2 };
  return itens
    .map((item, idx) => ({ item: item, idx: idx }))
    .sort((a, b) => {
      const pa = peso[a.item.tipo] !== undefined ? peso[a.item.tipo] : 3;
      const pb = peso[b.item.tipo] !== undefined ? peso[b.item.tipo] : 3;
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    })
    .map(x => x.item);
}
 
function renderCheckoutItens() {
  const host = $('checkoutItens');
  if (!host) return;
  if (!carrinho.itens.length) {
    host.innerHTML = '<li class="empty-state">Nenhum item no pedido.</li>';
    return;
  }
  const itensOrdenados = ordenarItensPorTipo(carrinho.itens);
  host.innerHTML = itensOrdenados.map((i, idx) => {
    const ings = nomesIngredientesDoItem(i);
    const lista = ings.length ? ings.join(', ') : '';
    return `
    <li class="drawer-item">
      <div style="min-width:0;">
        <div class="item-linha-topo">
          <span class="item-nome">${esc(i.nome)}</span>
          <span class="item-preco">- ${fmt(i.preco)}</span>
        </div>
        ${lista ? `<div class="item-ingredientes">${esc(lista)}</div>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <div class="qty-control">
          <button type="button" data-ck-dec="${idx}">−</button>
          <span>${i.quantidade || 1}</span>
          <button type="button" data-ck-inc="${idx}">+</button>
        </div>
        <button type="button" class="item-remove" data-ck-del="${idx}" aria-label="Excluir">×</button>
      </div>
    </li>
  `;
  }).join('');
}
 
async function repetirUltimoPedido() {
  if (!usuario) { abrirLogin(); return; }
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, criado_em')
    .eq('user_id', usuario.id)
    .order('criado_em', { ascending: false })
    .limit(1);
  if (error) { toast('Erro ao buscar pedido.'); return; }
  const ultimo = pedidos && pedidos[0];
  if (!ultimo) { toast('Nenhum pedido anterior encontrado.'); return; }
  const { data: itens, error: errItens } = await supabase
    .from('pedido_itens')
    .select('*')
    .eq('pedido_id', ultimo.id);
  if (errItens || !itens || !itens.length) { toast('Não foi possível recuperar os itens.'); return; }
  if (carrinho.itens.length) {
    if (!confirm('Seu carrinho tem itens. Deseja substituir pelo último pedido?')) return;
  }
  carrinho.itens = itens.map(it => ({
    nome: it.nome,
    tipo: it.tipo || 'montagem',
    camadas: it.camadas || {},
    inclusos: it.inclusos || {},
    observacao: it.observacao || '',
    preco: Number(it.preco_unitario) * (it.quantidade || 1),
    quantidade: it.quantidade || 1
  }));
  extrasNoCarrinho = [];
  itensCardapioNoCarrinho = [];
  pedidoEmFechamento = false;
  cupomAplicado = null;
  $('perfilOverlay').classList.remove('open');
  renderCarrinho();
  atualizarTotais();
  toast('Último pedido adicionado ao carrinho');
}
function precoAtualDoItem(it) {
  if (it.tipo === 'montagem' && it.camadas && Object.keys(it.camadas).length) {
    const camadasAntigas = montagem.camadas;
    const inclusosAntigos = montagem.inclusos;
    montagem.camadas = { ...it.camadas };
    montagem.inclusos = { ...(it.inclusos || {}) };
    const preco = precoMontagem();
    montagem.camadas = camadasAntigas;
    montagem.inclusos = inclusosAntigos;
    return preco;
  }
  if (it.tipo === 'receita') {
    const r = catalogo.receitas.find(x => x.nome === it.nome);
    if (r) return precoReceita(r.id);
  }
  if (it.tipo === 'adicional') {
    const a = catalogo.extras.find(x => x.nome === it.nome);
    if (a) return Number(a.preco);
  }
  if (it.tipo === 'bebida') {
    const b = catalogo.bebidas.find(x => it.nome.indexOf(x.nome) === 0);
    if (b) return Number(b.preco);
  }
  return null;
}
 
async function carregarPedidoNoCarrinho(pedidoId) {
  if (!usuario) { abrirLogin(); return; }
  if (!pedidoId) return;
  if (!confirm('Deseja repetir esse pedido?')) return;
  const { data: itens, error } = await supabase
    .from('pedido_itens')
    .select('*')
    .eq('pedido_id', pedidoId);
  if (error || !itens || !itens.length) {
    toast('Não foi possível recuperar os itens do pedido.');
    return;
  }
  carrinho.itens = itens.map(it => {
    const qtd = it.quantidade || 1;
    const atual = precoAtualDoItem(it);
    const unitario = atual !== null ? atual : Number(it.preco_unitario);
    return {
      nome: it.nome,
      tipo: it.tipo || 'montagem',
      camadas: it.camadas || {},
      inclusos: it.inclusos || {},
      observacao: it.observacao || '',
      preco: unitario * qtd,
      quantidade: qtd
    };
  });
  extrasNoCarrinho = [];
  itensCardapioNoCarrinho = [];
  pedidoEmFechamento = true;
  cupomAplicado = null;
  $('perfilOverlay').classList.remove('open');
  renderCarrinho();
  atualizarTotais();
  await carregarEnderecos();
  abrirCheckout();
  irParaEtapa('endereco');
}
 
// ============ EVENTOS ============
function configurarEventos() {
  if ($('btnWhatsapp')) {
    $('btnWhatsapp').addEventListener('click', () => {
      abrirWhatsApp('Preciso de ajuda com meu pedido');
    });
  }
  if ($('btnEsqueciSenha')) {
    $('btnEsqueciSenha').addEventListener('click', e => {
      e.preventDefault();
      abrirWhatsApp('Preciso redefinir minha senha');
    });
  }
 
  $('listaIngredientes').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add) setQtd(t.dataset.add, 1);
    if (t.dataset.inc) setQtd(t.dataset.inc, (montagem.camadas[t.dataset.inc] || 0) + 1);
    if (t.dataset.dec) setQtd(t.dataset.dec, (montagem.camadas[t.dataset.dec] || 0) - 1);
  });
 
  $('listaInclusos').addEventListener('change', e => {
    const cb = e.target.closest('input[data-incluso]');
    if (!cb) return;
    montagem.inclusos[cb.dataset.incluso] = cb.checked;
    const chip = cb.closest('.incluso-chip');
    if (chip) chip.classList.toggle('selected', cb.checked);
    renderBurger();
    renderResumo();
    atualizarTotais();
  });
 
  $('obsText').addEventListener('input', e => {
    montagem.observacao = e.target.value.slice(0, 200);
    $('obsCounter').textContent = montagem.observacao.length + '/200';
  });
 
  $('btnAdicionar').addEventListener('click', () => adicionarAoCarrinho());
  $('btnSalvar').addEventListener('click', salvarHamburguer);
 
$('checkout').addEventListener('click', async () => {
  if (!carrinho.itens.length && !Object.keys(montagem.camadas).length) {
    toast('Monte ou adicione algo antes de concluir.');
    return;
  }
  if (Object.keys(montagem.camadas).length) adicionarAoCarrinho();
  pedidoEmFechamento = true;
  atualizarTotais();
  await carregarEnderecos();
  abrirCheckout();
});
 
  if ($('listaBatata')) {
    $('listaBatata').addEventListener('click', e => {
      const inc = e.target.closest('[data-bat-inc]');
      const dec = e.target.closest('[data-bat-dec]');
      if (inc) {
        batataSelecionada = inc.dataset.batInc;
        qtdBatata++;
        const el = $('batQtd-' + inc.dataset.batInc);
        if (el) el.textContent = qtdBatata;
        atualizarQtdBatata();
      }
      if (dec) {
        if (qtdBatata > 0) qtdBatata--;
        if (qtdBatata === 0) batataSelecionada = null;
        const el = $('batQtd-' + dec.dataset.batDec);
        if (el) el.textContent = qtdBatata;
        atualizarQtdBatata();
      }
    });
  }
 
  if ($('btnExtrasContinuar')) $('btnExtrasContinuar').addEventListener('click', confirmarExtras);
  if ($('btnExtrasPular')) $('btnExtrasPular').addEventListener('click', () => {
    if (!usuario) { abrirLogin(); return; }
    qtdBatata = 0;
    batataSelecionada = null;
    bebidasSelecionadas = [];
    irParaEtapa('endereco');
  });
 
  if ($('listaBebidas')) {
    $('listaBebidas').addEventListener('change', e => {
      const cb = e.target.closest('input[name="bebSel"]');
      if (!cb) return;
      const id = cb.value;
      if (cb.checked) {
        if (!bebidasSelecionadas.includes(id)) bebidasSelecionadas.push(id);
      } else {
        bebidasSelecionadas = bebidasSelecionadas.filter(x => x !== id);
      }
      renderBebidas();
    });
  }
 
  if ($('btnVoltarEndereco')) $('btnVoltarEndereco').addEventListener('click', () => irParaEtapa('extras'));
 
  if ($('listaEnderecos')) {
    $('listaEnderecos').addEventListener('change', e => {
      const r = e.target.closest('input[name="tipoEntrega"]');
      if (!r) return;
      if (r.value === 'retirada') {
        tipoEntrega = 'retirada';
      } else {
        tipoEntrega = 'entrega';
        enderecoSelecionado = r.value;
      }
      renderEnderecosModal();
    });
  }
 
  if ($('btnNovoEndereco')) {
    $('btnNovoEndereco').addEventListener('click', () => {
      if ($('formNovoEndereco')) $('formNovoEndereco').style.display = 'block';
      if ($('btnNovoEndereco')) $('btnNovoEndereco').style.display = 'none';
    });
  }
 
  if ($('btnSalvarEndereco')) $('btnSalvarEndereco').addEventListener('click', salvarEndereco);
  if ($('enderecoForm')) $('enderecoForm').addEventListener('submit', finalizarPedido);
 
  $('loginForm').addEventListener('submit', processarLogin);
  $('toggleModo').addEventListener('click', e => {
    e.preventDefault();
    abrirLogin(!modoCadastro);
  });
 
  if ($('btnCardapio')) {
    $('btnCardapio').addEventListener('click', () => {
      receitasSelecionadas = [];
      renderReceitas();
      $('receitasOverlay').classList.add('open');
    });
  }
  $('listaReceitas').addEventListener('click', e => {
    const add = e.target.closest('[data-rec-add]');
    const inc = e.target.closest('[data-rec-inc]');
    const dec = e.target.closest('[data-rec-dec]');
    if (add) setQtdReceita(add.dataset.recAdd, 1);
    if (inc) {
      const id = inc.dataset.recInc;
      const sel = receitasSelecionadas.find(x => x.id === id);
      setQtdReceita(id, (sel ? sel.quantidade : 0) + 1);
    }
    if (dec) {
      const id = dec.dataset.recDec;
      const sel = receitasSelecionadas.find(x => x.id === id);
      setQtdReceita(id, (sel ? sel.quantidade : 0) - 1);
    }
  });
  if ($('btnCardapioConcluir')) $('btnCardapioConcluir').addEventListener('click', concluirCardapio);
 
  $('btnCarrinho').addEventListener('click', () => {
    renderCarrinho();
    $('carrinhoDrawer').classList.add('open');
    $('drawerBackdrop').classList.add('open');
  });
 
  $('btnSalvos').addEventListener('click', () => {
    renderSalvos();
    $('salvosDrawer').classList.add('open');
    $('drawerBackdrop').classList.add('open');
  });
  $('listaSalvos').addEventListener('click', async e => {
    const load = e.target.closest('[data-load]');
    const del = e.target.closest('[data-del]');
    if (load) carregarSalvo(load.dataset.load);
    if (del) {
      await supabase.from('hamburgueres_salvos').delete().eq('id', del.dataset.del);
      renderSalvos();
      toast('Removido');
    }
  });
 
  $('listaCarrinho').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove-item]');
    if (rm) {
      const ordenados = ordenarItensPorTipo(carrinho.itens);
      const alvo = ordenados[+rm.dataset.removeItem];
      if (alvo) {
        const posReal = carrinho.itens.indexOf(alvo);
        if (posReal >= 0) carrinho.itens.splice(posReal, 1);
      }
      renderCarrinho();
    }
  });
 
  $('btnPerfil').addEventListener('click', abrirPerfil);
 
  const btnSair = $('btnSair');
  if (btnSair) {
    btnSair.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { await supabase.auth.signOut(); } catch (err) { console.error('Erro ao sair:', err); }
      usuario = null;
      enderecos = [];
      enderecoSelecionado = null;
      $('perfilOverlay').classList.remove('open');
      toast('Você saiu');
    });
  }
 
if ($('checkoutItens')) {
  $('checkoutItens').addEventListener('click', e => {
    const inc = e.target.closest('[data-ck-inc]');
    const dec = e.target.closest('[data-ck-dec]');
    const del = e.target.closest('[data-ck-del]');
    const ordenados = ordenarItensPorTipo(carrinho.itens);
    if (inc) {
      const i = ordenados[+inc.dataset.ckInc];
      if (i) { const q = (i.quantidade || 1) + 1; i.preco = (i.preco / (i.quantidade || 1)) * q; i.quantidade = q; }
    }
    if (dec) {
      const i = ordenados[+dec.dataset.ckDec];
      if (i) {
        const q = (i.quantidade || 1) - 1;
        if (q <= 0) {
          const posReal = carrinho.itens.indexOf(i);
          if (posReal >= 0) carrinho.itens.splice(posReal, 1);
        }
        else { i.preco = (i.preco / (i.quantidade || 1)) * q; i.quantidade = q; }
      }
    }
    if (del) {
      const i = ordenados[+del.dataset.ckDel];
      if (i) {
        const posReal = carrinho.itens.indexOf(i);
        if (posReal >= 0) carrinho.itens.splice(posReal, 1);
      }
    }
    if (inc || dec || del) {
      renderCheckoutItens();
      renderCarrinho();
      atualizarResumoCheckout();
    }
  });
}
if ($('btnLimparCarrinho')) {
  $('btnLimparCarrinho').addEventListener('click', () => {
    if (!carrinho.itens.length) { toast('Carrinho já está vazio.'); return; }
    if (!confirm('Limpar todos os itens do carrinho?')) return;
    carrinho.itens = [];
    extrasNoCarrinho = [];
    itensCardapioNoCarrinho = [];
    pedidoEmFechamento = false;
    cupomAplicado = null;
    renderCarrinho();
    atualizarTotais();
    $('carrinhoDrawer').classList.remove('open');
    $('drawerBackdrop').classList.remove('open');
    toast('Carrinho limpo');
  });
}
if ($('btnFinalizarCarrinho')) {
  $('btnFinalizarCarrinho').addEventListener('click', async () => {
    if (!usuario) { $('carrinhoDrawer').classList.remove('open'); $('drawerBackdrop').classList.remove('open'); abrirLogin(); return; }
    if (!carrinho.itens.length) { toast('Carrinho vazio.'); return; }
    pedidoEmFechamento = true;
    atualizarTotais();
    $('carrinhoDrawer').classList.remove('open');
    $('drawerBackdrop').classList.remove('open');
    await carregarEnderecos();
    abrirCheckout();
  });
}
if ($('btnAplicarCupom')) $('btnAplicarCupom').addEventListener('click', aplicarCupom);
if ($('cupomInput')) {
  $('cupomInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); aplicarCupom(); }
  });
}
if ($('listaPedidos')) {
  $('listaPedidos').addEventListener('click', e => {
    const card = e.target.closest('[data-pedido]');
    if (card) carregarPedidoNoCarrinho(card.dataset.pedido);
  });
}
 
document.querySelectorAll('[data-close]').forEach(b => {
  b.addEventListener('click', () => {
    $(b.dataset.close).classList.remove('open');
    if (b.dataset.close === 'checkoutOverlay') {
      pedidoEmFechamento = false;
      cupomAplicado = null;
      const msg = $('cupomMsg'); if (msg) { msg.textContent = ''; msg.className = 'cupom-msg'; }
      const inp = $('cupomInput'); if (inp) inp.value = '';
      atualizarTotais();
    }
  });
});
  document.querySelectorAll('[data-close-drawer]').forEach(b => {
    b.addEventListener('click', () => {
      $(b.dataset.closeDrawer).classList.remove('open');
      $('drawerBackdrop').classList.remove('open');
    });
  });
  $('drawerBackdrop').addEventListener('click', () => {
    document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
    $('drawerBackdrop').classList.remove('open');
  });
 
  // Atualiza a taxa exibida ao trocar o bairro no formulário
  if ($('endBairro')) {
    $('endBairro').addEventListener('change', e => {
      const b = bairros.find(x => x.id === e.target.value);
      const label = $('taxaEnderecoLabel');
      if (label) {
        label.textContent = b
          ? `Taxa de entrega (${b.nome}): ${fmt(b.taxa_entrega)}`
          : '';
      }
    });
  }
}
 
// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarCatalogo();
    await carregarConfiguracoes();
    await carregarBairros();
    await carregarPrecosReceitas();
    montagemPadrao();
    await verificarSessao();
    await carregarEnderecos();
    renderTudo();
    configurarEventos();
    console.log('montaí iniciado com sucesso');
  } catch (err) {
    console.error('ERRO na inicialização:', err);
  }
});
