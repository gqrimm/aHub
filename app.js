
const app = {
    user: null,
    currentWorkspace: localStorage.getItem('active_workspace') || null,

    // --- INITIALIZE (Persistence) ---
    init: async function() {
        // Check if a user is already logged in from a previous session
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            this.user = session.user;
            this.initDashboard();
        }
    },

    // --- REGISTRATION ---
    register: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (error) alert("Error: " + error.message);
        else alert("Registration successful! Check your email for a confirmation link, then login.");
    },

    login: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) alert(error.message);
        else {
            this.user = data.user;
            this.initDashboard();
        }
    },

    // --- WORKSPACE LOGIC ---
    joinWorkspace: function() {
        const id = document.getElementById('join-work-id').value;
        if (id) {
            this.currentWorkspace = id;
            localStorage.setItem('active_workspace', id);
            alert(`Joined workspace: ${id}`);
            this.fetchTrackers();
        }
    },

    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;
        
        // When creating a tracker, we tag it with the Workspace ID
        const { error } = await supabaseClient.from('trackers').insert([
            { 
                name, 
                type, 
                user_id: this.user.id, 
                workspace_id: this.currentWorkspace, // Sharing magic happens here
                history_data: {} 
            }
        ]);

        if (!error) {
            this.closeModal();
            this.fetchTrackers();
        }
    },

    fetchTrackers: async function() {
        let query = supabaseClient.from('trackers').select('*');

        // If in a workspace, fetch trackers for that workspace
        if (this.currentWorkspace) {
            query = query.eq('workspace_id', this.currentWorkspace);
        } else {
            query = query.eq('user_id', this.user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        if (!error) {
            this.trackers = data;
            this.render();
        }
    },

    initDashboard: function() {
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('workspace-section').classList.remove('hidden');
        this.fetchTrackers();
    },

        // 4. LOG DATA (Update cloud record)
    logEntry: async function(trackerId, dateKey) {
        const tracker = this.trackers.find(t => t.id === trackerId);
        let currentHistory = { ...tracker.history_data };

        if (tracker.type === 'bool') {
            currentHistory[dateKey] = !currentHistory[dateKey];
        } else {
            const val = prompt(`Value for ${tracker.name}:`, currentHistory[dateKey] || 0);
            if (val === null) return;
            currentHistory[dateKey] = val;
        }

        const { error } = await sb
            .from('trackers')
            .update({ history_data: currentHistory })
            .eq('id', trackerId);

        if (error) {
            alert("Update failed: " + error.message);
        } else {
            this.fetchTrackers();
        }
    },

    // 5. DELETE TRACKER
    deleteTracker: async function(id) {
        if (!confirm("Delete this tracker and all its data?")) return;

        const { error } = await sb.from('trackers').delete().eq('id', id);

        if (error) {
            alert("Delete failed: " + error.message);
        } else {
            this.fetchTrackers();
        }
    },

    // 6. ADMIN PANEL (Protected check)
    showAdmin: function() {
        const pass = prompt("Admin Password:");
        // Only you know this password. 
        // In a real app, this would check a 'role' column in your DB.
        if (pass === "your-secret-admin-pass") {
            alert("Logged in as Admin. You can now delete any module.");
        }
    },

    // 7. UI LOGIC
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),

    render: function() {
        const container = document.getElementById('module-container');
        // Keep the Trade Checker (first child), remove the rest
        const staticModule = container.firstElementChild.outerHTML;
        container.innerHTML = staticModule;

        this.trackers.forEach(t => {
            const card = document.createElement('div');
            card.className = 'module';
            
            let calHtml = '';
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                const val = t.history_data[k];
                const active = val ? 'day-active' : '';
                const label = val ? (t.type === 'bool' ? '✓' : val) : d.getDate();
                
                calHtml += `<div class="day-box ${active}" onclick="app.logEntry(${t.id}, '${k}')">${label}</div>`;
            }

            card.innerHTML = `
                <div class="module-header">
                    <h3>${t.name}</h3>
                    <button onclick="app.deleteTracker(${t.id})">🗑️</button>
                </div>
                <div class="calendar-grid">${calHtml}</div>
                <small>Unit: ${t.type}</small>
            `;
            container.appendChild(card);
        });
    }

};

// Start the app on load
app.init();
