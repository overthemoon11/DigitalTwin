"""Raw BMS column map for T1_MVrawDataR2_2025_12_completed.xlsx.

SINGLE SOURCE OF TRUTH for the raw-to-canonical mapping. Only Python reads the
workbook (openpyxl); the TypeScript side consumes the normalised artifact this
map produces, so there is no second copy of these indices to drift out of sync.

TWO HAZARDS THIS FILE EXISTS TO RECORD

1. The parenthetical units in the workbook's header row are frequently WRONG.
   Verified counter-examples:
       "CH-1-ChwFls (degC)"           is a FLOW        (0 ... 163 L/s)
       "CH-1-CwFls (RT)"              is a FLOW        (0 ... 256 L/s)
       "CH-1-ChwRt (RT)"              is a TEMPERATURE (13.2 ... 15.7 degC)
       "CHW-Riser-L1-3-ChwSt (L/s)"   is a TEMPERATURE (6.7 ... 14.7 degC)
   The `unit` recorded here is therefore inferred from magnitude and from the
   tag stem (ChwSt/ChwRt/CwSt/CwRt = temperature, *Fls = flow, *kW = power),
   never copied from the header text.

2. Several columns are genuinely ambiguous. Those carry certainty="uncertain"
   with the reason, and no downstream model depends on them. Per the brief:
   document uncertainty, do not guess silently.

Column indices are 0-based into the row tuple of sheet T1_MVrawDataR2_2025_12.
"""
from __future__ import annotations

from dataclasses import dataclass

SHEET = "T1_MVrawDataR2_2025_12"
AUDIT_SHEET = "Calculation_Audit"

#: 1-based worksheet rows holding data (row 1 is the header).
FIRST_DATA_ROW, LAST_DATA_ROW = 2, 44641

N_CH, N_PUMP, N_CT = 5, 6, 5

#: Metered kW above which a unit counts as RUNNING. This site trends no status
#: or run flags of any kind, so ON/OFF has to be inferred from power. The
#: thresholds sit far above standby draw (compressors idle at ~1.3 kW, pumps at
#: ~0.02 kW) and far below any running value.
RUN_KW = {"ch": 50.0, "chwp": 5.0, "cwp": 5.0, "ct": 3.0}

#: RT = factor * sum(riser flows, L/s) * (CHWR - CHWS, K).
#: The workbook's own constant, recovered by refitting against the 133 rows that
#: carry a measured RT. It reproduces them to 0.105% MAPE.
RT_FACTOR_WORKBOOK = 1.18892327296496
#: The same identity from first principles: 4.186 kJ/(L*K) / 3.517 kW/RT.
#: Kept for comparison — it is 0.11% high against the measured rows, which is
#: how we know the workbook applied a small calibration factor of its own.
RT_FACTOR_PHYSICS = 4.186 / 3.517


@dataclass(frozen=True)
class Col:
    """One raw workbook column and what it actually is.

    `certainty` is "confirmed" when the tag, the magnitude and a cross-check all
    agree, and "uncertain" when something does not — in which case `note` says
    what, and nothing downstream is allowed to depend on the column.
    """

    idx: int
    raw: str
    name: str
    unit: str
    usage: str
    certainty: str = "confirmed"
    note: str = ""


def _c(idx, raw, name, unit, usage, certainty="confirmed", note=""):
    return Col(idx, raw, name, unit, usage, certainty, note)


# --------------------------------------------------------------- timestamps
TIMESTAMP = [
    _c(6, "Date", "date", "date", "timestamp (combined with `time`)"),
    _c(7, "Time", "time", "time-of-day", "timestamp (combined with `date`)"),
]

# ------------------------------------------------------- plant-level totals
PLANT = [
    _c(1, "kw", "total_plant_kw", "kW", "validation reference / baseline characterisation",
       note="workbook-computed plant total"),
    _c(2, "kw/rt", "plant_kw_per_rt", "kW/RT", "validation reference",
       note="equals kw / rt exactly (max abs err 0.0 over 44,638 rows)"),
    _c(3, "rt", "plant_rt", "RT", "disturbance: building load (derived)",
       note="only rows 2-134 measured; 44,507 rows reconstructed as "
            "RT_FACTOR_WORKBOOK * sum(riser flows) * (hcwrt - hcwst)"),
    _c(4, "deltaT", "header_chw_delta_t_c", "K", "validation reference",
       note="equals header_chwrt_c - header_chwst_c"),
    _c(0, "avg kw", "avg_kw_unmapped", "kW", "unused", certainty="uncertain",
       note="median 171 kW, max 313 kW. Not reproducible as the average of any "
            "column group we can identify. NOT used anywhere downstream."),
]

