// --- CONFIGURAZIONE GOOGLE SCRIPT ---
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMVy-zjw0yY8BR4LVSqSwSG6EA4GGb_N2SkSQyX9LSgVAkPyvLy7ndshRlm0QrhSoI/exec";

// --- STATO DELL'APPLICAZIONE ---
let database = JSON.parse(localStorage.getItem('event_db')) || [
    { id: "INV001", nome: "Esempio", cognome: "Mario", telefono: "", email: "", azienda: "", presente: false }
];

let html5QrCode;
let searchTimeout;
let isScansioneInPausa = false; 

// --- INIZIALIZZAZIONE ---
window.onload = async () => {
    console.log("🔄 Avvio dell'applicazione...");
    
    // 1. Tenta la lettura da Google Sheets
    await caricaDaGoogleSheet();
    
    // 2. Inizializza UI e Sensori
    aggiornaUI();
    checkConnection();
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    avviaScanner();

    // 3. Sincronizzazione automatica ogni 15 minuti
    setInterval(() => {
        console.log("⏱️ Avvio sincronizzazione automatica programmata...");
        sincronizzaConGoogleSheet(true);
    }, 900000);
};

// --- FUNZIONI DI RETE ---

function checkConnection() {
    const isOnline = navigator.onLine;
    const alertEl = document.getElementById('offlineAlert');
    if (alertEl) alertEl.classList.toggle('hidden', isOnline);
    console.log("🌐 Stato connessione:", isOnline ? "Online" : "Offline");
}

async function caricaDaGoogleSheet() {
    if (!navigator.onLine || GOOGLE_SCRIPT_URL.includes("INSERISCI")) {
        console.warn("⚠️ Caricamento saltato (Offline o URL mancante).");
        return;
    }
    
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        if (!response.ok) throw new Error("Risposta del server non valida");
        
        const data = await response.json();
        console.log("📄 Dati ricevuti dal Cloud:", data.length, "record");
        
        if (data && data.length > 0) {
            database = data;
            localStorage.setItem('event_db', JSON.stringify(database));
            console.log("✅ Database aggiornato correttamente.");
        }
    } catch (error) {
        console.error("❌ Errore nel caricamento Cloud:", error);
    }
}

async function sincronizzaConGoogleSheet(isAutomatic = false) {
    if (!navigator.onLine || GOOGLE_SCRIPT_URL.includes("INSERISCI")) return;

    if (!isAutomatic) {
        mostraNotifica("🔄", "Sincronizzazione", "Salvataggio sul foglio Google...", "bg-blue-50");
    }

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', 
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(database)
        });

        console.log("📤 Dati inviati con successo.");
        if (!isAutomatic) {
            mostraNotifica("✅", "Sincronizzato", "Dati salvati correttamente!", "bg-green-50");
        }
    } catch (error) {
        console.error("❌ Errore sincronizzazione:", error);
        if (!isAutomatic) {
            mostraNotifica("❌", "Errore", "Impossibile salvare i dati online.", "bg-red-50");
        }
    }
}

// --- LOGICA SCANNER & PROCESSO INGRESSO ---

function avviaScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
        if (isScansioneInPausa) return;
        vibrateDevice();
        processaIngresso(decodedText);
    }).catch(err => {
        console.warn("Fotocamera non disponibile:", err);
    });
}

function processaIngresso(codice) {
    if (!codice) return;
    
    // Pulizia estrema del codice scansionato
    const codiceCercato = codice.toString().trim().toLowerCase();
    console.log("📷 Cerco codice:", codiceCercato);

    // Ricerca nel database con normalizzazione delle chiavi e dei valori
    const utente = database.find(u => {
        // Controlla id, ID o codice gestendo eventuali maiuscole/minuscole nelle chiavi JSON
        const idDatabase = (u.id || u.ID || u.codice || "").toString().trim().toLowerCase();
        return idDatabase === codiceCercato;
    });
    
    if (!utente) {
        console.error("❌ Codice non trovato nel database:", codiceCercato);
        mostraNotifica("❌", "Non Trovato", `Il codice ${codiceCercato.substring(0,8)}... non è in lista.`, "bg-red-50");
        return;
    }

    // Normalizzazione stato presenza (gestisce booleani o stringhe "SI"/"true")
    const isPresente = utente.presente === true || 
                       String(utente.presente).toUpperCase() === "SI" || 
                       String(utente.presente).toLowerCase() === "true";

    if (isPresente) {
        mostraNotifica("⚠️", "Già Entrato", `${utente.nome} ${utente.cognome} risulta già accreditato.`, "bg-orange-50");
    } else {
        // Aggiorna lo stato nel database locale
        utente.presente = true;
        aggiornaUI();
        
        // Sincronizza immediatamente
        sincronizzaConGoogleSheet(true);
        
        mostraNotifica("✅", "Benvenuto", `${utente.nome} ${utente.cognome}`, "bg-green-50");
        
        // Pausa per evitare letture multiple dello stesso QR
        isScansioneInPausa = true;
        setTimeout(() => { isScansioneInPausa = false; }, 3000);
        chiudiSearchModal();
    }
}

