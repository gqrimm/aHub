// CONFIGURATION
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
        // Handle Session Persistence
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            this.user = session.user;
            this.showDashboard();
        }

        sb.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        });

        // Realtime Updates
        sb.channel('realtime-trackers')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => this.fetchTrackers())
          .subscribe();
    },

    // --- AUTH ---
    login: async () => {
        const { error } = await sb.auth.signInWithPassword({
            email: document.getElementById('user').value,
            password: document.getElementById('pass').value
        });
        if (error) alert(error.message);
    },

    register: async () => {
        const { error } = await sb.auth.signUp({
            email: document.getElementById('user').value,
            password: document.getElementById('pass').value
        });
        if (error) alert(error.message);
        else alert("Verification email sent!");
    },

    logout: async () => {
        await sb.auth.signOut();
        localStorage.clear();
        window.location.replace(window.location.origin + window.location.pathname);
    },

    // --- WORKSPACE DROPDOWN LOGIC ---
    fetchWorkspaceList: async function() {
        const { data, error } = await sb.from('user_workspaces').select('*');
        if (!error) {
            this.myWorkspaces = data;
            this.updateDropdownUI();
        }
    },

    saveWorkspaceToBookmarks: async function(wsId) {
        if (!wsId) return;
        await sb.from('user_workspaces').upsert({ 
            user_id: this.user.id, 
            workspace_id: wsId,
            workspace_name: wsId 
        }, { onConflict: 'user_id, workspace_id' });
        this.fetchWorkspaceList();
    },

    updateDropdownUI: function() {
        const dropdown = document.getElementById('workspace-dropdown');
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

    // --- WORKSPACE ACTIONS ---
    createNewWorkspace: async function() {
        const id = Math.random().toString(36).substring(2, 8);
        this.currentWorkspace = id;
        localStorage.setItem('active_workspace', id);
        await this.saveWorkspaceToBookmarks(id);
        this.fetchTrackers();
    },

    joinWorkspace: async function() {
        const id = document.getElementById('join-work-id').value.trim();
        if (!id) return;
        this.currentWorkspace = id;
        localStorage.setItem('active_workspace', id);
        await this.saveWorkspaceToBookmarks(id);
        document.getElementById('join-work-id').value = "";
        this.fetchTrackers();
    },

    copyInviteLink: function() {
        if (!this.currentWorkspace) return alert("You are in a Private Space!");
        const url = `${window.location.origin}${window.location.pathname}?space=${this.currentWorkspace}`;
        navigator.clipboard.writeText(url);
        alert("Invite link copied!");
    },

    // --- TRACKER DATA ---
    fetchTrackers: async function() {
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) query = query.eq('workspace_id', this.currentWorkspace);
        else query = query.eq('user_id', this.user.id).is('workspace_id', null);
        
        const { data } = await query.order('created_at', { ascending: true });
        this.trackers = data || [];
        this.render();
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value.trim();
        if (!name) return alert("Name is required!");

        const { error } = await sb.from('trackers').insert([{
            name, type: document.getElementById('track-type').value,
            user_id: this.user.id, workspace_id: this.currentWorkspace, history_data: {}
        }]);

        if (!error) { document.getElementById('track-name').value = ""; this.closeModal(); }
    },

    deleteTracker: async function(id) {
        if (confirm("Permanently delete this tracker?")) {
            await sb.from('trackers').delete().eq('id', id);
        }
    },

    logValue: async function(trackerId, dateKey, val) {
        const t = this.trackers.find(x => x.id === trackerId);
        let history = { ...t.history_data };
        if (t.type === 'bool') history[dateKey] = !history[dateKey];
        else history[dateKey] = val;

        await sb.from('trackers').update({ history_data: history }).eq('id', trackerId);
    },

    // --- RENDER ---
    render: function() {
        const container = document.getElementById('module-container');
        container.innerHTML = `<div class="module portal-card"><h3>Trade Checker</h3><a href="https://amvgg.com/calculator" target="_blank" class="neal-btn">Open AMVGG ↗</a></div>`;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const activeClass = t.history_data[k] ? 'day-active' : '';
                calHtml += `<div class="day-box ${activeClass}" onclick="app.selectedDate='${k}'; app.render();">${d.getDate()}</div>`;
            }

            const currentVal = t.history_data[this.selectedDate] || "";
            
            card.innerHTML = `
                <div class="card-left">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>${t.name}</strong>
                        <button onclick="app.deleteTracker(${t.id})" style="border:none; background:none; cursor:pointer; font-size:18px;">×</button>
                    </div>
                    <div class="calendar-grid">${calHtml}</div>
                </div>
                <div class="card-right">
                    <small style="font-weight:900; color:#666">${this.selectedDate}</small>
                    <div style="margin-top:10px; width:100%;">
                    ${t.type === 'bool' ? 
                        `<button class="neal-btn ${currentVal ? 'primary' : ''}" style="width:100%" onclick="app.logValue(${t.id}, '${this.selectedDate}', true)">${currentVal ? '✓ DONE' : 'MARK DONE'}</button>` :
                        `<input type="text" class="neal-input" style="width:100%" value="${currentVal}" onchange="app.logValue(${t.id}, '${this.selectedDate}', this.value)" placeholder="Enter value...">`
                    }
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    },

    // --- UI HELPERS ---
    showDashboard: function() {
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        this.fetchWorkspaceList();
        this.fetchTrackers();
    },
    showLogin: () => {
        document.getElementById('auth-overlay').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
    },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden')
};

app.init();