# ------------------------------------------------------------------ headers
HEADER = [
    _c(100, "Header-hcwst (degC)", "header_chwst_c", "degC",
       "plant state / model input - CHWS achieved"),
    _c(113, "Header-hcwrt", "header_chwrt_c", "degC",
       "plant state / model input - CHWR achieved"),
    _c(61, "Header-hcwf", "cw_header_flow_ls", "L/s",
       "condenser-loop plant state / heat-rejection checks",
       note="CONDENSER water header flow despite the 'hcw' tag prefix, which on "
            "hcwst/hcwrt means chilled water. Median 696 L/s. Do NOT use it for "
            "chilled-water duty or for the RT reconstruction."),
]

# ------------------------------------------------------------------- risers
RISER_KEYS = ("finger", "l13", "main_building", "t1u")
RISER_RAW = ("Finger", "L1-3", "MainBuilding", "T1U")


def riser_cols():
    """The four chilled-water risers: flow, supply temp, return temp."""
    out = []
    for i, (k, r) in enumerate(zip(RISER_KEYS, RISER_RAW)):
        out += [
            _c(48 + i, f"CHW-Riser-{r}-ChwFls", f"riser_{k}_flow_ls", "L/s",
               "building load reconstruction (RT = f * sum(flows) * dT)"),
            _c(74 + i, f"CHW-Riser-{r}-ChwSt", f"riser_{k}_st_c", "degC",
               "secondary-loop diagnostics"),
            _c(87 + i, f"CHW-Riser-{r}-ChwRt", f"riser_{k}_rt_c", "degC",
               "secondary-loop diagnostics"),
        ]
    return out


# ----------------------------------------------------------------- chillers
_HL_NOTE = ("integer-valued duplicate of the DPM CP-1 channel from a different "
            "source; medians differ (CH-3: DPM 260.4 vs HL 243.0). Meaning of "
            "the HL_ prefix is undocumented.")


def chiller_cols():
    """Per-machine power, water temperatures and flows, for CH-1 .. CH-5.

    Each machine has TWO metered compressors (CP-1, CP-2); machine power is
    their sum, and the run threshold is applied to that sum.
    """
    out = []
    for i in range(N_CH):
        n = i + 1
        p = "chiller power model (measured) + ON/OFF inference"
        out += [
            _c(8 + i, f"DPM-CH-{n}-CP-1-kW", f"ch{n}_cp1_kw", "kW", p),
            _c(136 + i, f"DPM-CH-{n}-CP-2-kW", f"ch{n}_cp2_kw", "kW", p),
            _c(66 + i, f"CH-{n}-ChwSt", f"ch{n}_chwst_c", "degC",
               "chiller model input - evaporator leaving water"),
            _c(79 + i, f"CH-{n}-ChwRt", f"ch{n}_chwrt_c", "degC",
               "chiller model input - evaporator entering water"),
            _c(92 + i, f"CH-{n}-CwSt", f"ch{n}_cwst_c", "degC",
               "chiller model input - condenser entering water (lift)"),
            _c(105 + i, f"CH-{n}-CwRt", f"ch{n}_cwrt_c", "degC",
               "chiller model input - condenser leaving water"),
            _c(40 + i, f"CH-{n}-ChwFls", f"ch{n}_chw_flow_ls", "L/s",
               "per-machine evaporator flow"),
            _c(53 + i, f"CH-{n}-CwFls", f"ch{n}_cw_flow_ls", "L/s",
               "per-machine condenser flow"),
            _c(141 + 2 * i, f"HL_CH_{n}_CP1_Power", f"ch{n}_cp1_kw_hl", "kW",
               "unused", certainty="uncertain", note=_HL_NOTE),
            _c(142 + 2 * i, f"HL_CH_{n}_CP2_Power", f"ch{n}_cp2_kw_hl", "kW",
               "unused", certainty="uncertain", note=f"see ch{n}_cp1_kw_hl"),
        ]
    return out


# -------------------------------------------------------------------- pumps
_VSD_NOTE_CHW = ("VSD-reported power, not a speed or frequency. There is NO "
                 "pump speed/Hz channel anywhere in this workbook.")
_VSD_NOTE_CW = "VSD-reported power, not a speed or frequency."


def pump_cols():
    """CHWP and CWP metered power, plus the VSD power cross-check channels."""
    out = []
    for i in range(N_PUMP):
        n = i + 1
        p = "pump power model (measured) + ON/OFF inference"
        out += [
            _c(16 + i, f"DPM-CHWP-{n}-kW", f"chwp{n}_kw", "kW", p),
            _c(24 + i, f"DPM-CWP-{n}-kW", f"cwp{n}_kw", "kW", p),
            _c(151 + i, f"CHWP_{n}_VSDkW", f"chwp{n}_vsd_kw", "kW",
               "cross-check against the DPM meter", certainty="uncertain",
               note=_VSD_NOTE_CHW),
            _c(157 + i, f"CWP_{n}_VSDkW", f"cwp{n}_vsd_kw", "kW",
               "cross-check against the DPM meter", certainty="uncertain",
               note=_VSD_NOTE_CW),
        ]
    return out


