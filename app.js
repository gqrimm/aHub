/**
 * CONFIGURATION
 * Get these from your Supabase Project Settings > API
 */
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_KEY = 'your-public-anon-key';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = {
    user: null,
    trackers: [],

    // 1. AUTHENTICATION (Credentials are handled by Supabase, not hardcoded)
    login: async function() {
        const email = document.getElementById('user').value;
        const password = document.getElementById('pass').value;

        // This checks the credentials against the Supabase User Database
        const { data, error } = await sb.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            alert("Access Denied: " + error.message);
        } else {
            this.user = data.user;
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            this.fetchTrackers(); // Load data from cloud
        }
    },

    // 2. FETCH DATA (Get trackers from the cloud)
    fetchTrackers: async function() {
        const { data, error } = await sb
            .from('trackers')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Error fetching data:", error);
        } else {
            this.trackers = data;
            this.render();
        }
    },

    // 3. CREATE NEW TRACKER (Save to cloud)
    createTracker: async function() {
        const name = document.getElementById('track-name').value;
        const type = document.getElementById('track-type').value;

        if (!name) return alert("Enter a name");

        const newTracker = {
            user_id: this.user.id,
            name: name,
            type: type,
            history_data: {} // Empty JSON object for calendar data
        };

        const { error } = await sb.from('trackers').insert([newTracker]);

        if (error) {
            alert("Error saving tracker: " + error.message);
        } else {
            document.getElementById('track-name').value = '';
            this.closeModal();
            this.fetchTrackers();
        }
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
