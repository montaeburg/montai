import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⚠️ SUBSTITUA PELOS DADOS DO SEU PROJETO
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

// ============ HELPERS ============
const $ = (id) => document.getElementById(id);
const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
  const [cats, ings, incs, recs, bebs, exts] = await Promise.all([
    supabase.from('categorias').select('*').order('ordem'),
    supabase.from('ingredientes').select('*').eq('ativo', true).order('ordem'),
    supabase.from('inclusos').select('*').eq('ativo', true).order('ordem'),
    supabase.from('vw_receitas_com_preco').select('*'),
    supabase.from('bebidas').select('*').eq('ativo', true).order('ordem'),
    supabase.from('adicionais_extras').select('*').eq('ativo', true).order('ordem')
  ]);
  catalogo.categorias = cats.data || [];
  catalogo.ingredientes = ings.data || [];
  catalogo.inclusos = incs.data || [];
  catalogo.receitas = recs.data || [];
  catalogo.bebidas = bebs.data || [];
  catalogo.extras = exts.data || [];
}

// ============ MONTAGEM ============
function iniciarMontagem() {
  montagem.camadas = {};
  montagem.inclusos = {};
  catalogo.inclusos.forEach(i => { montagem.inclusos[i.id] = i.padrao; });
  montagem.observacao = '';
  $('obsText').value = '';
  $('obsCounter').textContent = '0/200';
}

// Montagem padrão ao abrir a página
function montagemPadrao() {
  iniciarMontagem();
  // Carne é o único ingrediente que vem por padrão
  const carne = catalogo.ingredientes.find(i => i.id === 'carne' || i.layer === 'patty');
  if (carne) montagem.camadas[carne.id] = 1;
}

function setQtd(id, qtd) {
  if (qtd <= 0) delete montagem.camadas[id];
  else montagem.camadas[id] = qtd;
  renderIngredientes();
  renderBurger();
}