// --- GESTIONE DATI E UI ---

function aggiornaUI() {
    const pres = database.filter(u => 
        u.presente === true || 
        String(u.presente).toUpperCase() === "SI" || 
        String(u.presente).toLowerCase() === "true"
    ).length;

    const statPresenti = document.getElementById('statPresenti');
    const statMancanti = document.getElementById('statMancanti');
    
    if (statPresenti) statPresenti.innerText = pres;
    if (statMancanti) statMancanti.innerText = database.length - pres;
    
    localStorage.setItem('event_db', JSON.stringify(database));
}

function cercaDebounced() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(eseguiRicerca, 300);
}

function eseguiRicerca() {
    const q = document.getElementById('searchInput').value.toLowerCase().trim();
    const res = document.getElementById('risultatiRicerca');
    if (!res) return;
    res.innerHTML = "";

    if (q.length < 2) return;

    database.filter(u => {
        const nomeCompleto = `${u.nome} ${u.cognome}`.toLowerCase();
        const azienda = (u.azienda || "").toLowerCase();
        return nomeCompleto.includes(q) || azienda.includes(q);
    }).forEach(u => {
        const isPresente = (u.presente === true || String(u.presente).toUpperCase() === "SI");
        const div = document.createElement('div');
        div.className = `p-4 rounded-2xl flex justify-between items-center ${isPresente ? 'bg-slate-100 opacity-60' : 'bg-white shadow-sm border border-slate-200'}`;
        div.innerHTML = `
            <div class="text-left">
                <p class="font-bold text-slate-800">${u.nome} ${u.cognome}</p>
                <p class="text-xs text-slate-400">${u.azienda || 'Privato'}</p>
            </div>
            ${!isPresente ? `<button onclick="processaIngresso('${u.id || u.ID}')" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">Accredita</button>` : '<i class="fa-solid fa-circle-check text-green-500 text-xl"></i>'}
        `;
        res.appendChild(div);
    });
}

function aggiungiOspite(e) {
    e.preventDefault();
    const nuovo = {
        id: "L-" + Date.now(),
        nome: document.getElementById('fn').value,
        cognome: document.getElementById('ln').value,
        telefono: document.getElementById('tel').value,
        email: document.getElementById('em').value,
        azienda: document.getElementById('az').value,
        presente: true
    };
    
    database.push(nuovo);
    aggiornaUI();
    chiudiAddGuestModal();
    e.target.reset();

    sincronizzaConGoogleSheet(true);
    mostraNotifica("➕", "Registrato", `${nuovo.nome} aggiunto e accreditato.`, "bg-blue-50");
}

// --- GESTIONE MODALI ---

function apriSearchModal() {
    document.getElementById('searchModal').classList.remove('hidden');
    document.getElementById('searchInput').focus();
}

function chiudiSearchModal() {
    document.getElementById('searchModal').classList.add('hidden');
    document.getElementById('searchInput').value = "";
    document.getElementById('risultatiRicerca').innerHTML = "";
}

function apriAddGuestModal() {
    document.getElementById('addGuestModal').classList.remove('hidden');
}

function chiudiAddGuestModal() {
    document.getElementById('addGuestModal').classList.add('hidden');
}

// --- UTILITY ---

function mostraNotifica(icon, title, text, bgColor) {
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalText').innerText = text;
    document.getElementById('modalContent').className = `bg-white w-full max-w-sm rounded-3xl p-8 text-center relative z-10 ${bgColor} shadow-2xl`;
    document.getElementById('modal').classList.remove('hidden');
}

function chiudiModal() {
    document.getElementById('modal').classList.add('hidden');
}

function esportaCSV() {
    let csv = "id,nome,cognome,telefono,email,azienda,presente\n";
    database.forEach(u => {
        const p = (u.presente === true || String(u.presente).toUpperCase() === "SI") ? "SI" : "NO";
        csv += `${u.id || u.ID},"${u.nome}","${u.cognome}","${u.telefono}","${u.email}","${u.azienda}",${p}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `report-accrediti-${new Date().toLocaleDateString()}.csv`);
    link.click();
}

function vibrateDevice() {
    if ("vibrate" in navigator) navigator.vibrate(100);
}
