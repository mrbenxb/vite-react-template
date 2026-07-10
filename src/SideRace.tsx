import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SPRITES } from './sprites'

type Segment = 'meadow' | 'mud' | 'hill' | 'sprint'
type RacePhase = 'setup' | 'countdown' | 'racing' | 'finished'
type Tactic = 'surge' | 'settle' | 'draft'

type SpriteConfig = {
  idle: string
  run: string
  frameWidth: number
  frameHeight: number
  idleFrames: number
  runFrames: number
  scale: number
}

type RacerTemplate = {
  id: string
  name: string
  species: string
  number: number
  accent: string
  role: string
  speed: number
  stamina: number
  burst: number
  nerve: number
  affinity: Segment
  sprite: SpriteConfig
}

type RacerState = RacerTemplate & {
  distance: number
  energy: number
  velocity: number
  finishedAt: number | null
  tactic: Tactic | null
  tacticUntil: number
  depth: number
}

type Decision = {
  checkpoint: number
  title: string
  message: string
} | null

type WorldChunk = {
  key: string
  theme: Segment
  label?: string
  start: number
  end: number
}

const RACE_DISTANCE = 1200
const VIEW_METERS = 320
const CAMERA_ANCHOR = 0.35
const WORLD_PAD = 250
const WORLD_END = RACE_DISTANCE + WORLD_PAD
const DEPTH_Y = [51, 58, 65, 72, 79, 86]
const DEPTH_SCALE = [0.78, 0.84, 0.9, 0.96, 1.02, 1.08]

const RACERS: RacerTemplate[] = [
  {
    id: 'deer', name: 'Atlas', species: 'Deer', number: 1, accent: '#f6c453',
    role: 'Long-stride favorite', speed: 91, stamina: 78, burst: 77, nerve: 82, affinity: 'meadow',
    sprite: { idle: SPRITES.deerIdle, run: SPRITES.deerRun, frameWidth: 72, frameHeight: 52, idleFrames: 10, runFrames: 6, scale: 1 },
  },
  {
    id: 'fox', name: 'Cinder', species: 'Fox', number: 2, accent: '#ff785a',
    role: 'Explosive lane hunter', speed: 86, stamina: 70, burst: 94, nerve: 76, affinity: 'sprint',
    sprite: { idle: SPRITES.foxIdle, run: SPRITES.foxRun, frameWidth: 64, frameHeight: 36, idleFrames: 6, runFrames: 6, scale: 1.05 },
  },
  {
    id: 'wolf', name: 'Fang', species: 'Wolf', number: 3, accent: '#91a7ff',
    role: 'Relentless pack racer', speed: 84, stamina: 84, burst: 82, nerve: 91, affinity: 'hill',
    sprite: { idle: SPRITES.wolfWalk, run: SPRITES.wolfRun, frameWidth: 64, frameHeight: 40, idleFrames: 8, runFrames: 6, scale: 1.05 },
  },
  {
    id: 'boar', name: 'Moss', species: 'Boar', number: 4, accent: '#75cf91',
    role: 'Mud-track bruiser', speed: 74, stamina: 92, burst: 66, nerve: 88, affinity: 'mud',
    sprite: { idle: SPRITES.boarIdle, run: SPRITES.boarRun, frameWidth: 64, frameHeight: 40, idleFrames: 8, runFrames: 6, scale: 1.08 },
  },
  {
    id: 'rabbit', name: 'Pip', species: 'Rabbit', number: 5, accent: '#ff9dc9',
    role: 'Tiny all-out sprinter', speed: 83, stamina: 58, burst: 99, nerve: 70, affinity: 'sprint',
    sprite: { idle: SPRITES.rabbitIdle, run: SPRITES.rabbitHop, frameWidth: 64, frameHeight: 26, idleFrames: 5, runFrames: 5, scale: 1.08 },
  },
  {
    id: 'bear', name: 'Bramble', species: 'Bear', number: 6, accent: '#d69b72',
    role: 'Heavy late-race engine', speed: 70, stamina: 98, burst: 61, nerve: 95, affinity: 'hill',
    sprite: { idle: SPRITES.bearIdle, run: SPRITES.bearRun, frameWidth: 64, frameHeight: 33, idleFrames: 12, runFrames: 5, scale: 1.08 },
  },
]

