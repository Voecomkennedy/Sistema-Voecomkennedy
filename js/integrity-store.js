// Account-scoped IndexedDB authority. Transactions contain no network awaits.
(function (global) {
    const keys = ['emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes'];
    const clone = value => JSON.parse(JSON.stringify(value));
    const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    const error = (code, message) => Object.assign(new Error(message), { code });
    const Store = {
        ready: false, configured: false, owner: null, generation: 0, db: null, state: null, context: null,
        _projecting: false, _blocked: false, keys, canonical,
        _check(owner = this.owner, generation = this.generation) {
            if (!this.ready || this._blocked || owner !== this.owner || generation !== this.generation ||
                localStorage.getItem('emissao_cloud_sync_usuario_local') !== owner) {
                throw error('INTEGRITY_SCOPE', 'A conta ou os dados desta aba mudaram. Recarregue antes de salvar.');
            }
        },
        _validate(body) {
            for (const key of keys) {
                if (!Array.isArray(body[key])) throw error('INTEGRITY_DATA', 'Coleção inválida: ' + key);
                const ids = body[key].map(item => item && item.id != null ? String(item.id) : '');
                if (ids.some(id => !id) || new Set(ids).size !== ids.length)
                    throw error('INTEGRITY_DATA', 'Identidades ausentes ou duplicadas em ' + key);
            }
        },
        _legacyBody() {
            return Object.fromEntries(keys.map(key => [key, JSON.parse(localStorage.getItem(key) || '[]')]));
        },
        async init(owner) {
            this.configured = true;
            if (!global.indexedDB || !global.navigator?.locks) throw error('INTEGRITY_UNAVAILABLE',
                'Este navegador precisa de IndexedDB e bloqueio entre abas para salvar com segurança.');
            this.suspend();
            this.owner = owner;
            const generation = this.generation;
            this.db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('voecomkennedy-integrity-v1', 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore('accounts', { keyPath: 'owner' });
                    request.result.createObjectStore('history', { keyPath: ['owner', 'revision'] });
                    request.result.createObjectStore('attempts', { keyPath: ['owner', 'id'] });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(error('INTEGRITY_UPGRADE', 'Feche as outras abas para atualizar o armazenamento.'));
            });
            if (generation !== this.generation || localStorage.getItem('emissao_cloud_sync_usuario_local') !== owner) {
                this.db.close(); throw error('INTEGRITY_SCOPE', 'A conta mudou durante a inicialização.');
            }
            const legacy = this._legacyBody();
            this._validate(legacy);
            let meta = null;
            try { meta = JSON.parse(localStorage.getItem('emissao_cloud_sync_meta_v2') || 'null'); } catch (_) {}
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction('accounts', 'readwrite');
                const table = tx.objectStore('accounts');
                const get = table.get(owner);
                get.onsuccess = () => {
                    if (get.result) { this.state = get.result; return; }
                    this.state = { owner, revision: 0, body: legacy, pending: false, remote: null,
                        projection: canonical(legacy), importedAt: new Date().toISOString() };
                    if (meta?.userId === owner) this.state.legacyMeta = meta;
                    table.add(this.state);
                };
                tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
            });
            this.ready = true;
            // Keep divergent legacy bytes separately before using the authority.
            // This is also necessary after an older tab wrote without this protocol.
            if (keys.some(key => legacy[key].length) && canonical(legacy) !== canonical(this.state.body)) {
                let prior = null;
                try { prior = JSON.parse(this.state.projection); } catch (_) {}
                const knownProjection = prior && keys.every(key => canonical(legacy[key]) === canonical(prior[key]) ||
                    canonical(legacy[key]) === canonical(this.state.body[key]));
                if (!knownProjection) {
                    this._blocked = true;
                    global.CloudSync?._preservarCache(keys, 'cache-divergente-do-historico-local', owner);
                    throw error('INTEGRITY_LEGACY_CONFLICT', 'Uma aba antiga alterou o cache. A cópia foi preservada; revise antes de continuar.');
                }
                // Every value in a partial projection already exists in the
                // durable before/after snapshots; quota need not duplicate it.
            }
            if (await this._project() === false) throw error('INTEGRITY_PROJECTION', 'Dados duráveis preservados. O cache da tela não pôde ser atualizado; não apague os dados do navegador.');
            this.db.onversionchange = () => { this.suspend(); };
            if (!this._listening) {
                this._listening = true;
                global.addEventListener('storage', event => {
                    if (event.key === 'emissao_cloud_sync_usuario_local' && event.newValue !== this.owner && this.configured) {
                        this.suspend(); global.CloudSync?.suspenderSincronizacao();
                        global.document?.dispatchEvent(new CustomEvent('integrity:blocked', { detail: {
                            code: 'INTEGRITY_SCOPE', message: 'A conta mudou em outra aba. Recarregue antes de continuar.' } }));
                        return;
                    }
                    if (event.key === 'emissao_integrity_notice_v1' && this.ready) this.refresh().catch(() => {});
                    if (keys.includes(event.key) && this.ready) {
                        // Event bytes outlive a later cache overwrite. A busy marker
                        // cannot prove that this particular write was our projection.
                        const captured = this._legacyValues();
                        captured[event.key] = event.newValue;
                        this._observeLegacyEvent(event.key, captured, this.owner, this.generation);
                    }
                });
            }
            return true;
        },
        suspend() {
            this.generation++; this.ready = false; this.owner = null; this.context = null; this.state = null;
            this._blocked = false;
            this.db?.close(); this.db = null;
        },
        read(key) {
            this._check();
            return clone((this.context || this.state.body)[key]);
        },
        write(key, value) {
            this._check();
            if (!this.context) throw error('INTEGRITY_WRITE_REQUIRED', 'A gravação precisa usar uma transação.');
            this.context[key] = clone(value);
        },
        _legacyValues() {
            return Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
        },
        _blockLegacy(captured, owner, generation) {
            if (owner !== this.owner || generation !== this.generation ||
                localStorage.getItem('emissao_cloud_sync_usuario_local') !== owner) return;
            this._blocked = true;
            let preserved = false;
            try { preserved = global.CloudSync?._preservarCache(keys, 'escrita-por-aba-antiga', owner, captured) === true; }
            catch (_) {} // The caller must retain the original bytes and refuse projection.
            global.document?.dispatchEvent(new CustomEvent('integrity:blocked', { detail: {
                code: 'INTEGRITY_LEGACY_CONFLICT', message: preserved
                    ? 'Uma aba antiga alterou o cache. A cópia foi preservada; revise antes de continuar.'
                    : 'Uma aba antiga alterou o cache e não foi possível preservar a cópia. A projeção foi bloqueada; não apague os dados do navegador.'
            } }));
        },
        _observeLegacyEvent(key, captured, owner, generation) {
            // Read the durable snapshots without refresh(), which can be queued
            // behind a committing transaction and must not re-read mutable cache.
            this._knownLegacyValues(captured, [key], owner).then(known => {
                if (!known) this._blockLegacy(captured, owner, generation);
            }).catch(() => this._blockLegacy(captured, owner, generation));
        },
        _knownLegacyValues(captured, selectedKeys, owner = this.owner) {
            let values;
            try { values = Object.fromEntries(selectedKeys.map(key => [key, JSON.parse(captured[key] || '[]')])); }
            catch (_) { return Promise.resolve(false); }
            return new Promise((resolve, reject) => {
                const remaining = new Set(selectedKeys);
                const match = body => { if (body) for (const key of remaining)
                    if (canonical(body[key]) === canonical(values[key])) remaining.delete(key); };
                const tx = this.db.transaction(['accounts', 'history']);
                const account = tx.objectStore('accounts').get(owner);
                account.onsuccess = () => {
                    match(account.result?.body);
                    try { match(JSON.parse(account.result?.projection)); } catch (_) {}
                    if (!remaining.size) return;
                    // Ordinary projection events need only the account row.
                    // Inspect older snapshots lazily, without loading all history.
                    const cursor = tx.objectStore('history').openCursor(IDBKeyRange.bound([owner, 0], [owner, Number.MAX_SAFE_INTEGER]));
                    cursor.onsuccess = () => {
                        const item = cursor.result; if (!item) return;
                        match(item.value.before); match(item.value.after);
                        if (remaining.size) item.continue();
                    };
                };
                tx.oncomplete = () => resolve(!remaining.size);
                tx.onerror = tx.onabort = () => reject(tx.error || error('INTEGRITY_ABORT', 'Não foi possível conferir o cache.'));
            });
        },
        async refresh() {
            this._check(); const owner = this.owner, generation = this.generation;
            const state = await new Promise((resolve, reject) => {
                const tx = this.db.transaction('accounts');
                const get = tx.objectStore('accounts').get(owner);
                get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error);
            });
            this._check(owner, generation);
            if (!state) throw error('INTEGRITY_DATA', 'Estado da conta não encontrado.');
            if (!this.state || state.revision >= this.state.revision) this.state = state;
            return clone(this.state);
        },
        async _project(rechecks = 0) {
            this._check(); this._projecting = true;
            const token = this.owner + ':' + crypto.randomUUID();
            try {
                const notice = JSON.parse(localStorage.getItem('emissao_integrity_notice_v1') || 'null');
                if (notice?.owner === this.owner && notice.revision > this.state.revision) return true;
                // A legacy write may precede a queued observer read. Preserve
                // it synchronously before any collection can be overwritten.
                const captured = this._legacyValues();
                let prior, known = false;
                try {
                    prior = JSON.parse(this.state.projection);
                    known = keys.every(key => {
                        const value = JSON.parse(captured[key] || '[]');
                        return canonical(value) === canonical(prior?.[key]) || canonical(value) === canonical(this.state.body[key]);
                    });
                } catch (_) {}
                if (!known) {
                    // A delayed projection can be older than the immediately
                    // preceding revision, yet already preserved in the journal.
                    const owner = this.owner, generation = this.generation;
                    known = await this._knownLegacyValues(captured, keys, owner);
                    this._check(owner, generation);
                    if (!known) { this._blockLegacy(captured, owner, generation); return false; }
                    if (keys.some(key => localStorage.getItem(key) !== captured[key])) {
                        if (rechecks >= 3) return false;
                        return this._project(rechecks + 1);
                    }
                }
                localStorage.setItem('emissao_integrity_projection_busy_v1', token);
                for (const key of keys) localStorage.setItem(key, JSON.stringify(this.state.body[key]));
                localStorage.setItem('emissao_integrity_notice_v1', JSON.stringify({ owner: this.owner, revision: this.state.revision }));
                return true;
            } catch (cause) {
                // The durable state has committed. Never roll it back using old arrays.
                global.document?.dispatchEvent(new CustomEvent('integrity:projection-error'));
                return false;
            } finally {
                if (localStorage.getItem('emissao_integrity_projection_busy_v1') === token) localStorage.removeItem('emissao_integrity_projection_busy_v1');
                this._projecting = false;
            }
        },
        transact(mutator, options = {}) {
            this._check();
            const owner = this.owner, generation = this.generation;
            let next, result, failure;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['accounts', 'history'], 'readwrite');
                const accounts = tx.objectStore('accounts');
                const get = accounts.get(owner);
                get.onsuccess = () => {
                    try {
                        this._check(owner, generation);
                        const before = get.result;
                        if (!before) throw error('INTEGRITY_DATA', 'Estado da conta ausente.');
                        if (options.expectedRevision != null && before.revision !== options.expectedRevision)
                            throw error('INTEGRITY_CONFLICT', 'Os dados mudaram depois da prévia. Revise a versão atual.');
                        for (const expected of options.expected || []) {
                            const current = before.body[expected.key].find(item => String(item.id) === String(expected.id)) || null;
                            if (canonical(current) !== canonical(expected.value)) throw error('INTEGRITY_CONFLICT',
                                'Este registro mudou em outra aba. Reabra a versão atual antes de salvar.');
                        }
                        this.context = clone(before.body);
                        try {
                            result = mutator(this.context);
                            if (result?.then) throw error('INTEGRITY_ASYNC', 'A transação local não pode aguardar rede.');
                            this._validate(this.context);
                            next = { ...before, body: clone(this.context) };
                        } finally { this.context = null; }
                        if (canonical(next.body) === canonical(before.body)) { next = before; return; }
                        // All changed records get a monotonic local revision, even legacy editors.
                        if (options.cloud !== true) for (const key of keys) for (const record of next.body[key]) {
                            const old = before.body[key].find(item => String(item.id) === String(record.id));
                            if (canonical(record) !== canonical(old || null)) record._registroRevisao = (Number(old?._registroRevisao) || 0) + 1;
                        }
                        next.revision = before.revision + 1;
                        next.projection = canonical(before.body);
                        next.pending = options.cloud !== true;
                        if (options.remote) next.remote = clone(options.remote);
                        const id = crypto.randomUUID();
                        tx.objectStore('history').add({ owner, revision: next.revision, id,
                            source: options.label || 'edicao', at: new Date().toISOString(),
                            before: before.body, after: next.body });
                        accounts.put(next);
                    } catch (cause) { failure = cause; tx.abort(); }
                };
                tx.oncomplete = async () => {
                    try {
                        this._check(owner, generation);
                        if (!this.state || next.revision >= this.state.revision) this.state = next;
                        await this._project();
                        if (owner !== this.owner || generation !== this.generation ||
                            localStorage.getItem('emissao_cloud_sync_usuario_local') !== owner)
                            throw error('INTEGRITY_SCOPE', 'A conta mudou após a gravação local. Recarregue antes de continuar.');
                        global.document?.dispatchEvent(new CustomEvent('integrity:changed', { detail: { owner, revision: next.revision } }));
                        if (next.pending && !this._blocked) {
                            try { global.CloudSync?.agendarBackup(); }
                            catch (cause) {
                                // A scheduling error cannot reject an already committed operation.
                                if (global.CloudSync) global.CloudSync._backupPendente = true;
                                try { global.CloudSync?._atualizarIndicador('erro', 'Dados preservados neste aparelho. Não foi possível agendar o envio.'); } catch (_) {}
                            }
                        }
                        if (result?.id != null && options.resultKey) result = clone(next.body[options.resultKey].find(item => String(item.id) === String(result.id)) || result);
                        else if (result?.venda?.id != null) result = { ...result, venda: clone(next.body.emissao_vendas.find(item => String(item.id) === String(result.venda.id)) || result.venda) };
                        resolve(result);
                    } catch (cause) { reject(cause); }
                };
                tx.onerror = tx.onabort = () => reject(failure || tx.error || error('INTEGRITY_ABORT', 'A gravação foi interrompida.'));
            });
        },
        async replaceCloud(body, remote, expectedBody) {
            return this.transact(context => {
                if (canonical(context) !== canonical(expectedBody)) throw error('INTEGRITY_CONFLICT', 'Uma edição ocorreu durante o download.');
                for (const key of keys) context[key] = clone(body[key] || []);
            }, { label: 'nuvem', cloud: true, remote });
        },
        async metadata(remote) {
            this._check(); const owner = this.owner, generation = this.generation;
            const state = await new Promise((resolve, reject) => {
                const tx = this.db.transaction(['accounts', 'attempts'], 'readwrite');
                const accounts = tx.objectStore('accounts');
                const get = accounts.get(owner); let next;
                get.onsuccess = () => {
                    try {
                        this._check(owner, generation); next = get.result;
                        if (next.remote && next.remote.version > remote.version) throw error('INTEGRITY_ACK_STALE', 'Uma confirmação antiga não pode substituir a versão atual.');
                        next.remote = clone(remote);
                        next.pending = canonical(next.body) !== canonical(remote.body);
                        accounts.put(next);
                        const cursor = tx.objectStore('attempts').openCursor();
                        cursor.onsuccess = () => {
                            const item = cursor.result; if (!item) return;
                            if (item.value.owner === owner && item.value.version <= remote.version &&
                                canonical(item.value.body) === canonical(remote.body)) item.delete();
                            item.continue();
                        };
                    } catch (cause) { tx.abort(); }
                };
                tx.oncomplete = () => resolve(next); tx.onerror = tx.onabort = () => reject(tx.error || error('INTEGRITY_ABORT', 'Confirmação local não concluída.'));
            });
            this._check(owner, generation); this.state = state;
        },
        async attempts() { return this._list('attempts'); },
        async history() { return this._list('history'); },
        _list(table) {
            this._check(); const owner = this.owner, generation = this.generation;
            return new Promise((resolve, reject) => {
                const range = table === 'history' ? IDBKeyRange.bound([owner, 0], [owner, Number.MAX_SAFE_INTEGER])
                    : IDBKeyRange.bound([owner, ''], [owner, '\uffff']);
                const get = this.db.transaction(table).objectStore(table).getAll(range);
                get.onsuccess = () => { try { this._check(owner, generation); resolve(get.result.filter(item => item.owner === owner)); } catch (cause) { reject(cause); } };
                get.onerror = () => reject(get.error);
            });
        },
        async prepareAttempt(body, expectedVersion) {
            this._check(); const owner = this.owner, generation = this.generation;
            const old = (await this.attempts()).find(item => item.expectedVersion === expectedVersion && canonical(item.body) === canonical(body));
            if (old) return old;
            const item = { owner, id: crypto.randomUUID(), expectedVersion, version: (Number(expectedVersion) || 0) + 1,
                localRevision: this.state.revision, body: clone(body), at: new Date().toISOString() };
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction('attempts', 'readwrite');
                tx.objectStore('attempts').add(item);
                tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
            });
            this._check(owner, generation); return item;
        },
        withCloudLock(callback) {
            this._check(); const owner = this.owner, generation = this.generation;
            return navigator.locks.request('vck-cloud-' + owner, async () => {
                this._check(owner, generation); await this.refresh(); return callback();
            });
        },
        async previewQuote(source, id) {
            await this.refresh();
            const historical = source.emissao_cotacoes?.find(item => String(item.id) === String(id));
            if (!historical) throw error('RECOVERY_ABSENT', 'Cotação ausente da versão escolhida.');
            const current = this.state.body.emissao_cotacoes.find(item => String(item.id) === String(id)) || null;
            if (current?.vendaId || historical.vendaId || current?.status === 'convertida' || historical.status === 'convertida')
                throw error('RECOVERY_LINKED', 'Cotação vinculada a venda exige revisão conjunta; esta recuperação não desfaz conversões.');
            if (this.state.body.emissao_vendas.some(sale => String(sale.cotacaoOrigemId || '') === String(id)))
                throw error('RECOVERY_LINKED', 'Já existe uma venda originada desta cotação. Revise os vínculos antes de recuperar.');
            if (current && String(current.clienteId) !== String(historical.clienteId)) throw error('RECOVERY_CONTACT', 'A recuperação não pode trocar o contato.');
            if (!this.state.body.emissao_pessoas.some(item => String(item.id) === String(historical.clienteId)))
                throw error('RECOVERY_CONTACT', 'O contato histórico precisa existir na conta atual.');
            return { owner: this.owner, expectedRevision: this.state.revision, id, before: clone(current), after: clone(historical) };
        },
        restoreQuote(preview) {
            if (preview.owner !== this.owner) return Promise.reject(error('INTEGRITY_SCOPE', 'Prévia pertence a outra conta.'));
            return this.transact(context => {
                const existing = context.emissao_cotacoes.find(item => String(item.id) === String(preview.id));
                if (String(preview.after.id) !== String(preview.id) || preview.after.vendaId || preview.after.status === 'convertida' ||
                    existing?.vendaId || context.emissao_vendas.some(sale => String(sale.cotacaoOrigemId || '') === String(preview.id)))
                    throw error('RECOVERY_LINKED', 'A recuperação não pode alterar a identidade ou desfazer uma venda.');
                if ((existing && String(existing.clienteId) !== String(preview.after.clienteId)) ||
                    !context.emissao_pessoas.some(person => String(person.id) === String(preview.after.clienteId)))
                    throw error('RECOVERY_CONTACT', 'O contato da recuperação não corresponde à conta atual.');
                const restored = { ...clone(preview.after), propostaRevisao: Math.max(Number(existing?.propostaRevisao) || 0, Number(preview.after.propostaRevisao) || 0) + 1 };
                if (existing) context.emissao_cotacoes[context.emissao_cotacoes.indexOf(existing)] = restored;
                else context.emissao_cotacoes.push(restored);
                return restored;
            }, { label: 'recuperacao-seletiva', resultKey: 'emissao_cotacoes', expectedRevision: preview.expectedRevision,
                expected: [{ key: 'emissao_cotacoes', id: preview.id, value: preview.before }] });
        }
    };
    global.IntegrityStore = Store;
})(window);
