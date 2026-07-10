/* ============================================================
   vendeur.js — générateur de clés de licence INTÉGRÉ (mode vendeur)
   Caché derrière un appui long sur le numéro de version (Réglages)
   ou sur le nom dans le mur payant.
   La clé privée n'est JAMAIS dans le code : le vendeur la saisit une
   fois, elle est chiffrée (AES-GCM + passphrase, PBKDF2) et gardée
   sur son seul appareil.
   ============================================================ */
const Vendeur = (() => {

  const VKEY = 'depanne.vendeur';   // blob chiffré {salt, iv, ct}
  let privInMemory = null;          // clé privée déchiffrée, mémoire de session seulement

  const b64  = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => { const bin=atob(s); const a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; };
  const b64url = buf => b64(buf).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const toast = m => { window.App && App.toast(m); };

  function hasKey(){ try{ return !!localStorage.getItem(VKEY); }catch(e){ return false; } }

  async function deriveKey(pass, salt){
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations:150000, hash:'SHA-256' },
      km, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  }

  async function storePriv(jwkStr, pass){
    JSON.parse(jwkStr); // valide le JSON
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(pass, salt);
    const ct   = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(jwkStr));
    localStorage.setItem(VKEY, JSON.stringify({ salt:b64(salt), iv:b64(iv), ct:b64(ct) }));
  }

  async function unlockPriv(pass){
    const blob = JSON.parse(localStorage.getItem(VKEY));
    const key  = await deriveKey(pass, unb64(blob.salt));
    const pt   = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)}, key, unb64(blob.ct));
    return new TextDecoder().decode(pt); // throw si mauvaise passphrase
  }

  // signe l'e-mail normalisé (doit correspondre EXACTEMENT à licence.js : trim + minuscules)
  async function signEmail(jwkStr, email){
    const jwk = JSON.parse(jwkStr);
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign']);
    const em = (email||'').trim().toLowerCase();
    const sig = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, key, new TextEncoder().encode(em));
    return b64url(new Uint8Array(sig));
  }

  function open(){
    const back = document.createElement('div'); back.className='sheet-back';
    back.innerHTML = `<div class="sheet"><div id="v-body"></div></div>`;
    document.body.appendChild(back);
    const close = ()=>back.remove();
    back.addEventListener('click', e=>{ if (e.target===back) close(); });
    const body = back.querySelector('#v-body');
    if (privInMemory) return viewGenerate(body, close);
    if (hasKey())      return viewUnlock(body, close);
    return viewSetup(body, close);
  }

  function viewSetup(body, close){
    body.innerHTML = `
      <h3>🔑 Mode vendeur — installation</h3>
      <p class="hint">Colle ta clé privée de signature (JWK). Elle sera chiffrée et gardée sur ce seul appareil, jamais en clair, jamais dans le code.</p>
      <label class="field"><span class="lab">Clé privée (JWK)</span>
        <textarea id="v-priv" placeholder='{"kty":"EC","d":"...","x":"...","y":"...","crv":"P-256"}'></textarea></label>
      <label class="field"><span class="lab">Choisis une passphrase</span>
        <input type="password" id="v-pass" placeholder="mot de passe vendeur"></label>
      <div id="v-status" class="hint"></div>
      <div class="btn-row"><button class="btn ghost" id="v-cancel">Annuler</button><button class="btn primary" id="v-save">Enregistrer (chiffré)</button></div>`;
    body.querySelector('#v-cancel').addEventListener('click', close);
    body.querySelector('#v-save').addEventListener('click', async ()=>{
      const priv = body.querySelector('#v-priv').value.trim();
      const pass = body.querySelector('#v-pass').value;
      const st = body.querySelector('#v-status');
      if (!priv || !pass){ st.textContent='Clé privée et passphrase requises.'; return; }
      try{ await storePriv(priv, pass); privInMemory = priv; toast('Clé vendeur enregistrée 🔒'); viewGenerate(body, close); }
      catch(e){ st.textContent='Clé privée invalide (JSON incorrect).'; }
    });
  }

  function viewUnlock(body, close){
    body.innerHTML = `
      <h3>🔑 Mode vendeur</h3>
      <p class="hint">Déverrouille ta clé de signature pour générer une licence.</p>
      <label class="field"><span class="lab">Passphrase vendeur</span>
        <input type="password" id="v-pass" placeholder="mot de passe vendeur"></label>
      <div id="v-status" class="hint"></div>
      <div class="btn-row"><button class="btn ghost" id="v-forget">Oublier la clé</button><button class="btn primary" id="v-unlock">Déverrouiller</button></div>`;
    body.querySelector('#v-forget').addEventListener('click', ()=>{
      if (confirm('Supprimer la clé vendeur de cet appareil ?')){ localStorage.removeItem(VKEY); privInMemory=null; close(); toast('Clé vendeur supprimée'); }
    });
    body.querySelector('#v-unlock').addEventListener('click', async ()=>{
      const pass = body.querySelector('#v-pass').value; const st = body.querySelector('#v-status');
      if (!pass){ st.textContent='Entre ta passphrase.'; return; }
      st.textContent='Déverrouillage…';
      try{ privInMemory = await unlockPriv(pass); viewGenerate(body, close); }
      catch(e){ st.textContent='❌ Passphrase incorrecte.'; }
    });
  }

  function viewGenerate(body, close){
    body.innerHTML = `
      <h3>🔑 Générer une licence</h3>
      <p class="hint">Entre l'e-mail que le client t'a communiqué à l'achat. La clé sera liée à cet e-mail (valable sur tous ses appareils).</p>
      <label class="field"><span class="lab">E-mail du client</span>
        <input type="email" id="v-email" placeholder="ex. client@mail.com" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="btn-row"><button class="btn primary" id="v-gen">Générer la clé</button></div>
      <div id="v-out" class="result" style="display:none;margin-top:14px"></div>
      <div class="spacer"></div>
      <button class="btn ghost block" id="v-done">Fermer</button>`;
    body.querySelector('#v-done').addEventListener('click', close);
    body.querySelector('#v-gen').addEventListener('click', async ()=>{
      const email = body.querySelector('#v-email').value.trim();
      const out = body.querySelector('#v-out');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ out.style.display='block'; out.textContent='Entre un e-mail valide.'; return; }
      try{
        const licence = await signEmail(privInMemory, email);
        out.style.display='block';
        out.innerHTML = `<div class="hint" style="margin-bottom:6px">Clé pour <b>${email.toLowerCase()}</b> (copiée) — envoie e-mail + clé au client :</div>
          <div style="word-break:break-all;font-family:ui-monospace,monospace;font-size:13px;color:var(--accent2)">${licence}</div>`;
        if (navigator.clipboard) navigator.clipboard.writeText(licence);
        toast('Clé générée et copiée');
      }catch(e){ out.style.display='block'; out.textContent='Erreur : '+e.message; }
    });
  }

  // Ouvre le mode vendeur : appui long OU 5 appuis rapides (fiable sur mobile,
  // où l'appui long est souvent capté par le navigateur pour sélectionner le texte).
  function bindLongPress(el){
    if (!el) return;
    el.style.touchAction = 'manipulation';
    el.style.userSelect = 'none';
    el.style.webkitUserSelect = 'none';
    el.style.cursor = 'pointer';
    el.addEventListener('contextmenu', e => e.preventDefault());

    // 1) appui long (~800 ms)
    let timer=null;
    const start=()=>{ clearTimeout(timer); timer=setTimeout(open, 800); };
    const cancel=()=>{ clearTimeout(timer); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);

    // 2) repli imparable : 5 appuis rapides (< 800 ms entre chaque)
    let taps=0, tapTimer=null;
    el.addEventListener('click', ()=>{
      taps++;
      clearTimeout(tapTimer);
      tapTimer=setTimeout(()=>{ taps=0; }, 800);
      if (taps>=5){ taps=0; clearTimeout(tapTimer); open(); }
    });
  }

  return { open, bindLongPress, hasKey };
})();
window.Vendeur = Vendeur;
