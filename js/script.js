const regions = {
    'fr': 'FRA',
    'us': 'USA',
    'cn': 'CHN',
    'eu': 'EUU'
};

const indicators = {
    'unemployment': 'SL.UEM.TOTL.ZS',
    'inflation': 'FP.CPI.TOTL.ZG',
    'trade': 'NE.RSB.GNFS.CD',
    'gdp': 'NY.GDP.MKTP.CD'
};

const fallbackData = {
    'unemployment': { 'eu': 5.92, 'fr': 7.54, 'us': 4.19, 'cn': 4.61 },
    'inflation': { 'eu': 2.46, 'fr': 0.94, 'us': 3.10, 'cn': 0.05 },
    'trade': { 'eu': 140000000000, 'fr': -13691000000, 'us': -773000000000, 'cn': 816189000000 },
    'gdp': { 'eu': 21243000000000, 'fr': 3366000000000, 'us': 30769000000000, 'cn': 19498000000000 }
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

async function fetchWorldBankAll(indicatorCode, indicatorId) {
    try {
        const url = `https://api.worldbank.org/v2/country/all/indicator/${indicatorCode}?format=json&date=2020:2026&per_page=1000`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        
        const results = {};
        if (data && data[1]) {
            const records = data[1];
            for (const [regionId, isoCode] of Object.entries(regions)) {
                const countryRecords = records.filter(r => r.countryiso3code === isoCode && r.value !== null);
                if (countryRecords.length > 0) {
                    countryRecords.sort((a, b) => parseInt(b.date) - parseInt(a.date));
                    results[regionId] = {
                        value: countryRecords[0].value,
                        date: countryRecords[0].date
                    };
                } else {
                    results[regionId] = {
                        value: fallbackData[indicatorId][regionId],
                        date: "2025"
                    };
                }
            }
            return results;
        }
        throw new Error('Données vides');
    } catch (error) {
        const errResults = {};
        for (const regionId of Object.keys(regions)) {
            errResults[regionId] = {
                value: fallbackData[indicatorId][regionId],
                date: "2025"
            };
        }
        return errResults;
    }
}

async function loadMacroData() {
    const promises = Object.entries(indicators).map(async ([indicatorId, indicatorCode]) => {
        const bulkData = await fetchWorldBankAll(indicatorCode, indicatorId);
        
        for (const regionId of Object.keys(regions)) {
            const elementId = `${regionId}-${indicatorId}`;
            const element = document.getElementById(elementId);
            const dateElement = document.getElementById(`${elementId}-date`);
            
            if (element) {
                let dataObj = bulkData[regionId];
                let value = dataObj ? dataObj.value : null;
                let date = dataObj ? dataObj.date : "";
                
                if (value === null || value === undefined) {
                    value = fallbackData[indicatorId][regionId];
                    date = "2025";
                }
                
                element.textContent = formatNumber(value, indicatorId);
                if (dateElement && date) {
                    dateElement.textContent = `Donnée de ${date}`;
                }
            }
        }
    });

    await Promise.all(promises);
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
