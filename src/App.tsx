import { SPRITES } from './sprites'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  progress: number
  energy: number
  velocity: number
  finishedAt: number | null
  tactic: Tactic | null
  tacticUntil: number
  lane: number
}

type Decision = {
  checkpoint: number
  title: string
  message: string
} | null

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

const SEGMENTS: { key: Segment; label: string; from: number; to: number }[] = [
  { key: 'meadow', label: 'OPEN FIELD', from: 0, to: 25 },
  { key: 'mud', label: 'MUD FLATS', from: 25, to: 50 },
  { key: 'hill', label: 'RIDGE CLIMB', from: 50, to: 75 },
  { key: 'sprint', label: 'HOME STRETCH', from: 75, to: 100 },
]

const makeRaceState = (): RacerState[] => RACERS.map((racer, lane) => ({
  ...racer,
  progress: 0,
  energy: 100,
  velocity: 0,
  finishedAt: null,
  tactic: null,
  tacticUntil: 0,
  lane,
}))

const getSegment = (progress: number): Segment => {
  if (progress < 25) return 'meadow'
  if (progress < 50) return 'mud'
  if (progress < 75) return 'hill'
  return 'sprint'
}

const ordinal = (value: number) => {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const mod100 = value % 100
  return `${value}${suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]}`
}

