
let gapDetailChartInstance = null;
let gapDetailChart = null; // Variable global para el gráfico de detalle
let intradayChart;
let isShowingIntraday = false;
let tradingViewWidgets = {};
let gapIntradayChart = null;
let priceChart;
let selectedGapRow = null;

const patronesInfo = {
    "Gap and Go": {
      tipo: "📈 Largo",
      descripcion: "Gap alcista ≥ 15% con catalizador, float bajo y sin sobrecarga de resistencia. Ideal cuando hay consolidación en premarket seguida de breakout con volumen creciente. Entrada óptima en el dip tras romper el high del premarket.",
      enlace: "/static/img/gapandgo.png"
    },
    "Gap and Crap Reversal": {
      tipo: "📈 Largo",
      descripcion: "Acción que abre con gap up, se pone roja y cae por debajo de VWAP, pero forma un soporte sólido en vez de continuar cayendo. Requiere float bajo (<15M), volumen histórico alto y extensión previa >30%. Ofrece excelente R/R en el rebote.",
      enlace: "/static/img/gapandcrap-reversal.png"
    },
    "Gap and Crap": {
      tipo: "📉 Corto",
      descripcion: "Acción sobreextendida en premarket que hace un push hacia el HOD en los primeros minutos tras la apertura, pero luego se desploma con vela roja de alto volumen. Ideal en acciones con fundamentales débiles y dilución. Puede convertirse en 'all day fader'.",
      enlace: "/static/img/gapandcrap.png"
    },
    "Gap and Extensión": {
      tipo: "📉 Corto",
      descripcion: "Acción sobreextendida en premarket que rechaza el PM high claramente. Similar al Gap and Crap pero con entrada en 'front side' contra los niveles de premarket. Requiere disciplina con el riesgo y se confirma cuando el precio no logra superar el high del premarket.",
      enlace: "/static/img/gapandextension.png"
    },
    "Over Extended Gap Down": {
      tipo: "📉 Corto",
      descripcion: "Acción sobreextendida (>100%) que hace gap down (>10%) tras período alcista. Bounce hacia el cierre anterior pero con volumen menor que día previo. Entrada ideal en el rebote hacia el cierre, cuando el volumen confirma debilidad.",
      enlace: "/static/img/overextend.png"
    },
    "Short Into Resistance": {
      tipo: "📉 Corto",
      descripcion: "Acción con tendencia bajista que muestra corrida fuerte (>50%) hacia niveles de resistencia histórica con alto volumen. Entrada cerca de la resistencia cuando llega en un spike sin consolidación previa. Ideal cuando hay 'bag holders' esperando vender.",
      enlace: "/static/img/shortintoresistence.png"
    }
  };  


