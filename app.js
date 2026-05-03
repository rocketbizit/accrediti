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
    
    // 1. Carica dati
    await caricaDaGoogleSheet();
    
    // 2. Inizializza UI e Sensori
    aggiornaUI();
    checkConnection();
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    avviaScanner();
};

// --- FUNZIONI DI RETE ---

function checkConnection() {
    const isOnline = navigator.onLine;
    document.getElementById('offlineAlert').classList.toggle('hidden', isOnline);
    console.log("🌐 Stato connessione:", isOnline ? "Online" : "Offline");
}

async function caricaDaGoogleSheet() {
    if (!navigator.onLine || GOOGLE_SCRIPT_URL.includes("INSERISCI")) {
        console.warn("⚠️ Caricamento da Google saltato (Offline o URL mancante).");
        return;
    }
    
    console.log("📥 Richiesta dati a Google Sheets...");
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        if (!response.ok) throw new Error("Risposta del server non valida");
        
        const data = await response.json();
        console.log("📄 Dati ricevuti:", data);
        
        if (data && data.length > 0) {
            database = data;
            localStorage.setItem('event_db', JSON.stringify(database));
            console.log("✅ Database aggiornato dal Cloud.");
        }
    } catch (error) {
        console.error("❌ Errore nel caricamento Cloud:", error);
    }
}

// Sincronizza solo il singolo ospite modificato o aggiunto
async function sincronizzaSingoloOspite(utente) {
    if (!navigator.onLine || GOOGLE_SCRIPT_URL.includes("INSERISCI")) return;

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', 
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: utente.id,
                nome: utente.nome,
                cognome: utente.cognome,
                telefono: utente.telefono || "",
                email: utente.email || "",
                azienda: utente.azienda || "",
                presente: "SI"
            })
        });
        console.log("📤 Ospite sincronizzato con Google Sheets");
    } catch (error) {
        console.error("❌ Errore nella sincronizzazione dell'ospite:", error);
    }
}

// --- LOGICA SCANNER ---

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
    console.log("📷 Codice rilevato:", codice);
    const utente = database.find(u => u.id == codice || u.codice == codice);
    
    if (!utente) {
        mostraNotifica("❌", "Non Trovato", "Questo codice non è in lista.", "bg-red-50");
        return;
    }

    const isPresente = utente.presente === true || utente.presente === "SI";

    if (isPresente) {
        mostraNotifica("⚠️", "Già Entrato", `${utente.nome} ${utente.cognome} è già dentro.`, "bg-orange-50");
    } else {
        utente.presente = true;
        aggiornaUI();
        
        // Sincronizza l'accredito su Google Sheets immediatamente
        sincronizzaSingoloOspite(utente);
        
        mostraNotifica("✅", "Benvenuto", `${utente.nome} ${utente.cognome}`, "bg-green-50");
        
        isScansioneInPausa = true;
        setTimeout(() => { isScansioneInPausa = false; }, 3000);
        chiudiSearchModal();
    }
}

// --- GESTIONE DATI E UI ---

function aggiornaUI() {
    const pres = database.filter(u => u.presente === true || u.presente === "SI").length;
    document.getElementById('statPresenti').innerText = pres;
    document.getElementById('statMancanti').innerText = database.length - pres;
    
    localStorage.setItem('event_db', JSON.stringify(database));
}

function cercaDebounced() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(eseguiRicerca, 300);
}

function eseguiRicercaFunzione() {
    // Funzione interna per i risultati
    eseguiRicerca();
}

function eseguiRicerca() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const res = document.getElementById('risultatiRicerca');
    res.innerHTML = "";

    if (q.length < 2) return;

    database.filter(u => (u.nome + " " + u.cognome).toLowerCase().includes(q))
        .forEach(u => {
            const isPresente = (u.presente === true || u.presente === "SI");
            const div = document.createElement('div');
            div.className = `p-4 rounded-2xl flex justify-between items-center ${isPresente ? 'bg-slate-100 opacity-60' : 'bg-white shadow-sm border border-slate-200'}`;
            div.innerHTML = `
                <div class="text-left">
                    <p class="font-bold text-slate-800">${u.nome} ${u.cognome}</p>
                    <p class="text-xs text-slate-400">${u.azienda || 'Privato'}</p>
                </div>
                ${!isPresente ? `<button onclick="processaIngresso('${u.id}')" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">Accredita</button>` : '<i class="fa-solid fa-circle-check text-green-500 text-xl"></i>'}
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

    // Sincronizzazione immediata dell'ospite last-minute su Google Sheets
    sincronizzaSingoloOspite(nuovo);
    
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

function aggiungiOspiteEChiudi(event) {
    aggiungiOspite(event);
    chiudiAddGuestModal();
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
        const p = (u.presente === true || u.presente === "SI") ? "SI" : "NO";
        csv += `${u.id},"${u.nome}","${u.cognome}","${u.telefono}","${u.email}","${u.azienda}",${p}\n`;
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
