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

        // Realtime Refresh
        sb.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => this.fetchTrackers()).subscribe();
    },

    // --- AUTH ---
    login: async () => {
        const email = document.getElementById('user').value;
        const pass = document.getElementById('pass').value;
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message);
    },

    logout: async () => {
        await sb.auth.signOut();
        localStorage.clear();
        window.location.replace(window.location.origin + window.location.pathname);
    },

    // --- WORKSPACE DROPDOWN FIX ---
    fetchWorkspaceList: async function() {
        const { data, error } = await sb.from('user_workspaces').select('*');
        if (!error) {
            this.myWorkspaces = data;
            this.updateDropdownUI();
        }
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
        if (id) localStorage.setItem('active_workspace', id);
        else localStorage.removeItem('active_workspace');
        
        // Force refresh trackers for the new space
        this.fetchTrackers();
    },

    // --- INVITE FIX ---
    copyInviteLink: function() {
        if (!this.currentWorkspace) {
            alert("Join a workspace first to invite someone!");
            return;
        }
        const url = `${window.location.origin}${window.location.pathname}?space=${this.currentWorkspace}`;
        
        navigator.clipboard.writeText(url).then(() => {
            alert("Invite link copied: " + url);
        }).catch(() => {
            alert("Manual link: " + url);
        });
    },

    // --- TRACKERS ---
    fetchTrackers: async function() {
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) {
            query = query.eq('workspace_id', this.currentWorkspace);
        } else {
            query = query.eq('user_id', this.user.id).is('workspace_id', null);
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        this.trackers = data || [];
        this.render();
    },

    render: function() {
        const container = document.getElementById('module-container');
        // Clear container and add static module
        container.innerHTML = `
            <div class="module portal-card" style="flex-direction:column; justify-content:center; align-items:center; text-align:center;">
                <h3>Trade Checker</h3>
                <a href="https://amvgg.com/calculator" target="_blank" class="neal-btn primary">Open AMVGG ↗</a>
            </div>
        `;

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
                        <strong style="font-size:18px">${t.name}</strong>
                        <button onclick="app.deleteTracker(${t.id})" style="border:none; background:none; cursor:pointer; font-size:22px;">×</button>
                    </div>
                    <div class="calendar-grid">${calHtml}</div>
                </div>
                <div class="card-right">
                    <small style="font-weight:900; color:#555">${this.selectedDate}</small>
                    <div style="margin-top:15px; width:100%;">
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

    // ... (Keep existing login, register, createTracker, deleteTracker, showDashboard functions)
};

app.init();