// Mostrar alertas
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi ${type === 'success' ? 'bi-check-circle' : type === 'danger' ? 'bi-exclamation-triangle' : 'bi-info-circle'} me-2"></i>
            <div>${message}</div>
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
        </div>
    `;
    alertContainer.appendChild(alert);
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

// Mostrar/ocultar carga
function showLoading(show) {
    const btn = stockForm.querySelector('button[type="submit"]');
    if (show) {
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Analizando...';
        btn.disabled = true;
    } else {
        btn.innerHTML = '<i class="bi bi-lightning-charge"></i> Analizar';
        btn.disabled = false;
    }
}

// Formatear números
function formatNumber(num) {
    if (isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('es-ES').format(Math.round(num));
}
// Activar tooltips de Bootstrap
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    new bootstrap.Tooltip(el);
});

document.getElementById('resetAppBtn').addEventListener('click', () => {
    location.reload(); // 🔁 recarga la app completa desde cero
});


document.addEventListener('DOMContentLoaded', function () {
    activateTooltips(); // inicializa tooltips estáticos al cargar
    // Elementos del DOM
    const stockForm = document.getElementById('stockForm');
    const priceChartCtx = document.getElementById('priceChart').getContext('2d');
    const gapsTableBody = document.getElementById('gapsTableBody');
    const companyInfoCard = document.getElementById('companyInfoCard');
    const alertContainer = document.getElementById('alertContainer');
    const runBacktestBtn = document.getElementById('runBacktestBtn');
    const backtestContainer = document.getElementById('backtestContainer');
    const userRole = sessionStorage.getItem("userRole") || "user";

    if (["intermedio", "vip"].includes(userRole)) {
        const btnCalc = document.getElementById("btnCalculadora");
        const playbook = document.getElementById("playbookSection");
        if (playbook) playbook.style.display = "block";
        if (btnCalc) btnCalc.style.display = "inline-block";
      }
    
      if (userRole === "vip") {
        const btnCalc = document.getElementById("btnCalculadora");
        const btnBack = document.getElementById("btnBacktesting");
        const playbook = document.getElementById("playbookSection");
        if (playbook) playbook.style.display = "block";
        if (btnCalc) btnCalc.style.display = "inline-block";
        if (btnBack) btnBack.style.display = "inline-block";
      }
    
      // Mostrar modal de Calculadora
      const btnCalc = document.getElementById("btnCalculadora");
      if (btnCalc) {
        btnCalc.addEventListener("click", () => {
          fetch("/calculadora")
            .then(res => res.text())
            .then(html => {
              document.getElementById("modalContent").innerHTML = html;
              new bootstrap.Modal(document.getElementById("utilModal")).show();
            });
        });
      }
    
      // Mostrar modal de Backtesting
      const btnBack = document.getElementById("btnBacktesting");
      if (btnBack) {
        btnBack.addEventListener("click", () => {
          fetch("/backtesting")
            .then(res => res.text())
            .then(html => {
              document.getElementById("modalContent").innerHTML = html;
              new bootstrap.Modal(document.getElementById("utilModal")).show();
            });
        });
      }

     
    // Variables de estado

    let currentData = {};
    let mainPriceChart;

    // Función para formatear el input de volumen
    function setupVolumeInput() {
        const volumeInput = document.getElementById('minVolume');
        if (!volumeInput) return;

        volumeInput.addEventListener('blur', function (e) {
            const value = e.target.value.replace(/\./g, '');
            if (!isNaN(value) && value !== '') {
                e.target.value = Number(value).toLocaleString('es-ES');
            }
        });

        volumeInput.addEventListener('focus', function (e) {
            e.target.value = e.target.value.replace(/\./g, '');
        });
    }

    // Inicializar el formato del volumen
    setupVolumeInput();

    // Configurar formulario principal
    // Modificar el event listener del formulario
    stockForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const ticker = document.getElementById('ticker').value.trim().toUpperCase();

        if (!ticker) {
            showAlert('Por favor ingresa un símbolo válido', 'danger');
            return;
        }

        // Actualizar widgets primero
        updateTradingViewWidgets(ticker);

        // Luego obtener los datos de la API
        const minGap = parseFloat(document.getElementById('minGap').value);
        let minVolume = document.getElementById('minVolume').value.replace(/\./g, '');
        const period = document.getElementById('period').value;

        minVolume = parseFloat(minVolume);
        if (isNaN(minVolume) || minVolume <= 0) {
            showAlert('El volumen mínimo debe ser un número mayor a cero', 'danger');
            return;
        }

        fetchStockData(ticker, minGap, minVolume, period)
            .catch(error => {
                console.error('Error:', error);
                showAlert(`Error al obtener datos: ${error.message}`, 'danger');
            })
            .finally(() => {
                showLoading(false);
            });
    });


    // Configurar botón de backtesting
    runBacktestBtn.addEventListener('click', function () {
        if (!currentData.dates || currentData.dates.length === 0) {
            showAlert('Primero analiza un ticker para ejecutar backtesting', 'warning');
            return;
        }
        runBacktest();
    });

    // Función para actualizar widgets de TradingView
    // Función para actualizar todos los widgets de TradingView
    function updateTradingViewWidgets(ticker) {
        const symbol = ticker.includes(':') ? ticker : `NASDAQ:${ticker}`;

        // Función auxiliar para crear y agregar el widget
        function createWidget(containerId, scriptSrc, widgetConfig) {
            const container = document.getElementById(containerId);
            if (!container) return;

            // Limpiar contenido previo
            container.innerHTML = '';

            // Div necesario por TradingView
            const widgetDiv = document.createElement('div');
            widgetDiv.className = 'tradingview-widget-container__widget';
            container.appendChild(widgetDiv);

            // Crear script dinámico
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = scriptSrc;
            script.async = true;
            script.innerHTML = JSON.stringify(widgetConfig);

            container.appendChild(script);
        }

        // 1. Widget: Información del Símbolo
        createWidget('symbol-info-widget',
            'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js',
            {
                "symbol": symbol,
                "width": "100%",
                "locale": "en",
                "colorTheme": "light",
                "isTransparent": true
            }
        );

        // 2. Widget: Gráfico Avanzado
        createWidget('advanced-chart-widget',
            'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
            {
                "width": "auto",
                "height": "610",
                "autosize": true,
                "symbol": symbol,
                "interval": "D",
                "timezone": "Etc/UTC",
                "theme": "light",
                "style": "1",
                "locale": "en",
                "allow_symbol_change": true,
                "save_image": false,
                "hide_volume": true,
                "calendar": false
            }
        );

        // 3. Widget: Perfil de la Compañía
        createWidget('company-profile-widget',
            'https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js',
            {
                "width": "100%",
                "height": "100%",
                "locale": "es",
                "colorTheme": "light",
                "isTransparent": true,
                "symbol": symbol
            }
        );

        // 4. Widget: Datos Fundamentales
        createWidget('fundamental-data-widget',
            'https://s3.tradingview.com/external-embedding/embed-widget-financials.js',
            {
                "colorTheme": "light",
                "isTransparent": true,
                "largeChartUrl": "",
                "displayMode": "adaptive",
                "width": "100%",
                "height": "90%",
                "symbol": symbol,
                "locale": "es"
            }
        );
    }

    // Función principal para obtener datos del mercado
    async function fetchStockData(ticker, minGap, minVolume, period) {
        showLoading(true);

        try {
            const response = await fetch('/get_stock_data', {

                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: ticker,
                    min_gap_percent: minGap,
                    min_volume: minVolume,
                    period: period,
                })
            });

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            currentData = data;
            renderCompanyInfo(data.company);
            renderChart(data);
            renderGapsTable(data.gaps);
            renderGapStats(data.gap_stats);
            renderDay2Stats(data.day2);
            renderGapVsDay2Chart(data.gaps, data.day2);

            if (data.day2) {
                renderDay2Table(data.day2);
            }

            if (data.extended_used) {
                showAlert('Se utilizaron datos de cierre extendido', 'success');
            }

        } catch (error) {
            console.error('Error:', error);
            showAlert(`Error al obtener datos: ${error.message}`, 'danger');
        } 
        finally {
            showLoading(false);
        }
    }

    // Renderizar información de la empresa
    function renderCompanyInfo(company) {
        if (!company) return;

        companyInfoCard.style.display = 'block';
        document.getElementById('companyName').textContent = company.name || 'N/A';
        document.getElementById('companySector').textContent = company.sector || 'N/A';
        //document.getElementById('avgVolume').textContent = company.avgVolume || 'N/A';
        document.getElementById('float-value').textContent = company.floatShares || 'N/A';
        document.getElementById('shortInterest').textContent = company.shortInterest || 'N/A';
        document.getElementById('marketCapCard').textContent = company.marketCap || 'N/A';
        document.getElementById('companyCountry').textContent = company.country || 'N/A';
        document.getElementById('companyDescription').textContent = company.description || 'N/A';
        document.getElementById('sharesOutstanding').textContent = company.sharesOutstanding || 'N/A';
        // INSIDER OWNERSHIP
            const insiderValue = parseFloat(company.insiderOwn?.replace('%', '') || 0);
            const insiderElem = document.getElementById('insiderOwn');
            insiderElem.textContent = company.insiderOwn || 'N/A';
            insiderElem.className = 'stat-value'; // limpia clases anteriores

            if (!isNaN(insiderValue)) {
                if (insiderValue <= 25) {
                    insiderElem.classList.add('text-success');
                    insiderElem.setAttribute('data-bs-toggle', 'tooltip');
                    insiderElem.setAttribute('title', 'Bajo nivel de participación de insiders');
                } else if (insiderValue <= 50) {
                    insiderElem.classList.add('text-warning');
                    insiderElem.setAttribute('data-bs-toggle', 'tooltip');
                    insiderElem.setAttribute('title', 'Moderado nivel de participación de insiders');
                } else {
                    insiderElem.classList.add('text-danger');
                    insiderElem.setAttribute('data-bs-toggle', 'tooltip');
                    insiderElem.setAttribute('title', 'Alto nivel de participación de insiders');
                }
            }

            // INSTITUTIONAL OWNERSHIP
            const institutionalValue = parseFloat(company.institutionalOwn?.replace('%', '') || 0);
            const institutionalElem = document.getElementById('institutionalOwn');
            institutionalElem.textContent = company.institutionalOwn || 'N/A';
            institutionalElem.className = 'stat-value'; // limpia clases anteriores

            if (!isNaN(institutionalValue)) {
                institutionalElem.setAttribute('data-bs-toggle', 'tooltip');
                if (institutionalValue >= 30) {
                    institutionalElem.classList.add('text-danger');
                    institutionalElem.setAttribute('title', 'Alta participación institucional');
                } else {
                    institutionalElem.classList.add('text-success');
                    institutionalElem.setAttribute('title', 'Baja participación institucional');
                }
            }

            // Activar tooltips
            bootstrap.Tooltip.getInstance(insiderElem)?.dispose();
            bootstrap.Tooltip.getInstance(institutionalElem)?.dispose();
            new bootstrap.Tooltip(insiderElem);
            new bootstrap.Tooltip(institutionalElem);  

            activateTooltips(); 

            if (userRole === "intermedio", "vip") {
                const playbook = currentData.playbook || "Ningún patrón identificado";
                document.getElementById("playbookSection").style.display = "block";
                const playbooks = currentData.playbooks || [];

                const playbookContent = document.getElementById("playbookContent");
                if (userRole === "intermedio", "vip") {
                document.getElementById("playbookSection").style.display = "block";

                if (playbooks.length === 1 && playbooks[0] === "Ningún patrón identificado") {
                    playbookContent.innerHTML = `<span class="text-muted">Ningún patrón identificado.</span>`;
                } else {
                    playbookContent.innerHTML = playbooks.map(nombre => {
                    const info = patronesInfo[nombre];
                    if (!info) return "";

                    return `
                        <div class="mb-3 p-2 border rounded shadow-sm">
                        <div class="fw-bold text-primary">${nombre} 
                            <span class="badge ${info.tipo.includes('Largo') ? 'bg-success' : 'bg-danger'} ms-2">${info.tipo}</span>
                        </div>
                        <div class="fst-italic mb-2">${info.descripcion}</div>
                        <button class="btn btn-sm btn-outline-info" onclick="abrirModalEjemplo('${info.enlace}')">Ver ejemplo visual</button>
                        </div>
                    `;
                    }).join("");
                }
                }

            }
            
              

    }

    // Renderizar playbook

    function renderPlaybookDetalle(nombrePatron) {
        const info = patronesInfo[nombrePatron];
        const playbookContent = document.getElementById("playbookContent");
      
        if (!info) {
          playbookContent.innerHTML = `<span class="text-muted">Ningún patrón identificado.</span>`;
          return;
        }
      
        playbookContent.innerHTML = `
        <div class="mb-2"><strong>📘 Patrón Detectado:</strong> <span class="text-primary">${nombrePatron}</span></div>
        <div class="mb-2"><em>${info.descripcion}</em></div>
        <div>
            <button class="btn btn-sm btn-outline-info" onclick="abrirModalEjemplo('${info.enlace}')">Ver ejemplo visual</button>
        </div>
        `;

      }

    // Renderizar gráfico principal
    function renderChart(data) {
        if (mainPriceChart) {
            mainPriceChart.destroy();
        }


        const datasets = [{
            label: 'Precio de Cierre',
            data: data.prices.close,
            borderColor: '#0d6efd',
            backgroundColor: 'rgba(13, 110, 253, 0.1)',
            borderWidth: 2,
            tension: 0.1,
            pointRadius: 0,
            fill: true
        }];

        if (data.gaps && data.gaps.length > 0) {
            datasets.push({
                label: 'Gaps Alcistas',
                data: data.dates.map(date => {
                    const gap = data.gaps.find(g => g.date === date);
                    return gap && gap.direction === 'up' ? data.prices.close[data.dates.indexOf(date)] : null;
                }),
                borderColor: 'transparent',
                backgroundColor: '#28a745',
                pointRadius: 5,
                pointHoverRadius: 7,
                showLine: false
            });

            datasets.push({
                label: 'Gaps Bajistas',
                data: data.dates.map(date => {
                    const gap = data.gaps.find(g => g.date === date);
                    return gap && gap.direction === 'down' ? data.prices.close[data.dates.indexOf(date)] : null;
                }),
                borderColor: 'transparent',
                backgroundColor: '#dc3545',
                pointRadius: 5,
                pointHoverRadius: 7,
                showLine: false
            });
        }

        mainPriceChart = new Chart(priceChartCtx, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    zoom: {
                        pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.datasetIndex === 0) return `Cierre: $${ctx.parsed.y.toFixed(2)}`;
                                return null;
                            },
                            footer: (items) => {
                                const date = items[0].label;
                                const gapData = data.gaps?.find(g => g.date === date);
                                if (!gapData) return null;
                                return [
                                    `Gap ${gapData.direction === 'up' ? '↑ Alcista' : '↓ Bajista'}: ${Math.abs(gapData.gap_percent).toFixed(2)}%`,
                                    `Apertura: $${gapData.open.toFixed(2)}`,
                                    `Cierre Previo: $${gapData.prev_close.toFixed(2)}`
                                ];
                            }
                        }
                    },
                    legend: {
                        onClick: (e, legendItem, legend) => {
                            if (legendItem.datasetIndex > 0) {
                                Chart.defaults.plugins.legend.onClick(e, legendItem, legend);
                            }
                        },
                        labels: {
                            filter: (legendItem) => {
                                return legendItem.datasetIndex === 0 || legendItem.text.includes('Gaps');
                            }
                        }
                    }

                },
                scales: {
                    x: { title: { display: true, text: 'Fecha' } },
                    y: { title: { display: true, text: 'Precio ($)' } }
                }
            }
        });
    }

    // Renderizar tabla de gaps
    function renderGapsTable(gaps) {
        gapsTableBody.innerHTML = '';

        if (!gaps || gaps.length === 0) {
            gapsTableBody.innerHTML = `
                <tr>
                    <td class="text-center py-4">
                        <i class="bi bi-info-circle"></i> No se encontraron gaps significativos
                    </td>
                </tr>
            `;
            return;
        }

        gaps.forEach((gap) => {
            const highSpike = gap.high ? ((gap.high - gap.open) / gap.open * 100).toFixed(2) : 'N/A';
            const lowSpike = gap.low ? ((gap.low - gap.open) / gap.open * 100).toFixed(2) : 'N/A';
            const dayReturn = ((gap.close - gap.open) / gap.open * 100).toFixed(2);
            const change = gap.change_percent?.toFixed(2) ?? 'N/A';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${gap.date}</td>
                <td>
                    <span class="${gap.direction === 'up' ? 'gap-up' : 'gap-down'}">
                        ${gap.direction === 'up' ? '↑ Alcista' : '↓ Bajista'}
                    </span>
                </td>
                <td>${Math.abs(gap.gap_percent).toFixed(2)}%</td>
                <td>${formatNumber(gap.volume)}</td>
                <td>${formatNumber(gap.dollar_volume)}</td>
                <td class="${highSpike >= 0 ? 'text-success' : 'text-danger'}">${highSpike}%</td>
                <td class="${lowSpike >= 0 ? 'text-success' : 'text-danger'}">${lowSpike}%</td>
                <td class="${change >= 0 ? 'text-success' : 'text-danger'}">${change}%</td>
                <td>$${gap.open.toFixed(2)}</td>             
                <td>$${gap.close.toFixed(2)}</td>             
                <td class="${dayReturn >= 0 ? 'text-success' : 'text-danger'}">${dayReturn}%</td>
            `;

            gapsTableBody.appendChild(row);
            activateTooltips();
        });
    }

    // Renderizar estadísticas de gaps
    function renderGapStats(stats) {
        const container = document.getElementById('gapStatsContainer');
        const gaps = currentData?.gaps || [];

        if (!stats || stats.total === 0 || gaps.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <p class="text-muted">No hay suficientes gaps para estadísticas</p>
                </div>
            `;
            return;
        }

        const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const avgGap = mean(gaps.map(g => Math.abs(g.gap_percent))).toFixed(2);
        const avgVol = mean(gaps.map(g => g.dollar_volume)).toFixed(0);
        const avgHigh = mean(gaps.map(g => ((g.high - g.open) / g.open) * 100)).toFixed(2);
        const avgLow = mean(gaps.map(g => ((g.low - g.open) / g.open) * 100)).toFixed(2);
        const avgReturn = mean(gaps.map(g => ((g.close - g.open) / g.open) * 100)).toFixed(2);
        const avgChange = mean(gaps.map(g => g.change_percent)).toFixed(2);

        // Cabecera con totales
        const statsHeader = `
    <div class="stats-grid mb-4">
        <div class="stats-tile">
            <h6>Total de Gaps</h6>
            <div class="stat-valuebig ${stats.total <= 4 ? 'text-danger' : stats.total <= 10 ? 'text-warning' : 'text-success'}">
                ${stats.total}
            </div>
        </div>
    </div>

    <div class="row g-3 mb-2">
        <div class="col-md-6">
            <div class="stats-tile h-100">
                <h6>Cierran por Encima</h6>
                <div class="stat-value text-success">
                    ${stats.closed_above} <small>(${stats.pct_above.toFixed(1)}%)</small>
                </div>
                <div class="progress mt-2">
                    <div class="progress-bar bg-success" style="width: ${stats.pct_above}%"></div>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="stats-tile h-100">
                <h6>Cierran por Debajo</h6>
                <div class="stat-value text-danger">
                    ${stats.closed_below} <small>(${stats.pct_below.toFixed(1)}%)</small>
                </div>
                <div class="progress mt-2">
                    <div class="progress-bar bg-danger" style="width: ${stats.pct_below}%"></div>
                </div>
            </div>
        </div>
    </div>
  `;


        // Tarjetas con promedios
        const averagesGrid = `
            <div class="stats-grid">
                <div class="stats-tile">
                    <h6>Tamaño Promedio (%)</h6>
                    <div class="stat-value">${avgGap}%</div>
                </div>
                <div class="stats-tile">
                    <h6>Volumen $ Promedio</h6>
                    <div class="stat-value">${formatNumber(avgVol)}</div>
                </div>
                <div class="stats-tile">
                    <h6>High Spike Promedio</h6>
                    <div class="stat-value text-success">${avgHigh}%</div>
                </div>
                <div class="stats-tile">
                    <h6>Low Spike Promedio</h6>
                    <div class="stat-value text-danger">${avgLow}%</div>
                </div>
                <div class="stats-tile">
                    <h6>
                        Change Promedio
                        <i class="bi bi-info-circle text-secondary" data-bs-toggle="tooltip" title="Cierre vs Cierre previo (overnight + intradía)"></i>
                    </h6>
                    <div class="stat-value ${avgChange >= 0 ? 'text-success' : 'text-danger'}">${avgChange}%</div>
                </div>
                <div class="stats-tile">
                    <h6>
                        Return Promedio
                        <i class="bi bi-info-circle text-secondary" data-bs-toggle="tooltip" title="Cierre vs Apertura (intradía)"></i>
                    </h6>
                    <div class="stat-value ${avgReturn >= 0 ? 'text-success' : 'text-danger'}">${avgReturn}%</div>
                </div>
            </div>
        `;



        container.innerHTML = statsHeader + averagesGrid;

        // Activar tooltips de Bootstrap
        document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
            new bootstrap.Tooltip(el);
        });

        // Crear el gráfico
        setTimeout(() => {
            const ctx = document.getElementById('gapStatsChart').getContext('2d');

            if (window.gapStatsChart instanceof Chart) {
                window.gapStatsChart.destroy();
            }

            window.gapStatsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: [
                        'Tamaño (%)', 'Volumen', 'High Spike (%)',
                        'Low Spike (%)', 'Change (%)', 'Return (%)'
                    ],
                    datasets: [{
                        label: 'Promedio',
                        data: [
                            parseFloat(avgGap),
                            parseFloat(avgVol),
                            parseFloat(avgHigh),
                            parseFloat(avgLow),
                            parseFloat(avgChange),
                            parseFloat(avgReturn)
                        ],
                        backgroundColor: [
                            '#0d6efd',
                            '#20c997',
                            '#28a745',
                            '#dc3545',
                            avgChange >= 0 ? '#28a745' : '#dc3545',
                            avgReturn >= 0 ? '#28a745' : '#dc3545'
                        ],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const value = ctx.raw;
                                    if (ctx.dataIndex === 1) {
                                        return `${formatNumber(value)} volumen`;
                                    } else {
                                        return `${parseFloat(value).toFixed(2)}%`;
                                    }
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Valor Promedio'
                            },
                            ticks: {
                                callback: function (value, index) {
                                    return index === 1 ? formatNumber(value) : value + '%';
                                }
                            }
                        }
                    }
                }
            });
        }, 150);
    }
    // Renderizar estadísticas de DAy 2
    function renderDay2Stats(day2) {
        const container = document.getElementById('day2StatsContainer');
        if (!day2 || day2.length === 0) {
            container.innerHTML = `<div class="text-muted py-3 text-center">No hay datos disponibles para Day 2</div>`;
            return;
        }

        const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

        const avgGap = mean(day2.map(d => Math.abs(d.gap_size))).toFixed(2);
        const avgVol = mean(day2.map(d => d.dollar_volume)).toFixed(0);
        const avgHigh = mean(day2.map(d => d.high_spike)).toFixed(2);
        const avgLow = mean(day2.map(d => d.low_spike)).toFixed(2);
        const avgReturn = mean(day2.map(d => d.return)).toFixed(2);
        const avgChange = mean(day2.map(d => d.change)).toFixed(2);

        const up = day2.filter(d => d.return >= 0).length;
        const down = day2.length - up;

        const pctUp = (up / day2.length * 100).toFixed(1);
        const pctDown = (down / day2.length * 100).toFixed(1);

        container.innerHTML = `
            <div class="stats-grid mb-4">
                <div class="stats-tile">
                    <h6>Total Días Day 2</h6>
                    <div class="stat-value">${day2.length}</div>
                </div>
            </div>
    
            <div class="row g-3 mb-4">
                <div class="col-md-6">
                    <div class="stats-tile h-100">
                        <h6>Cierran por Encima</h6>
                        <div class="stat-value text-success">${up} <small>(${pctUp}%)</small></div>
                        <div class="progress mt-2">
                            <div class="progress-bar bg-success" style="width: ${pctUp}%"></div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="stats-tile h-100">
                        <h6>Cierran por Debajo</h6>
                        <div class="stat-value text-danger">${down} <small>(${pctDown}%)</small></div>
                        <div class="progress mt-2">
                            <div class="progress-bar bg-danger" style="width: ${pctDown}%"></div>
                        </div>
                    </div>
                </div>
            </div>
    
            <div class="stats-grid">
                <div class="stats-tile">
                    <h6>Tamaño Promedio del Gap (%)</h6>
                    <div class="stat-value">${avgGap}%</div>
                </div>
                <div class="stats-tile">
                    <h6>Volumen $ Promedio</h6>
                    <div class="stat-value">${formatNumber(avgVol)}</div>
                </div>
                <div class="stats-tile">
                    <h6>High Spike Promedio</h6>
                    <div class="stat-value text-success">${avgHigh}%</div>
                </div>
                <div class="stats-tile">
                    <h6>Low Spike Promedio</h6>
                    <div class="stat-value text-danger">${avgLow}%</div>
                </div>
                <div class="stats-tile">
                     <h6>Change Promedio</h6>
                      <div class="stat-value ${avgChange >= 0 ? 'text-success' : 'text-danger'}">${avgChange}%</div>
                </div>
                 <div class="stats-tile">
                    <h6>Return Promedio</h6>
                    <div class="stat-value ${avgReturn >= 0 ? 'text-success' : 'text-danger'}">${avgReturn}%</div>
                </div>
            </div>
        `;
    }

    // Renderizar resultados de backtesting
    function renderBacktestResults(results) {
        if (!results || !results.summary || results.summary.total_trades === 0) {
            backtestContainer.innerHTML = `
                <div class="alert alert-warning">
                    <h6><i class="bi bi-exclamation-triangle"></i> No se encontraron trades válidos</h6>
                    <p>Prueba con:</p>
                    <ul>
                        <li>Reducir el % mínimo de gap</li>
                        <li>Seleccionar un período más largo</li>
                        <li>Usar un ticker más volátil (ej: TSLA, BTC-USD)</li>
                    </ul>
                </div>
            `;
            return;
        }

        backtestContainer.innerHTML = `
            <div class="card shadow mt-3">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0"><i class="bi bi-speedometer2"></i> Resultados de Backtesting</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6><i class="bi bi-graph-up"></i> Métricas Clave</h6>
                            <div class="metrics-grid">
                                <div class="metric-card bg-success-light">
                                    <span class="metric-label">Total Trades</span>
                                    <span class="metric-value">${results.summary.total_trades}</span>
                                </div>
                                <div class="metric-card ${results.summary.win_rate >= 50 ? 'bg-success-light' : 'bg-danger-light'}">
                                    <span class="metric-label">Win Rate</span>
                                    <span class="metric-value">${results.summary.win_rate}%</span>
                                </div>
                                <div class="metric-card ${results.summary.avg_profit >= 0 ? 'bg-success-light' : 'bg-danger-light'}">
                                    <span class="metric-label">Retorno Promedio</span>
                                    <span class="metric-value">${results.summary.avg_profit}%</span>
                                </div>
                                <div class="metric-card bg-info-light">
                                    <span class="metric-label">Max Drawdown</span>
                                    <span class="metric-value">${results.summary.max_drawdown}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6><i class="bi bi-bar-chart"></i> Distribución de Retornos</h6>
                            <canvas id="returnsChart"></canvas>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h6><i class="bi bi-table"></i> Detalle de Trades</h6>
                        <div class="table-responsive" style="max-height: 300px;">
                            <table class="table table-sm table-hover">
                                <thead>
                                    <tr>
                                        <th>Fecha Entrada</th>
                                        <th>Dirección</th>
                                        <th>Precio Entrada</th>
                                        <th>Precio Salida</th>
                                        <th>Retorno</th>
                                    </tr>
                                </thead>
                                <tbody id="backtestTradesBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const allTrades = [...results.long_positions.map(t => ({ ...t, direction: 'LONG' })),
        ...results.short_positions.map(t => ({ ...t, direction: 'SHORT' }))];

        const tradesBody = document.getElementById('backtestTradesBody');
        allTrades.sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

        allTrades.forEach(trade => {
            const row = document.createElement('tr');
            row.innerHTML = `
  <td>${gap.date}</td>
  <td>
    <span class="${gap.direction === 'up' ? 'gap-up' : 'gap-down'}">
      ${gap.direction === 'up' ? '↑ Alcista' : '↓ Bajista'}
    </span>
  </td>
  <td>${Math.abs(gap.gap_percent).toFixed(2)}%</td>
  <td>${formatNumber(gap.volume)}</td>
  <td>$${gap.high?.toFixed(2) || 'N/A'}</td>
  <td>${gap.time_high || 'N/A'}</td>
  <td>$${gap.low?.toFixed(2) || 'N/A'}</td>
  <td>${gap.time_low || 'N/A'}</td>
`;
            tradesBody.appendChild(row);
        });

        const ctx = document.getElementById('returnsChart').getContext('2d');
        const returns = allTrades.map(t => t.return_pct);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: allTrades.map((_, i) => `Trade ${i + 1}`),
                datasets: [{
                    label: 'Retorno (%)',
                    data: returns,
                    backgroundColor: returns.map(r => r >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)'),
                    borderColor: returns.map(r => r >= 0 ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.raw.toFixed(2)}%`
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Retorno (%)' },
                        ticks: { callback: value => value + '%' }
                    }
                }
            }
        });
    }
    

});


function renderDay2Table(day2) {
    const tbody = document.getElementById('day2TableBody');
    tbody.innerHTML = "";

    day2.forEach(entry => {
        const row = document.createElement("tr");
        const direction = entry.return >= 0 ? "↑ Alcista" : "↓ Bajista";

        row.innerHTML = `
            <td>${entry.date}</td>
            <td><span class="${entry.return >= 0 ? 'gap-up' : 'gap-down'}">${entry.return >= 0 ? "↑ Alcista" : "↓ Bajista"}</span></td>
            <td>${Math.abs(entry.gap_size).toFixed(2)}%</td>
            <td>${formatNumber(entry.volume)}</td>
             <td>${formatNumber(entry.dollar_volume)}</td>
            <td class="${entry.high_spike >= 0 ? 'text-success' : 'text-danger'}">${entry.high_spike.toFixed(2)}%</td>
            <td class="${entry.low_spike >= 0 ? 'text-success' : 'text-danger'}">${entry.low_spike.toFixed(2)}%</td>
            <td class="${entry.change >= 0 ? 'text-success' : 'text-danger'}">${entry.change.toFixed(2)}%</td>
            <td>$${entry.open.toFixed(2)}</td>           
            <td>$${entry.close.toFixed(2)}</td>
            <td class="${entry.return >= 0 ? 'text-success' : 'text-danger'}">${entry.return.toFixed(2)}%</td>
            `;


        tbody.appendChild(row);
    });
}

function renderGapVsDay2Chart(gaps, day2) {
    if (!gaps || !day2 || gaps.length === 0 || day2.length === 0) return;

    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    const avgGapSize = mean(gaps.map(g => Math.abs(g.gap_percent))).toFixed(2);
    const avgGapSize2 = mean(day2.map(d => Math.abs(d.gap_size))).toFixed(2);
    const avgHigh1 = mean(gaps.map(g => ((g.high - g.open) / g.open) * 100)).toFixed(2);
    const avgLow1 = mean(gaps.map(g => ((g.low - g.open) / g.open) * 100)).toFixed(2);
    const avgReturn1 = mean(gaps.map(g => ((g.close - g.open) / g.open) * 100)).toFixed(2);
    const avgChange1 = mean(gaps.map(g => g.change_percent)).toFixed(2);

    const avgHigh2 = mean(day2.map(d => d.high_spike)).toFixed(2);
    const avgLow2 = mean(day2.map(d => d.low_spike)).toFixed(2);
    const avgReturn2 = mean(day2.map(d => d.return)).toFixed(2);
    const avgChange2 = mean(day2.map(d => d.change)).toFixed(2);

    const ctx = document.getElementById('gapVsDay2Chart').getContext('2d');

    if (window.gapVsDay2Chart instanceof Chart) {
        window.gapVsDay2Chart.destroy();
    }

    window.gapVsDay2Chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tamaño Gap', 'High Spike', 'Low Spike', 'Change', 'Return'],
            datasets: [
                {
                    label: 'Gap Day',
                    data: [
                        parseFloat(avgGapSize),
                        parseFloat(avgHigh1),
                        parseFloat(avgLow1),
                        parseFloat(avgChange1),
                        parseFloat(avgReturn1)
                    ],
                    backgroundColor: '#0d6efd'
                },
                {
                    label: 'Day 2',
                    data: [
                        parseFloat(avgGapSize2),
                        parseFloat(avgHigh2),
                        parseFloat(avgLow2),
                        parseFloat(avgChange2),
                        parseFloat(avgReturn2)
                    ],
                    backgroundColor: '#6f42c1'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${parseFloat(ctx.raw).toFixed(2)}%`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '% promedio'
                    }
                }
            }
        }
    });
}

