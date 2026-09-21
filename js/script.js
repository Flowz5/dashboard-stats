const regions = {
    'fr': 'FR',
    'us': 'US',
    'cn': 'CN',
    'eu': 'EU'
};

const indicators = {
    'unemployment': 'SL.UEM.TOTL.ZS',
    'inflation': 'FP.CPI.TOTL.ZG',
    'trade': 'NE.RSB.GNFS.CD',
    'gdp': 'NY.GDP.MKTP.CD'
};

let lastExchangeRates = {
    'USD': null,
    'JPY': null
};

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWorldBankBulk(indicatorCode) {
    try {
        const url = `https://api.worldbank.org/v2/country/FR;US;CN;EU/indicator/${indicatorCode}?format=json&per_page=100`;
        
        let data = null;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('API Error');
            data = await response.json();
        } catch (err) {
            console.warn(`Erreur CORS/Réseau sur ${indicatorCode}, tentative via Proxy 2...`);
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Proxy Error');
            data = await response.json();
        }
        
        const results = {};
        if (data && data[1]) {
            const grouped = {};
            data[1].forEach(item => {
                const cId = item.country.id.toLowerCase();
                const id = cId;
                if (!grouped[id]) grouped[id] = [];
                if (item.value !== null) {
                    grouped[id].push(item.value);
                }
            });
            
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

async function loadMacroData() {
    for (const [indicatorId, indicatorCode] of Object.entries(indicators)) {
        await sleep(300);
        const bulkData = await fetchWorldBankBulk(indicatorCode);
        
        for (const regionId of Object.keys(regions)) {
            const elementId = `${regionId}-${indicatorId}`;
            const element = document.getElementById(elementId);
            
            if (element) {
                const value = bulkData[regionId] !== undefined ? bulkData[regionId] : null;
                element.textContent = formatNumber(value, indicatorId);
            }
        }
    }
}

function updateLiveValue(elementId, newValue, currency) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const oldValue = lastExchangeRates[currency];
    const formattedValue = newValue.toFixed(4);
    
    if (oldValue !== null && oldValue !== newValue) {
        element.classList.remove('update-up', 'update-down');
        void element.offsetWidth;
        
        if (newValue > oldValue) {
            element.classList.add('update-up');
        } else {
            element.classList.add('update-down');
        }
    }
    
    element.textContent = formattedValue;
    lastExchangeRates[currency] = newValue;
}

async function fetchExchangeRates() {
    const statusElement = document.getElementById('exchange-api-status');
    try {
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
        
        const usdEl = document.getElementById('eur-usd');
        const jpyEl = document.getElementById('eur-jpy');
        if (usdEl && usdEl.textContent === 'Chargement...') usdEl.textContent = 'Erreur';
        if (jpyEl && jpyEl.textContent === 'Chargement...') jpyEl.textContent = 'Erreur';
    }
}

window.highlight = function(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        card.classList.remove('highlight-effect');
        void card.offsetWidth;
        card.classList.add('highlight-effect');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    loadMacroData();
    fetchExchangeRates();
    
    setInterval(fetchExchangeRates, 15000);
});
