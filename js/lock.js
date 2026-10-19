'use strict';
/* Senha opcional para abrir o app.
   A senha nunca é guardada: só um hash PBKDF2-SHA256 com sal aleatório.
   Importante: é uma trava de uso (impede que outra pessoa abra o app no seu aparelho),
   não uma criptografia dos dados. Os hashes ficam só neste aparelho (não sincronizam). */

const Lock = {
  ITER: 200000,
  supported: () => !!(window.crypto && crypto.subtle),
  async isSet() { return !!(await Store.getMeta('lock')); },
  unlocked() { try { return sessionStorage.getItem('cg-unlocked') === '1'; } catch { return false; } },
  _markUnlocked() { try { sessionStorage.setItem('cg-unlocked', '1'); } catch { /* ignorar */ } },

  _b64: buf => btoa(String.fromCharCode(...new Uint8Array(buf))),
  _unb64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  async _hash(pw, salt, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return this._b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
  },

  async set(pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await Store.setMeta('lock', { salt: this._b64(salt), iter: this.ITER, hash: await this._hash(pw, salt, this.ITER) });
    this._markUnlocked();
  },
  async verify(pw) {
    const rec = await Store.getMeta('lock');
    if (!rec) return true;
    const h = await this._hash(pw, this._unb64(rec.salt), rec.iter);
    let diff = h.length ^ rec.hash.length;                       // comparação sem atalho
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (rec.hash.charCodeAt(i) || 0);
    return diff === 0;
  },
  async remove() {
    await Store.setMeta('lock', null);
    try { sessionStorage.removeItem('cg-unlocked'); } catch { /* ignorar */ }
  },

  /* tela de bloqueio: resolve quando a senha correta é digitada */
  prompt() {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.id = 'lock';
      el.innerHTML = `
        <form class="lock-box" autocomplete="off">
          ${brandMarkHtml(64)}
          <h1>${esc(brandName())}</h1>
          <p class="muted">Digite a senha para abrir</p>
          <input type="password" id="lpw" placeholder="Senha" autocomplete="current-password" aria-label="Senha">
          <div class="lock-err" id="lerr" role="alert"></div>
          <button class="btn primary" type="submit" id="lok">Entrar</button>
          <button class="btn small" type="button" id="lforgot" style="border:0;background:none;color:var(--ink-3)">Esqueci a senha</button>
        </form>`;
      document.body.appendChild(el);
      const pw = $('#lpw', el), err = $('#lerr', el);
      let fails = 0, blockedUntil = 0;
      setTimeout(() => pw.focus(), 50);
      $('form', el).onsubmit = async e => {
        e.preventDefault();
        const wait = Math.ceil((blockedUntil - Date.now()) / 1000);
        if (wait > 0) { err.textContent = `Aguarde ${wait}s para tentar de novo.`; return; }
        if (await this.verify(pw.value)) { this._markUnlocked(); el.remove(); resolve(); return; }
        fails++;
        pw.value = '';
        if (fails >= 5) { blockedUntil = Date.now() + 8000; err.textContent = 'Muitas tentativas. Aguarde 8s.'; }
        else err.textContent = 'Senha incorreta.';
        pw.focus();
      };
      $('#lforgot', el).onclick = async () => {
        if (!confirm('Não existe recuperação de senha. Para redefinir, os dados DESTE aparelho serão apagados (se você usa a nuvem, eles voltam na próxima sincronização). Continuar?')) return;
        await Store.wipe();
        await this.remove();
        el.remove();
        resolve();
      };
    });
  },

  /* formulário em Ajustes: definir / alterar / remover */
  openForm(mode) {
    const needCurrent = mode !== 'set';
    openModal(`
      <form class="sheet" id="lf2" autocomplete="off">
        <h2>${mode === 'set' ? 'Definir senha' : mode === 'change' ? 'Alterar senha' : 'Remover senha'}</h2>
        ${needCurrent ? '<label class="f">Senha atual<input type="password" id="lcur" required autocomplete="current-password"></label>' : ''}
        ${mode === 'remove' ? '' : `<label class="f">Nova senha (mínimo 4 caracteres)<input type="password" id="lnew" minlength="4" required autocomplete="new-password"></label>
        <label class="f">Repita a nova senha<input type="password" id="lnew2" minlength="4" required autocomplete="new-password"></label>`}
        <div class="muted" style="font-size:13px">Não há recuperação de senha. Se esquecer, será preciso apagar os dados do aparelho (ou restaurar de um backup/da nuvem).</div>
        <div class="acts"><span class="spacer"></span><button type="button" class="btn" id="lx">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`, m => {
      $('#lx', m).onclick = closeModal;
      $('#lf2', m).onsubmit = async e => {
        e.preventDefault();
        if (needCurrent && !(await this.verify($('#lcur', m).value))) { toast('Senha atual incorreta'); return; }
        if (mode === 'remove') { await this.remove(); closeModal(); toast('Senha removida'); refresh(); return; }
        const a = $('#lnew', m).value, b = $('#lnew2', m).value;
        if (a.length < 4) { toast('Use pelo menos 4 caracteres'); return; }
        if (a !== b) { toast('As senhas não conferem'); return; }
        await this.set(a);
        closeModal(); toast('Senha salva'); refresh();
      };
      setTimeout(() => (needCurrent ? $('#lcur', m) : $('#lnew', m)).focus(), 50);
    });
  },
};
