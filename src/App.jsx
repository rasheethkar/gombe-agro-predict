import { useState, useEffect } from 'react';
import './App.css';

const GOMBE_LGAS = {
  akko: { name: "Akko LGA", lat: 10.2833, lon: 10.9667 },
  balanga: { name: "Balanga LGA", lat: 9.9667, lon: 11.6833 },
  billiri: { name: "Billiri LGA", lat: 9.8667, lon: 11.2167 },
  dukku: { name: "Dukku LGA", lat: 10.8167, lon: 10.7667 },
  funakaye: { name: "Funakaye LGA", lat: 10.8500, lon: 11.4333 },
  gombe: { name: "Gombe Area", lat: 10.2897, lon: 11.1673 },
  kaltungo: { name: "Kaltungo LGA", lat: 9.8167, lon: 11.3167 },
  kwami: { name: "Kwami LGA", lat: 10.5167, lon: 11.2500 },
  nafada: { name: "Nafada LGA", lat: 11.0956, lon: 11.3325 },
  shongom: { name: "Shongom LGA", lat: 9.6667, lon: 11.2000 },
  yamaltu: { name: "Yamaltu/Deba LGA", lat: 10.2167, lon: 11.3833 }
};

const CROP_REQUIREMENTS = {
  sorghum: { nameEn: "Sorghum (Dawa)", nameHa: "Dawa", minMoisture: 35 },
  millet: { nameEn: "Millet (Maiwa)", nameHa: "Maiwa", minMoisture: 30 },
  maize: { nameEn: "Maize (Masara)", nameHa: "Masara", minMoisture: 50 },
  cotton: { nameEn: "Cotton (Auduga)", nameHa: "Auduga", minMoisture: 45 }
};

function buildNasaReport(json) {
  const params = json.properties.parameter;
  const isValidNASAValue = value => value !== null
    && value !== undefined
    && value !== ''
    && Number.isFinite(Number(value))
    && Number(value) !== -999;
  const validMoistureEntries = Object.entries(params.GWETTOP || {})
    .filter(([, val]) => isValidNASAValue(val))
    .map(([date, val]) => ({
      date: `${date.slice(4, 6)}/${date.slice(6, 8)}`,
      fullDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      val: Math.round(Number(val) * 100)
    }));
  const validValues = values => Object.values(values || {})
    .filter(isValidNASAValue)
    .map(Number);
  const validRoot = validValues(params.GWETROOT);
  const validTemp = validValues(params.T2M);
  const validRain = validValues(params.PRECTOTCORR);
  const latest = validMoistureEntries[validMoistureEntries.length - 1] || { val: 0, fullDate: '' };

  return {
    surfaceMoisture: latest.val,
    rootMoisture: validRoot.length ? Math.round(validRoot[validRoot.length - 1] * 100) : 0,
    temp: validTemp.length ? Number(validTemp[validTemp.length - 1]).toFixed(1) : 0,
    rain7Days: validRain.length ? validRain.reduce((a, b) => a + b, 0).toFixed(1) : 0,
    validRainDays: validRain.length,
    dateStamp: latest.fullDate,
    history: validMoistureEntries
  };
}