function precoMontagem() {
  let total = 0;
  Object.entries(montagem.camadas).forEach(([id, q]) => {
    const ing = catalogo.ingredientes.find(i => i.id === id);
    if (ing) total += Number(ing.preco) * q;
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
  return lista;
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
    const itens = catalogo.ingredientes.filter(i => i.categoria_id === cat.id);
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
      <img src="${c.url}" alt="${esc(c.nome)}">
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
          <div class="meta">${Object.values(i.camadas).reduce((s,q)=>s+q,0)} complementos</div>
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
      <span style="color:var(--accent-text);">${fmt(r.preco)}</span>
    </button>
  `).join('') || '<p class="empty-state">Nenhuma receita cadastrada.</p>';
}

async function renderSalvos() {
  if (!usuario) {
    $('listaSalvos').innerHTML = '<li class="empty-state">Entre para ver seus hambúrgueres salvos.</li>';
    return;
  }
  const { data } = await supabase.from('hamburgueres_salvos').select('*').order('criado_em', { ascending: false });
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
  const total = precoMontagem() + carrinho.itens.reduce((s,i)=>s+i.preco, 0);
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
  $('loginSubtitle').textContent = cadastro ? 'Cadastre-se para salvar seus pedidos.' : 'Use seu e-mail e senha para acessar.';
  $('loginSubmit').textContent = cadastro ? 'Criar conta' : 'Entrar';
  $('nomeField').style.display = cadastro ? 'flex' : 'none';
  $('toggleModo').textContent = cadastro ? 'Já tenho conta' : 'Criar conta';
  $('loginError').classList.remove('show');
  $('loginOverlay').classList.add('open');
}

async function processarLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const senha = $('loginSenha').value;
  const nome = $('loginNome').value.trim();
  const err = $('loginError');

  if (!email || senha.length < 6) {
    err.textContent = 'Informe e-mail e senha (mínimo 6 caracteres).';
    err.classList.add('show');
    return;
  }

  const { data, error } = modoCadastro
    ? await supabase.auth.signUp({ email, password: senha, options: { data: { nome } } })
    : await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    err.textContent = error.message;
    err.classList.add('show');
    return;
  }

  usuario = data.user;
  $('loginOverlay').classList.remove('open');
  toast(modoCadastro ? 'Conta criada!' : 'Bem-vindo de volta!');
  renderSalvos();
}

async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession();
  usuario = session?.user ?? null;
  supabase.auth.onAuthStateChange((_e, s) => {
    usuario = s?.user ?? null;
    renderSalvos();
  });
}

// ============ AÇÕES ============
function adicionarAoCarrinho(nome) {
  if (!Object.keys(montagem.camadas).length) {
    toast('Adicione pelo menos um ingrediente.');
    return;
  }
  carrinho.itens.push({
    nome: nome || 'Meu montaê',
    camadas: { ...montagem.camadas },
    inclusos: { ...montagem.inclusos },
    observacao: montagem.observacao,
    preco: precoMontagem()
  });
  iniciarMontagem();
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
  const { data } = await supabase
    .from('receita_itens')
    .select('*, ingrediente:ingredientes(*), incluso:inclusos(*)')
    .eq('receita_id', id);

  iniciarMontagem();
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
  toast(receita?.nome + ' carregado');
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
  if (!usuario) { $('enderecoOverlay').classList.remove('open'); abrirLogin(); return; }
  if (!carrinho.itens.length) { toast('Carrinho vazio.'); return; }

  const endereco = {
    cep: $('endCep').value, rua: $('endRua').value, numero: $('endNumero').value,
    complemento: $('endComplemento').value, bairro: $('endBairro').value,
    cidade: $('endCidade').value, estado: $('endEstado').value
  };

  const subtotal = carrinho.itens.reduce((s,i)=>s+i.preco, 0);

  const { data: pedido, error: errPed } = await supabase.from('pedidos').insert({
    user_id: usuario.id,
    endereco_snapshot: endereco,
    subtotal,
    taxa_entrega: 0,
    total: subtotal,
    status: 'pendente'
  }).select().single();

  if (errPed) { $('endError').textContent = errPed.message; $('endError').classList.add('show'); return; }

  const itens = carrinho.itens.map(i => ({
    pedido_id: pedido.id,
    tipo: 'montagem',
    nome: i.nome,
    quantidade: 1,
    preco_unitario: i.preco,
    camadas: i.camadas,
    inclusos: i.inclusos,
    observacao: i.observacao
  }));

  const { error: errItens } = await supabase.from('pedido_itens').insert(itens);
  if (errItens) { $('endError').textContent = errItens.message; $('endError').classList.add('show'); return; }

  carrinho.itens = [];
  $('enderecoOverlay').classList.remove('open');
  $('enderecoForm').reset();
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
  $('checkout').addEventListener('click', () => {
    if (!usuario) { abrirLogin(); return; }
    if (!carrinho.itens.length && !Object.keys(montagem.camadas).length) {
      toast('Monte ou adicione algo antes de concluir.');
      return;
    }
    if (Object.keys(montagem.camadas).length) adicionarAoCarrinho();
    $('enderecoOverlay').classList.add('open');
  });

  $('loginForm').addEventListener('submit', processarLogin);
  $('toggleModo').addEventListener('click', e => {
    e.preventDefault();
    abrirLogin(!modoCadastro);
  });
  $('enderecoForm').addEventListener('submit', finalizarPedido);

  $('btnReceitas').addEventListener('click', () => {
    renderReceitas();
    $('receitasOverlay').classList.add('open');
  });
  $('listaReceitas').addEventListener('click', e => {
    const b = e.target.closest('[data-receita]');
    if (b) carregarReceita(b.dataset.receita);
  });

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
      carrinho.itens.splice(+rm.dataset.removeItem, 1);
      renderCarrinho();
    }
  });

  $('btnPerfil').addEventListener('click', async () => {
    if (usuario) {
      if (confirm('Deseja sair da conta?')) {
        await supabase.auth.signOut();
        usuario = null;
        toast('Você saiu');
      }
    } else abrirLogin();
  });

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

  // Busca de CEP
  $('endCep').addEventListener('blur', async e => {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) return;
      $('endRua').value = d.logradouro || '';
      $('endBairro').value = d.bairro || '';
      $('endCidade').value = d.localidade || '';
      $('endEstado').value = d.uf || '';
    } catch {}
  });
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  await carregarCatalogo();
  iniciarMontagem();
  await verificarSessao();
  renderTudo();
  configurarEventos();
});