function App() {
  const [selectedId, setSelectedId] = useState('deer')
  const [phase, setPhase] = useState<RacePhase>('setup')
  const [racers, setRacers] = useState<RacerState[]>(makeRaceState)
  const [countdown, setCountdown] = useState(3)
  const [decision, setDecision] = useState<Decision>(null)
  const [raceClock, setRaceClock] = useState(0)
  const [commentary, setCommentary] = useState('Choose your racer, then enter the Wildline Cup.')

  const raceRef = useRef<RacerState[]>(makeRaceState())
  const phaseRef = useRef<RacePhase>('setup')
  const decisionRef = useRef<Decision>(null)
  const startTimeRef = useRef(0)
  const previousTimeRef = useRef(0)
  const lastPaintRef = useRef(0)
  const checkpointRef = useRef(new Set<number>())

  const selected = useMemo(() => racers.find((racer) => racer.id === selectedId) ?? racers[0], [racers, selectedId])
  const ranking = useMemo(() => [...racers].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return b.progress - a.progress
  }), [racers])
  const selectedPlace = ranking.findIndex((racer) => racer.id === selectedId) + 1

  const beginRace = useCallback(() => {
    const fresh = makeRaceState()
    raceRef.current = fresh
    setRacers(fresh)
    setPhase('countdown')
    phaseRef.current = 'countdown'
    setCountdown(3)
    setDecision(null)
    decisionRef.current = null
    setRaceClock(0)
    checkpointRef.current.clear()
    setCommentary(`${RACERS.find((racer) => racer.id === selectedId)?.name} is loaded into lane ${RACERS.findIndex((racer) => racer.id === selectedId) + 1}.`)
  }, [selectedId])

  useEffect(() => {
    if (phase !== 'countdown') return
    setCountdown(3)
    const interval = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          phaseRef.current = 'racing'
          setPhase('racing')
          startTimeRef.current = performance.now()
          previousTimeRef.current = performance.now()
          setCommentary('They are off! Atlas and Cinder break sharply from the line.')
          return 0
        }
        return value - 1
      })
    }, 720)
    return () => window.clearInterval(interval)
  }, [phase])

  const chooseTactic = (tactic: Tactic) => {
    const now = performance.now()
    raceRef.current = raceRef.current.map((racer) => racer.id === selectedId
      ? { ...racer, tactic, tacticUntil: now + (tactic === 'surge' ? 4200 : 5000) }
      : racer)

    const labels: Record<Tactic, string> = {
      surge: 'You call for a surge. Big speed now, but the stamina bill is coming.',
      settle: 'You tell your racer to settle. The stride shortens and energy starts returning.',
      draft: 'You order a draft. Your racer tucks into the traffic and waits for a gap.',
    }
    setCommentary(labels[tactic])
    setDecision(null)
    decisionRef.current = null
  }

  useEffect(() => {
    if (phase !== 'racing') return
    let animationFrame = 0

    const tick = (now: number) => {
      const elapsedMs = Math.min(50, now - previousTimeRef.current)
      previousTimeRef.current = now
      const dt = elapsedMs / 1000
      const timeScale = decisionRef.current ? 0.28 : 1
      const current = raceRef.current
      const liveRanking = [...current].sort((a, b) => b.progress - a.progress)

      const next = current.map((racer) => {
        if (racer.finishedAt !== null) return racer

        const segment = getSegment(racer.progress)
        const rank = liveRanking.findIndex((entry) => entry.id === racer.id)
        const energyFactor = 0.68 + racer.energy / 310
        const affinityBonus = racer.affinity === segment ? 0.72 : 0
        const mudPenalty = segment === 'mud' ? (92 - racer.stamina) * 0.006 : 0
        const hillPenalty = segment === 'hill' ? (90 - racer.stamina) * 0.004 : 0
        const pressureBonus = segment === 'sprint' ? racer.nerve * 0.004 : 0
        const packBonus = racer.id === 'wolf' && rank > 0 ? 0.28 : 0
        const lateBear = racer.id === 'bear' && racer.progress > 58 ? 0.42 : 0
        const jitter = (Math.sin(now / 620 + racer.lane * 1.7) + 1) * 0.10

        let tacticBoost = 0
        let drainMultiplier = 1
        let regen = 0
        const tacticActive = racer.tacticUntil > now
        if (tacticActive && racer.tactic === 'surge') {
          tacticBoost = 1.05 + racer.burst * 0.004
          drainMultiplier = 1.85
        }
        if (tacticActive && racer.tactic === 'settle') {
          tacticBoost = -0.42
          drainMultiplier = 0.30
          regen = 2.9
        }
        if (tacticActive && racer.tactic === 'draft') {
          const leaderAhead = liveRanking.find((entry) => entry.progress > racer.progress && entry.progress - racer.progress < 7)
          tacticBoost = leaderAhead ? 0.52 : 0.10
          drainMultiplier = leaderAhead ? 0.42 : 0.72
        }

        const rawSpeed = 2.45 + racer.speed * 0.019 + affinityBonus + pressureBonus + packBonus + lateBear + tacticBoost + jitter - mudPenalty - hillPenalty
        const velocity = Math.max(1.45, rawSpeed * energyFactor)
        const baseDrain = 0.88 + velocity * 0.16 + (segment === 'hill' ? 0.24 : 0)
        const energy = Math.max(0, Math.min(100, racer.energy - baseDrain * drainMultiplier * dt + regen * dt))
        const progress = Math.min(100, racer.progress + velocity * dt * timeScale)
        const finishedAt = progress >= 100 ? now - startTimeRef.current : null

        return {
          ...racer,
          progress,
          energy,
          velocity,
          finishedAt,
          tactic: tacticActive ? racer.tactic : null,
        }
      })

      raceRef.current = next
      const player = next.find((racer) => racer.id === selectedId)!
      const checkpoints = [19, 48, 76]
      const reached = checkpoints.find((point) => player.progress >= point && !checkpointRef.current.has(point))
      if (reached !== undefined && !decisionRef.current) {
        checkpointRef.current.add(reached)
        const prompts: Record<number, NonNullable<Decision>> = {
          19: { checkpoint: 19, title: 'The field compresses', message: 'Your racer is boxed in as the course turns toward the mud.' },
          48: { checkpoint: 48, title: 'The ridge begins', message: 'The climb will punish anyone who burns too much energy here.' },
          76: { checkpoint: 76, title: 'One move left', message: 'The home stretch is open. Commit to your finish.' },
        }
        decisionRef.current = prompts[reached]
        setDecision(prompts[reached])
      }

      const finished = next.filter((racer) => racer.finishedAt !== null)
      if (finished.length === next.length) {
        phaseRef.current = 'finished'
        setRacers([...next])
        setRaceClock((now - startTimeRef.current) / 1000)
        setPhase('finished')
        const finalOrder = [...next].sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity))
        const playerPlace = finalOrder.findIndex((racer) => racer.id === selectedId) + 1
        const winner = finalOrder[0]
        setCommentary(playerPlace === 1
          ? `${player.name} wins the Wildline Cup! Your final call broke the field.`
          : `${winner.name} takes the cup. ${player.name} finishes ${ordinal(playerPlace)}.`)
      }

      if (now - lastPaintRef.current > 46) {
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
          <div className="race-meta">
            <div>
              <span>COURSE</span>
              <strong>1,200 m Mixed</strong>
            </div>
            <div>
              <span>RACE CLOCK</span>
              <strong>{raceClock.toFixed(1)}s</strong>
            </div>
            <div>
              <span>YOUR POSITION</span>
              <strong>{phase === 'setup' ? '—' : ordinal(selectedPlace)}</strong>
            </div>
          </div>

          <div className="course-map" aria-label="Race course">
            <div className="sky-layer">
              <span className="sun" />
              <span className="cloud cloud-a" />
              <span className="cloud cloud-b" />
              <span className="hill hill-a" />
              <span className="hill hill-b" />
            </div>

            <div className="segment-labels">
              {SEGMENTS.map((segment) => (
                <span key={segment.key}>{segment.label}</span>
              ))}
            </div>

            <div className="finish-post"><span>FINISH</span></div>
            <div className="start-post" />

            <div className="lanes">
              {racers.map((racer) => {
                const rank = ranking.findIndex((entry) => entry.id === racer.id) + 1
                const moving = phase === 'racing' || phase === 'finished'
                const spriteSheet = moving ? racer.sprite.run : racer.sprite.idle
                const frames = moving ? racer.sprite.runFrames : racer.sprite.idleFrames
                const duration = moving ? Math.max(0.35, 0.82 - racer.velocity * 0.08) : 1.4
                return (
                  <div className={`lane lane-${racer.lane + 1} ${racer.id === selectedId ? 'managed' : ''}`} key={racer.id}>
                    <div className="lane-number">{racer.number}</div>
                    <div className="lane-line" />
                    <div
                      className="runner"
                      style={{
                        left: `calc(4% + ${racer.progress * 0.84}%)`,
                        transition: phase === 'setup' ? 'left 300ms ease' : undefined,
                      }}
                    >
                      <div className="runner-rank">{rank}</div>
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
                    <div className="racer-label">
                      <span className="racer-dot" style={{ background: racer.accent }} />
                      <strong>{racer.name}</strong>
                      <div className="mini-energy"><i style={{ width: `${racer.energy}%` }} /></div>
                    </div>
                  </div>
                )
              })}
            </div>

            {phase === 'countdown' && (
              <div className="countdown-overlay">
                <span>{countdown || 'GO!'}</span>
              </div>
            )}
          </div>

          <div className="commentary-bar">
            <span className="live-dot" />
            <p>{commentary}</p>
          </div>
        </section>

        {decision && phase === 'racing' ? (
          <section className="decision-panel">
            <div className="decision-copy">
              <span>MANAGER CALL</span>
              <h2>{decision.title}</h2>
              <p>{decision.message}</p>
            </div>
            <div className="tactic-grid">
              <button onClick={() => chooseTactic('surge')}>
                <strong>{decision.checkpoint >= 76 ? 'ALL-OUT' : 'PUSH'}</strong>
                <span>Gain speed · heavy drain</span>
              </button>
              <button onClick={() => chooseTactic('settle')}>
                <strong>{decision.checkpoint >= 76 ? 'HOLD FORM' : 'SETTLE'}</strong>
                <span>Recover · lose ground</span>
              </button>
              <button onClick={() => chooseTactic('draft')}>
                <strong>{decision.checkpoint >= 76 ? 'SLINGSHOT' : 'DRAFT'}</strong>
                <span>Use traffic · needs a target</span>
              </button>
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
              <div className="energy-readout">
                <span>ENERGY</span>
                <strong>{Math.round(selected.energy)}%</strong>
              </div>
            </div>

            {phase === 'setup' && (
              <div className="roster-strip">
                {RACERS.map((racer) => (
                  <button
                    key={racer.id}
                    className={racer.id === selectedId ? 'active' : ''}
                    onClick={() => setSelectedId(racer.id)}
                    style={{ ['--accent' as string]: racer.accent }}
                  >
                    <span>{racer.number}</span>
                    <strong>{racer.name}</strong>
                    <small>{racer.affinity}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="stat-row">
              {[
                ['SPD', selected.speed],
                ['STA', selected.stamina],
                ['BUR', selected.burst],
                ['NRV', selected.nerve],
              ].map(([label, value]) => (
                <div className="stat" key={String(label)}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              <button className="race-button" onClick={beginRace} disabled={phase === 'countdown' || phase === 'racing'}>
                {phase === 'finished' ? 'RACE AGAIN' : phase === 'setup' ? 'START RACE' : 'RACING…'}
              </button>
            </div>
          </section>
        )}

        <footer className="prototype-note">
          Prototype course uses color-block scenery. Animal sprites are rendered at native pixel size.
        </footer>
      </section>
    </main>
  )
}

export default App