function App() {
  const [lang, setLang] = useState('en');
  const [selectedLocation, setSelectedLocation] = useState({
    name: "Gombe Area",
    lat: 10.2897,
    lon: 11.1673,
    isCustomGps: false
  });
  const [cropKey, setCropKey] = useState('sorghum');
  const [soilType, setSoilType] = useState('loam');
  
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [showSmsPreview, setShowSmsPreview] = useState(false);
  const [nasaData, setNasaData] = useState({
    surfaceMoisture: 0,
    rootMoisture: 0,
    temp: 0,
    rain7Days: 0,
    validRainDays: 0,
    dateStamp: '',
    history: []
  });

  // NASA POWER data is approximately four days behind the current date.
  const getNASAQueryDates = () => {
    const end = new Date();
    end.setDate(end.getDate() - 4);
    const start = new Date(end);
    start.setDate(start.getDate() - 6); // Inclusive 7-day window
    const format = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };
    return { startStr: format(start), endStr: format(end) };
  };

  // Fetch the latest NASA POWER daily gridded estimates.
  useEffect(() => {
    let isCancelled = false;
    const lgaKey = selectedLocation.isCustomGps
      ? `gps-${selectedLocation.lat}-${selectedLocation.lon}`
      : Object.keys(GOMBE_LGAS).find(key => GOMBE_LGAS[key].name === selectedLocation.name) || selectedLocation.name;
    const cacheKey = `gombe-agro-predict:nasa-report:${lgaKey}`;

    const fetchLiveNASA = async () => {
      setLoading(true);
      setError(null);
      setOfflineMode(false);
      const { lat, lon } = selectedLocation;
      const { startStr, endStr } = getNASAQueryDates();

      const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETTOP,GWETROOT,T2M,PRECTOTCORR&community=RE&longitude=${lon}&latitude=${lat}&start=${startStr}&end=${endStr}&format=JSON`;

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`NASA POWER request failed (${res.status})`);
        const json = await res.json();
        try {
          localStorage.setItem(cacheKey, JSON.stringify(json));
        } catch (storageError) {
          console.error("Unable to save NASA report locally:", storageError);
        }
        const report = buildNasaReport(json);

        if (!isCancelled) {
          setNasaData(report);
          setOfflineMode(false);
        }
      } catch (err) {
        console.error("NASA API Error:", err);
        if (!isCancelled) {
          try {
            const cachedResponse = localStorage.getItem(cacheKey);
            if (cachedResponse) {
              setNasaData(buildNasaReport(JSON.parse(cachedResponse)));
              setOfflineMode(true);
              setError(null);
            } else {
              setError(lang === 'en' ? "Unable to reach NASA servers. Check network connection." : "Ba a iya samun bayanan tauraron NASA ba. Duba hanyar intanet.");
            }
          } catch (storageError) {
            console.error("Unable to load cached NASA report:", storageError);
            setError(lang === 'en' ? "Unable to reach NASA servers. Check network connection." : "Ba a iya samun bayanan tauraron NASA ba. Duba hanyar intanet.");
          }
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchLiveNASA();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocation, lang]);

  // Feature 1: Real Device GPS Detection
  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSelectedLocation({
          name: "My Exact Farm GPS",
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          isCustomGps: true
        });
        setGpsLoading(false);
      },
      () => {
        alert("Location access denied. Please select an LGA manually.");
        setGpsLoading(false);
      }
    );
  };

  // Physics-Driven Readiness Score
  const calculateReadiness = () => {
    let effectiveMoisture = nasaData.surfaceMoisture;
    if (soilType === 'clay') effectiveMoisture += 8;
    if (soilType === 'sandy') effectiveMoisture -= 10;
    effectiveMoisture = Math.max(0, Math.min(100, effectiveMoisture));

    const required = CROP_REQUIREMENTS[cropKey]?.minMoisture || 35;
    let score = Math.max(5, Math.min(99, Math.round(50 + (effectiveMoisture - required) * 2)));
    return { score, effectiveMoisture, isSafe: score >= 60 };
  };

  const readiness = calculateReadiness();
  const cropInfo = CROP_REQUIREMENTS[cropKey] || CROP_REQUIREMENTS.sorghum;

  const advisoryText = lang === 'en'
    ? `NASA POWER Daily Gridded Estimates report ${nasaData.surfaceMoisture}% topsoil moisture and ${nasaData.rain7Days}mm rain across ${nasaData.validRainDays} valid days at ${selectedLocation.name}. Adjusted for ${soilType} soil (${readiness.effectiveMoisture}%), conditions are ${readiness.isSafe ? 'favorable' : 'too dry'} for planting ${cropInfo.nameEn}.`
    : `Bayanan NASA POWER Daily Gridded Estimates sun nuna danshin kasa ${nasaData.surfaceMoisture}% da ruwan sama ${nasaData.rain7Days}mm a cikin kwanaki ${nasaData.validRainDays} a ${selectedLocation.name}. Yanayin kasa (${readiness.effectiveMoisture}%) ${readiness.isSafe ? 'yayi kyau sosai' : 'ya bushe'} don shukar ${cropInfo.nameHa}.`;

  // Feature 3: Audio Voice Readout for Non-Readers
  const handleSpeakAdvisory = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(advisoryText);
      utterance.rate = 0.9;
      utterance.lang = lang === 'ha' ? 'ha' : 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const smsMessage = `NASA-GOMBE ALERT (${nasaData.dateStamp}): Location: ${selectedLocation.name}. Topsoil Moisture: ${nasaData.surfaceMoisture}%. Temp: ${nasaData.temp}°C. Advice for ${lang === 'en' ? cropInfo.nameEn : cropInfo.nameHa}: ${readiness.isSafe ? 'FAVORABLE MOISTURE (A SHUKA)' : 'DELAY PLANTING (A DAKATA)'}.`;

  return (
    <div className="app-wrapper">
      <div className="app-container">
        <header className="app-header">
          <div className="logo-group">
            <span className="sat-icon">🛰️</span>
            <div>
              <h1>Gombe Agro Predict</h1>
              <p className="tagline">
                NASA POWER Daily Gridded Estimates • ~4-day satellite processing lag
              </p>
            </div>
          </div>
          <button className="lang-toggle-btn" onClick={() => setLang(lang === 'en' ? 'ha' : 'en')}>
            {lang === 'en' ? 'Hausa' : 'English'}
          </button>
        </header>

        <main className="app-main">
          {/* Location & Live GPS Card */}
          <div className="dashboard-card select-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ margin: 0 }}>
                {lang === 'en' ? 'Farm Location (GPS):' : 'Wurin Gona (GPS):'}
              </label>
              <button 
                onClick={handleDetectGPS}
                style={{ background: '#0d47a1', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {gpsLoading ? 'Locating...' : '📍 Use My Exact GPS'}
              </button>
            </div>

            <select 
              value={selectedLocation.isCustomGps ? 'custom' : Object.keys(GOMBE_LGAS).find(k => GOMBE_LGAS[k].name === selectedLocation.name) || 'gombe'}
              onChange={(e) => {
                if (e.target.value !== 'custom') {
                  setSelectedLocation({ ...GOMBE_LGAS[e.target.value], isCustomGps: false });
                }
              }}
            >
              {selectedLocation.isCustomGps && (
                <option value="custom">📍 Exact GPS ({selectedLocation.lat.toFixed(4)}°N, {selectedLocation.lon.toFixed(4)}°E)</option>
              )}
              {Object.entries(GOMBE_LGAS).map(([key, data]) => (
                <option key={key} value={key}>
                  {data.name} ({data.lat.toFixed(2)}°N, {data.lon.toFixed(2)}°E)
                </option>
              ))}
            </select>
            {!loading && !error && (
              <p className="caption">Latest NASA POWER data: {nasaData.dateStamp} | ~4-day processing lag | Coords: {selectedLocation.lat.toFixed(3)}, {selectedLocation.lon.toFixed(3)}</p>
            )}
          </div>

          {loading ? (
            <div className="dashboard-card" style={{ textAlign: 'center', padding: '30px' }}>
              <p>🛰️ {lang === 'en' ? 'Loading NASA POWER Daily Gridded Estimates...' : 'Ana sauko da bayanai daga NASA POWER...'}</p>
            </div>
          ) : error ? (
            <div className="dashboard-card badge-danger"><p>{error}</p></div>
          ) : (
            <>
              {offlineMode && (
                <div className="dashboard-card" role="status">
                  <p>{lang === 'en' ? 'Offline Mode: Showing last saved NASA report' : 'Yanayin Kashe Intanet: Ana nuna rahoton NASA na baya da aka adana'}</p>
                </div>
              )}
              {/* 4 Telemetry Metrics */}
              <div className="metrics-grid-layout">
                <div className="dashboard-card metric-card">
                  <h3>💧 {lang === 'en' ? 'Topsoil Wetness' : 'Danshin Saman Kasa'}</h3>
                  <div className={`badge ${nasaData.surfaceMoisture >= 35 ? 'badge-success' : 'badge-danger'}`}>
                    {nasaData.surfaceMoisture}%
                  </div>
                </div>
                <div className="dashboard-card metric-card">
                  <h3>🌱 {lang === 'en' ? 'Root Moisture' : 'Danshin Cikin Kasa'}</h3>
                  <div className={`badge ${nasaData.rootMoisture >= 40 ? 'badge-success' : 'badge-danger'}`}>
                    {nasaData.rootMoisture}%
                  </div>
                </div>
                <div className="dashboard-card metric-card">
                  <h3>🌡️ {lang === 'en' ? 'Air Temp' : 'Zafin Yanayi'}</h3>
                  <div className="badge" style={{ background: '#e3f2fd', color: '#0d47a1' }}>
                    {nasaData.temp} °C
                  </div>
                </div>
                <div className="dashboard-card metric-card">
                  <h3>🌧️ {lang === 'en' ? `7-Day Rain (${nasaData.validRainDays} valid days)` : `Ruwan sama (kwanaki 7; ingantattun kwanaki ${nasaData.validRainDays})`}</h3>
                  <div className="badge" style={{ background: '#e0f7fa', color: '#006064' }}>
                    {nasaData.rain7Days} mm
                  </div>
                </div>
              </div>

              {/* 7-day NASA POWER soil moisture trend */}
              <div className="dashboard-card">
                <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#1b5e20', textTransform: 'uppercase' }}>
                  📈 {lang === 'en' ? '7-Day NASA POWER Soil Moisture Trend' : 'Yanayin Danshin Kasa (Kwanaki 7 da suka wuce)'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '70px', padding: '10px 4px 0 4px', background: 'white', borderRadius: '10px' }}>
                  {nasaData.history.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div 
                        style={{
                          width: '60%',
                          height: `${Math.max(8, item.val * 0.55)}px`,
                          background: item.val >= 35 ? '#2e7d32' : '#d32f2f',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 0.3s ease'
                        }} 
                        title={`${item.date}: ${item.val}%`} 
                      />
                      <span style={{ fontSize: '7px', color: '#757575', marginTop: '3px' }}>
                        {idx % 3 === 0 ? item.date : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actionable Decision Engine + Voice Readout */}
              <div className="dashboard-card action-card">
                <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#1b5e20', textTransform: 'uppercase' }}>
                  🧮 {lang === 'en' ? 'Dynamic Sowing Engine' : 'Na\'urar Shawarar Shuka'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#616161', marginBottom: '4px' }}>
                      {lang === 'en' ? 'Crop' : 'Irin Shuka'}
                    </label>
                    <select 
                      value={cropKey} 
                      onChange={(e) => setCropKey(e.target.value)} 
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #bdbdbd', fontSize: '13px', background: 'white' }}
                    >
                      {Object.entries(CROP_REQUIREMENTS).map(([key, c]) => (
                        <option key={key} value={key}>
                          {lang === 'en' ? c.nameEn : c.nameHa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#616161', marginBottom: '4px' }}>
                      {lang === 'en' ? 'Soil Type' : 'Kalar Kasa'}
                    </label>
                    <select 
                      value={soilType} 
                      onChange={(e) => setSoilType(e.target.value)} 
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #bdbdbd', fontSize: '13px', background: 'white' }}
                    >
                      <option value="loam">{lang === 'en' ? 'Loam Soil' : 'Laka da Yashi (Loam)'}</option>
                      <option value="clay">{lang === 'en' ? 'Clay / Laka (+8%)' : 'Kasar Laka (+8%)'}</option>
                      <option value="sandy">{lang === 'en' ? 'Sandy / Yashi (-10%)' : 'Kasar Yashi (-10%)'}</option>
                    </select>
                  </div>
                </div>

                <div className="advisory-box-frame" style={{
                  background: readiness.isSafe ? '#e8f5e9' : '#ffebee',
                  borderLeftColor: readiness.isSafe ? '#2e7d32' : '#c62828'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', color: readiness.isSafe ? '#1b5e20' : '#b71c1c' }}>
                      {lang === 'en'
                        ? `Readiness: ${readiness.score}% (${readiness.isSafe ? 'FAVORABLE MOISTURE' : 'DELAY'})`
                        : `Shiri: ${readiness.score}% (${readiness.isSafe ? 'A SHUKA' : 'A DAKATA'})`
                      }
                    </h4>

                    <button
                      onClick={handleSpeakAdvisory}
                      style={{ background: '#212121', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      🔊 {lang === 'en' ? 'Listen' : 'Saurara'}
                    </button>
                  </div>

                  <p style={{ color: '#212121', fontSize: '12.5px', margin: 0 }}>{advisoryText}</p>
                  <p style={{ color: '#616161', fontSize: '11px', margin: '8px 0 0' }}>
                    {lang === 'en'
                      ? 'Experimental prototype; recommendations are not field-validated and await calibration with Gombe agricultural extension officers.'
                      : 'Wannan gwaji ne; ba a tabbatar da shawarwarin a gona ba, kuma suna jiran daidaitawa tare da jami’an fadada aikin gona na Gombe.'}
                  </p>
                </div>
              </div>

              {/* SMS text is shown as a preview; it is not sent by this app. */}
              <div className="dashboard-card">
                <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#1b5e20', textTransform: 'uppercase' }}>
                  📲 SMS Alert Format (Preview Only)
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(smsMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textAlign: 'center', background: '#25D366', color: 'white', padding: '10px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}
                  >
                    WhatsApp Farmers
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowSmsPreview(!showSmsPreview)}
                    style={{ textAlign: 'center', background: '#1565c0', color: 'white', border: 'none', padding: '10px', borderRadius: '10px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Preview Outbound SMS Alert
                  </button>
                </div>
                {showSmsPreview && (
                  <p style={{ margin: '10px 0 0', padding: '10px', background: 'white', borderRadius: '8px', fontSize: '12px', lineHeight: 1.5 }}>
                    {smsMessage}
                  </p>
                )}
              </div>
            </>
          )}
        </main>

        <footer className="app-footer">
          NASA POWER Daily Gridded Estimates • Agro-Climatic Information for Gombe State
        </footer>
      </div>
    </div>
  );
}

export default App;
