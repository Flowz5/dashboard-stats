// --- Configuration des pays et indicateurs (World Bank API) ---
const regions = {
    'fr': 'FR', // France
    'us': 'US', // USA
    'cn': 'CN', // Chine
    'eu': 'EU'  // Union Européenne
};

const indicators = {
    'unemployment': 'SL.UEM.TOTL.ZS',
    'inflation': 'FP.CPI.TOTL.ZG',
    'trade': 'NE.RSB.GNFS.CD',
    'gdp': 'NY.GDP.MKTP.CD'
};

// Stockage des dernières valeurs de taux de change pour l'animation
let lastExchangeRates = {
    'USD': null,
    'JPY': null
};

// Fonction de formatage
function formatNumber(value, type) {
    if (value === null || value === undefined) return 'N/A';
    
    if (type === 'unemployment' || type === 'inflation') {
        return value.toFixed(2) + ' %';
    }
    
    if (type === 'trade' || type === 'gdp') {
        if (type === 'gdp') {
            const trillions = value / 1e12;
            return trillions.toFixed(2) + ' Trillions $';
        } else {
            const billions = value / 1e9;
            return billions.toFixed(2) + ' Mds $';
        }
    }
    
    return value;
}

// Fonction utilitaire pour éviter le rate-limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fonction pour récupérer les données d'un indicateur pour TOUS les pays en même temps
async function fetchWorldBankBulk(indicatorCode) {
    try {
        // FR;US;CN;EU permet de récupérer tous les pays en une seule requête
        // per_page=100 pour être sûr d'avoir les données de tous les pays
        const url = `https://api.worldbank.org/v2/country/FR;US;CN;EU/indicator/${indicatorCode}?format=json&per_page=100`;
        
        let data = null;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('API Error');
            data = await response.json();
        } catch (err) {
            // Si l'API de la Banque Mondiale bloque la requête (CORS missing header fréquent sur file://), on passe par un proxy public
            console.warn(`Erreur CORS/Réseau sur ${indicatorCode}, tentative via Proxy...`);
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const proxyData = await response.json();
            data = JSON.parse(proxyData.contents);
        }
        
        const results = {};
        if (data && data[1]) {
            // Grouper par pays et trouver la valeur la plus récente non-null
            const grouped = {};
            data[1].forEach(item => {
                const cId = item.country.id.toLowerCase(); // 'fr', 'us', 'cn', 'eu'
                // WorldBank renvoie 'eu' mais son code interne est 'xc' ou 'eu' parfois. On va utiliser le code renvoyé.
                // Attention: l'API renvoie iso2code pour 'EU' qui est 'EU' ou parfois countryiso3code
                const id = cId;
                if (!grouped[id]) grouped[id] = [];
                if (item.value !== null) {
                    grouped[id].push(item.value);
                }
            });
            
            // On prend la première valeur valide de chaque pays
            for (const [cId, values] of Object.entries(grouped)) {
                results[cId] = values.length > 0 ? values[0] : null;
            }
        }
        return results;
    } catch (error) {
        console.error(`Erreur fetch bulk ${indicatorCode}:`, error);
        return {};
    }
}

// Charger toutes les données macro en 4 requêtes seulement (au lieu de 16)
async function loadMacroData() {
    for (const [indicatorId, indicatorCode] of Object.entries(indicators)) {
        await sleep(300); // Petit délai de sécurité
        const bulkData = await fetchWorldBankBulk(indicatorCode);
        
        // Pour chaque région, on met à jour le DOM
        for (const regionId of Object.keys(regions)) {
            const elementId = `${regionId}-${indicatorId}`;
            const element = document.getElementById(elementId);
            
            if (element) {
                // bulkData contient potentiellement 'fr', 'us', etc.
                const value = bulkData[regionId] !== undefined ? bulkData[regionId] : null;
                element.textContent = formatNumber(value, indicatorId);
            }
        }
    }
}

// Fonction pour mettre à jour les taux de change avec animation
function updateLiveValue(elementId, newValue, currency) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const oldValue = lastExchangeRates[currency];
    const formattedValue = newValue.toFixed(4);
    
    if (oldValue !== null && oldValue !== newValue) {
        element.classList.remove('update-up', 'update-down');
        void element.offsetWidth; // Force reflow
        
        if (newValue > oldValue) {
            element.classList.add('update-up');
        } else {
            element.classList.add('update-down');
        }
    }
    
    element.textContent = formattedValue;
    lastExchangeRates[currency] = newValue;
}

// Fonction pour récupérer les taux de change
async function fetchExchangeRates() {
    const statusElement = document.getElementById('exchange-api-status');
    try {
        // Utilisation de exchangerate-api qui est plus stable avec les CORS sur file://
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        if (data && data.rates) {
            updateLiveValue('eur-usd', data.rates.USD, 'USD');
            updateLiveValue('eur-jpy', data.rates.JPY, 'JPY');
            if (statusElement) statusElement.textContent = `Données en direct via ExchangeRate-API (Dernière màj: ${new Date().toLocaleTimeString()})`;
        }
    } catch (error) {
        console.error('Erreur taux de change:', error);
        if (statusElement) statusElement.textContent = 'Erreur de connexion à l\'API des taux de change.';
        
        // Fallback affichage erreur
        const usdEl = document.getElementById('eur-usd');
        const jpyEl = document.getElementById('eur-jpy');
        if (usdEl && usdEl.textContent === 'Chargement...') usdEl.textContent = 'Erreur';
        if (jpyEl && jpyEl.textContent === 'Chargement...') jpyEl.textContent = 'Erreur';
    }
}

// Fonction d'animation au clic sur le menu de navigation
window.highlight = function(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        // Enlever la classe si elle y est déjà pour pouvoir re-déclencher l'animation
        card.classList.remove('highlight-effect');
        void card.offsetWidth; // Force reflow
        card.classList.add('highlight-effect');
    }
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadMacroData();
    fetchExchangeRates();
    
    // Polling toutes les 15 secondes pour les taux de change
    setInterval(fetchExchangeRates, 15000);
});
