const SUPABASE_URL = 'https://ynnqidfodgravvhxhbuw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ziIy4oGXycJNYeZRKyqNKg_GwnJrz6f';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],
    currentWorkspace: new URLSearchParams(window.location.search).get('space') || localStorage.getItem('active_workspace') || null,
    selectedDate: new Date().toISOString().split('T')[0], // Default to today

    init: async function() {
        // Handle Session on Load
        const { data: { session } } = await sb.auth.getSession();
        if (session) this.user = session.user;

        sb.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.user = session.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        });

        // Realtime
        sb.channel('trackers-room').on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, () => {
            this.fetchTrackers();
        }).subscribe();
    },

    // --- AUTH ---
    login: async () => {
        const { error } = await sb.auth.signInWithPassword({
            email: document.getElementById('user').value,
            password: document.getElementById('pass').value
        });
        if (error) alert(error.message);
    },

    logout: async () => {
        await sb.auth.signOut();
        localStorage.removeItem('active_workspace');
        // Redirect and clean URL
        window.location.replace(window.location.origin + window.location.pathname);
    },

    // --- TRACKERS ---
    createTracker: async function() {
        const nameEl = document.getElementById('track-name');
        const name = nameEl.value.trim();
        if (!name) return alert("Card name is required!"); // Requirement check

        const { error } = await sb.from('trackers').insert([{
            name: name,
            type: document.getElementById('track-type').value,
            user_id: this.user.id,
            workspace_id: this.currentWorkspace,
            history_data: {}
        }]);

        if (error) alert(error.message);
        else { nameEl.value = ""; this.closeModal(); }
    },

    deleteTracker: async function(id) {
        if (!confirm("Delete this tracker?")) return;
        const { error } = await sb.from('trackers').delete().eq('id', id);
        if (error) alert("Delete error: " + error.message);
    },

    logValue: async function(trackerId, dateKey, value) {
        const t = this.trackers.find(x => x.id === trackerId);
        let history = { ...t.history_data };
        
        if (t.type === 'bool') history[dateKey] = !history[dateKey];
        else history[dateKey] = value;

        await sb.from('trackers').update({ history_data: history }).eq('id', trackerId);
    },

    // --- UI RENDER ---
    render: function() {
        const container = document.getElementById('module-container');
        container.innerHTML = `<div class="module portal-card"><h3>Trade Checker</h3><a href="https://amvgg.com/calculator" target="_blank" class="neal-btn">Open AMVGG</a></div>`;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            
            // Left Pane: Calendar
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const active = t.history_data[k] ? 'day-active' : '';
                calHtml += `<div class="day-box ${active}" onclick="app.selectedDate='${k}'; app.render();">${d.getDate()}</div>`;
            }

            const currentVal = t.history_data[this.selectedDate] || "";
            
            // Right Pane: Interface
            card.innerHTML = `
                <div class="card-left">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <strong>${t.name}</strong>
                        <button onclick="app.deleteTracker(${t.id})" style="border:none; cursor:pointer;">×</button>
                    </div>
                    <div class="calendar-grid">${calHtml}</div>
                </div>
                <div class="card-right">
                    <small>${this.selectedDate}</small>
                    ${t.type === 'bool' ? 
                        `<button class="neal-btn ${currentVal ? 'primary' : ''}" onclick="app.logValue(${t.id}, '${this.selectedDate}', true)">${currentVal ? 'COMPLETED' : 'MARK DONE'}</button>` :
                        `<input type="text" class="neal-input small" style="width:80%" value="${currentVal}" onchange="app.logValue(${t.id}, '${this.selectedDate}', this.value)" placeholder="Enter value...">`
                    }
                </div>
            `;
            container.appendChild(card);
        });
    },

    // ... (Keep workspace functions from previous version)
    fetchTrackers: async function() {
        let query = sb.from('trackers').select('*');
        if (this.currentWorkspace) query = query.eq('workspace_id', this.currentWorkspace);
        else query = query.eq('user_id', this.user.id).is('workspace_id', null);
        const { data } = await query.order('created_at', { ascending: true });
        this.trackers = data || [];
        this.render();
    },
    showDashboard: () => { document.getElementById('auth-overlay').classList.add('hidden'); document.getElementById('main-content').classList.remove('hidden'); app.fetchTrackers(); },
    showLogin: () => { document.getElementById('auth-overlay').classList.remove('hidden'); document.getElementById('main-content').classList.add('hidden'); },
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden')
};
app.init();
