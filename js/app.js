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

// Endereços
let enderecos = [];
let enderecoSelecionado = null;

// Fluxo de finalização
let etapaCheckout = 'batata'; // 'batata' | 'bebida' | 'endereco'
let qtdBatata = 0;
let bebidaSelecionada = null;

// Configurações
let precoBase = 12.00;
let inclusosPadrao = ['alface', 'tomate', 'cebola', 'ketchup', 'maionese'];
let idsFixo = ['pao-baixo', 'pao-cima', 'carne'];
let itensNaBase = ['pao-baixo', 'pao-cima', 'carne', 'alface', 'tomate', 'cebola', 'ketchup', 'maionese'];
let precosReceita = {};

const IMG_VERSION = Date.now();

const LAYER_ORDER = [
  'bun-bottom', 'ketchup', 'maionese', 'molho-especial',
  'lettuce', 'tomato', 'onion',
  'patty', 'extra-patty', 'cheese', 'bacon', 'calabresa', 'egg',
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
  });
  console.log('precoBase:', precoBase, '| itensNaBase:', itensNaBase);
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

  if (!enderecos.length) {
    host.innerHTML = '<p class="empty-state">Nenhum endereço salvo. Cadastre o primeiro abaixo.</p>';
  } else {
    host.innerHTML = enderecos.map(e => `
      <label class="endereco-card ${enderecoSelecionado === e.id ? 'selected' : ''}">
        <input type="radio" name="endSel" value="${e.id}" ${enderecoSelecionado === e.id ? 'checked' : ''}>
        <div>
          <div class="endereco-rotulo">${esc(e.rotulo || 'Casa')}</div>
          <div class="meta">${esc(e.rua || '')}, ${esc(e.numero || '')} — ${esc(e.bairro || '')}</div>
          <div class="meta">${esc(e.cidade || '')}/${esc(e.estado || '')} · CEP ${esc(e.cep || '')}</div>
        </div>
      </label>
    `).join('');
  }

  const form = $('formNovoEndereco');
  if (form) form.style.display = enderecos.length ? 'none' : 'block';

  const btnNovo = $('btnNovoEndereco');
  if (btnNovo) btnNovo.style.display = enderecos.length ? 'inline-flex' : 'none';
}

async function salvarEndereco() {
  if (!usuario) { abrirLogin(); return; }

  const rotulo = ($('endRotulo')?.value || '').trim() || 'Casa';
  const cep = ($('endCep')?.value || '').trim();
  const rua = ($('endRua')?.value || '').trim();
  const numero = ($('endNumero')?.value || '').trim();
  const bairro = ($('endBairro')?.value || '').trim();
  const cidade = ($('endCidade')?.value || '').trim();
  const estado = ($('endEstado')?.value || '').trim();

  if (!cep || !rua || !numero || !bairro || !cidade || !estado) {
    toast('Preencha todos os campos do endereço.');
    return;
  }

  const { data, error } = await supabase.from('enderecos').insert({
    user_id: usuario.id,
    rotulo, cep, rua, numero,
    complemento: ($('endComplemento')?.value || '').trim(),
    bairro, cidade, estado,
    principal: enderecos.length === 0
  }).select().single();

  if (error) { toast('Erro ao salvar endereço: ' + error.message); return; }

  await carregarEnderecos();
  enderecoSelecionado = data.id;
  renderEnderecosModal();
  toast('Endereço salvo!');
}

// ============ CHECKOUT EM ETAPAS ============
function abrirCheckout() {
  etapaCheckout = 'batata';
  qtdBatata = 0;
  bebidaSelecionada = null;
  renderEtapa();
  $('checkoutOverlay').classList.add('open');
}

function renderEtapa() {
  const passos = ['batata', 'bebida', 'endereco'];
  passos.forEach(p => {
    const el = $('etapa' + p.charAt(0).toUpperCase() + p.slice(1));
    if (el) el.style.display = (p === etapaCheckout) ? 'block' : 'none';
  });

  // Indicador de progresso
  const idx = passos.indexOf(etapaCheckout);
  document.querySelectorAll('.step-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
    d.classList.toggle('done', i < idx);
  });

  if (etapaCheckout === 'batata') renderBatata();
  if (etapaCheckout === 'bebida') renderBebidas();
  if (etapaCheckout === 'endereco') renderEnderecosModal();
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
          <span id="batQtd-${x.id}">0</span>
          <button type="button" data-bat-inc="${x.id}">+</button>
        </div>
      </div>
    </div>
  `).join('');

  atualizarQtdBatata();
}

function atualizarQtdBatata() {
  const total = qtdBatata;
  const label = $('batataTotal');
  if (label) label.textContent = total > 0 ? `${total} porção${total > 1 ? 'ões' : ''}` : '';
}

function renderBebidas() {
  const host = $('listaBebidas');
  if (!host) return;

  if (!catalogo.bebidas.length) {
    host.innerHTML = '<p class="empty-state">Nenhuma bebida disponível.</p>';
    return;
  }

  host.innerHTML = catalogo.bebidas.map(b => `
    <label class="bebida-card ${bebidaSelecionada === b.id ? 'selected' : ''}">
      <input type="radio" name="bebSel" value="${b.id}" ${bebidaSelecionada === b.id ? 'checked' : ''}>
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

