/* ============================================================
   trial.js — compteur d'essais gratuits côté serveur (Cloudflare Worker).
   But : la réinstallation de l'app ne redonne pas d'essais. Le compteur
   vit sur le Worker, indexé par l'e-mail de la personne (haché côté serveur).
   Repli honnête : si le Worker est injoignable, on laisse passer (fail-open)
   pour ne pas bloquer un utilisateur légitime ; on ne décompte simplement pas.
   ============================================================ */
const Trial = (() => {
  const WORKER = 'https://resolv-trials.contactweb71.workers.dev';
  const EKEY   = 'resolv.trial_email';
  let email = null;
  let usesLeft = null;   // null = inconnu (pas encore interrogé / hors-ligne)
  let limit = 10;

  const norm  = e => (e || '').trim().toLowerCase();
  const valid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(e));

  function load(){ try{ email = localStorage.getItem(EKEY) || null; }catch(e){ email = null; } }
  function hasEmail(){ return !!email; }
  function getEmail(){ return email; }
  function setEmail(e){ email = norm(e); try{ localStorage.setItem(EKEY, email); }catch(_){}}

  async function api(path){
    const r = await fetch(WORKER + path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email })
    });
    if(!r.ok) throw new Error('HTTP_'+r.status);
    return r.json();
  }

  // Interroge le compteur SANS consommer. null si inconnu (hors-ligne).
  async function status(){
    if(!email) return null;
    try{ const j = await api('/api/status'); usesLeft = j.usesLeft; limit = j.limit; return j; }
    catch(e){ return null; }
  }

  // Consomme un essai. Renvoie {allowed}. Fail-open (allowed:true, offline:true)
  // si le Worker est injoignable, pour ne pas bloquer sur une panne réseau.
  async function consume(){
    if(!email) return { allowed:false, noEmail:true };
    try{ const j = await api('/api/consume'); usesLeft = j.usesLeft; limit = j.limit; return j; }
    catch(e){ return { allowed:true, offline:true }; }
  }

  return {
    load, hasEmail, getEmail, setEmail, valid, status, consume,
    get usesLeft(){ return usesLeft; },
    get limit(){ return limit; }
  };
})();
window.Trial = Trial;