// Dark Mode Toggle Functionality
document.addEventListener('DOMContentLoaded', function () {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    // Check for saved user preference or use system preference
    const currentTheme = localStorage.getItem('theme') ||
        (prefersDarkScheme.matches ? 'dark' : 'light');

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        darkModeToggle.innerHTML = '<i class="bi bi-sun-fill"></i>';
    }

    // Toggle dark mode
    darkModeToggle.addEventListener('click', function () {
        document.body.classList.toggle('dark-mode');
        const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
        localStorage.setItem('theme', theme);

        if (theme === 'dark') {
            darkModeToggle.innerHTML = '<i class="bi bi-sun-fill"></i>';
        } else {
            darkModeToggle.innerHTML = '<i class="bi bi-moon-fill"></i>';
        }

        // Update charts with dark mode
        updateChartsForDarkMode(theme === 'dark');
    });

    // Update charts for dark mode
    function updateChartsForDarkMode(isDark) {
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDark ? '#e0e0e0' : '#666';

        // Update all Chart.js instances
        Chart.helpers.each(Chart.instances, function (instance) {
            instance.options.scales.x.grid.color = gridColor;
            instance.options.scales.y.grid.color = gridColor;
            instance.options.scales.x.ticks.color = textColor;
            instance.options.scales.y.ticks.color = textColor;
            instance.options.plugins.title.color = textColor;
            instance.update();
        });
    }

    // Initialize charts with correct theme
    const initialDarkMode = document.body.classList.contains('dark-mode');
    updateChartsForDarkMode(initialDarkMode);
});


