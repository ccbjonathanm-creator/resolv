/* ============================================================
   licence.js — 2 diagnostics gratuits puis clé de licence à vie.
   Sécurité : la clé de licence est une SIGNATURE ECDSA P-256 de
   l'E-MAIL de l'acheteur (normalisé). Elle marche sur n'importe
   quel appareil et survit à une réinstallation (le client ressaisit
   son e-mail + sa clé). La clé privée n'est JAMAIS dans l'app
   (seul le vendeur peut signer). L'app ne fait que vérifier.
   ============================================================ */
const Licence = (() => {

  // Clé PUBLIQUE de vérification (la privée reste chez le vendeur).
  const PUB = { kty:'EC', crv:'P-256',
    x:'YIEjRQWhrl2ZUTuDdunAWKoAwn_amcBwGcZLyupz5ds',
    y:'A2Ncq2L_h0Hu52JTaheio0THTxH7UJ7zFWut2UVNI4E' };

  const LKEY = 'depanne.lic';   // stocké à part : survit à un reset des réglages
  const FREE_USES = 2;
  let state = null;
  let verified = false;

  // normalisation IDENTIQUE côté vérif et côté générateur
  const normEmail = e => (e || '').trim().toLowerCase();

  function load(){
    try{ state = JSON.parse(localStorage.getItem(LKEY)); }catch(e){ state = null; }
    if (!state || typeof state !== 'object'){
      state = { email:null, uses:0, key:null };
      save();
    }
    if (typeof state.uses !== 'number') state.uses = 0;
  }
  function save(){ try{ localStorage.setItem(LKEY, JSON.stringify(state)); }catch(e){} }

  function usesLeft(){ return Math.max(0, FREE_USES - state.uses); }
  function isLicensed(){ return verified; }
  function licensedEmail(){ return verified ? state.email : null; }
  function canUse(){ return verified || usesLeft() > 0; }
  function consume(){ if (!verified){ state.uses++; save(); } }

  function b64urlToBuf(s){
    s = s.replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '=';
    const bin = atob(s); const buf = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  async function verify(keyB64, email){
    try{
      const pub = await crypto.subtle.importKey('jwk', PUB, {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
      const sig = b64urlToBuf((keyB64||'').trim());
      const data = new TextEncoder().encode(normEmail(email));
      return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, pub, sig, data);
    }catch(e){ return false; }
  }

  async function init(){
    load();
    verified = (state.key && state.email) ? await verify(state.key, state.email) : false;
    return verified;
  }

  async function activate(email, keyStr){
    const ok = await verify(keyStr, email);
    if (ok){ state.email = normEmail(email); state.key = (keyStr||'').trim(); save(); verified = true; }
    return ok;
  }

  // Écran d'activation. isPaywall=true quand l'essai est épuisé (message 15 €),
  // sinon activation manuelle accessible à tout moment (bouton dans les Réglages / l'accueil).
  function openSheet(isPaywall){
    // déjà licencié : on affiche juste le statut
    if (verified){
      const back = document.createElement('div'); back.className='sheet-back';
      back.innerHTML = `<div class="sheet">
        <h3>✓ Version complète active</h3>
        <div class="result" style="background:rgba(49,208,170,.1);border-color:rgba(49,208,170,.4);margin:10px 0">
          Resolv est débloqué à vie sur cet appareil pour <b>${state.email||''}</b>. Merci !
        </div>
        <div class="btn-row"><button class="btn primary block" id="lic-ok">Fermer</button></div>
        <div class="version-line" id="lic-version">Resolv</div>
      </div>`;
      document.body.appendChild(back);
      const close=()=>back.remove();
      back.addEventListener('click', e=>{ if(e.target===back) close(); });
      back.querySelector('#lic-ok').addEventListener('click', close);
      if (window.Vendeur) Vendeur.bindLongPress(back.querySelector('#lic-version'));
      return;
    }

    const back = document.createElement('div'); back.className = 'sheet-back';
    const banner = isPaywall
      ? `<div class="result" style="background:rgba(61,139,255,.1);border-color:rgba(61,139,255,.4);margin:10px 0">
           Tu as utilisé tes <b>2 diagnostics gratuits</b>. Pour continuer sans limite, débloque l'appli
           <b>à vie pour 15 €</b> (paiement unique, aucun abonnement).
         </div>`
      : `<p class="hint">Tu as acheté Resolv ? Saisis ton e-mail d'achat et la clé qu'on t'a envoyée pour débloquer l'appli à vie.</p>`;
    back.innerHTML = `<div class="sheet">
      <h3>🔓 ${isPaywall ? 'Débloque Resolv à vie' : 'Activer ma licence'}</h3>
      ${banner}
      <p class="hint">La clé est liée à ton e-mail : elle marche sur tous tes appareils, même après une réinstallation.</p>
      <label class="field"><span class="lab">E-mail d'achat</span>
        <input type="email" id="pw-email" placeholder="Ton e-mail d'achat" autocomplete="email" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span class="lab">Clé de licence</span>
        <input type="text" id="pw-key" placeholder="Colle ta clé ici" autocomplete="off"></label>
      <div id="pw-status" class="hint"></div>
      <div class="btn-row">
        <button class="btn ghost" id="pw-close">${isPaywall ? 'Plus tard' : 'Fermer'}</button>
        <button class="btn primary" id="pw-activate">Activer ma clé</button>
      </div>
      <div class="version-line" id="pw-version">Resolv</div>
    </div>`;
    document.body.appendChild(back);
    const close = ()=>back.remove();
    back.addEventListener('click', e=>{ if (e.target===back) close(); });
    back.querySelector('#pw-close').addEventListener('click', close);
    // appui long / 5 appuis sur le nom = mode vendeur (génération de clés)
    if (window.Vendeur) Vendeur.bindLongPress(back.querySelector('#pw-version'));
    // pré-remplit l'e-mail si déjà saisi une fois
    if (state.email) back.querySelector('#pw-email').value = state.email;
    back.querySelector('#pw-activate').addEventListener('click', async ()=>{
      const email = back.querySelector('#pw-email').value.trim();
      const k = back.querySelector('#pw-key').value.trim();
      const st = back.querySelector('#pw-status');
      if (!email){ st.textContent = 'Saisis ton e-mail d\'achat.'; return; }
      if (!k){ st.textContent = 'Colle ta clé de licence.'; return; }
      st.textContent = 'Vérification…';
      const ok = await activate(email, k);
      if (ok){ close(); window.App && App.toast('✓ Débloqué à vie, merci !'); window.App && App.refreshQuota(); }
      else { st.textContent = '❌ E-mail ou clé incorrects.'; }
    });
  }

  function paywall(){ openSheet(true); }        // essai épuisé
  function openActivate(){ openSheet(false); }  // bouton "Activer" toujours accessible

  // Garde : true si l'action est permise, sinon ouvre le paywall et renvoie false.
  function guard(){
    if (canUse()) return true;
    paywall();
    return false;
  }

  return { init, canUse, consume, guard, paywall, openActivate, isLicensed, licensedEmail, usesLeft,
           activate, FREE_USES };
})();
window.Licence = Licence;