# ---------------------------------------------------------------- cooling towers
#: The DPM tag naming is inconsistent — CT-4's meter is `DPM_CT_04_kW` while the
#: others are `CT_0n_DPM_kW`, and CT-4's two VSD channels are named after fan
#: groups (135/246) rather than A/B. Listed explicitly rather than patterned.
CT_METER_RAW = ["CT_01_DPM_kW", "CT_02_DPM_kW", "CT_03_DPM_kW", "DPM_CT_04_kW", "CT_05_DPM_kW"]
CT_FAN_RAW = {4: ("CT_4_VSD_135_kW", "CT_4_VSD_246_kW")}


def tower_cols():
    """Per-cell tower power and the A/B water temperatures for CT-1 .. CT-5."""
    out = []
    for i in range(N_CT):
        n = i + 1
        meter = CT_METER_RAW[i]
        fan_a, fan_b = CT_FAN_RAW.get(n, (f"CT_{n}_VSD_A_kW", f"CT_{n}_VSD_B_kW"))
        out += [
            _c(32 + i, meter, f"ct{n}_kw", "kW",
               "tower power model (measured) + ON/OFF inference"),
            _c(163 + 2 * i, fan_a, f"ct{n}a_vsd_kw", "kW", "per-cell fan power",
               certainty="uncertain",
               note="fan VSD power, NOT fan speed %. No fan-speed channel exists."),
            _c(164 + 2 * i, fan_b, f"ct{n}b_vsd_kw", "kW", "per-cell fan power",
               certainty="uncertain", note="fan VSD power, NOT fan speed %."),
            _c(173 + 2 * i, f"CT_{n}A_CWST", f"ct{n}a_cwst_c", "degC",
               "tower model - leaving (supply) condenser water"),
            _c(174 + 2 * i, f"CT_{n}B_CWST", f"ct{n}b_cwst_c", "degC",
               "tower model - leaving (supply) condenser water"),
            _c(183 + 2 * i, f"CT_{n}A_CWRT", f"ct{n}a_cwrt_c", "degC",
               "tower model - entering (return) condenser water"),
            _c(184 + 2 * i, f"CT_{n}B_CWRT", f"ct{n}b_cwrt_c", "degC",
               "tower model - entering (return) condenser water"),
        ]
    return out


# ----------------------------------------------------------------- wet bulb
def wetbulb_cols():
    """Five wet-bulb sensors. The plant wet bulb is their mean."""
    return [
        _c(118 + i, f"WST_{i + 1}_WetBulbTemp", f"wst{i + 1}_wetbulb_c", "degC",
           "disturbance: wet bulb (mean of the 5 sensors)")
        for i in range(N_CT)
    ]


ALL_COLS = (
    TIMESTAMP + PLANT + HEADER + riser_cols() + chiller_cols()
    + pump_cols() + tower_cols() + wetbulb_cols()
)
BY_NAME = {c.name: c for c in ALL_COLS}
NUMERIC_COLS = [c for c in ALL_COLS if c.unit not in ("date", "time-of-day")]

#: Signals this site does NOT trend, and what each one blocks. Anything listed
#: here must be reported as not-available downstream, never defaulted to a
#: plausible number.
MISSING_SIGNALS = {
    "chw_dp_kpa": "No differential-pressure channel of any kind. DP-SP cannot be calibrated or validated from this dataset.",
    "chwst_sp_c": "No setpoint channels at all. Only ACHIEVED temperatures are trended, so a setpoint can only be proxied by its achieved value.",
    "dp_sp_kpa": "No DP setpoint (no DP measurement either).",
    "cwst_sp_c": "No condenser-water setpoint; CWS is observable, its setpoint is not.",
    "chwp_speed_pct": "No pump speed or frequency channel - VSD kW only.",
    "cwp_speed_pct": "No pump speed or frequency channel - VSD kW only.",
    "ct_fan_speed_pct": "No fan speed channel - fan VSD kW only.",
    "valve_position_pct": "No valve positions.",
    "oat_dry_bulb_c": "No outdoor dry-bulb; only the five WST wet-bulb sensors.",
    "oat_rh_pct": "No outdoor humidity.",
    "chiller_status": "No status/run flags; ON/OFF must be inferred from kW against the RUN_KW thresholds.",
    "cw_header_flow_ls": "No condenser-water HEADER flow; per-chiller CwFls only.",
}

#: Periods the raw data is known to be wrong over. Carried through as quality
#: flags rather than patched, so a report can show the gap and a fit can skip it.
KNOWN_ANOMALIES = [
    {
        "code": "CT4_POWER_GAP",
        "from": "2025-12-31 00:00",
        "to": "2025-12-31 23:59",
        "detail": "DPM_CT_04_kW and the CT_4 VSD channels are absent for all 1,440 rows; total plant kW is understated on this date.",
        "action": "excluded from tower fitting and from energy baselines",
    },
    {
        "code": "NEGATIVE_HEADER_DT",
        "from": "2025-12-23 11:41",
        "to": "2025-12-23 11:42",
        "detail": "Header CHWS exceeds CHWR, so the reconstructed RT is negative.",
        "action": "excluded from every fit and from load statistics",
    },
]
