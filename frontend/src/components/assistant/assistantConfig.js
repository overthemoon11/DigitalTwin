import {
  BellIcon,
  BuildingIcon,
  DropletIcon,
  ExchangeIcon,
  FilterIcon,
  MoonIcon,
  OptimizeIcon,
  SolverIcon,
  SunIcon,
  TrendDownIcon,
  WindIcon,
} from "../ui/TwIcons";

/**
 * Per-system copy and starter questions for the Plant AI Assistant.
 *
 * The chiller entries changed meaning in the agent rewrite. They used to be
 * COMMANDS — each `prompt` was a phrase the server-side parser recognised, and
 * typing something else got you a help menu. They are now EXAMPLES: every
 * prompt goes through `POST /api/assistant/chat` exactly like anything typed by
 * hand, and the assistant routes it by intent. Nothing here is privileged, and
 * clicking a chip is indistinguishable from typing the same words.
 *
 * That is why the chiller prompts are questions rather than imperatives. They
 * are meant to demonstrate that free-form questions work, not to teach a
 * vocabulary that has to be memorised.
 *
 * ETS and AHU still answer from their local engines and keep their command
 * phrasing, because their parsers are what runs.
 *
 * Icons are stored as components, not elements, so this stays a plain `.js`
 * module with no JSX.
 */

const CHILLER = {
  id: "chiller",
  systemLabel: "Chiller Plant",
  authorLabel: "Plant AI",
  welcomeTitle: "I can help you understand and optimise the chiller plant.",
  welcomeBody:
    "Ask naturally about plant performance, energy efficiency, equipment behaviour, alarms, MPC decisions or simulation scenarios. You do not need exact commands.",
  placeholder: "Ask about the plant…",
  inputLabel: "Message the Plant AI Assistant about the chiller plant",
  analysing: "Analysing the chiller plant…",
  /** Starter questions, not commands. Each is sent verbatim through the agent. */
  quickActions: [
    {
      id: "efficiency",
      icon: TrendDownIcon,
      label: "Why is efficiency low?",
      hint: "Reads kW/RT and the power split",
      prompt: "why is efficiency low?",
    },
    {
      id: "optimise",
      icon: OptimizeIcon,
      label: "What should I optimise?",
      hint: "Inspects the plant and solves for the best point",
      prompt: "what should I optimise right now?",
    },
    {
      id: "explain-mpc",
      icon: SolverIcon,
      label: "Explain MPC decision",
      hint: "From the solver's own diagnostics",
      prompt: "why did the MPC choose those settings?",
    },
    {
      id: "alarms",
      icon: BellIcon,
      label: "Check alarms",
      hint: "Active alarms and binding limits",
      prompt: "are there any active alarms?",
    },
    {
      id: "run-mpc",
      icon: SunIcon,
      label: "Run MPC",
      hint: "Optimise the current conditions",
      prompt: "run mpc on the current conditions",
    },
  ],
  examples: [
    "how do I optimise this plant?",
    "why is CHWR high?",
    "which chiller is least efficient?",
    "what is kW/RT?",
    "why does raising CHWST save energy?",
    "is the MPC result trustworthy?",
    "what happens if wet bulb reaches 30 °C?",
    "simulate a 3,500 RT load",
    "compare baseline and MPC over the next few hours",
    "what is limiting the plant?",
    "run the peak summer scenario",
    "set CHWST to 8 °C",
  ],
  scenarioIds: [
    "baseline",
    "peak-summer",
    "night-low-load",
    "aggressive-chws",
    "high-header-dp",
    "humid-monsoon",
    "condenser-stress",
    "part-load-tune",
  ],
  scenarioJson: `{
  "label": "Hot afternoon",
  "controls": {
    "ctrl-building-load": 3500,
    "ctrl-ambient-temp": 36,
    "ctrl-chws-sp": 7.0
  },
  "advanceSec": 120
}`,
};

