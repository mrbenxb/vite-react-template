import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { SPRITES } from './sprites'

type Segment = 'meadow' | 'mud' | 'hill' | 'sprint'
type Phase = 'setup' | 'countdown' | 'racing' | 'finished'
type Tactic = 'surge' | 'settle' | 'draft'

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
  idle: string
  run: string
  frameWidth: number
  frameHeight: number
  idleFrames: number
  runFrames: number
  strideMeters: number
}

type Racer = RacerTemplate & {
  distance: number
  energy: number
  velocity: number
  finishedAt: number | null
  tactic: Tactic | null
  tacticUntil: number
  tacticCharge: number
  tacticsUnlocked: boolean
  trackSlot: number
}

type AiCall = {
  name: string
  tactic: Tactic
  distance: number
}

const RACE_DISTANCE = 1200
const VIEW_METERS = 150
const CAMERA_ANCHOR = 0.34
const WORLD_PAD = 180
const INITIAL_CAMERA_LEFT = -VIEW_METERS * CAMERA_ANCHOR
const FIRST_SURFACE_CHANGE = 300
const TRACK_OFFSETS = [18, 11, 4, -4, -11, -18]
const MARKERS = Array.from({ length: 11 }, (_, index) => (index + 1) * 100)
const GROUND_TICKS = Array.from({ length: 59 }, (_, index) => (index + 1) * 20)

const TACTIC_DURATION_MS: Record<Tactic, number> = {
  surge: 5600,
  settle: 5400,
  draft: 6000,
}

const TACTIC_LABEL: Record<Tactic, string> = {
  surge: 'PUSH',
  settle: 'SETTLE',
  draft: 'DRAFT',
}

const RACERS: RacerTemplate[] = [
  {
    id: 'deer', name: 'Atlas', species: 'Deer', number: 1, accent: '#f6c453',
    role: 'Long-stride favorite', speed: 91, stamina: 78, burst: 77, nerve: 82, affinity: 'meadow',
    idle: SPRITES.deerIdle, run: SPRITES.deerRun, frameWidth: 72, frameHeight: 52, idleFrames: 10, runFrames: 6,
    strideMeters: 10.4,
  },
  {
    id: 'fox', name: 'Cinder', species: 'Fox', number: 2, accent: '#ff785a',
    role: 'Explosive lane hunter', speed: 86, stamina: 70, burst: 94, nerve: 76, affinity: 'sprint',
    idle: SPRITES.foxIdle, run: SPRITES.foxRun, frameWidth: 64, frameHeight: 36, idleFrames: 6, runFrames: 6,
    strideMeters: 7.4,
  },
  {
    id: 'wolf', name: 'Fang', species: 'Wolf', number: 3, accent: '#91a7ff',
    role: 'Relentless pack racer', speed: 84, stamina: 84, burst: 82, nerve: 91, affinity: 'hill',
    idle: SPRITES.wolfWalk, run: SPRITES.wolfRun, frameWidth: 64, frameHeight: 40, idleFrames: 8, runFrames: 6,
    strideMeters: 8.5,
  },
  {
    id: 'boar', name: 'Moss', species: 'Boar', number: 4, accent: '#75cf91',
    role: 'Mud-track bruiser', speed: 74, stamina: 92, burst: 66, nerve: 88, affinity: 'mud',
    idle: SPRITES.boarIdle, run: SPRITES.boarRun, frameWidth: 64, frameHeight: 40, idleFrames: 8, runFrames: 6,
    strideMeters: 6.8,
  },
  {
    id: 'rabbit', name: 'Pip', species: 'Rabbit', number: 5, accent: '#ff9dc9',
    role: 'Tiny all-out sprinter', speed: 83, stamina: 58, burst: 99, nerve: 70, affinity: 'sprint',
    idle: SPRITES.rabbitIdle, run: SPRITES.rabbitHop, frameWidth: 64, frameHeight: 26, idleFrames: 5, runFrames: 5,
    strideMeters: 5.2,
  },
  {
    id: 'bear', name: 'Bramble', species: 'Bear', number: 6, accent: '#d69b72',
    role: 'Heavy late-race engine', speed: 70, stamina: 98, burst: 61, nerve: 95, affinity: 'hill',
    idle: SPRITES.bearIdle, run: SPRITES.bearRun, frameWidth: 64, frameHeight: 33, idleFrames: 12, runFrames: 5,
    strideMeters: 7.7,
  },
]

