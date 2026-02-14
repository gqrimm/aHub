const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    myWorkspaces: [],
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || localStorage.getItem('active_workspace') || null,
    selectedDate: new Date().toISOString().split('T')[0],

    init: async function() {
        // 1. Initial Session Check
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            this.user = session.user;
            this.showDashboard();
        }

        // 2. Auth State Listener (Handles Login, Logout, and Password Recovery)
        sb.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                this.user = session.user;
                
                if (event === 'PASSWORD_RECOVERY') {
                    const newPass = prompt("Enter your new password:");
                    if (newPass) {
                        const { error } = await sb.auth.updateUser({ password: newPass });
                        if (error) alert(error.message);
                        else alert("Password updated!");
                    }
                }
                this.showDashboard();
            } else {
                this.user = null;
                this.showLogin();
            }
        });

        // 3. Realtime Refresh
        sb.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => this.fetchTrackers()).subscribe();
    },

    // --- AUTH ---
    login: async () => {
        const email = document.getElementById('user').value;
        const pass = document.getElementById('pass').value;
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message);
    },

    register: async () => {
        const email = document.getElementById('user').value;
        const pass = document.getElementById('pass').value;
        const { error } = await sb.auth.signUp({ 
            email, 
            password: pass,
            options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (error) alert(error.message);
        else alert("Verification email sent! Check your inbox.");
    },

    forgotPassword: async () => {
        const email = document.getElementById('user').value;
        if (!email) return alert("Please enter your email first.");
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) alert(error.message);
        else alert("Password reset link sent!");
    },

    logout: async () => {
        await sb.auth.signOut();
        localStorage.clear();
        window.location.replace(window.location.origin + window.location.pathname);
    },

    // --- WORKSPACE LOGIC ---
    fetchWorkspaceList: async function() {
        const { data, error } = await sb.from('user_workspaces').select('*');
        if (!error) {
            this.myWorkspaces = data;
            this.updateDropdownUI();
        }
    },

    saveWorkspaceToBookmarks: async function(wsId) {
        if (!wsId || !this.user) return;
        await sb.from('user_workspaces').upsert({ 
            user_id: this.user.id, 
            workspace_id: wsId,
            workspace_name: wsId 
        }, { onConflict: 'user_id, workspace_id' });
        this.fetchWorkspaceList();
    },

    updateDropdownUI: function() {
        const dropdown = document.getElementById('workspace-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = '<option value="">🏠 Private Space</option>';
        this.myWorkspaces.forEach(ws => {
            const opt = document.createElement('option');
            opt.value = ws.workspace_id;
            opt.textContent = `👥 ${ws.workspace_name}`;
            if (ws.workspace_id === this.currentWorkspace) opt.selected = true;
            dropdown.appendChild(opt);
        });
    },

    switchWorkspace: function(id) {
        this.currentWorkspace = id || null;
        id ? localStorage.setItem('active_workspace', id) : localStorage.removeItem('active_workspace');
        this.fetchTrackers();
    },

    copyInviteLink: function() {
        if (!this.currentWorkspace) return alert("Join a workspace first!");
        const url = `${window.location.origin}${window.location.pathname}?space=${this.currentWorkspace}`;
        navigator.clipboard.writeText(url).then(() => alert("Link Copied!"));
    },

    // --- TRACKERS ---
    fetchTrackers: async function() {
        if (!this.user) return;
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) query = query.eq('workspace_id', this.currentWorkspace);
        else query = query.eq('user_id', this.user.id).is('workspace_id', null);

        const { data } = await query.order('created_at', { ascending: true });
        this.trackers = data || [];
        this.render();
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value.trim();
        if (!name) return alert("Name required");
        const { error } = await sb.from('trackers').insert([{
            name, type: document.getElementById('track-type').value,
            user_id: this.user.id, workspace_id: this.currentWorkspace, history_data: {}
        }]);
        if (!error) this.closeModal();
    },

    deleteTracker: async function(id) {
        if (confirm("Delete tracker?")) await sb.from('trackers').delete().eq('id', id);
    },

    logValue: async function(trackerId, dateKey, val) {
        const t = this.trackers.find(x => x.id === trackerId);
        if (!t) return;
        let history = { ...t.history_data };
        if (t.type === 'bool') history[dateKey] = !history[dateKey];
        else history[dateKey] = val;
        await sb.from('trackers').update({ history_data: history }).eq('id', trackerId);
    },

    // --- UI HELPERS ---
    showDashboard: function() {
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        this.fetchWorkspaceList();
        this.fetchTrackers();
    },
    showLogin: function() {
        document.getElementById('auth-overlay').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
    },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),

    render: function() {
        const container = document.getElementById('module-container');
        if (!container) return;
        container.innerHTML = `<div class="module portal-card"><h3>Trade Checker</h3><a href="https://amvgg.com/calculator" target="_blank" class="neal-btn primary">Open AMVGG ↗</a></div>`;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const active = t.history_data[k] ? 'day-active' : '';
                calHtml += `<div class="day-box ${active}" onclick="app.selectedDate='${k}'; app.render();">${d.getDate()}</div>`;
            }
            const currentVal = t.history_data[this.selectedDate] || "";
            card.innerHTML = `
                <div class="card-left">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>${t.name}</strong>
                        <button onclick="app.deleteTracker(${t.id})" style="border:none; background:none; cursor:pointer; font-size:22px;">×</button>
                    </div>
                    <div class="calendar-grid">${calHtml}</div>
                </div>
                <div class="card-right">
                    <small>${this.selectedDate}</small>
                    <div style="margin-top:15px; width:100%;">
                    ${t.type === 'bool' ? 
                        `<button class="neal-btn ${currentVal ? 'primary' : ''}" style="width:100%" onclick="app.logValue(${t.id}, '${this.selectedDate}', true)">${currentVal ? '✓ DONE' : 'MARK DONE'}</button>` :
                        `<input type="text" class="neal-input" style="width:100%" value="${currentVal}" onchange="app.logValue(${t.id}, '${this.selectedDate}', this.value)" placeholder="Enter value...">`
                    }
                    </div>
                </div>`;
            container.appendChild(card);
        });
    }
};

app.init();