const ETS = {
  id: "ets",
  systemLabel: "District Cooling",
  authorLabel: "Station AI",
  welcomeTitle: "How can I help with the station?",
  welcomeBody:
    "Ask about district and building side temperatures, heat-exchanger approach, secondary pumping, or run a station scenario.",
  placeholder: "Ask about the station or run a scenario…",
  inputLabel: "Message the Plant AI Assistant about the ETS station",
  analysing: "Analysing the ETS station…",
  quickActions: [
    {
      id: "peak-summer",
      icon: SunIcon,
      label: "Peak summer",
      hint: "Run scenario",
      prompt: "run peak summer scenario",
    },
    {
      id: "night-setback",
      icon: MoonIcon,
      label: "Night setback",
      hint: "Run scenario",
      prompt: "run night setback scenario",
    },
    {
      id: "building-load",
      icon: BuildingIcon,
      label: "Building load",
      hint: "Set to 950 RT",
      prompt: "set building load to 950 RT",
    },
    {
      id: "alarms",
      icon: BellIcon,
      label: "ETS alarms",
      hint: "Review active",
      prompt: "show active alarms",
    },
    {
      id: "approach",
      icon: ExchangeIcon,
      label: "HX approach",
      hint: "Heat exchange",
      prompt: "what is the HX approach?",
    },
  ],
  examples: [
    "run peak summer scenario",
    "run night setback scenario",
    "set building load to 950 RT",
    "set DCS supply to 5.5 °C",
    "set header DP to 120 kPa",
    "run single HX scenario",
    "show active alarms",
    "what is the HX approach?",
    "what should I optimize on ETS?",
    "give me an ETS status summary",
  ],
  scenarioIds: [
    "baseline",
    "peak-summer",
    "night-setback",
    "single-hx",
    "warm-dcs",
    "high-header-dp",
    "lt-bypass-tune",
  ],
  scenarioJson: `{
  "label": "Warm district supply",
  "controls": {
    "ets-load": 950,
    "ets-dcs-temp": 7.2
  },
  "advanceSec": 60
}`,
};

const AHU = {
  id: "ahu",
  systemLabel: "AHU01",
  authorLabel: "AHU AI",
  welcomeTitle: "How can I help with AHU01?",
  welcomeBody:
    "Ask about airflow, supply air temperature, filters and dampers, or run an air-side scenario.",
  placeholder: "Ask about AHU01 or run a scenario…",
  inputLabel: "Message the Plant AI Assistant about AHU01",
  analysing: "Analysing AHU01…",
  quickActions: [
    {
      id: "high-humidity",
      icon: DropletIcon,
      label: "High humidity",
      hint: "Run scenario",
      prompt: "run high humidity scenario",
    },
    {
      id: "dirty-filter",
      icon: FilterIcon,
      label: "Dirty filters",
      hint: "Run scenario",
      prompt: "run dirty filter scenario",
    },
    {
      id: "economizer",
      icon: WindIcon,
      label: "Economizer",
      hint: "Run scenario",
      prompt: "run economizer scenario",
    },
    {
      id: "alarms",
      icon: BellIcon,
      label: "AHU alarms",
      hint: "Review active",
      prompt: "show active alarms",
    },
    {
      id: "zone-load",
      icon: BuildingIcon,
      label: "Zone load",
      hint: "Set index to 1.35",
      prompt: "set zone load to 1.35",
    },
  ],
  examples: [
    "run high humidity scenario",
    "run dirty filter scenario",
    "run economizer scenario",
    "set zone load to 1.35",
    "set SAT to 13 °C",
    "set SA airflow to 3000 CFM",
    "show active alarms",
    "give me an AHU status summary",
    "what should I optimize on AHU01?",
  ],
  scenarioIds: [
    "baseline",
    "high-humidity",
    "economizer",
    "dirty-filter",
    "heating-morning",
    "sa-overvent",
  ],
  scenarioJson: `{
  "label": "Warm humid morning",
  "controls": {
    "ahu-zone-load": 1.35,
    "ahu-sat-sp": 13.0,
    "ahu-oarh": 82
  },
  "advanceSec": 60
}`,
};

const BY_SYSTEM = { chiller: CHILLER, ets: ETS, ahu: AHU };

/** Systems whose panel talks to the backend agent rather than a local parser. */
export const AGENT_SYSTEMS = new Set(["chiller"]);

/** @param {'chiller' | 'ets' | 'ahu' | undefined} scenario */
export function assistantConfigFor(scenario) {
  return BY_SYSTEM[scenario] ?? CHILLER;
}
