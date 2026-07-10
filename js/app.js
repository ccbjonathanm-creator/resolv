/* ===========================================================
   Dépanne — trouve la solution à ton problème, tous domaines.
   Flux : problème -> l'IA pose des questions -> diagnostic clair
          -> liens vidéos/forums/articles pré-remplis.
   Cerveau : Groq (défaut) ou Gemini, clé gratuite de l'utilisateur
   stockée sur l'appareil. Aucun code distant.
   =========================================================== */

const App = (() => {
  const APP_VERSION = 'v1';
  const LS = 'depanne_settings_v1';

  const state = {
    provider: 'groq',
    keys: { groq:'', gemini:'' },
    problem: '',
    domaine: '',
    questions: [],
    answers: [],
  };

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const screens = { home:$('screen-home'), questions:$('screen-questions'), result:$('screen-result') };
  function show(name){ Object.entries(screens).forEach(([k,el])=>el.classList.toggle('hidden', k!==name)); window.scrollTo(0,0); }
  function loader(on, txt){ $('loader').classList.toggle('hidden', !on); if(txt) $('loader-text').textContent = txt; }
  function toast(msg, ms=2600){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.add('hidden'), ms); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  /* ---------- Réglages ---------- */
  function loadSettings(){
    try{ const s=JSON.parse(localStorage.getItem(LS)); if(s){ state.provider=s.provider||'groq'; state.keys=Object.assign({groq:'',gemini:''}, s.keys||{}); } }catch(e){}
  }
  function saveSettings(){ localStorage.setItem(LS, JSON.stringify({ provider:state.provider, keys:state.keys })); }
  function providerLabel(){ return state.provider==='gemini'?'Gemini':'Groq'; }
  function hasKey(){ return !!state.keys[state.provider]; }

  /* ---------- Appels IA ---------- */
  async function callGroq(system, user){
    const key = state.keys.groq; if(!key) throw new Error('NO_KEY');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body: JSON.stringify({
        model:'llama-3.3-70b-versatile',
        messages:[{role:'system',content:system},{role:'user',content:user}],
        temperature:0.3,
        response_format:{ type:'json_object' }
      })
    });
    if(!r.ok) throw new Error('HTTP_'+r.status);
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content || '';
    if(!txt) throw new Error('EMPTY');
    return txt;
  }
  async function callGemini(system, user){
    const key = state.keys.gemini; if(!key) throw new Error('NO_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        contents:[{ parts:[{ text: user }] }],
        systemInstruction:{ parts:[{ text: system }] },
        generationConfig:{ responseMimeType:'application/json', temperature:0.3 }
      })
    });
    if(!r.ok) throw new Error('HTTP_'+r.status);
    const j = await r.json();
    const txt = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '';
    if(!txt) throw new Error('EMPTY');
    return txt;
  }
  async function callAI(system, user){
    return state.provider==='gemini' ? callGemini(system,user) : callGroq(system,user);
  }
  function parseJSON(txt){
    // robustesse : enlève d'éventuelles balises ```json et isole le premier objet {...}
    let t = String(txt).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    const a=t.indexOf('{'), b=t.lastIndexOf('}');
    if(a>=0 && b>a) t=t.slice(a,b+1);
    return JSON.parse(t);
  }

  /* ---------- Étape 1 : questions de précision ---------- */
  const SYS_Q = `Tu es un expert en dépannage tous domaines (auto, vélo, jardinage, électroménager, informatique, bricolage, maison...).
On te donne un problème décrit par un particulier. Ta mission : identifier le domaine, puis poser de 3 à 5 questions COURTES et CONCRÈTES dont les réponses sont indispensables pour bien diagnostiquer (marque/modèle, âge, symptômes précis, quand ça arrive, ce qui a déjà été tenté...).
Réponds UNIQUEMENT en JSON valide, en français, au format :
{"domaine":"un ou deux mots", "questions":["question 1","question 2","question 3"]}
Pas de texte hors du JSON.`;

  async function askQuestions(){
    const sys = SYS_Q;
    const user = `Problème du particulier : "${state.problem}"`;
    const raw = await callAI(sys, user);
    const data = parseJSON(raw);
    state.domaine = (data.domaine||'').toString().slice(0,40);
    state.questions = Array.isArray(data.questions) ? data.questions.slice(0,5).map(q=>String(q)) : [];
    if(!state.questions.length) throw new Error('NO_Q');
  }

  function renderQuestions(){
    $('q-domain').textContent = state.domaine || 'Diagnostic';
    const box = $('questions-list'); box.innerHTML='';
    state.questions.forEach((q,i)=>{
      const div=document.createElement('div'); div.className='q-item';
      div.innerHTML = `<label for="q${i}">${esc(q)}</label>
        <input type="text" id="q${i}" placeholder="Ta réponse (ou « je ne sais pas »)">`;
      box.appendChild(div);
    });
    show('questions');
  }

  /* ---------- Étape 2 : diagnostic ---------- */
  const SYS_D = `Tu es un expert en dépannage tous domaines qui aide un particulier débutant.
On te donne un problème et les réponses à des questions de précision.
Fournis un diagnostic clair, pragmatique et prudent. Classe les causes de la plus probable à la moins probable.
Donne des étapes de vérification/réparation dans l'ordre logique (du plus simple et gratuit au plus complexe).
Signale tout risque de sécurité (électricité, gaz, hauteur, garantie...) et dis quand il vaut mieux appeler un professionnel.
Propose 2 à 4 requêtes de recherche EFFICACES (mots-clés que taperait un bon bricoleur) pour trouver des tutos vidéo et des discussions de forum sur CE problème précis (inclure la marque/le modèle si connu).
Réponds UNIQUEMENT en JSON valide, en français, au format EXACT :
{
 "resume":"1 à 2 phrases qui résument le diagnostic",
 "causes":[{"titre":"...","explication":"...","probabilite":"élevée|moyenne|faible"}],
 "etapes":["étape 1","étape 2"],
 "outils":["outil ou pièce 1","outil ou pièce 2"],
 "securite":"avertissement de sécurité ou chaîne vide",
 "difficulte":"facile|moyen|difficile|pro",
 "recherches":["requête 1","requête 2"]
}
Pas de texte hors du JSON.`;

  function collectAnswers(){
    state.answers = state.questions.map((q,i)=>({ q, a:($('q'+i)?.value||'').trim() }));
  }

  async function diagnose(){
    const sys = SYS_D;
    const qa = state.answers.map(x=>`- ${x.q}\n  Réponse : ${x.a||'(non précisé)'}`).join('\n');
    const user = `Problème : "${state.problem}"\nDomaine : ${state.domaine}\nPrécisions :\n${qa}`;
    const raw = await callAI(sys, user);
    return parseJSON(raw);
  }

  /* ---------- Liens de recherche pré-remplis ---------- */
  function searchLinks(query){
    const q = encodeURIComponent(query);
    const yt = `https://www.youtube.com/results?search_query=${q}`;
    const gg = `https://www.google.com/search?q=${q}`;
    const fo = `https://www.google.com/search?q=${encodeURIComponent(query + ' forum')}`;
    return `<div class="search-group">
      <p class="search-q">🔎 ${esc(query)}</p>
      <div class="links">
        <a class="link yt" href="${yt}" target="_blank" rel="noopener">▶️ Vidéos YouTube</a>
        <a class="link gg" href="${gg}" target="_blank" rel="noopener">🌐 Articles &amp; tutos</a>
        <a class="link fo" href="${fo}" target="_blank" rel="noopener">💬 Forums</a>
      </div>
    </div>`;
  }

  /* ---------- Rendu du diagnostic ---------- */
  const PROB_CLASS = { 'élevée':'high','elevee':'high','moyenne':'mid','faible':'low' };
  function renderResult(d){
    const causes = Array.isArray(d.causes)?d.causes:[];
    const etapes = Array.isArray(d.etapes)?d.etapes:[];
    const outils = Array.isArray(d.outils)?d.outils:[];
    const rech   = Array.isArray(d.recherches)&&d.recherches.length?d.recherches:[state.problem];
    const diff   = (d.difficulte||'moyen').toLowerCase();
    const diffLabel = { facile:'Facile à faire soi-même', moyen:'Difficulté moyenne', difficile:'Difficile, sois méthodique', pro:'Mieux vaut un professionnel' }[diff] || 'Difficulté moyenne';

    let html = `<h2 class="r-title">Diagnostic</h2>`;
    if(d.resume) html += `<div class="r-resume">${esc(d.resume)}</div>`;

    html += `<div class="diff-badge"><span class="dot ${diff}"></span>${esc(diffLabel)}</div>`;

    if(d.securite && String(d.securite).trim())
      html += `<div class="safety">⚠️ ${esc(d.securite)}</div>`;

    if(causes.length){
      html += `<div class="block-title"><span class="ic">🧩</span>Causes probables</div>`;
      causes.forEach(c=>{
        const cl = PROB_CLASS[(c.probabilite||'moyenne').toLowerCase()] || 'mid';
        html += `<div class="cause ${cl}">
          <h4>${esc(c.titre)}<span class="prob ${cl}">${esc(c.probabilite||'')}</span></h4>
          <p>${esc(c.explication)}</p></div>`;
      });
    }

    if(etapes.length){
      html += `<div class="block-title"><span class="ic">🛠️</span>Marche à suivre</div>`;
      html += `<ol class="steps">${etapes.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`;
    }

    if(outils.length){
      html += `<div class="block-title"><span class="ic">🧰</span>Outils &amp; pièces</div>`;
      html += `<div class="taglist">${outils.map(o=>`<span class="tag">${esc(o)}</span>`).join('')}</div>`;
    }

    html += `<div class="block-title"><span class="ic">📺</span>Trouver les tutos &amp; les avis</div>`;
    html += rech.map(searchLinks).join('');

    html += `<div class="r-actions">
      <button class="btn ghost" id="r-copy">Copier</button>
      <button class="btn primary" id="r-new">Nouveau problème</button>
    </div>`;

    $('result-body').innerHTML = html;
    show('result');
    $('r-copy').addEventListener('click', ()=>copyResult(d));
    $('r-new').addEventListener('click', reset);
  }

  function copyResult(d){
    const lines = [];
    lines.push('DIAGNOSTIC — '+state.problem);
    if(d.resume) lines.push('\n'+d.resume);
    if(d.causes?.length){ lines.push('\nCauses probables :'); d.causes.forEach(c=>lines.push(`- ${c.titre} (${c.probabilite}) : ${c.explication}`)); }
    if(d.etapes?.length){ lines.push('\nMarche à suivre :'); d.etapes.forEach((s,i)=>lines.push(`${i+1}. ${s}`)); }
    if(d.outils?.length) lines.push('\nOutils/pièces : '+d.outils.join(', '));
    if(d.securite) lines.push('\n⚠️ '+d.securite);
    navigator.clipboard?.writeText(lines.join('\n')).then(()=>toast('Diagnostic copié')).catch(()=>toast('Copie impossible'));
  }

  /* ---------- Erreurs ---------- */
  function errMsg(err){
    const m = String(err.message||err);
    if(m==='NO_KEY') return `Il manque ta clé ${providerLabel()}. Ouvre les réglages (⚙️) pour la coller, c'est gratuit.`;
    if(m==='HTTP_401'||m==='HTTP_403') return `Clé refusée. Recolle une clé ${providerLabel()} valide dans les réglages.`;
    if(m==='HTTP_400') return `Requête refusée (clé invalide ?). Vérifie ta clé dans les réglages.`;
    if(m==='HTTP_429') return `Quota IA atteint pour l'instant. Réessaie dans un moment.`;
    if(m==='NO_Q'||m==='EMPTY') return `L'IA n'a rien renvoyé d'exploitable. Reformule ton problème et réessaie.`;
    if(m.startsWith('HTTP_5')) return `Le service IA est momentanément indisponible. Réessaie dans un moment.`;
    if(m.includes('JSON')) return `Réponse de l'IA illisible. Réessaie (ou change de cerveau dans les réglages).`;
    return `Souci de connexion. Vérifie ta connexion internet et réessaie.`;
  }

  /* ---------- Flux ---------- */
  async function onGo(){
    const p = $('problem').value.trim();
    if(!p){ toast('Décris ton problème en une phrase.'); return; }
    if(!hasKey()){ toast(`Ajoute ta clé ${providerLabel()} (⚙️), c'est gratuit.`); openSettings(); return; }
    if(!Licence.guard()) return;            // mur payant si 2 diagnostics déjà utilisés
    state.problem = p;
    loader(true, 'Analyse de ton problème…');
    try{
      await askQuestions();
      renderQuestions();
    }catch(err){ toast(errMsg(err), 4200); }
    finally{ loader(false); }
  }

  async function onDiagnose(){
    collectAnswers();
    if(!Licence.guard()) return;
    loader(true, 'Diagnostic en cours…');
    try{
      const d = await diagnose();
      Licence.consume();                    // 1 diagnostic livré = 1 usage
      refreshQuota();
      renderResult(d);
    }catch(err){ toast(errMsg(err), 4200); }
    finally{ loader(false); }
  }

  function reset(){
    state.problem=''; state.questions=[]; state.answers=[]; state.domaine='';
    $('problem').value='';
    show('home');
  }

  function refreshQuota(){
    const line = $('quota-line');
    if(Licence.isLicensed()){ line.innerHTML = '✓ Version complète débloquée à vie'; return; }
    const left = Licence.usesLeft();
    line.innerHTML = left>0
      ? `Version d'essai — <b>${left}</b> diagnostic${left>1?'s':''} gratuit${left>1?'s':''} restant${left>1?'s':''}`
      : `Essai terminé — débloque l'appli à vie pour 15 €`;
  }

  /* ---------- Feuille de réglages ---------- */
  function openSettings(){
    const back = document.createElement('div'); back.className='sheet-back';
    const g = state.keys.groq, ge = state.keys.gemini;
    back.innerHTML = `<div class="sheet">
      <h3>⚙️ Réglages</h3>
      <p class="hint">Choisis ton cerveau IA et colle ta clé gratuite. Elle reste sur ton appareil, jamais envoyée ailleurs qu'au service choisi.</p>

      <div class="radio-row" id="prov-row">
        <label><input type="radio" name="prov" value="groq" ${state.provider==='groq'?'checked':''}><span>Groq</span></label>
        <label><input type="radio" name="prov" value="gemini" ${state.provider==='gemini'?'checked':''}><span>Gemini</span></label>
      </div>

      <label class="field"><span class="lab">Clé Groq</span>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="password" id="k-groq" placeholder="gsk_..." value="${esc(g)}">
        </div>
        <a class="help-link" href="https://console.groq.com/keys" target="_blank" rel="noopener">Créer ma clé Groq gratuite ↗</a>
      </label>

      <label class="field"><span class="lab">Clé Gemini</span>
        <input type="password" id="k-gemini" placeholder="AIza..." value="${esc(ge)}">
        <a class="help-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Créer ma clé Gemini gratuite ↗</a>
      </label>

      <div class="btn-row">
        <button class="btn ghost" id="s-close">Fermer</button>
        <button class="btn primary" id="s-save">Enregistrer</button>
      </div>
      <div class="version-line" id="s-version">Resolv ${APP_VERSION}</div>
    </div>`;
    document.body.appendChild(back);
    const close=()=>back.remove();
    back.addEventListener('click', e=>{ if(e.target===back) close(); });
    back.querySelector('#s-close').addEventListener('click', close);
    back.querySelector('#s-save').addEventListener('click', ()=>{
      state.provider = back.querySelector('input[name="prov"]:checked').value;
      state.keys.groq = back.querySelector('#k-groq').value.trim();
      state.keys.gemini = back.querySelector('#k-gemini').value.trim();
      saveSettings(); close(); toast('Réglages enregistrés');
    });
    if(window.Vendeur) Vendeur.bindLongPress(back.querySelector('#s-version'));
  }

  /* ---------- Câblage ---------- */
  function wire(){
    $('btn-go').addEventListener('click', onGo);
    $('btn-diagnose').addEventListener('click', onDiagnose);
    $('btn-settings').addEventListener('click', openSettings);
    $('q-back').addEventListener('click', ()=>show('home'));
    $('r-back').addEventListener('click', reset);
    document.querySelectorAll('#examples .chip').forEach(c=>{
      c.addEventListener('click', ()=>{ $('problem').value = c.dataset.ex; $('problem').focus(); });
    });
  }

  async function init(){
    loadSettings();
    await Licence.init();
    wire();
    refreshQuota();
    show('home');
    if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
  document.addEventListener('DOMContentLoaded', init);

  return { toast, refreshQuota };
})();
window.App = App;