function confirmarBatata() {
  if (qtdBatata > 0) {
    const batata = catalogo.extras[0];
    if (batata) {
      carrinho.itens.push({
        nome: batata.nome,
        tipo: 'adicional',
        camadas: {},
        inclusos: {},
        observacao: '',
        preco: Number(batata.preco) * qtdBatata,
        quantidade: qtdBatata
      });
      renderCarrinho();
    }
  }
  irParaEtapa('bebida');
}

function confirmarBebida() {
  if (bebidaSelecionada) {
    const b = catalogo.bebidas.find(x => x.id === bebidaSelecionada);
    if (b) {
      carrinho.itens.push({
        nome: b.nome + (b.tamanho ? ` ${b.tamanho}` : ''),
        tipo: 'bebida',
        camadas: {},
        inclusos: {},
        observacao: '',
        preco: Number(b.preco),
        quantidade: 1
      });
      renderCarrinho();
    }
  }
  irParaEtapa('endereco');
}

// ============ MONTAGEM ============
function montagemPadrao() {
  montagem.camadas = {};
  montagem.inclusos = {};

  catalogo.inclusos.forEach(i => { montagem.inclusos[i.id] = false; });
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
  $('chipsCategoria').innerHTML = html.join('');
}

function renderInclusos() {
  $('listaInclusos').innerHTML = catalogo.inclusos.map(i => `
    <label class="incluso-row">
      <input type="checkbox" data-incluso="${i.id}" ${montagem.inclusos[i.id] ? 'checked' : ''}>
      <span class="check-box">
        <svg viewBox="0 0 12 12" fill="none"><path d="M2 6.5 L5 9 L10 3" stroke="#0A0A0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="incluso-label">${esc(i.nome)}</span>
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
    lista.innerHTML = carrinho.itens.map((i, idx) => `
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
  atualizarTotais();
}

function renderReceitas() {
  $('listaReceitas').innerHTML = catalogo.receitas.map(r => `
    <button class="drawer-item" style="width:100%; text-align:left; margin-bottom:8px;" data-receita="${r.id}">
      <div>
        <div style="font-family:var(--font-serif); font-size:1.1rem;">${esc(r.nome)}</div>
        <div class="meta">${esc(r.descricao || '')}</div>
      </div>
      <span style="color:var(--accent-text);">${fmt(precoReceita(r.id))}</span>
    </button>
  `).join('') || '<p class="empty-state">Nenhuma receita cadastrada.</p>';
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
  const total = precoMontagem() + carrinho.itens.reduce((s, i) => s + i.preco, 0);
  $('footTotal').textContent = fmt(total);
}

function renderTudo() {
  renderChips();
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
  $('loginOverlay').classList.add('open');
}

async function processarLogin(e) {
  e.preventDefault();

  const senha = $('loginSenha').value;
  const nome = ($('loginNome')?.value || '').trim();
  const telefone = ($('loginTelefone')?.value || '').trim();
  const digits = soDigitos(telefone);
  const err = $('loginError');

  if (digits.length < 10) {
    err.textContent = 'Informe um telefone válido com DDD.';
    err.classList.add('show');
    return;
  }

  if (senha.length < 6) {
    err.textContent = 'A senha precisa ter no mínimo 6 caracteres.';
    err.classList.add('show');
    return;
  }

  if (modoCadastro && !nome) {
    err.textContent = 'Informe seu nome.';
    err.classList.add('show');
    return;
  }

  const email = emailInterno(digits);

  if (modoCadastro) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome, telefone: digits } }
    });

    if (error) {
      err.textContent = /already|registered|exists/i.test(error.message)
        ? 'Este telefone já está cadastrado. Faça login.'
        : error.message;
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
        const rot = (p.endereco_snapshot && p.endereco_snapshot.rotulo) || 'Endereço';
        return `
          <li class="drawer-item">
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
    nome: nome || 'Meu montaê',
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
  const nome = prompt('Nome do hambúrguer:', 'Meu montaê');
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
  if (!enderecoSelecionado) { toast('Escolha ou cadastre um endereço.'); return; }

  const end = enderecos.find(x => x.id === enderecoSelecionado);
  if (!end) { toast('Endereço inválido.'); return; }

  const endereco = {
    rotulo: end.rotulo,
    cep: end.cep, rua: end.rua, numero: end.numero,
    complemento: end.complemento, bairro: end.bairro,
    cidade: end.cidade, estado: end.estado
  };

  const subtotal = carrinho.itens.reduce((s, i) => s + i.preco, 0);

  const { data: pedido, error: errPed } = await supabase.from('pedidos').insert({
    user_id: usuario.id,
    endereco_snapshot: endereco,
    subtotal,
    taxa_entrega: 0,
    total: subtotal,
    status: 'pendente'
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
  $('checkoutOverlay').classList.remove('open');
  if ($('enderecoForm')) $('enderecoForm').reset();
  renderCarrinho();
  toast('Pedido realizado!');
}

// ============ EVENTOS ============
function configurarEventos() {
  $('chipsCategoria').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    catAtiva = chip.dataset.cat;
    renderIngredientes();
  });

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

  // Checkout em etapas
  $('checkout').addEventListener('click', async () => {
    if (!usuario) { abrirLogin(); return; }
    if (!carrinho.itens.length && !Object.keys(montagem.camadas).length) {
      toast('Monte ou adicione algo antes de concluir.');
      return;
    }
    if (Object.keys(montagem.camadas).length) adicionarAoCarrinho();
    await carregarEnderecos();
    abrirCheckout();
  });

  // Batata
  if ($('listaBatata')) {
    $('listaBatata').addEventListener('click', e => {
      const inc = e.target.closest('[data-bat-inc]');
      const dec = e.target.closest('[data-bat-dec]');
      if (inc) {
        qtdBatata++;
        const el = $('batQtd-' + inc.dataset.batInc);
        if (el) el.textContent = qtdBatata;
        atualizarQtdBatata();
      }
      if (dec) {
        if (qtdBatata > 0) qtdBatata--;
        const el = $('batQtd-' + dec.dataset.batDec);
        if (el) el.textContent = qtdBatata;
        atualizarQtdBatata();
      }
    });
  }

  if ($('btnBatataContinuar')) $('btnBatataContinuar').addEventListener('click', confirmarBatata);
  if ($('btnBatataPular')) $('btnBatataPular').addEventListener('click', () => { qtdBatata = 0; irParaEtapa('bebida'); });

  // Bebida
  if ($('listaBebidas')) {
    $('listaBebidas').addEventListener('change', e => {
      const r = e.target.closest('input[name="bebSel"]');
      if (r) { bebidaSelecionada = r.value; renderBebidas(); }
    });
  }

  if ($('btnBebidaContinuar')) $('btnBebidaContinuar').addEventListener('click', confirmarBebida);
  if ($('btnBebidaPular')) $('btnBebidaPular').addEventListener('click', () => { bebidaSelecionada = null; irParaEtapa('endereco'); });

  // Voltar
  if ($('btnVoltarBebida')) $('btnVoltarBebida').addEventListener('click', () => irParaEtapa('batata'));
  if ($('btnVoltarEndereco')) $('btnVoltarEndereco').addEventListener('click', () => irParaEtapa('bebida'));

  // Endereços
  if ($('listaEnderecos')) {
    $('listaEnderecos').addEventListener('change', e => {
      const r = e.target.closest('input[name="endSel"]');
      if (r) { enderecoSelecionado = r.value; renderEnderecosModal(); }
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

  // Login
  $('loginForm').addEventListener('submit', processarLogin);
  $('toggleModo').addEventListener('click', e => {
    e.preventDefault();
    abrirLogin(!modoCadastro);
  });

  // Receitas
  $('btnReceitas').addEventListener('click', () => {
    renderReceitas();
    $('receitasOverlay').classList.add('open');
  });
  $('listaReceitas').addEventListener('click', e => {
    const b = e.target.closest('[data-receita]');
    if (b) carregarReceita(b.dataset.receita);
  });

  // Carrinho
  $('btnCarrinho').addEventListener('click', () => {
    renderCarrinho();
    $('carrinhoDrawer').classList.add('open');
    $('drawerBackdrop').classList.add('open');
  });

  // Salvos
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
      carrinho.itens.splice(+rm.dataset.removeItem, 1);
      renderCarrinho();
    }
  });

  // Perfil
  $('btnPerfil').addEventListener('click', abrirPerfil);
  if ($('btnSair')) {
    $('btnSair').addEventListener('click', async () => {
      await supabase.auth.signOut();
      usuario = null;
      enderecos = [];
      enderecoSelecionado = null;
      $('perfilOverlay').classList.remove('open');
      toast('Você saiu');
    });
  }

  // Fechar modais
  document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', () => $(b.dataset.close).classList.remove('open'));
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

  // CEP
  document.querySelectorAll('input[id$="Cep"], #endCep').forEach(inp => {
    inp.addEventListener('blur', async e => {
      const cep = e.target.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await r.json();
        if (d.erro) return;
        if ($('endRua')) $('endRua').value = d.logradouro || '';
        if ($('endBairro')) $('endBairro').value = d.bairro || '';
        if ($('endCidade')) $('endCidade').value = d.localidade || '';
        if ($('endEstado')) $('endEstado').value = d.uf || '';
      } catch {}
    });
  });
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarCatalogo();
    await carregarConfiguracoes();
    await carregarPrecosReceitas();
    montagemPadrao();
    await verificarSessao();
    await carregarEnderecos();
    renderTudo();
    configurarEventos();
    console.log('montaê iniciado com sucesso');
  } catch (err) {
    console.error('ERRO na inicialização:', err);
  }
});