const SEGMENTS: { key: Segment; label: string; start: number; end: number }[] = [
  { key: 'meadow', label: 'OPEN MEADOW', start: 0, end: 300 },
  { key: 'mud', label: 'MUD FLATS', start: 300, end: 600 },
  { key: 'hill', label: 'RIDGE CLIMB', start: 600, end: 900 },
  { key: 'sprint', label: 'HOME STRETCH', start: 900, end: 1200 },
]

const WORLD_CHUNKS: WorldChunk[] = [
  { key: 'lead-in', theme: 'meadow', start: -WORLD_PAD, end: 0 },
  ...SEGMENTS.map((segment) => ({ ...segment, theme: segment.key })),
  { key: 'runout', theme: 'sprint', start: RACE_DISTANCE, end: WORLD_END },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getSegment = (distance: number): Segment => {
  if (distance < 300) return 'meadow'
  if (distance < 600) return 'mud'
  if (distance < 900) return 'hill'
  return 'sprint'
}

const ordinal = (value: number) => {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const mod100 = value % 100
  return `${value}${suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]}`
}

const makeRaceState = (selectedId: string): RacerState[] => {
  const depthSlots = [0, 1, 2, 4, 5]
  let otherIndex = 0

  return RACERS.map((racer) => ({
    ...racer,
    distance: 0,
    energy: 100,
    velocity: 0,
    finishedAt: null,
    tactic: null,
    tacticUntil: 0,
    depth: racer.id === selectedId ? 3 : depthSlots[otherIndex++],
  }))
}

function SideRace() {
  const [selectedId, setSelectedId] = useState('deer')
  const [phase, setPhase] = useState<RacePhase>('setup')
  const [racers, setRacers] = useState<RacerState[]>(() => makeRaceState('deer'))
  const [countdown, setCountdown] = useState(3)
  const [decision, setDecision] = useState<Decision>(null)
  const [raceClock, setRaceClock] = useState(0)
  const [commentary, setCommentary] = useState('Choose your racer, then enter the Wildline Cup.')

  const raceRef = useRef<RacerState[]>(makeRaceState('deer'))
  const phaseRef = useRef<RacePhase>('setup')
  const decisionRef = useRef<Decision>(null)
  const startTimeRef = useRef(0)
  const previousTimeRef = useRef(0)
  const lastPaintRef = useRef(0)
  const checkpointRef = useRef(new Set<number>())

  const ranking = useMemo(() => [...racers].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return b.distance - a.distance
  }), [racers])

  const selected = racers.find((racer) => racer.id === selectedId) ?? racers[0]
  const selectedPlace = ranking.findIndex((racer) => racer.id === selectedId) + 1
  const selectedSegment = getSegment(selected.distance)
  const cameraLeft = clamp(
    selected.distance - VIEW_METERS * CAMERA_ANCHOR,
    -WORLD_PAD,
    WORLD_END - VIEW_METERS,
  )
  const finishX = ((RACE_DISTANCE - cameraLeft) / VIEW_METERS) * 100

  const beginRace = useCallback(() => {
    const fresh = makeRaceState(selectedId)
    raceRef.current = fresh
    setRacers(fresh)
    setPhase('countdown')
    phaseRef.current = 'countdown'
    setCountdown(3)
    setDecision(null)
    decisionRef.current = null
    setRaceClock(0)
    checkpointRef.current.clear()
    setCommentary(`${RACERS.find((racer) => racer.id === selectedId)?.name} moves into the camera group.`)
  }, [selectedId])

  useEffect(() => {
    if (phase !== 'countdown') return

    const interval = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          phaseRef.current = 'racing'
          setPhase('racing')
          startTimeRef.current = performance.now()
          previousTimeRef.current = performance.now()
          setCommentary('They are off! The camera locks onto your racer.')
          return 0
        }
        return value - 1
      })
    }, 700)

    return () => window.clearInterval(interval)
  }, [phase])

  const chooseTactic = (tactic: Tactic) => {
    const now = performance.now()
    raceRef.current = raceRef.current.map((racer) => racer.id === selectedId
      ? { ...racer, tactic, tacticUntil: now + (tactic === 'surge' ? 4200 : 5200) }
      : racer)

    setDecision(null)
    decisionRef.current = null

    const copy: Record<Tactic, string> = {
      surge: 'You call for a surge. The stride opens and the field starts moving backward.',
      settle: 'You ask for control. Your racer eases off and saves energy for later.',
      draft: 'You tuck behind the nearest runner and let them cut the air.',
    }
    setCommentary(copy[tactic])
  }

  useEffect(() => {
    if (phase !== 'racing') return
    let animationFrame = 0

    const tick = (now: number) => {
      const dt = Math.min(50, now - previousTimeRef.current) / 1000
      previousTimeRef.current = now
      const current = raceRef.current
      const liveRanking = [...current].sort((a, b) => b.distance - a.distance)

      const next = current.map((racer) => {
        if (racer.finishedAt !== null) return racer

        const segment = getSegment(racer.distance)
        const rankIndex = liveRanking.findIndex((entry) => entry.id === racer.id)
        const energyFactor = 0.70 + racer.energy / 300
        const affinityBonus = racer.affinity === segment ? 1.25 : 0
        const mudPenalty = segment === 'mud' ? (92 - racer.stamina) * 0.014 : 0
        const hillPenalty = segment === 'hill' ? (90 - racer.stamina) * 0.011 : 0
        const pressureBonus = segment === 'sprint' ? racer.nerve * 0.009 : 0
        const wolfPack = racer.id === 'wolf' && rankIndex > 0 ? 0.55 : 0
        const bearFinish = racer.id === 'bear' && racer.distance > 720 ? 0.8 : 0
        const strideNoise = (Math.sin(now / 620 + racer.depth * 1.8) + 1) * 0.24

        let tacticBoost = 0
        let drainMultiplier = 1
        let regen = 0
        const tacticActive = racer.tacticUntil > now

        if (tacticActive && racer.tactic === 'surge') {
          tacticBoost = 2.2 + racer.burst * 0.012
          drainMultiplier = 1.9
        }
        if (tacticActive && racer.tactic === 'settle') {
          tacticBoost = -1.25
          drainMultiplier = 0.28
          regen = 4.2
        }
        if (tacticActive && racer.tactic === 'draft') {
          const target = liveRanking.find((entry) => entry.distance > racer.distance && entry.distance - racer.distance < 42)
          tacticBoost = target ? 1.4 : 0.3
          drainMultiplier = target ? 0.42 : 0.75
        }

        const rawSpeed = 15.4
          + racer.speed * 0.12
          + affinityBonus
          + pressureBonus
          + wolfPack
          + bearFinish
          + tacticBoost
          + strideNoise
          - mudPenalty
          - hillPenalty

        const velocity = Math.max(10.5, rawSpeed * energyFactor)
        const baseDrain = 0.9 + velocity * 0.055 + (segment === 'hill' ? 0.45 : 0)
        const energy = clamp(racer.energy - baseDrain * drainMultiplier * dt + regen * dt, 0, 100)
        const distance = Math.min(RACE_DISTANCE, racer.distance + velocity * dt)
        const finishedAt = distance >= RACE_DISTANCE ? now - startTimeRef.current : null

        return {
          ...racer,
          distance,
          energy,
          velocity,
          finishedAt,
          tactic: tacticActive ? racer.tactic : null,
        }
      })

      raceRef.current = next
      const player = next.find((racer) => racer.id === selectedId)!
      const reached = [255, 590, 920].find((point) => player.distance >= point && !checkpointRef.current.has(point))

      if (reached !== undefined && !decisionRef.current) {
        checkpointRef.current.add(reached)
        const prompts: Record<number, NonNullable<Decision>> = {
          255: { checkpoint: 255, title: 'Mud ahead', message: 'The grass ends in a few strides. Decide before everyone bunches up.' },
          590: { checkpoint: 590, title: 'The ridge rises', message: 'The climb is long enough to punish an early attack.' },
          920: { checkpoint: 920, title: 'Home stretch', message: 'The finish is finally in sight. This is your last meaningful call.' },
        }
        decisionRef.current = prompts[reached]
        setDecision(prompts[reached])
      }

      const finished = next.filter((racer) => racer.finishedAt !== null)
      if (finished.length === next.length) {
        phaseRef.current = 'finished'
        setPhase('finished')
        const order = [...next].sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity))
        const place = order.findIndex((racer) => racer.id === selectedId) + 1
        const winner = order[0]
        setCommentary(place === 1
          ? `${player.name} wins the Meadow Cup! The camera catches the winning stride.`
          : `${winner.name} wins. ${player.name} crosses in ${ordinal(place)}.`)
      }

      if (now - lastPaintRef.current > 42) {
        lastPaintRef.current = now
        setRacers([...next])
        setRaceClock((now - startTimeRef.current) / 1000)
      }

      if (phaseRef.current === 'racing') animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [phase, selectedId])

  return (
    <main className="app-shell">
      <section className="game-frame">
        <header className="topbar">
          <div>
            <p className="eyebrow">WILDLINE LEAGUE · DIVISION 4</p>
            <h1>Meadow Cup</h1>
          </div>
          <div className="stable-badge">
            <span>STABLE RANK</span>
            <strong>#18</strong>
          </div>
        </header>

        <section className="race-card">
          <div className="race-hud">
            <div className="hud-racer">
              <span className="hud-dot" style={{ background: selected.accent }} />
              <div><small>CAMERA RACER</small><strong>{selected.name}</strong></div>
            </div>
            <div><small>POSITION</small><strong>{phase === 'setup' ? '—' : ordinal(selectedPlace)}</strong></div>
            <div><small>DISTANCE</small><strong>{Math.round(selected.distance)} / {RACE_DISTANCE}m</strong></div>
            <div><small>TIME</small><strong>{raceClock.toFixed(1)}s</strong></div>
          </div>

          <div className={`race-scene scene-${selectedSegment}`}>
            <div className="world-stage">
              {WORLD_CHUNKS.map((chunk) => {
                const left = ((chunk.start - cameraLeft) / VIEW_METERS) * 100
                const width = ((chunk.end - chunk.start) / VIEW_METERS) * 100
                const visible = left < 115 && left + width > -15

                if (!visible) return null

                return (
                  <section
                    className={`world-chunk theme-${chunk.theme}`}
                    key={chunk.key}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    <div className="sky-tone" />
                    <span className="sun" />
                    <span className="cloud cloud-a" />
                    <span className="cloud cloud-b" />
                    <div className="far-land" />
                    <div className="near-land" />
                    <div className="track-ground"><div className="terrain-detail" /></div>
                    {chunk.label && <div className="segment-sign">{chunk.label}</div>}
                  </section>
                )
              })}
            </div>

            <div className="speed-lines" />
            <div className="camera-guide" />

            {finishX > -8 && finishX < 108 && (
              <div className="finish-gate" style={{ left: `${finishX}%` }}>
                <span>FINISH</span>
              </div>
            )}

            <div className="runner-stage">
              {racers.map((racer) => {
                const screenX = ((racer.distance - cameraLeft) / VIEW_METERS) * 100
                const rank = ranking.findIndex((entry) => entry.id === racer.id) + 1
                const moving = phase === 'racing' || phase === 'finished'
                const spriteSheet = moving ? racer.sprite.run : racer.sprite.idle
                const frames = moving ? racer.sprite.runFrames : racer.sprite.idleFrames
                const duration = moving ? Math.max(.28, .72 - racer.velocity * .012) : 1.4
                const visible = screenX > -18 && screenX < 118
                const isManaged = racer.id === selectedId
                const perspectiveScale = DEPTH_SCALE[racer.depth]

                return (
                  <div
                    className={`runner ${isManaged ? 'managed' : ''} ${visible ? '' : 'offscreen'}`}
                    key={racer.id}
                    style={{
                      left: `${screenX}%`,
                      top: `${DEPTH_Y[racer.depth]}%`,
                      zIndex: 20 + racer.depth,
                      ['--perspective-scale' as string]: perspectiveScale,
                    }}
                  >
                    {isManaged ? (
                      <div className="managed-tag"><b>{rank}</b><span>YOU · {racer.name}</span></div>
                    ) : (
                      <div className="rival-rank">{rank}</div>
                    )}
                    <div className="animal-shadow" />
                    <div className="sprite-flip">
                      <div
                        className="animal-sprite"
                        style={{
                          width: racer.sprite.frameWidth,
                          height: racer.sprite.frameHeight,
                          backgroundImage: `url(${spriteSheet})`,
                          ['--sheet-offset' as string]: `-${racer.sprite.frameWidth * frames}px`,
                          animationDuration: `${duration}s`,
                          animationTimingFunction: `steps(${frames})`,
                          transform: `scale(${racer.sprite.scale})`,
                        }}
                      />
                    </div>
                    {racer.tactic && <div className={`tactic-pip ${racer.tactic}`}>{racer.tactic.toUpperCase()}</div>}
                  </div>
                )
              })}
            </div>

            <div className="race-progress">
              <div className="progress-fill" style={{ width: `${(selected.distance / RACE_DISTANCE) * 100}%` }} />
              {SEGMENTS.slice(1).map((segment) => <i key={segment.key} style={{ left: `${(segment.start / RACE_DISTANCE) * 100}%` }} />)}
            </div>

            {phase === 'countdown' && <div className="countdown-overlay"><span>{countdown || 'GO!'}</span></div>}
          </div>

          <div className="commentary-bar">
            <span className="live-dot" />
            <p>{commentary}</p>
          </div>
        </section>

        {decision && phase === 'racing' ? (
          <section className="decision-panel">
            <div className="decision-copy">
              <span>LIVE MANAGER CALL · RACE CONTINUES</span>
              <h2>{decision.title}</h2>
              <p>{decision.message}</p>
            </div>
            <div className="tactic-grid">
              <button onClick={() => chooseTactic('surge')}><strong>PUSH</strong><span>Fast now · heavy drain</span></button>
              <button onClick={() => chooseTactic('settle')}><strong>SETTLE</strong><span>Save energy · lose ground</span></button>
              <button onClick={() => chooseTactic('draft')}><strong>DRAFT</strong><span>Follow a nearby racer</span></button>
            </div>
          </section>
        ) : (
          <section className="manager-panel">
            <div className="selected-racer">
              <div className="portrait" style={{ borderColor: selected.accent }}>
                <div className="sprite-flip">
                  <div
                    className="animal-sprite portrait-sprite"
                    style={{
                      width: selected.sprite.frameWidth,
                      height: selected.sprite.frameHeight,
                      backgroundImage: `url(${selected.sprite.idle})`,
                      ['--sheet-offset' as string]: `-${selected.sprite.frameWidth * selected.sprite.idleFrames}px`,
                      animationDuration: '1.5s',
                      animationTimingFunction: `steps(${selected.sprite.idleFrames})`,
                    }}
                  />
                </div>
              </div>
              <div className="selected-copy">
                <span>YOUR RACER</span>
                <h2>{selected.name} <small>the {selected.species}</small></h2>
                <p>{selected.role}</p>
              </div>
              <div className="energy-readout"><span>ENERGY</span><strong>{Math.round(selected.energy)}%</strong></div>
            </div>

            {phase === 'setup' && (
              <div className="roster-strip">
                {RACERS.map((racer) => (
                  <button
                    key={racer.id}
                    className={racer.id === selectedId ? 'active' : ''}
                    onClick={() => {
                      setSelectedId(racer.id)
                      const fresh = makeRaceState(racer.id)
                      raceRef.current = fresh
                      setRacers(fresh)
                    }}
                    style={{ ['--accent' as string]: racer.accent }}
                  >
                    <span>{racer.number}</span><strong>{racer.name}</strong><small>{racer.affinity}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="stat-row">
              {([['SPD', selected.speed], ['STA', selected.stamina], ['BUR', selected.burst], ['NRV', selected.nerve]] as const).map(([label, value]) => (
                <div className="stat" key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
              <button className="race-button" onClick={beginRace} disabled={phase === 'countdown' || phase === 'racing'}>
                {phase === 'finished' ? 'RACE AGAIN' : phase === 'setup' ? 'START RACE' : 'RACING…'}
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default SideRace