const SEGMENTS: { key: Segment; label: string; start: number; end: number }[] = [
  { key: 'meadow', label: 'OPEN MEADOW', start: 0, end: 300 },
  { key: 'mud', label: 'MUD FLATS', start: 300, end: 600 },
  { key: 'hill', label: 'RIDGE CLIMB', start: 600, end: 900 },
  { key: 'sprint', label: 'HOME STRETCH', start: 900, end: 1200 },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getSegment = (distance: number): Segment => {
  if (distance < 300) return 'meadow'
  if (distance < 600) return 'mud'
  if (distance < 900) return 'hill'
  return 'sprint'
}

const ordinal = (value: number) => {
  const suffix = value % 10 === 1 && value % 100 !== 11
    ? 'st'
    : value % 10 === 2 && value % 100 !== 12
      ? 'nd'
      : value % 10 === 3 && value % 100 !== 13
        ? 'rd'
        : 'th'
  return `${value}${suffix}`
}

const chooseAiTactic = (racer: Racer, ranking: Racer[], finalStretch = false): Tactic => {
  const rankIndex = ranking.findIndex((entry) => entry.id === racer.id)
  const nearestAhead = ranking
    .filter((entry) => entry.distance > racer.distance)
    .sort((a, b) => a.distance - b.distance)[0]
  const gapAhead = nearestAhead ? nearestAhead.distance - racer.distance : Number.POSITIVE_INFINITY

  if (racer.energy <= (finalStretch ? 25 : 40)) return 'settle'
  if (finalStretch && racer.energy >= 45) return 'surge'
  if (racer.id === 'wolf' && nearestAhead && gapAhead <= 22) return 'draft'
  if ((racer.id === 'boar' || racer.id === 'bear') && racer.energy < 68) return 'settle'
  if ((racer.id === 'fox' || racer.id === 'rabbit') && racer.energy >= 52) return 'surge'
  if (nearestAhead && gapAhead <= 18) return 'draft'
  if (rankIndex >= 3 && racer.energy >= 48) return 'surge'
  if (racer.energy < 60) return 'settle'
  return racer.number % 2 === 0 ? 'draft' : 'surge'
}

const describeAiCall = ({ name, tactic }: AiCall) => {
  if (tactic === 'surge') return `${name} spends a full gauge on PUSH and attacks.`
  if (tactic === 'settle') return `${name} spends a full gauge on SETTLE to recover.`
  return `${name} spends a full gauge on DRAFT behind the nearest rival.`
}

const activateTactic = (racer: Racer, tactic: Tactic, now: number): Racer => ({
  ...racer,
  tactic,
  tacticUntil: now + TACTIC_DURATION_MS[tactic],
  tacticCharge: 0,
})

const makeRace = (selectedId: string): Racer[] => {
  const openSlots = [0, 1, 3, 4, 5]
  let slotIndex = 0

  return RACERS.map((racer) => ({
    ...racer,
    distance: 0,
    energy: 100,
    velocity: 0,
    finishedAt: null,
    tactic: null,
    tacticUntil: 0,
    tacticCharge: 100,
    tacticsUnlocked: false,
    trackSlot: racer.id === selectedId ? 2 : openSlots[slotIndex++],
  }))
}

function FreeTacticRace() {
  const [selectedId, setSelectedId] = useState('deer')
  const [phase, setPhase] = useState<Phase>('setup')
  const [racers, setRacers] = useState<Racer[]>(() => makeRace('deer'))
  const [countdown, setCountdown] = useState(3)
  const [raceClock, setRaceClock] = useState(0)
  const [commentary, setCommentary] = useState('Choose your racer, then enter the Wildline Cup.')
  const [cameraLeft, setCameraLeft] = useState(INITIAL_CAMERA_LEFT)

  const raceRef = useRef<Racer[]>(makeRace('deer'))
  const phaseRef = useRef<Phase>('setup')
  const previousTimeRef = useRef(0)
  const startTimeRef = useRef(0)
  const lastPaintRef = useRef(0)
  const lastAiCommentRef = useRef(0)
  const tacticsUnlockedRef = useRef(false)
  const cameraLeftRef = useRef(INITIAL_CAMERA_LEFT)

  const ranking = useMemo(() => [...racers].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return b.distance - a.distance
  }), [racers])

  const selected = racers.find((racer) => racer.id === selectedId) ?? racers[0]
  const selectedPlace = ranking.findIndex((racer) => racer.id === selectedId) + 1

  const tacticReady = phase === 'racing'
    && selected.tacticsUnlocked
    && selected.tacticCharge >= 100
    && !selected.tactic

  const selectedGaugeLabel = !selected.tacticsUnlocked
    ? 'LOCKED UNTIL MUD'
    : selected.tactic
      ? TACTIC_LABEL[selected.tactic]
      : selected.tacticCharge >= 100
        ? 'READY · HOLD OR USE'
        : `${Math.round(selected.tacticCharge)}%`

  const beginRace = useCallback(() => {
    const fresh = makeRace(selectedId)
    raceRef.current = fresh
    setRacers(fresh)
    setRaceClock(0)
    cameraLeftRef.current = INITIAL_CAMERA_LEFT
    setCameraLeft(INITIAL_CAMERA_LEFT)
    tacticsUnlockedRef.current = false
    lastAiCommentRef.current = 0
    setCountdown(3)
    setPhase('countdown')
    phaseRef.current = 'countdown'
    setCommentary(`${RACERS.find((racer) => racer.id === selectedId)?.name} starts with a full but terrain-locked tactic gauge.`)
  }, [selectedId])

  useEffect(() => {
    if (phase !== 'countdown') return

    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          phaseRef.current = 'racing'
          setPhase('racing')
          startTimeRef.current = performance.now()
          previousTimeRef.current = performance.now()
          setCommentary('They are off! Tactics unlock for everyone at the mud transition.')
          return 0
        }
        return value - 1
      })
    }, 700)

    return () => window.clearInterval(timer)
  }, [phase])

  const chooseTactic = (tactic: Tactic) => {
    const player = raceRef.current.find((racer) => racer.id === selectedId)
    if (!player || phaseRef.current !== 'racing') return
    if (!player.tacticsUnlocked || player.tacticCharge < 100 || player.tactic) return

    const now = performance.now()
    raceRef.current = raceRef.current.map((racer) => racer.id === selectedId
      ? activateTactic(racer, tactic, now)
      : racer)

    const playerText: Record<Tactic, string> = {
      surge: 'You spend the stored gauge on PUSH. Burst converts into a major speed attack.',
      settle: 'You spend the stored gauge on SETTLE. Stamina converts into strong recovery.',
      draft: 'You spend the stored gauge on DRAFT. Nerve improves the chase and final slingshot.',
    }

    setRacers([...raceRef.current])
    setCommentary(playerText[tactic])
  }

  useEffect(() => {
    if (phase !== 'racing') return
    let frame = 0

    const tick = (now: number) => {
      const dt = Math.min(50, now - previousTimeRef.current) / 1000
      previousTimeRef.current = now

      const current = raceRef.current
      const liveRanking = [...current].sort((a, b) => b.distance - a.distance)

      let next = current.map((racer) => {
        if (racer.finishedAt !== null) return racer

        const segment = getSegment(racer.distance)
        const rankIndex = liveRanking.findIndex((entry) => entry.id === racer.id)
        const energyFactor = 0.82 + racer.energy / 560
        const affinityBonus = racer.affinity === segment ? 0.62 : 0
        const mudPenalty = segment === 'mud' ? (92 - racer.stamina) * 0.008 : 0
        const hillPenalty = segment === 'hill' ? (90 - racer.stamina) * 0.006 : 0
        const pressureBonus = segment === 'sprint' ? racer.nerve * 0.004 : 0
        const packBonus = racer.id === 'wolf' && rankIndex > 0 ? 0.24 : 0
        const bearBonus = racer.id === 'bear' && racer.distance > 720 ? 0.34 : 0
        const naturalVariation = (Math.sin(now / 900 + racer.trackSlot * 1.7) + 1) * 0.06

        let tacticBoost = 0
        let drainMultiplier = 1
        let recovery = 0
        let extraDrain = 0
        const tacticActive = racer.tacticUntil > now
        const tacticTimeLeft = racer.tacticUntil - now

        if (tacticActive && racer.tactic === 'surge') {
          tacticBoost = 2.25 + racer.burst * 0.018
          drainMultiplier = 2.25
          extraDrain = 1.1
        }

        if (tacticActive && racer.tactic === 'settle') {
          tacticBoost = -1.75
          drainMultiplier = 0.22
          recovery = 1.8 + racer.stamina * 0.018
        }

        if (tacticActive && racer.tactic === 'draft') {
          const target = liveRanking.find((entry) => entry.distance > racer.distance && entry.distance - racer.distance < 22)
          tacticBoost = target ? 1.15 + racer.nerve * 0.012 : 0.08
          drainMultiplier = target ? 0.38 : 0.85
          if (target && tacticTimeLeft < 1500) tacticBoost += 0.75 + racer.burst * 0.008
        }

        const rawSpeed = 8.1
          + racer.speed * 0.078
          + affinityBonus
          + pressureBonus
          + packBonus
          + bearBonus
          + naturalVariation
          + tacticBoost
          - mudPenalty
          - hillPenalty

        const velocity = Math.max(8.8, rawSpeed * energyFactor)
        const drain = 0.18 + velocity * 0.015 + (segment === 'hill' ? 0.08 : 0)
        const energy = clamp(racer.energy - (drain * drainMultiplier + extraDrain) * dt + recovery * dt, 0, 100)
        const distance = Math.min(RACE_DISTANCE, racer.distance + velocity * dt)
        const finishedAt = distance >= RACE_DISTANCE ? now - startTimeRef.current : null
        const rechargeRate = 4.6 + racer.nerve * 0.025
        const tacticCharge = racer.tacticsUnlocked && !tacticActive
          ? clamp(racer.tacticCharge + rechargeRate * dt, 0, 100)
          : racer.tacticCharge

        return {
          ...racer,
          distance,
          energy,
          velocity,
          finishedAt,
          tacticCharge,
          tactic: tacticActive ? racer.tactic : null,
        }
      })

      const leaderDistance = Math.max(...next.map((racer) => racer.distance))
      let justUnlocked = false

      if (!tacticsUnlockedRef.current && leaderDistance >= FIRST_SURFACE_CHANGE) {
        tacticsUnlockedRef.current = true
        justUnlocked = true
        next = next.map((racer) => ({ ...racer, tacticsUnlocked: true }))
        setCommentary('Tactics unlocked for the whole field. Your full gauge can be held and used whenever you choose.')
      }

      const updatedRanking = [...next].sort((a, b) => b.distance - a.distance)
      const aiCalls: AiCall[] = []

      next = next.map((racer) => {
        if (racer.id === selectedId || racer.finishedAt !== null || !racer.tacticsUnlocked) return racer
        if (racer.tactic || racer.tacticCharge < 100) return racer

        const aiTactic = chooseAiTactic(racer, updatedRanking, racer.distance >= 900)
        aiCalls.push({ name: racer.name, tactic: aiTactic, distance: racer.distance })
        return activateTactic(racer, aiTactic, now)
      })

      const player = next.find((racer) => racer.id === selectedId)!

      if (!justUnlocked && aiCalls.length > 0 && now - lastAiCommentRef.current > 1800) {
        const nearby = aiCalls.find((call) => Math.abs(call.distance - player.distance) <= VIEW_METERS * 0.7) ?? aiCalls[0]
        lastAiCommentRef.current = now
        setCommentary(describeAiCall(nearby))
      }

      const targetCameraLeft = clamp(
        player.distance - VIEW_METERS * CAMERA_ANCHOR,
        -WORLD_PAD,
        RACE_DISTANCE + WORLD_PAD - VIEW_METERS,
      )
      const cameraFollowSpeed = player.tactic === 'surge'
        ? 1.45
        : player.tactic === 'settle'
          ? 3.4
          : 2.25
      cameraLeftRef.current += (targetCameraLeft - cameraLeftRef.current) * clamp(dt * cameraFollowSpeed, 0, 1)
      cameraLeftRef.current = clamp(
        cameraLeftRef.current,
        -WORLD_PAD,
        RACE_DISTANCE + WORLD_PAD - VIEW_METERS,
      )

      raceRef.current = next

      if (next.every((racer) => racer.finishedAt !== null)) {
        phaseRef.current = 'finished'
        setPhase('finished')
        const order = [...next].sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity))
        const place = order.findIndex((racer) => racer.id === selectedId) + 1
        setCommentary(place === 1
          ? `${player.name} wins the Meadow Cup!`
          : `${order[0].name} wins. ${player.name} finishes ${ordinal(place)}.`)
      }

      if (now - lastPaintRef.current > 42) {
        lastPaintRef.current = now
        setRacers([...next])
        setCameraLeft(cameraLeftRef.current)
        setRaceClock((now - startTimeRef.current) / 1000)
      }

      if (phaseRef.current === 'racing') frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, selectedId])

  return (
    <main className="contra-app">
      <section className="contra-frame">
        <header className="contra-header">
          <div>
            <p>WILDLINE LEAGUE · DIVISION 4</p>
            <h1>Meadow Cup</h1>
          </div>
          <div className="rank-card"><span>STABLE RANK</span><strong>#18</strong></div>
        </header>

        <section className="race-card">
          <div className="race-hud gauge-hud">
            <div className="hud-racer">
              <i style={{ background: selected.accent }} />
              <span>
                <small>CAMERA RACER</small>
                <b>{selected.name}</b>
                <em className={`hud-gauge ${tacticReady ? 'ready' : ''}`}>
                  <i style={{ width: `${selected.tacticCharge}%` }} />
                </em>
                <small className="hud-gauge-label">TACTIC · {selectedGaugeLabel}</small>
              </span>
            </div>
            <div><small>POSITION</small><b>{phase === 'setup' ? '—' : ordinal(selectedPlace)}</b></div>
            <div><small>DISTANCE</small><b>{Math.round(selected.distance)} / {RACE_DISTANCE}m</b></div>
            <div><small>TIME</small><b>{raceClock.toFixed(1)}s</b></div>
          </div>

          <div className={`contra-scene theme-${getSegment(selected.distance)}`}>
            <div className="world">
              {[{ key: 'lead', label: '', start: -WORLD_PAD, end: 0, theme: 'meadow' as Segment }, ...SEGMENTS, { key: 'runout', label: '', start: RACE_DISTANCE, end: RACE_DISTANCE + WORLD_PAD, theme: 'sprint' as Segment }].map((chunk) => {
                const theme = 'theme' in chunk ? chunk.theme : chunk.key
                const left = ((chunk.start - cameraLeft) / VIEW_METERS) * 100
                const width = ((chunk.end - chunk.start) / VIEW_METERS) * 100
                if (left > 115 || left + width < -15) return null

                return (
                  <section className={`world-chunk chunk-${theme}`} key={`${chunk.key}-${chunk.start}`} style={{ left: `${left}%`, width: `${width}%` }}>
                    <div className="sky" />
                    <div className="sun" />
                    <div className="cloud cloud-one" />
                    <div className="cloud cloud-two" />
                    <div className="mountains far" />
                    <div className="mountains near" />
                    <div className="platform-top" />
                    <div className="platform-face" />
                    {chunk.label && <div className="segment-label">{chunk.label}</div>}
                  </section>
                )
              })}
            </div>

            {GROUND_TICKS.map((tick) => {
              const x = ((tick - cameraLeft) / VIEW_METERS) * 100
              if (x < -3 || x > 103) return null
              return <div className="ground-tick" key={tick} style={{ left: `${x}%` }} />
            })}

            {MARKERS.map((marker) => {
              const x = ((marker - cameraLeft) / VIEW_METERS) * 100
              if (x < -5 || x > 105) return null
              return <div className="distance-post" key={marker} style={{ left: `${x}%` }}><span>{marker}m</span></div>
            })}

            {(() => {
              const x = ((RACE_DISTANCE - cameraLeft) / VIEW_METERS) * 100
              return x > -8 && x < 108 ? <div className="finish-post" style={{ left: `${x}%` }}><span>FINISH</span></div> : null
            })()}

            <div className="runner-layer">
              {racers.map((racer) => {
                const x = ((racer.distance - cameraLeft) / VIEW_METERS) * 100
                const isManaged = racer.id === selectedId
                const moving = phase === 'racing'
                const frames = moving ? racer.runFrames : racer.idleFrames
                const sprite = moving ? racer.run : racer.idle
                const rawCycleDuration = racer.strideMeters / Math.max(racer.velocity, 1)
                const duration = moving
                  ? Math.round(clamp(rawCycleDuration, 0.34, 0.92) * 20) / 20
                  : 1.45
                const rank = ranking.findIndex((entry) => entry.id === racer.id) + 1
                const style = {
                  left: `${x}%`,
                  bottom: `calc(31% + ${TRACK_OFFSETS[racer.trackSlot]}px)`,
                  zIndex: 30 + racer.trackSlot,
                } as CSSProperties

                return (
                  <div className={`race-animal ${isManaged ? 'managed' : ''} tactic-${racer.tactic ?? 'none'} ${x < -15 || x > 115 ? 'hidden' : ''}`} key={racer.id} style={style}>
                    {isManaged
                      ? <div className="you-tag"><b>{rank}</b><span>YOU · {racer.name}</span></div>
                      : <><div className="rival-chip">{rank}</div><div className="rival-gauge"><i style={{ width: `${racer.tacticCharge}%` }} /></div></>}
                    <div className="animal-shadow" />
                    <div className="sprite-flip">
                      <div className="animal-sprite" style={{
                        width: racer.frameWidth,
                        height: racer.frameHeight,
                        backgroundImage: `url(${sprite})`,
                        animationDuration: `${duration}s`,
                        animationTimingFunction: `steps(${frames})`,
                        ['--sheet-offset' as string]: `-${racer.frameWidth * frames}px`,
                      } as CSSProperties} />
                    </div>
                    {racer.tactic && <span className={`tactic ${racer.tactic}`}>{TACTIC_LABEL[racer.tactic]}</span>}
                  </div>
                )
              })}
            </div>

            <div className="course-progress"><span style={{ width: `${(selected.distance / RACE_DISTANCE) * 100}%` }} /></div>
            {phase === 'countdown' && <div className="countdown"><strong>{countdown || 'GO!'}</strong></div>}
          </div>

          <div className="commentary"><i /><p>{commentary}</p></div>
        </section>

        {phase === 'racing' ? (
          <section className={`tactic-dock ${tacticReady ? 'ready' : ''}`}>
            <div className="dock-status">
              <small>TACTIC GAUGE · RACE NEVER PAUSES</small>
              <strong>{selectedGaugeLabel}</strong>
              <p>{selected.tacticsUnlocked ? 'Hold the full gauge or spend it at the exact moment you choose.' : 'All racers unlock tactics together when the field reaches 300 m.'}</p>
            </div>
            <div className="tactic-buttons free-use">
              <button disabled={!tacticReady} onClick={() => chooseTactic('surge')}><b>PUSH</b><span>BURST · speed attack</span></button>
              <button disabled={!tacticReady} onClick={() => chooseTactic('settle')}><b>SETTLE</b><span>STAMINA · recover</span></button>
              <button disabled={!tacticReady} onClick={() => chooseTactic('draft')}><b>DRAFT</b><span>NERVE · chase + slingshot</span></button>
            </div>
          </section>
        ) : (
          <section className="manager-card">
            <div className="selected-row">
              <div className="portrait" style={{ borderColor: selected.accent }}>
                <div className="sprite-flip"><div className="animal-sprite" style={{
                  width: selected.frameWidth,
                  height: selected.frameHeight,
                  backgroundImage: `url(${selected.idle})`,
                  animationDuration: '1.45s',
                  animationTimingFunction: `steps(${selected.idleFrames})`,
                  ['--sheet-offset' as string]: `-${selected.frameWidth * selected.idleFrames}px`,
                } as CSSProperties} /></div>
              </div>
              <div><small>YOUR RACER</small><h2>{selected.name} <span>the {selected.species}</span></h2><p>{selected.role}</p></div>
              <div className="energy"><small>ENERGY</small><b>{Math.round(selected.energy)}%</b><small>TACTIC</small><b className="tactic-percent">{selectedGaugeLabel}</b></div>
            </div>

            {phase === 'setup' && <div className="roster">
              {RACERS.map((racer) => <button key={racer.id} className={selectedId === racer.id ? 'active' : ''} style={{ ['--accent' as string]: racer.accent } as CSSProperties} onClick={() => {
                setSelectedId(racer.id)
                const fresh = makeRace(racer.id)
                raceRef.current = fresh
                setRacers(fresh)
                cameraLeftRef.current = INITIAL_CAMERA_LEFT
                setCameraLeft(INITIAL_CAMERA_LEFT)
              }}><span>{racer.number}</span><b>{racer.name}</b><small>{racer.affinity}</small></button>)}
            </div>}

            <div className="stats-row">
              {[['SPD', selected.speed], ['STA', selected.stamina], ['BUR', selected.burst], ['NRV', selected.nerve]].map(([label, value]) => <div className="stat" key={String(label)}><small>{label}</small><b>{value}</b></div>)}
              <button className="start-button" onClick={beginRace} disabled={phase === 'countdown'}>{phase === 'finished' ? 'RACE AGAIN' : 'START RACE'}</button>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default FreeTacticRace
