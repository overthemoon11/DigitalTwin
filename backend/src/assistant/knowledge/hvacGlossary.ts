/**
 * Curated chiller-plant knowledge.
 *
 * This is the assistant's HVAC competence when there is no language model, and
 * its grounding when there is one. Every entry is general engineering — it
 * describes how chiller plants behave, never what THIS plant is doing. That
 * separation is enforced by construction: nothing in this file can read plant
 * state, so a sentence from here can never masquerade as a measurement.
 *
 * Entries are written to be quoted directly. When the LLM is down the composer
 * prints the `answer` field verbatim, so it has to read as a finished reply
 * rather than as notes.
 */
import type { KnowledgeDocument, KnowledgeSource } from './index';

export interface GlossaryEntry {
  id: string;
  title: string;
  tags: string[];
  /** A complete answer to "what is this / why does it matter". */
  answer: string;
  /** Ids of entries a reader will want next. */
  related?: string[];
}

export const HVAC_GLOSSARY: GlossaryEntry[] = [
  {
    id: 'chwst',
    title: 'CHWST — chilled water supply temperature',
    tags: ['chwst', 'chws', 'supply', 'setpoint', 'chilled water', 'leaving water temperature', 'lwt'],
    answer:
      'CHWST is the temperature of the chilled water leaving the chillers and entering the building loop. It is the plant\'s primary temperature setpoint.\n\nIt matters because it sets the evaporator saturation temperature, and therefore the compressor lift — the pressure difference the compressor has to work across. Raising CHWST reduces lift and reduces chiller kW, typically 1.5–3% of chiller power per Kelvin on a centrifugal machine.\n\nIt is not free: warmer supply water means less cooling capacity per litre, so the coils need more flow to remove the same heat. Pump power rises, the return temperature drifts up, and dehumidification gets weaker. A CHWST reset strategy exists to find the point where the chiller saving still exceeds the pumping cost.',
    related: ['chwrt', 'lift', 'chwst-reset', 'delta-t'],
  },
  {
    id: 'chwrt',
    title: 'CHWRT — chilled water return temperature',
    tags: ['chwrt', 'chwr', 'return', 'chilled water return', 'return temperature'],
    answer:
      'CHWRT is the temperature of chilled water coming back from the building. Unlike CHWST it is not a setpoint — it is an outcome. It tells you how much heat the building put into the loop and how well the coils transferred it.\n\nA high CHWRT usually means one of four things: the building load is genuinely high; chilled-water flow is low relative to load, so each litre picks up more heat; the plant is not making enough cooling, so the loop is warming up; or coil valves are wide open and the loop has run out of capacity.\n\nMost plants enforce an upper CHWRT limit. It is the constraint that stops CHWST reset and DP reset from being free savings: raise the supply temperature or slow the pumps far enough and the return climbs until the coils are starved, so the return limit is what pushes back.',
    related: ['chwst', 'delta-t', 'low-delta-t-syndrome'],
  },
  {
    id: 'delta-t',
    title: 'CHW ΔT — chilled water temperature difference',
    tags: ['delta t', 'deltat', 'dt', 'temperature difference', 'chw delta'],
    answer:
      'ΔT is CHWRT minus CHWST — how many degrees the building added to the water. With flow, it defines the cooling delivered: RT ≈ flow (L/s) × ΔT (K) × 1.189.\n\nA design ΔT of 5–7 K is normal for a chilled-water plant. Running below design ΔT means moving more water for the same cooling, which costs pump energy and can force an extra chiller on to satisfy flow rather than load.',
    related: ['low-delta-t-syndrome', 'chwrt', 'kw-per-rt'],
  },
  {
    id: 'low-delta-t-syndrome',
    title: 'Low ΔT syndrome',
    tags: ['low delta t', 'degradation', 'bypass', 'over pumping', 'coil'],
    answer:
      'Low ΔT syndrome is when a plant returns water much cooler than design, so it has to circulate far more of it. Common causes are three-way valves or an open decoupler bypass mixing supply into return, coils fouled or oversized, control valves stuck open, and pumping to a differential-pressure setpoint that is higher than the system needs.\n\nThe symptom to watch is ΔT falling while load is flat. The cost is pump energy plus, in bad cases, an extra chiller staged on to make flow rather than tonnes.',
    related: ['delta-t', 'dp-setpoint', 'staging'],
  },
  {
    id: 'kw-per-rt',
    title: 'kW/RT — plant efficiency',
    tags: ['kwperrt', 'kw/rt', 'kw per rt', 'efficiency', 'specific power', 'kw per ton'],
    answer:
      'kW/RT is the electrical power the plant draws per refrigeration ton of cooling it delivers. Lower is better. One refrigeration ton is 3.517 kW of heat removed, so kW/RT and COP are the same number seen from two sides: COP = 3.517 / (kW/RT).\n\nWhat counts in the numerator matters. Chiller-only kW/RT counts compressors. Plant kW/RT counts chillers plus chilled-water pumps, condenser-water pumps and cooling tower fans — that is the honest figure, because every efficiency measure that helps the chillers tends to cost one of the other three.\n\nAs rough context for a water-cooled centrifugal plant: below about 0.60 kW/RT is good, 0.60–0.75 is typical, and above about 0.85 suggests something specific is wrong rather than a general inefficiency. The number is only comparable at similar load and wet bulb.',
    related: ['cop', 'rt', 'plant-power-split'],
  },
  {
    id: 'cop',
    title: 'COP — coefficient of performance',
    tags: ['cop', 'coefficient of performance', 'efficiency ratio'],
    answer:
      'COP is cooling delivered divided by electrical power consumed, both in the same units — a dimensionless efficiency. A plant COP of 6.0 means six kilowatts of heat removed per kilowatt drawn.\n\nCOP = 3.517 / (kW/RT). It rises when lift falls, so it improves with warmer chilled water, colder condenser water, and machines running near their best part-load point.',
    related: ['kw-per-rt', 'lift'],
  },
  {
    id: 'rt',
    title: 'RT — refrigeration ton',
    tags: ['rt', 'ton', 'tonnage', 'refrigeration ton', 'cooling load'],
    answer:
      'One refrigeration ton is 3.517 kW of heat removal — historically the rate at which a ton of ice melts over a day. Plant capacity and building load are both quoted in RT.\n\nOn a chilled-water plant the load is normally derived rather than metered: RT ≈ flow (L/s) × ΔT (K) × 1.189. That means the load figure inherits any error in the flow meter and the two temperature sensors.',
    related: ['delta-t', 'kw-per-rt'],
  },
  {
    id: 'lift',
    title: 'Compressor lift',
    tags: ['lift', 'head', 'pressure ratio', 'compressor', 'condensing temperature', 'evaporating temperature'],
    answer:
      'Lift is the difference between condensing and evaporating temperature — the thermal hill the compressor has to push the refrigerant over. It is the single strongest driver of chiller power.\n\nEverything that reduces lift reduces chiller kW: warmer chilled water (raises the evaporating temperature), colder condenser water (lowers the condensing temperature), clean tubes and adequate condenser flow. Everything that increases lift costs power, which is why a hot, humid day is expensive even at the same cooling load.',
    related: ['chwst', 'condenser-water', 'approach'],
  },
  {
    id: 'condenser-water',
    title: 'Condenser water (CWS / CWR)',
    tags: ['condenser water', 'cws', 'cwr', 'condenser', 'cooling water'],
    answer:
      'Condenser water carries the heat rejected by the chillers to the cooling towers. CWS is what leaves the towers and enters the condensers; CWR is what comes back, typically 4–6 K warmer.\n\nColder CWS lowers condensing temperature and therefore chiller power — roughly 1.5–3% of chiller kW per Kelvin. Getting it colder costs tower fan energy, so there is an optimum. Slowing the condenser pumps saves cubic pump power but raises the condenser water rise and degrades the tube-bundle approach, which pushes lift back up; that trade-off has to be priced or slow pumps look free.',
    related: ['approach', 'wet-bulb', 'lift', 'condenser-approach'],
  },
  {
    id: 'approach',
    title: 'Cooling tower approach',
    tags: ['approach', 'tower approach', 'cooling tower', 'wetbulb approach'],
    answer:
      'Approach is how many degrees above the outdoor wet bulb the tower can deliver its leaving water: approach = CWS − wet bulb. It is the tower\'s performance measure, and it can never be zero — the wet bulb is the thermodynamic floor.\n\nA well-performing tower runs 3–5 K approach at design airflow. Approach widens when airflow falls (fan slowed or fan fault), when fill is fouled or scaled, when water distribution is uneven, and as load rises. Because approach sets CWS, and CWS sets condensing temperature, a degraded tower shows up as higher chiller power long before anyone looks at the tower.',
    related: ['wet-bulb', 'condenser-water', 'tower-fan'],
  },
  {
    id: 'condenser-approach',
    title: 'Condenser approach (tube bundle)',
    tags: ['condenser approach', 'tube bundle', 'fouling', 'condenser flow'],
    answer:
      'The condenser approach is the gap between the refrigerant condensing temperature and the leaving condenser water. It measures heat-transfer effectiveness inside the machine rather than at the tower.\n\nIt widens with fouled or scaled tubes and with reduced condenser water flow, since the tube-side film coefficient falls roughly with flow to the 0.8 power (Dittus–Boelter). A widening approach at constant flow and load is one of the cleanest early indicators that condenser tubes need cleaning.',
    related: ['condenser-water', 'lift'],
  },
  {
    id: 'wet-bulb',
    title: 'Wet bulb temperature',
    tags: ['wetbulb', 'wet bulb', 'humidity', 'psychrometrics', 'weather'],
    answer:
      'Wet bulb is the lowest temperature air can reach by evaporating water into it. It depends on both dry-bulb temperature and humidity.\n\nIt is the boundary condition for the whole heat-rejection side of a chiller plant: a cooling tower can only ever approach the wet bulb, so wet bulb sets the coldest condenser water available, which sets the condensing temperature, which sets chiller power. Two days with the same dry-bulb temperature but different humidity are not the same day for a chiller plant.\n\nThis is why plant efficiency must be compared at similar wet bulb. A kW/RT figure quoted without the wet bulb it was measured at is not comparable to anything.',
    related: ['approach', 'condenser-water', 'kw-per-rt'],
  },
  {
    id: 'dp-setpoint',
    title: 'CHW differential pressure (DP) setpoint',
    tags: ['dp', 'differential pressure', 'dp setpoint', 'header dp', 'pump control', 'kpa', 'psi'],
    answer:
      'Variable-speed chilled-water pumps are usually controlled to hold a differential pressure across the loop. The DP setpoint decides how hard they work.\n\nPump power follows roughly the cube of speed, so a modest DP reduction is a large energy saving — dropping speed 10% takes about 27% off pump power. The limit is the worst-served coil: if DP falls too far, the valve furthest from the plant cannot get the flow it needs and that zone loses control.\n\nDP reset (lowering the setpoint until some valve is nearly wide open) is one of the highest-value, lowest-risk measures on a chilled-water system. 1 psi ≈ 6.895 kPa.',
    related: ['pump-affinity', 'low-delta-t-syndrome', 'chwrt'],
  },
  {
    id: 'pump-affinity',
    title: 'Pump and fan affinity laws',
    tags: ['affinity', 'cube law', 'vsd', 'vfd', 'pump speed', 'fan speed', 'variable speed'],
    answer:
      'For a centrifugal pump or fan on a variable-speed drive: flow scales with speed, head with speed squared, and shaft power with speed cubed.\n\nThat cube is why speed control dominates every other pumping measure — 80% speed is about half the power. In practice the exponent is a little less than three because motor and drive efficiency fall at low speed and because most systems have a static head the law does not cover, but the shape holds.',
    related: ['dp-setpoint', 'tower-fan'],
  },
  {
    id: 'tower-fan',
    title: 'Cooling tower fan speed',
    tags: ['tower fan', 'ct fan', 'fan speed', 'fan power', 'heat rejection'],
    answer:
      'Tower fan speed sets airflow, which sets how close the leaving water gets to the wet bulb. More airflow means a narrower approach and colder condenser water, which lowers chiller power — and fan power rises with roughly the cube of speed.\n\nSo there is a genuine optimum, and it moves with load and wet bulb. At high load the chiller saving from colder condenser water easily pays for the fan; at low load it often does not, and the correct move is to slow the fans and let the condenser water float up. Getting this trade-off right is one of the largest whole-plant optimisation opportunities, and it cannot be found by tuning the tower and the chillers separately.',
    related: ['approach', 'condenser-water', 'pump-affinity'],
  },
  {
    id: 'staging',
    title: 'Chiller staging and sequencing',
    tags: ['staging', 'sequencing', 'chillers online', 'stage up', 'stage down', 'part load'],
    answer:
      'Staging decides how many machines run and which ones. Too few and the running machines are overloaded and inefficient at full load; too many and each runs at a low part load where fixed losses dominate.\n\nThe efficiency curve of a centrifugal chiller is not flat: most machines are at their best somewhere around 50–80% of nameplate, and fall away sharply below about 30%. Adding a chiller also adds its dedicated pumps, so a staging decision is never only about the compressors.\n\nStaging must also respect minimum run and minimum off timers, which exist to protect motors from short cycling. That is why a staging change can be correct on energy and still be forbidden this minute.',
    related: ['part-load', 'kw-per-rt', 'plant-power-split'],
  },
  {
    id: 'part-load',
    title: 'Part load ratio (PLR)',
    tags: ['partload', 'plr', 'part load ratio', 'loading', 'unloading'],
    answer:
      'PLR is a machine\'s current load as a fraction of its rated capacity. Chiller power is not proportional to PLR — there is a no-load loss, and the curve bends.\n\nThat curvature is exactly what makes staging a real decision. If power were linear in load, splitting a load across two machines would cost the same as one machine, and staging would not matter. Because there is a fixed loss per running machine and an efficiency peak partway up the curve, there is a right number of machines for every load.',
    related: ['staging', 'lift'],
  },
  {
    id: 'plant-power-split',
    title: 'Where chiller plant energy goes',
    tags: ['power split', 'breakdown', 'plant kw', 'auxiliaries', 'parasitic'],
    answer:
      'A typical water-cooled plant divides roughly as: chillers 70–80% of plant kW, chilled-water pumps 5–12%, condenser-water pumps 6–12%, cooling tower fans 2–6%.\n\nThe split is the reason whole-plant optimisation beats component optimisation. Every lever that helps the chillers costs one of the auxiliaries — colder condenser water costs fan power, lower DP costs coil authority, fewer chillers costs part-load efficiency — so the only meaningful objective is total plant kW at the delivered tonnage.',
    related: ['kw-per-rt', 'mpc', 'tower-fan'],
  },
  {
    id: 'chwst-reset',
    title: 'CHWST reset — why raising supply temperature can save energy',
    tags: ['chwst reset', 'raise chwst', 'increase chwst', 'reset', 'temperature reset', 'why increase chwst'],
    answer:
      'Raising the chilled-water supply setpoint raises the evaporating temperature, cuts compressor lift and therefore cuts chiller power — commonly 1.5–3% of chiller kW per Kelvin.\n\nThe cost appears elsewhere. Warmer water carries less cooling per litre, so flow must rise to serve the same load: pump power goes up, the return temperature climbs, and latent (dehumidification) capacity falls. Raise it far enough and coils saturate — valves go fully open and zones lose control.\n\nSo CHWST reset is a bounded optimisation, not a one-way improvement. The usual bounds are a return-temperature limit, a humidity requirement, and the position of the worst-case coil valve. The right setpoint moves with load and with weather, which is precisely why it is a good candidate for model-predictive control rather than a fixed schedule.',
    related: ['chwst', 'chwrt', 'mpc', 'dp-setpoint'],
  },
  {
    id: 'mpc',
    title: 'MPC — model predictive control',
    tags: ['mpc', 'model predictive control', 'optimizer', 'optimization', 'receding horizon', 'solver'],
    answer:
      'Model predictive control uses a model of the plant to plan a sequence of control moves over a future horizon, applies only the first move, then re-plans on the next measurement. That last part — apply one move, re-plan — is what makes it robust to forecast error rather than dependent on it.\n\nFor a chiller plant it solves the whole-plant trade-off at once: chiller staging, CHWST setpoint, DP setpoint, pump speeds and tower fan speed, all against the same objective of minimum total plant kW subject to constraints. A rule-based sequence cannot do this because the correct move for one subsystem depends on what the others are doing.\n\nThe horizon matters because the loop has thermal memory. Shedding a chiller costs nothing this minute; it costs a warmer return temperature three steps from now. A steady-state optimiser cannot see that, and will book savings the loop later pays back.',
    related: ['mpc-constraints', 'mpc-trust', 'plant-power-split'],
  },
  {
    id: 'mpc-constraints',
    title: 'What constrains an MPC solution',
    tags: ['constraints', 'binding constraint', 'limits', 'feasible', 'infeasible'],
    answer:
      'An MPC answer is only as meaningful as the constraint set it respected. Typical hard limits on a chiller plant are: chilled-water return temperature, minimum and maximum chiller loading, minimum and maximum chilled and condenser water flow per machine, header flow capacity, tower approach floor at the wet bulb, pump and fan speed ranges, staging count with required standby, minimum run and off timers, and a per-cycle limit on how far any setpoint may move.\n\nA constraint that is binding is the reason the optimiser stopped where it did. If the answer is "CHWST went up 0.7 K and no further", the binding constraint — usually the return-temperature limit or a move-size limit — is the actual explanation.',
    related: ['mpc', 'chwrt'],
  },
  {
    id: 'mpc-trust',
    title: 'When not to trust a reported MPC saving',
    tags: ['trust', 'verification', 'saving', 'unmet cooling', 'calibration', 'fallback'],
    answer:
      'A percentage saving from a model is a claim about the model first and the plant second. It should be discounted when any of the following is true.\n\nThe two arms did not deliver the same cooling. If the optimised run served less load, part of the "saving" is unserved cooling, and only the efficiency figure (kW/RT) is comparable.\n\nThe controls sit outside the range the model was calibrated on. Outside the fitted envelope the direction of a response is usually right and the magnitude is an extrapolation.\n\nThe solver fell back to a heuristic, or reported infeasible steps. Those moves were not optimised.\n\nThe loop was left warmer at the end than it started. Thermal storage borrowed during a run has to be paid back after it.\n\nNone of these mean the result is wrong. They mean the honest number is smaller than the headline, and the difference should be stated rather than absorbed.',
    related: ['mpc', 'calibration-envelope'],
  },
  {
    id: 'calibration-envelope',
    title: 'Calibration envelope of a digital twin',
    tags: ['calibration', 'envelope', 'extrapolation', 'fitted', 'model accuracy', 'validity'],
    answer:
      'A twin fitted to measured operation is trustworthy over the range that operation covered, and progressively less so outside it. The envelope is the set of conditions the fitting data actually contained — load range, temperature range, staging configuration, whether the pumps and fans were ever moved off auto.\n\nOutside the envelope the model still returns a number, and it is still physically shaped, but it is an extrapolation. This matters most for optimisation, because an optimiser will deliberately walk to the edge of whatever it is allowed to search, and the edge is exactly where the model is weakest.',
    related: ['mpc-trust', 'digital-twin'],
  },
  {
    id: 'digital-twin',
    title: 'Digital twin of a chiller plant',
    tags: ['digital twin', 'twin', 'simulation', 'model', 'physics engine'],
    answer:
      'A plant digital twin answers one question: given a load, weather and a set of control settings, what does the plant do — power, temperatures, flows, staging and alarms.\n\nIt is useful precisely because it is separable from optimisation. The twin knows nothing about what is desirable; an optimiser proposes control settings and asks the twin to score them. Keeping that direction one-way is what stops an optimiser from quietly optimising against its own assumptions.',
    related: ['mpc', 'calibration-envelope'],
  },
  {
    id: 'bms',
    title: 'BMS — building management system',
    tags: ['bms', 'bas', 'building management system', 'scada', 'trend', 'points'],
    answer:
      'The BMS is the control and monitoring system that actually runs the plant — it holds the sequences of operation, the setpoints, the alarms and the trend history.\n\nFor analysis, what matters is which points are trended and at what interval. A model can only be calibrated against channels that were recorded: if fan speed is not trended, fan-speed response cannot be fitted from that site\'s data, whatever else the dataset contains.',
    related: ['digital-twin', 'calibration-envelope'],
  },
  {
    id: 'chilled-water-loop',
    title: 'Primary / secondary chilled water loops',
    tags: ['primary', 'secondary', 'decoupler', 'bypass', 'loop', 'hydronics'],
    answer:
      'A primary–secondary arrangement uses constant-flow primary pumps to protect the chiller evaporators and variable-flow secondary pumps to serve the building, joined by a decoupler.\n\nFlow through the decoupler tells you which side is moving more water. Forward flow (primary to secondary) is normal at part load. Reverse flow means the building is pulling more than the running chillers are producing, which mixes warm return into supply and raises the effective supply temperature — the classic signal that another chiller is needed.',
    related: ['low-delta-t-syndrome', 'staging'],
  },
  {
    id: 'optimisation-levers',
    title: 'The optimisation levers on a chiller plant',
    tags: ['optimize', 'optimise', 'optimization', 'levers', 'save energy', 'how to optimise', 'efficiency opportunity'],
    answer:
      'On a water-cooled chiller plant there are six levers worth touching, and they interact.\n\nChiller staging — how many machines run and which. Wrong staging is usually the single largest error, in either direction.\n\nCHWST setpoint — raising it cuts lift and chiller power, bounded by the return temperature, humidity control and coil authority.\n\nCHW differential-pressure setpoint — lowering it cuts pump power by roughly the cube of the speed change, bounded by the worst-served coil.\n\nCHW pump speed — the direct expression of the DP decision, and the thing that actually spends the energy.\n\nCW pump speed — cubic savings against a widening condenser approach that pushes lift back up.\n\nCooling tower fan speed — colder condenser water for more fan power, with an optimum that moves with load and wet bulb.\n\nThey cannot be tuned independently, because each one moves the operating point the others are optimised against. That interaction is the entire argument for whole-plant optimisation rather than six separate control loops.',
    related: ['mpc', 'plant-power-split', 'chwst-reset', 'dp-setpoint', 'tower-fan', 'staging'],
  },
  {
    id: 'alarms',
    title: 'Chiller plant alarms',
    tags: ['alarm', 'alert', 'fault', 'trip', 'warning'],
    answer:
      'Plant alarms fall into a few families: temperature deviations (supply or return outside band), flow problems (below the machine\'s minimum, or header capacity exceeded), condenser-side problems (high condenser water, wide approach), equipment faults and trips, and water-treatment or makeup problems.\n\nAn alarm is a threshold crossing, not a diagnosis. The useful next step is almost always to look at what changed just before it and what constraint it sits against.',
    related: ['mpc-constraints'],
  },
  {
    id: 'demand-limiting',
    title: 'Demand limiting and load shifting',
    tags: ['demand', 'peak', 'kw cap', 'demand response', 'tariff', 'load shift'],
    answer:
      'Demand limiting caps plant electrical demand during a billing peak, usually by raising CHWST, shedding a chiller, or drawing on thermal storage. It trades comfort margin and possibly total energy for a lower demand charge.\n\nIt is a different objective from efficiency and should be stated as one: the cheapest plant on kWh is not necessarily the cheapest plant on a bill with a demand component.',
    related: ['optimisation-levers'],
  },
  {
    id: 'sequence-of-operation',
    title: 'Sequence of operation',
    tags: ['sequence', 'soo', 'control sequence', 'sop', 'operation'],
    answer:
      'The sequence of operation is the written specification of how the plant is supposed to control itself: staging thresholds and timers, setpoint reset schedules, pump and fan control modes, failure and standby behaviour, and alarm limits.\n\nMost "the plant is behaving strangely" investigations end at the sequence rather than at a piece of equipment — either the sequence says something nobody expected, or the installed logic no longer matches the sequence.',
    related: ['staging', 'bms'],
  },
];

/** The glossary as a knowledge source. */
export const glossarySource: KnowledgeSource = {
  name: 'HVAC glossary',
  kind: 'glossary',
  available: () => true,
  documents(): KnowledgeDocument[] {
    return HVAC_GLOSSARY.map((entry) => ({
      id: `glossary:${entry.id}`,
      title: entry.title,
      source: 'HVAC glossary',
      category: 'glossary',
      text: entry.answer,
      tags: entry.tags,
      // Written to be quoted as an answer, so it outranks an incidental match.
      weight: 1.45,
    }));
  },
};

export function glossaryEntry(id: string): GlossaryEntry | null {
  return HVAC_GLOSSARY.find((e) => e.id === id) ?? null;
}