// BOTONES ENLACES A WEBS EXTERNAS
  document.getElementById('finviz-btn').addEventListener('click', function() {
    const ticker = document.getElementById('ticker').value.trim(); // Captura el ticker
    if (ticker) {
        // Si hay un ticker, abrir el enlace de Finviz
        window.open(`https://finviz.com/quote.ashx?t=${ticker}`, '_blank');
    } else {
        alert("Por favor ingrese un ticker.");
    }
});

document.getElementById('dilutiontracker-btn').addEventListener('click', function() {
    const ticker = document.getElementById('ticker').value.trim(); // Captura el ticker
    if (ticker) {
        // Si hay un ticker, abrir el enlace de DilutionTracker
        window.open(`https://dilutiontracker.com/app/search/${ticker}`, '_blank');
    } else {
        alert("Por favor ingrese un ticker.");
    }
});

document.getElementById('edgar-btn').addEventListener('click', function() {
    const ticker = document.getElementById('ticker').value.trim(); // Captura el ticker
    if (ticker) {
        // Si hay un ticker, abrir el enlace de Edgar
        window.open(`https://app.askedgar.io/ticker/${ticker}`, '_blank');
    } else {
        alert("Por favor ingrese un ticker.");
    }
});

function activateTooltips() {
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new bootstrap.Tooltip(el);
    });
}

