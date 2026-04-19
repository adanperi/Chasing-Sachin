"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"

interface Century {
  n: number
  score: number
  notOut: boolean
  opponent: string
  ground: string
  country: string
  format: "Test" | "ODI"
  date: string
  venueType: "Home" | "Away" | "Neutral"
  lat: number
  lon: number
  year: number
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return MONTH[d.getMonth()] + " " + d.getFullYear()
}
const fmtScore = (c: Century) => c.score + (c.notOut ? "*" : "")
const colorFor = (c: Century) => (c.venueType === "Home" ? "#ffd166" : c.venueType === "Away" ? "#4ecdc4" : "#c9c9c9")
const sizeFor = (c: Century) => (c.n === 100 ? 0.95 : c.score >= 200 ? 0.78 : c.score >= 150 ? 0.56 : 0.42)

export default function SachinGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<ReturnType<typeof import("globe.gl").default> | null>(null)
  const [centuries, setCenturies] = useState<Century[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFilter, setCurrentFilter] = useState("all")
  const [currentYear, setCurrentYear] = useState(2012)
  const [playing, setPlaying] = useState(false)
  const [selectedCentury, setSelectedCentury] = useState<Century | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string>("all")
  const [showIntro, setShowIntro] = useState(false)
  const [introText, setIntroText] = useState("23 years")
  const [showControls, setShowControls] = useState(false)
  const autoplayRef = useRef<NodeJS.Timeout | null>(null)
  const idleRef = useRef<NodeJS.Timeout | null>(null)
  const interactedRef = useRef(false)

  useEffect(() => {
    fetch("/centuries.json")
      .then((r) => r.json())
      .then((data) => {
        setCenturies(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading || !containerRef.current || centuries.length === 0) return

    let Globe: typeof import("globe.gl").default
    import("globe.gl").then((mod) => {
      Globe = mod.default
      const globe = Globe()
        .width(containerRef.current!.clientWidth)
        .height(containerRef.current!.clientHeight)
        .backgroundColor("#060a18")
        .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg")
        .showAtmosphere(true)
        .atmosphereColor("#1a8cff")
        .atmosphereAltitude(0.2)
        .pointsData(centuries)
        .pointLat("lat")
        .pointLng("lon")
        .pointColor((d) => colorFor(d as Century))
        .pointAltitude((d) => sizeFor(d as Century) * 0.08)
        .pointRadius((d) => sizeFor(d as Century) * 0.5)
        .pointLabel(
          (d) =>
            `<div style="background:rgba(10,14,26,0.95);padding:6px 10px;border-radius:6px;border:0.5px solid rgba(78,205,196,0.4);color:#fff;font-size:12px;font-family:Inter,system-ui;line-height:1.4;"><b>#${(d as Century).n}</b> · ${fmtScore(d as Century)} vs ${(d as Century).opponent}<br><span style="color:#8892a6">${(d as Century).ground} · ${fmtDate((d as Century).date)}</span></div>`
        )
        .onPointClick((c) => {
          const century = c as Century
          handleUserInteract()
          setSelectedCentury(century)
          globe.pointOfView({ lat: century.lat, lng: century.lon, altitude: 1.2 }, 1200)
        })(containerRef.current!)

      globeRef.current = globe

      fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
        .then((r) => r.json())
        .then((world) => {
          const countries = topoFeature(world, world.objects.countries)
          globe
            .polygonsData(countries.features)
            .polygonCapColor(() => "rgba(100,115,140,0.05)")
            .polygonSideColor(() => "rgba(78,205,196,0.02)")
            .polygonStrokeColor(() => "rgba(140,155,180,0.35)")
            .polygonAltitude(0.005)
        })
        .catch(() => {})

      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.6
      globe.controls().enableDamping = true
      globe.pointOfView({ lat: 20, lng: 75, altitude: 2.3 }, 0)

      setTimeout(() => setShowControls(true), 400)

      const handleResize = () => {
        if (containerRef.current) {
          globe.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight)
        }
      }
      window.addEventListener("resize", handleResize)

      return () => {
        window.removeEventListener("resize", handleResize)
        if (autoplayRef.current) clearInterval(autoplayRef.current)
      }
    })
  }, [loading, centuries])

  function topoFeature(topology: any, obj: any) {
    function arcFn(i: number, points: number[][]) {
      if (points.length) points.pop()
      const arr = topology.arcs[i < 0 ? ~i : i]
      let x = 0, y = 0
      const res = arr.map((p: number[]) => [(x += p[0]), (y += p[1])])
      if (i < 0) res.reverse()
      res.forEach((p: number[]) =>
        points.push([
          p[0] * (topology.transform?.scale[0] || 1) + (topology.transform?.translate[0] || 0),
          p[1] * (topology.transform?.scale[1] || 1) + (topology.transform?.translate[1] || 0),
        ])
      )
    }
    function polygon(arcs: number[]) {
      const pts: number[][] = []
      arcs.forEach((i) => arcFn(i, pts))
      pts.push(pts[0])
      return pts
    }
    function geom(g: any) {
      if (g.type === "Polygon") return { type: "Polygon", coordinates: g.arcs.map(polygon) }
      if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.arcs.map((rs: any) => rs.map(polygon)) }
      return null
    }
    return {
      type: "FeatureCollection",
      features: obj.geometries
        .map((g: any) => ({ type: "Feature", properties: g.properties || {}, geometry: geom(g) }))
        .filter((f: any) => f.geometry),
    }
  }

  const countryList = useMemo(() => {
    const seen = new Set<string>()
    centuries.forEach((c) => seen.add(c.country))
    return Array.from(seen).sort()
  }, [centuries])

  const countryData = useMemo(() => {
    return countryList.map((country) => {
      let pts = centuries.filter((c) => c.country === country && c.year <= currentYear)
      if (currentFilter === "Test" || currentFilter === "ODI") pts = pts.filter((c) => c.format === currentFilter)
      else if (currentFilter === "Home" || currentFilter === "Away" || currentFilter === "Neutral")
        pts = pts.filter((c) => c.venueType === currentFilter)
      return { country, count: pts.length }
    }).filter((d) => d.count > 0).sort((a, b) => b.count - a.count)
  }, [centuries, countryList, currentYear, currentFilter])

  const stats = useMemo(() => {
    let data = centuries
    if (currentFilter === "Test" || currentFilter === "ODI") data = data.filter((c) => c.format === currentFilter)
    else if (currentFilter === "Home" || currentFilter === "Away" || currentFilter === "Neutral")
      data = data.filter((c) => c.venueType === currentFilter)
    if (selectedCountry !== "all") data = data.filter((c) => c.country === selectedCountry)
    data = data.filter((c) => c.year <= currentYear)
    const test = data.filter((c) => c.format === "Test").length
    const odi = data.filter((c) => c.format === "ODI").length
    return { total: data.length, test, odi }
  }, [centuries, currentFilter, selectedCountry, currentYear])

  const applyFilters = useCallback(
    (filter: string, year: number, country: string) => {
      if (!globeRef.current) return
      let data = centuries
      if (filter === "Test" || filter === "ODI") data = data.filter((c) => c.format === filter)
      else if (filter === "Home" || filter === "Away" || filter === "Neutral") data = data.filter((c) => c.venueType === filter)
      if (country !== "all") data = data.filter((c) => c.country === country)
      data = data.filter((c) => c.year <= year)
      globeRef.current.pointsData(data)
    },
    [centuries]
  )

  useEffect(() => {
    applyFilters(currentFilter, currentYear, selectedCountry)
  }, [currentFilter, currentYear, selectedCountry, applyFilters])

  const handleUserInteract = useCallback(() => {
    if (playing) {
      if (autoplayRef.current) clearInterval(autoplayRef.current)
      setPlaying(false)
      setShowIntro(false)
    }
    if (!interactedRef.current && globeRef.current) {
      interactedRef.current = true
      globeRef.current.controls().autoRotate = false
    }
    if (idleRef.current) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => {
      if (!selectedCentury && globeRef.current) {
        globeRef.current.controls().autoRotate = true
      }
    }, 8000)
  }, [playing, selectedCentury])

  const startAutoplay = useCallback(() => {
    let year = 1990
    setCurrentYear(1990)
    setPlaying(true)
    setIntroText("23 years")
    setShowIntro(true)
    setTimeout(() => setShowIntro(false), 2800)

    autoplayRef.current = setInterval(() => {
      year++
      if (year > 2012) {
        year = 2012
        if (autoplayRef.current) clearInterval(autoplayRef.current)
        setPlaying(false)
        setIntroText("100")
        setShowIntro(true)
        setTimeout(() => setShowIntro(false), 2500)
      }
      setCurrentYear(year)
    }, 500)
  }, [])

  const handlePlayClick = () => {
    if (playing) {
      if (autoplayRef.current) clearInterval(autoplayRef.current)
      setPlaying(false)
    } else {
      startAutoplay()
    }
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUserInteract()
    setCurrentYear(+e.target.value)
  }

  const handleChipClick = (filter: string) => {
    handleUserInteract()
    setCurrentFilter(filter)
    setSelectedCentury(null)
  }

  const selectCountry = useCallback((country: string) => {
    handleUserInteract()
    setSelectedCountry(country)
    setSelectedCentury(null)
    if (!globeRef.current) return
    if (country === "all") {
      globeRef.current.controls().autoRotate = true
      globeRef.current.pointOfView({ lat: 20, lng: 75, altitude: 2.3 }, 1200)
    } else {
      const pts = centuries.filter((c) => c.country === country)
      if (pts.length === 0) return
      const lat = pts.reduce((s, c) => s + c.lat, 0) / pts.length
      const lng = pts.reduce((s, c) => s + c.lon, 0) / pts.length
      globeRef.current.controls().autoRotate = false
      globeRef.current.pointOfView({ lat, lng, altitude: 1.6 }, 1400)
    }
  }, [centuries, handleUserInteract])

  const handleCardClose = () => {
    setSelectedCentury(null)
    if (globeRef.current) globeRef.current.pointOfView({ altitude: 2.3 }, 1000)
    if (idleRef.current) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => {
      if (globeRef.current) globeRef.current.controls().autoRotate = true
    }, 8000)
  }

  const handleShare = async () => {
    const url = window.location.href
    const shareData = { title: "Chasing Sachin — 100 international centuries", text: "Every international century Sachin ever scored.", url }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch {}
    } else {
      try { await navigator.clipboard.writeText(url) } catch {}
    }
  }

  const chips = [
    { filter: "all", label: "All 100" },
    { filter: "Test", label: "Test (51)" },
    { filter: "ODI", label: "ODI (49)" },
    { filter: "Home", label: "Home (42)" },
    { filter: "Away", label: "Away (40)" },
    { filter: "Neutral", label: "Neutral (18)" },
  ]

  const maxBar = Math.max(stats.test, stats.odi, 1)
  const statsLabel = selectedCountry === "all" ? "All countries" : selectedCountry

  return (
    <div className="app">
      <div className={`loading ${!loading ? "hidden" : ""}`}>
        <div className="loading-dot" />
      </div>

      <div className="header">
        <div className="brand">
          <div className="title">100</div>
          <div className="subtitle">Sachin&apos;s international centuries, 1990 – 2012</div>
        </div>
        <div className="counter-wrap">
          <div className={`counter ${playing ? "playing" : ""}`}>{stats.total}</div>
          <div className="counter-label">centuries</div>
        </div>
      </div>

      <button className={`share-btn ${showControls ? "visible" : ""}`} onClick={handleShare} title="Share this page">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      <div className={`left-panel ${showControls ? "visible" : ""}`}>
        <div className="legend">
          <div className="legend-item"><span className="dot" style={{ background: "#ffd166" }} />Home</div>
          <div className="legend-item"><span className="dot" style={{ background: "#4ecdc4" }} />Away</div>
          <div className="legend-item"><span className="dot" style={{ background: "#c9c9c9" }} />Neutral</div>
        </div>
        <div className="stats-panel">
          <div className="stats-title">{statsLabel}</div>
          <div className="stats-row">
            <span className="stats-label">Test</span>
            <div className="stats-bar-wrap">
              <div className="stats-bar" style={{ width: `${(stats.test / maxBar) * 100}%`, background: "#4ecdc4" }} />
            </div>
            <span className="stats-num">{stats.test}</span>
          </div>
          <div className="stats-row">
            <span className="stats-label">ODI</span>
            <div className="stats-bar-wrap">
              <div className="stats-bar" style={{ width: `${(stats.odi / maxBar) * 100}%`, background: "#ffd166" }} />
            </div>
            <span className="stats-num">{stats.odi}</span>
          </div>
        </div>
      </div>

      <div className={`country-panel ${showControls && !selectedCentury ? "visible" : ""}`}>
        <div className={`country-item ${selectedCountry === "all" ? "active" : ""}`} onClick={() => selectCountry("all")}>
          <span className="country-name">All</span>
          <span className="country-count">{stats.total}</span>
        </div>
        {countryData.map((d) => (
          <div key={d.country} className={`country-item ${selectedCountry === d.country ? "active" : ""}`} onClick={() => selectCountry(d.country)}>
            <span className="country-name">{d.country}</span>
            <span className="country-count">{d.count}</span>
          </div>
        ))}
      </div>

      {selectedCentury && (
        <div className="card visible">
          <button className="card-close" onClick={handleCardClose} aria-label="Close">×</button>
          <div className="card-num">#{selectedCentury.n}</div>
          <div className="card-score">{fmtScore(selectedCentury)}</div>
          <div className="card-rows">
            <div className="card-row"><span className="card-label">vs</span><span className="card-value">{selectedCentury.opponent}</span></div>
            <div className="card-row"><span className="card-label">At</span><span className="card-value">{selectedCentury.ground}</span></div>
            <div className="card-row"><span className="card-label">Country</span><span className="card-value">{selectedCentury.country}</span></div>
            <div className="card-row"><span className="card-label">Format</span><span className="card-value">{selectedCentury.format}</span></div>
            <div className="card-row"><span className="card-label">Date</span><span className="card-value">{fmtDate(selectedCentury.date)}</span></div>
            <div className="card-row"><span className="card-label">Venue</span><span className="card-value">{selectedCentury.venueType}</span></div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="globe-container" onPointerDown={handleUserInteract} onWheel={handleUserInteract} />

      <div className={`intro ${showIntro ? "visible" : ""}`}>
        <div>{introText}</div>
        <div className="intro-sub">watch them accumulate</div>
      </div>

      <div className={`controls ${showControls ? "visible" : ""}`}>
        <div className="chips">
          {chips.map((chip) => (
            <button key={chip.filter} className={`chip ${currentFilter === chip.filter ? "active" : ""}`} onClick={() => handleChipClick(chip.filter)}>
              {chip.label}
            </button>
          ))}
        </div>

        <div className="country-strip">
          <div className={`cstrip-item ${selectedCountry === "all" ? "active" : ""}`} onClick={() => selectCountry("all")}>
            All <span className="cstrip-count">{stats.total}</span>
          </div>
          {countryData.map((d) => (
            <div key={d.country} className={`cstrip-item ${selectedCountry === d.country ? "active" : ""}`} onClick={() => selectCountry(d.country)}>
              {d.country} <span className="cstrip-count">{d.count}</span>
            </div>
          ))}
        </div>

        <div className="timeline">
          <button className="play-btn" onClick={handlePlayClick} title="Replay timeline">
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
            }
          </button>
          <span className="year-label">1990</span>
          <div className="slider-wrap">
            <input type="range" className="slider" min="1990" max="2012" value={currentYear} step="1" onChange={handleSliderChange} />
          </div>
          <span className="year-label">2012</span>
        </div>
      </div>

      <style jsx>{`
        * { box-sizing: border-box; }
        .app { position: fixed; inset: 0; display: flex; flex-direction: column; background: #060a18; color: #fff; font-family: "Inter", system-ui, sans-serif; overflow: hidden; }
        .header { position: absolute; top: 0; left: 0; right: 0; z-index: 10; padding: 18px 22px; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; }
        .brand { pointer-events: auto; }
        .title { font-family: "Fraunces", serif; font-size: 30px; font-weight: 500; line-height: 1; letter-spacing: -0.01em; }
        .subtitle { font-size: 11px; color: #8892a6; margin-top: 6px; max-width: 200px; line-height: 1.4; }
        .counter-wrap { text-align: right; pointer-events: none; }
        .counter { font-family: "Fraunces", serif; font-size: 36px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; color: #fff; transition: color 0.3s; }
        .counter.playing { color: #4ecdc4; }
        .counter-label { font-size: 9px; color: #8892a6; margin-top: 4px; letter-spacing: 0.15em; text-transform: uppercase; }
        .globe-container { flex: 1; width: 100%; }
        .intro { position: absolute; bottom: 160px; left: 50%; transform: translateX(-50%); font-family: "Fraunces", serif; font-size: 18px; color: #fff; letter-spacing: 0.02em; pointer-events: none; opacity: 0; transition: opacity 0.6s; text-align: center; white-space: nowrap; z-index: 5; }
        .intro.visible { opacity: 0.95; }
        .intro-sub { font-family: "Inter", sans-serif; font-size: 10px; color: #8892a6; margin-top: 5px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 400; }
        .card { position: absolute; top: 90px; right: 18px; width: 260px; background: rgba(10,14,26,0.94); border: 0.5px solid rgba(78,205,196,0.35); border-radius: 12px; padding: 16px 18px; z-index: 20; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); opacity: 0; transform: translateY(-8px); pointer-events: none; transition: opacity 0.25s, transform 0.25s; }
        .card.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
        .card-num { font-family: "Fraunces", serif; font-size: 26px; color: #4ecdc4; line-height: 1; font-weight: 500; }
        .card-score { font-size: 20px; font-weight: 500; margin-top: 6px; letter-spacing: -0.01em; }
        .card-rows { margin-top: 12px; }
        .card-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 0.5px solid rgba(255,255,255,0.08); font-size: 12px; gap: 12px; }
        .card-row:last-child { border-bottom: none; }
        .card-label { color: #8892a6; flex-shrink: 0; }
        .card-value { text-align: right; font-weight: 500; }
        .card-close { position: absolute; top: 10px; right: 12px; background: none; border: none; color: #8892a6; cursor: pointer; font-size: 22px; line-height: 1; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: color 0.15s, background 0.15s; padding: 0; }
        .card-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .left-panel { position: absolute; top: 108px; left: 22px; z-index: 5; opacity: 0; transition: opacity 0.8s; }
        .left-panel.visible { opacity: 1; }
        .legend { display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: #8892a6; }
        .legend-item { display: flex; align-items: center; gap: 8px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .stats-panel { margin-top: 18px; width: 160px; }
        .stats-title { font-size: 11px; color: #4ecdc4; font-weight: 500; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stats-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .stats-label { font-size: 12px; color: #8892a6; width: 26px; flex-shrink: 0; }
        .stats-bar-wrap { flex: 1; height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; }
        .stats-bar { height: 100%; border-radius: 5px; transition: width 0.4s ease; }
        .stats-num { font-size: 12px; color: #fff; font-variant-numeric: tabular-nums; min-width: 20px; text-align: right; font-weight: 600; }
        .controls { position: absolute; bottom: 0; left: 0; right: 0; padding: 12px 16px 18px; z-index: 10; background: linear-gradient(to top, rgba(6,10,24,0.98) 40%, transparent); opacity: 0; transform: translateY(10px); transition: opacity 0.8s, transform 0.8s; }
        .controls.visible { opacity: 1; transform: translateY(0); }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 10px; }
        .chip { background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.18); color: #fff; padding: 6px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; transition: all 0.18s; font-family: inherit; font-weight: 400; white-space: nowrap; }
        .chip:hover { background: rgba(78,205,196,0.12); border-color: rgba(78,205,196,0.4); }
        .chip.active { background: #4ecdc4; color: #060a18; border-color: #4ecdc4; font-weight: 500; }
        .country-strip { display: none; overflow-x: auto; gap: 6px; padding: 0 2px 2px; margin-bottom: 8px; scrollbar-width: none; }
        .country-strip::-webkit-scrollbar { display: none; }
        .cstrip-item { display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 16px; background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.15); font-size: 12px; color: #c8d2e0; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.15s; }
        .cstrip-item:hover { background: rgba(78,205,196,0.12); border-color: rgba(78,205,196,0.4); }
        .cstrip-item.active { background: rgba(78,205,196,0.2); border-color: #4ecdc4; color: #4ecdc4; font-weight: 500; }
        .cstrip-count { font-size: 10px; opacity: 0.7; }
        .country-panel { position: absolute; top: 90px; right: 18px; z-index: 15; width: 150px; max-height: calc(100vh - 200px); overflow-y: auto; background: rgba(10,14,26,0.88); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 6px; opacity: 0; pointer-events: none; transition: opacity 0.4s; scrollbar-width: thin; scrollbar-color: rgba(78,205,196,0.3) transparent; }
        .country-panel.visible { opacity: 1; pointer-events: auto; }
        .country-panel::-webkit-scrollbar { width: 3px; }
        .country-panel::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.3); border-radius: 2px; }
        .country-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: background 0.15s; gap: 8px; }
        .country-item:hover { background: rgba(78,205,196,0.1); }
        .country-item.active { background: rgba(78,205,196,0.18); }
        .country-name { font-size: 12px; color: #c8d2e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .country-item.active .country-name { color: #4ecdc4; font-weight: 500; }
        .country-count { font-size: 11px; color: #8892a6; font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .country-item.active .country-count { color: #4ecdc4; }
        .timeline { display: flex; align-items: center; gap: 10px; max-width: 520px; margin: 0 auto; }
        .play-btn { width: 32px; height: 32px; border-radius: 50%; background: rgba(78,205,196,0.15); border: 0.5px solid rgba(78,205,196,0.5); color: #4ecdc4; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; transition: background 0.15s; }
        .play-btn:hover { background: rgba(78,205,196,0.25); }
        .play-btn svg { width: 12px; height: 12px; }
        .year-label { font-size: 12px; color: #8892a6; font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .slider-wrap { flex: 1; position: relative; height: 28px; display: flex; align-items: center; }
        .slider { width: 100%; appearance: none; -webkit-appearance: none; height: 2px; background: rgba(255,255,255,0.18); border-radius: 2px; outline: none; margin: 0; }
        .slider::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #4ecdc4; cursor: pointer; border: none; box-shadow: 0 0 0 4px rgba(78,205,196,0.15); }
        .slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #4ecdc4; cursor: pointer; border: none; box-shadow: 0 0 0 4px rgba(78,205,196,0.15); }
        .share-btn { position: absolute; top: 22px; right: 120px; z-index: 10; background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.15); color: #fff; padding: 6px 10px; border-radius: 18px; font-size: 11px; cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 5px; opacity: 0; transition: opacity 0.8s, background 0.15s, border-color 0.15s; }
        .share-btn.visible { opacity: 0.85; }
        .share-btn:hover { opacity: 1; background: rgba(78,205,196,0.15); border-color: rgba(78,205,196,0.4); }
        .loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #060a18; z-index: 100; transition: opacity 0.6s; }
        .loading.hidden { opacity: 0; pointer-events: none; }
        .loading-dot { width: 10px; height: 10px; border-radius: 50%; background: #4ecdc4; animation: pulse 1.3s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        @media (max-width: 640px) {
          .header { padding: 12px 14px; }
          .title { font-size: 22px; }
          .subtitle { font-size: 10px; max-width: 140px; }
          .counter { font-size: 26px; }
          .card { width: calc(100% - 24px); right: 12px; left: 12px; top: 70px; padding: 12px 14px; }
          .card-num { font-size: 22px; }
          .card-score { font-size: 17px; }
          .left-panel { top: auto; bottom: 210px; left: 12px; }
          .legend { flex-direction: row; gap: 10px; font-size: 10px; }
          .stats-panel { display: none; }
          .country-panel { display: none; }
          .country-strip { display: flex; }
          .chips { gap: 5px; margin-bottom: 8px; overflow-x: auto; flex-wrap: nowrap; justify-content: flex-start; padding-bottom: 2px; scrollbar-width: none; }
          .chips::-webkit-scrollbar { display: none; }
          .chip { font-size: 11px; padding: 5px 10px; flex-shrink: 0; }
          .controls { padding: 8px 12px 20px; }
          .timeline { gap: 8px; }
          .play-btn { width: 30px; height: 30px; }
          .intro { bottom: 220px; font-size: 15px; }
          .share-btn { display: none; }
        }
      `}</style>
    </div>
  )
}
