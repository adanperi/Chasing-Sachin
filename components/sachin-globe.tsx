"use client"

import { useEffect, useRef, useState, useCallback } from "react"

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
  const [currentYear, setCurrentYear] = useState(1990)
  const [playing, setPlaying] = useState(false)
  const [selectedCentury, setSelectedCentury] = useState<Century | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [introText, setIntroText] = useState("23 years")
  const [showControls, setShowControls] = useState(false)
  const autoplayRef = useRef<NodeJS.Timeout | null>(null)
  const idleRef = useRef<NodeJS.Timeout | null>(null)
  const interactedRef = useRef(false)

  // Load data
  useEffect(() => {
    fetch("/centuries.json")
      .then((r) => r.json())
      .then((data) => {
        setCenturies(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Initialize globe
  useEffect(() => {
    if (loading || !containerRef.current || centuries.length === 0) return

    let Globe: typeof import("globe.gl").default
    import("globe.gl").then((mod) => {
      Globe = mod.default
      const globe = Globe()
        .width(containerRef.current!.clientWidth)
        .height(containerRef.current!.clientHeight)
        .backgroundColor("#060a18")
        .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg")
        .showAtmosphere(true)
        .atmosphereColor("#4ecdc4")
        .atmosphereAltitude(0.18)
        .pointsData([])
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

      // Country borders
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

      // Globe controls
      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.25
      globe.controls().enableDamping = true
      globe.pointOfView({ lat: 20, lng: 75, altitude: 2.3 }, 0)

      // Show controls after delay
      setTimeout(() => setShowControls(true), 400)

      // Start autoplay
      setTimeout(() => startAutoplay(), 1200)

      // Resize handler
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

  // TopoJSON helper
  function topoFeature(topology: any, obj: any) {
    function arcFn(i: number, points: number[][]) {
      if (points.length) points.pop()
      const arr = topology.arcs[i < 0 ? ~i : i]
      let x = 0,
        y = 0
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

  // Apply filters
  const applyFilters = useCallback(
    (filter: string, year: number) => {
      if (!globeRef.current) return
      let data = centuries
      if (filter === "Test" || filter === "ODI") data = data.filter((c) => c.format === filter)
      else if (filter === "Home" || filter === "Away" || filter === "Neutral") data = data.filter((c) => c.venueType === filter)
      data = data.filter((c) => c.year <= year)
      globeRef.current.pointsData(data)
    },
    [centuries]
  )

  // Update globe when filters change
  useEffect(() => {
    applyFilters(currentFilter, currentYear)
  }, [currentFilter, currentYear, applyFilters])

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

  const handleCardClose = () => {
    setSelectedCentury(null)
    if (globeRef.current) {
      globeRef.current.pointOfView({ altitude: 2.3 }, 1000)
    }
    if (idleRef.current) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => {
      if (globeRef.current) globeRef.current.controls().autoRotate = true
    }, 8000)
  }

  const handleShare = async () => {
    const url = window.location.href
    const shareData = { title: "Sachin's 100 centuries, on a globe", text: "Every international century Sachin ever scored.", url }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
      } catch {}
    }
  }

  const filteredCount = centuries.filter((c) => {
    let match = true
    if (currentFilter === "Test" || currentFilter === "ODI") match = c.format === currentFilter
    else if (currentFilter === "Home" || currentFilter === "Away" || currentFilter === "Neutral") match = c.venueType === currentFilter
    return match && c.year <= currentYear
  }).length

  const chips = [
    { filter: "all", label: "All 100" },
    { filter: "Test", label: "Test (51)" },
    { filter: "ODI", label: "ODI (49)" },
    { filter: "Home", label: "Home (42)" },
    { filter: "Away", label: "Away (40)" },
    { filter: "Neutral", label: "Neutral (18)" },
  ]

  return (
    <div className="app">
      {/* Loading */}
      <div className={`loading ${!loading ? "hidden" : ""}`}>
        <div className="loading-dot" />
      </div>

      {/* Header */}
      <div className="header">
        <div className="brand">
          <div className="title">100</div>
          <div className="subtitle">Sachin&apos;s international centuries, 1990 - 2012</div>
        </div>
        <div className="counter-wrap">
          <div className={`counter ${playing ? "playing" : ""}`}>{filteredCount}</div>
          <div className="counter-label">centuries</div>
        </div>
      </div>

      {/* Share Button */}
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

      {/* Legend */}
      <div className={`legend ${showControls ? "visible" : ""}`}>
        <div className="legend-item">
          <span className="dot" style={{ background: "#ffd166" }} />
          Home
        </div>
        <div className="legend-item">
          <span className="dot" style={{ background: "#4ecdc4" }} />
          Away
        </div>
        <div className="legend-item">
          <span className="dot" style={{ background: "#c9c9c9" }} />
          Neutral
        </div>
      </div>

      {/* Card */}
      {selectedCentury && (
        <div className="card visible">
          <div className="card-close" onClick={handleCardClose}>
            x
          </div>
          <div className="card-num">#{selectedCentury.n}</div>
          <div className="card-score">{fmtScore(selectedCentury)}</div>
          <div className="card-rows">
            <div className="card-row">
              <span className="card-label">vs</span>
              <span className="card-value">{selectedCentury.opponent}</span>
            </div>
            <div className="card-row">
              <span className="card-label">At</span>
              <span className="card-value">{selectedCentury.ground}</span>
            </div>
            <div className="card-row">
              <span className="card-label">Country</span>
              <span className="card-value">{selectedCentury.country}</span>
            </div>
            <div className="card-row">
              <span className="card-label">Format</span>
              <span className="card-value">{selectedCentury.format}</span>
            </div>
            <div className="card-row">
              <span className="card-label">Date</span>
              <span className="card-value">{fmtDate(selectedCentury.date)}</span>
            </div>
            <div className="card-row">
              <span className="card-label">Venue</span>
              <span className="card-value">{selectedCentury.venueType}</span>
            </div>
          </div>
        </div>
      )}

      {/* Globe Container */}
      <div
        ref={containerRef}
        className="globe-container"
        onPointerDown={handleUserInteract}
        onWheel={handleUserInteract}
      />

      {/* Intro */}
      <div className={`intro ${showIntro ? "visible" : ""}`}>
        <div>{introText}</div>
        <div className="intro-sub">watch them accumulate</div>
      </div>

      {/* Controls */}
      <div className={`controls ${showControls ? "visible" : ""}`}>
        <div className="chips">
          {chips.map((chip) => (
            <button
              key={chip.filter}
              className={`chip ${currentFilter === chip.filter ? "active" : ""}`}
              onClick={() => handleChipClick(chip.filter)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="timeline">
          <button className="play-btn" onClick={handlePlayClick} title="Replay timeline">
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </button>
          <div className="year-display">{currentYear}</div>
          <div className="slider-wrap">
            <input
              type="range"
              className="slider"
              min="1990"
              max="2012"
              value={currentYear}
              step="1"
              onChange={handleSliderChange}
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }
        .app {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: #060a18;
          color: #fff;
          font-family: "Inter", system-ui, sans-serif;
          overflow: hidden;
        }

        .header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10;
          padding: 18px 22px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          pointer-events: none;
        }
        .brand {
          pointer-events: auto;
        }
        .title {
          font-family: "Fraunces", serif;
          font-size: 30px;
          font-weight: 500;
          line-height: 1;
          letter-spacing: -0.01em;
        }
        .subtitle {
          font-size: 11px;
          color: #8892a6;
          margin-top: 6px;
          max-width: 200px;
          line-height: 1.4;
        }
        .counter-wrap {
          text-align: right;
          pointer-events: none;
        }
        .counter {
          font-family: "Fraunces", serif;
          font-size: 36px;
          font-weight: 500;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #fff;
          transition: color 0.3s;
        }
        .counter.playing {
          color: #4ecdc4;
        }
        .counter-label {
          font-size: 9px;
          color: #8892a6;
          margin-top: 4px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .globe-container {
          flex: 1;
          width: 100%;
        }

        .intro {
          position: absolute;
          bottom: 140px;
          left: 50%;
          transform: translateX(-50%);
          font-family: "Fraunces", serif;
          font-size: 18px;
          color: #fff;
          letter-spacing: 0.02em;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.6s;
          text-align: center;
          white-space: nowrap;
          z-index: 5;
        }
        .intro.visible {
          opacity: 0.95;
        }
        .intro-sub {
          font-family: "Inter", sans-serif;
          font-size: 10px;
          color: #8892a6;
          margin-top: 5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 400;
        }

        .card {
          position: absolute;
          top: 90px;
          right: 18px;
          width: 260px;
          background: rgba(10, 14, 26, 0.94);
          border: 0.5px solid rgba(78, 205, 196, 0.35);
          border-radius: 12px;
          padding: 16px 18px;
          z-index: 20;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          opacity: 0;
          transform: translateY(-8px);
          pointer-events: none;
          transition: opacity 0.25s, transform 0.25s;
        }
        .card.visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .card-num {
          font-family: "Fraunces", serif;
          font-size: 26px;
          color: #4ecdc4;
          line-height: 1;
          font-weight: 500;
        }
        .card-score {
          font-size: 20px;
          font-weight: 500;
          margin-top: 6px;
          letter-spacing: -0.01em;
        }
        .card-rows {
          margin-top: 12px;
        }
        .card-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
          font-size: 12px;
          gap: 12px;
        }
        .card-row:last-child {
          border-bottom: none;
        }
        .card-label {
          color: #8892a6;
          flex-shrink: 0;
        }
        .card-value {
          text-align: right;
          font-weight: 500;
        }
        .card-close {
          position: absolute;
          top: 10px;
          right: 12px;
          color: #8892a6;
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: color 0.15s, background 0.15s;
        }
        .card-close:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }

        .controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 12px 16px 18px;
          z-index: 10;
          background: linear-gradient(to top, rgba(6, 10, 24, 0.98) 40%, transparent);
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.8s, transform 0.8s;
        }
        .controls.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .chips {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 14px;
        }
        .chip {
          background: rgba(255, 255, 255, 0.06);
          border: 0.5px solid rgba(255, 255, 255, 0.18);
          color: #fff;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.18s;
          font-family: inherit;
          font-weight: 400;
          white-space: nowrap;
        }
        .chip:hover {
          background: rgba(78, 205, 196, 0.12);
          border-color: rgba(78, 205, 196, 0.4);
        }
        .chip.active {
          background: #4ecdc4;
          color: #060a18;
          border-color: #4ecdc4;
          font-weight: 500;
        }

        .timeline {
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 520px;
          margin: 0 auto;
        }
        .play-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(78, 205, 196, 0.15);
          border: 0.5px solid rgba(78, 205, 196, 0.5);
          color: #4ecdc4;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 0;
          transition: background 0.15s;
        }
        .play-btn:hover {
          background: rgba(78, 205, 196, 0.25);
        }
        .play-btn svg {
          width: 12px;
          height: 12px;
        }
        .year-display {
          font-family: "Fraunces", serif;
          font-size: 20px;
          font-weight: 500;
          color: #fff;
          min-width: 60px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .slider-wrap {
          flex: 1;
          position: relative;
          height: 28px;
          display: flex;
          align-items: center;
        }
        .slider {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          height: 2px;
          background: rgba(255, 255, 255, 0.18);
          border-radius: 2px;
          outline: none;
          margin: 0;
        }
        .slider::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4ecdc4;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 0 4px rgba(78, 205, 196, 0.15);
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4ecdc4;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 0 4px rgba(78, 205, 196, 0.15);
        }

        .legend {
          position: absolute;
          top: 110px;
          left: 22px;
          z-index: 5;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 11px;
          color: #8892a6;
          opacity: 0;
          transition: opacity 0.8s;
        }
        .legend.visible {
          opacity: 0.85;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .share-btn {
          position: absolute;
          top: 22px;
          right: 120px;
          z-index: 10;
          background: rgba(255, 255, 255, 0.06);
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          color: #fff;
          padding: 6px 10px;
          border-radius: 18px;
          font-size: 11px;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 5px;
          opacity: 0;
          transition: opacity 0.8s, background 0.15s, border-color 0.15s;
        }
        .share-btn.visible {
          opacity: 0.85;
        }
        .share-btn:hover {
          opacity: 1;
          background: rgba(78, 205, 196, 0.15);
          border-color: rgba(78, 205, 196, 0.4);
        }

        .loading {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #060a18;
          z-index: 100;
          transition: opacity 0.6s;
        }
        .loading.hidden {
          opacity: 0;
          pointer-events: none;
        }
        .loading-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4ecdc4;
          animation: pulse 1.3s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @media (max-width: 640px) {
          .header {
            padding: 14px 16px;
          }
          .title {
            font-size: 24px;
          }
          .subtitle {
            font-size: 10px;
            max-width: 150px;
          }
          .counter {
            font-size: 28px;
          }
          .card {
            width: calc(100% - 32px);
            right: 16px;
            left: 16px;
            top: 80px;
          }
          .legend {
            top: auto;
            bottom: 150px;
            left: 16px;
            flex-direction: row;
            gap: 12px;
            font-size: 10px;
          }
          .controls {
            padding: 10px 12px 16px;
          }
          .chip {
            font-size: 11px;
            padding: 5px 10px;
          }
          .year-display {
            font-size: 17px;
            min-width: 50px;
          }
          .intro {
            bottom: 170px;
            font-size: 15px;
          }
          .share-btn {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