function calcularPosicion() {
    const riesgoInput = document.getElementById('riesgo');
    const entradaInput = document.getElementById('entrada');
    const stopInput = document.getElementById('stop');
  
    const riesgo = parseFloat(riesgoInput.value);
    const entrada = parseFloat(entradaInput.value);
    const stop = parseFloat(stopInput.value);
  
    // Reset clases de error
    riesgoInput.classList.remove('is-invalid');
    entradaInput.classList.remove('is-invalid');
    stopInput.classList.remove('is-invalid');
  
    // Validaciones mínimas
    let hayError = false;
    if (isNaN(riesgo) || riesgo <= 0) {
      riesgoInput.classList.add('is-invalid');
      hayError = true;
    }
    if (isNaN(entrada)) {
      entradaInput.classList.add('is-invalid');
      hayError = true;
    }
    if (isNaN(stop)) {
      stopInput.classList.add('is-invalid');
      hayError = true;
    }
  
    if (hayError) {
      document.getElementById('resultadoPosicion').innerHTML = '<div class="text-danger">Verifica los valores ingresados</div>';
      return;
    }
  
    const diferencia = entrada - stop;
  
    if (diferencia === 0) {
      stopInput.classList.add('is-invalid');
      document.getElementById('resultadoPosicion').innerHTML = '<div class="text-danger">La diferencia entre entrada y stop no puede ser cero</div>';
      return;
    }
  
    const size = Math.floor(Math.abs(riesgo / diferencia));
    const total = size * entrada;
  
    const esLarga = diferencia > 0;
    const tipoPosicion = esLarga ? 'Posición Larga 📈' : 'Posición Corta 📉';
    const colorPosicion = esLarga ? 'green' : 'red';
  
    document.getElementById('resultadoPosicion').innerHTML = `
      <div class="mb-2" style="color:${colorPosicion}; font-weight:bold;">${tipoPosicion}</div>
      <div class="mb-2">Riesgo por acción: <span style="color:rgb(44, 216, 25)"> $${diferencia.toFixed(2)}</span></div>
      <div class="mb-2"><strong>Número de Size:</strong>
        <strong style="color: #fd7e14; font-weight: bold; display:block; font-size:1.6rem;">${size} acciones</strong>
      </div>
      <div class="mb-2">Importe Total de la Posición: : <strong style="color:write;font-size:1.4rem">$${total.toFixed(2)}</strong></div>
    `;
  }

  
  function limpiarPosicion() {
    document.getElementById('riesgo').value = "10";
    document.getElementById('entrada').value = "";
    document.getElementById('stop').value = "";
    document.getElementById('resultadoPosicion').innerHTML = "";
  
    document.getElementById('riesgo').classList.remove('is-invalid');
    document.getElementById('entrada').classList.remove('is-invalid');
    document.getElementById('stop').classList.remove('is-invalid');
  }
  
  function abrirModalEjemplo(urlImagen) {
    const modalBody = document.getElementById('modalEjemploVisualBody');
    modalBody.innerHTML = `<img src="${urlImagen}" alt="Ejemplo visual" class="img-fluid rounded shadow">`;
    const modal = new bootstrap.Modal(document.getElementById('modalEjemploVisual'));
    modal.show();
  }
  
  