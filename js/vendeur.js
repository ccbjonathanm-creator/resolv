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

  // --- Registre des ventes (e-mail -> clé + date), gardé sur l'appareil du vendeur ---
  const LKEY = VKEY.replace('.vendeur', '.ledger');
  const esc  = s => (s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function ledgerGet(){ try{ return JSON.parse(localStorage.getItem(LKEY)) || []; }catch(e){ return []; } }
  function ledgerSave(l){ localStorage.setItem(LKEY, JSON.stringify(l)); }
  function ledgerAdd(email, key){
    email = (email||'').trim().toLowerCase();
    const l = ledgerGet(); const i = l.findIndex(x=> x.email===email);
    const e = { email, key, date:new Date().toISOString().slice(0,10) };
    if(i>=0) l[i]=e; else l.push(e); ledgerSave(l);
  }

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
      <div class="btn-row" style="justify-content:space-between">
        <button class="btn ghost" id="v-ledger">📋 Registre (${ledgerGet().length})</button>
        <button class="btn primary" id="v-gen">Générer la clé</button></div>
      <div id="v-out" class="result" style="display:none;margin-top:14px"></div>
      <div class="spacer"></div>
      <button class="btn ghost block" id="v-done">Fermer</button>`;
    body.querySelector('#v-done').addEventListener('click', close);
    body.querySelector('#v-ledger').addEventListener('click', ()=> viewLedger(body, close));
    body.querySelector('#v-gen').addEventListener('click', async ()=>{
      const email = body.querySelector('#v-email').value.trim();
      const out = body.querySelector('#v-out');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ out.style.display='block'; out.textContent='Entre un e-mail valide.'; return; }
      try{
        const licence = await signEmail(privInMemory, email);
        ledgerAdd(email, licence);
        out.style.display='block';
        out.innerHTML = `<div class="hint" style="margin-bottom:6px">Clé pour <b>${email.toLowerCase()}</b> (copiée, enregistrée) — envoie e-mail + clé au client :</div>
          <div style="word-break:break-all;font-family:ui-monospace,monospace;font-size:13px;color:var(--accent2)">${licence}</div>`;
        if (navigator.clipboard) navigator.clipboard.writeText(licence);
        toast('Clé générée et copiée');
      }catch(e){ out.style.display='block'; out.textContent='Erreur : '+e.message; }
    });
  }

  function viewLedger(body, close){
    body.innerHTML = `
      <h3>📋 Registre des ventes</h3>
      <p class="hint">Tes acheteurs, gardés sur cet appareil. Cherche un e-mail pour vérifier un achat et recopier sa clé.</p>
      <label class="field"><input type="search" id="ld-q" placeholder="Chercher un e-mail…" autocomplete="off"></label>
      <div id="ld-list" style="max-height:44vh;overflow:auto"></div>
      <div class="btn-row" style="justify-content:space-between;margin-top:10px">
        <span><button class="btn ghost" id="ld-exp">⬇ Sauvegarder</button> <button class="btn ghost" id="ld-imp">⬆ Restaurer</button></span>
        <button class="btn ghost" id="ld-back">Retour</button></div>
      <input id="ld-file" type="file" accept=".json,application/json" style="display:none">`;
    const render=()=>{
      const q=(body.querySelector('#ld-q').value||'').trim().toLowerCase();
      const list=ledgerGet().filter(x=>!q||x.email.includes(q)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      const box=body.querySelector('#ld-list');
      if(!list.length){ box.innerHTML='<p class="hint">'+(q?'Aucun e-mail ne correspond.':'Aucune vente enregistrée pour l\'instant.')+'</p>'; return; }
      box.innerHTML=list.map((x,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid rgba(255,255,255,.1)">
        <div style="flex:1;min-width:0"><div style="font-weight:700;word-break:break-all">${esc(x.email)}</div><div class="hint" style="font-size:11px">acheté le ${x.date||'?'}</div></div>
        <button class="btn ghost" data-i="${i}" style="flex:none">Copier la clé</button></div>`).join('');
      box.querySelectorAll('button[data-i]').forEach(b=> b.addEventListener('click',()=>{ const x=list[+b.dataset.i]; if(navigator.clipboard) navigator.clipboard.writeText(x.key); toast('Clé de '+x.email+' copiée'); }));
    };
    render();
    body.querySelector('#ld-q').addEventListener('input', render);
    body.querySelector('#ld-back').addEventListener('click', ()=> viewGenerate(body, close));
    body.querySelector('#ld-exp').addEventListener('click', ()=>{ const url=URL.createObjectURL(new Blob([JSON.stringify(ledgerGet(),null,1)],{type:'application/json'})); const a=document.createElement('a'); a.href=url; a.download='licences-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(url); toast('Registre sauvegardé'); });
    body.querySelector('#ld-imp').addEventListener('click', ()=> body.querySelector('#ld-file').click());
    body.querySelector('#ld-file').addEventListener('change', async e=>{ const f=e.target.files[0]; if(!f)return; try{ const arr=JSON.parse(await f.text()); if(!Array.isArray(arr))throw 0; const m=new Map(ledgerGet().map(x=>[x.email,x])); for(const x of arr){ if(x&&x.email&&x.key){ const em=x.email.trim().toLowerCase(); m.set(em,{email:em,key:x.key,date:x.date||''}); } } ledgerSave([...m.values()]); toast('Registre restauré'); render(); }catch(_){ toast('Fichier invalide'); } e.target.value=''; });
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
