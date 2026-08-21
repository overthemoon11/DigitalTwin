# BMS data mapping - T1_MVrawDataR2_2025_12_completed.xlsx

> GENERATED FILE - produced by `data/scripts/export_bms_records.py`.
> Edit `data/scripts/bms_columns.py` and re-run; do not edit this by hand.
>
> For what is measured vs derived vs assumed, see [`data-provenance.md`](data-provenance.md).

## Source

| | |
|---|---|
| Sheet | `T1_MVrawDataR2_2025_12` (193 columns, 136 named) |
| Data rows | 44640 (workbook rows 2-44641) |
| Period | 2025-12-01 00:00:00 to 2025-12-31 23:59:00 |
| Interval | 1 minute |
| Audit sheet | `Calculation_Audit` - documents the missing-value completion |

**Header units are unreliable.** Several headers carry a parenthetical
unit that contradicts the data (`CH-1-ChwFls (degC)` is a flow in L/s;
`CH-1-ChwRt (RT)` is a temperature in degC). Every unit below is inferred
from magnitude and tag stem, never copied from the header text.

## Raw column -> standard name -> unit -> usage

| # | Raw BMS column | Standard internal name | Unit | Usage | Certainty |
|---:|---|---|---|---|---|
| 0 | `avg kw` | `avg_kw_unmapped` | kW | unused | **uncertain** |
| 1 | `kw` | `total_plant_kw` | kW | validation reference / baseline characterisation | confirmed |
| 2 | `kw/rt` | `plant_kw_per_rt` | kW/RT | validation reference | confirmed |
| 3 | `rt` | `plant_rt` | RT | disturbance: building load (derived) | confirmed |
| 4 | `deltaT` | `header_chw_delta_t_c` | K | validation reference | confirmed |
| 6 | `Date` | `date` | date | timestamp (combined with `time`) | confirmed |
| 7 | `Time` | `time` | time-of-day | timestamp (combined with `date`) | confirmed |
| 8 | `DPM-CH-1-CP-1-kW` | `ch1_cp1_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 9 | `DPM-CH-2-CP-1-kW` | `ch2_cp1_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 10 | `DPM-CH-3-CP-1-kW` | `ch3_cp1_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 11 | `DPM-CH-4-CP-1-kW` | `ch4_cp1_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 12 | `DPM-CH-5-CP-1-kW` | `ch5_cp1_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 16 | `DPM-CHWP-1-kW` | `chwp1_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 17 | `DPM-CHWP-2-kW` | `chwp2_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 18 | `DPM-CHWP-3-kW` | `chwp3_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 19 | `DPM-CHWP-4-kW` | `chwp4_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 20 | `DPM-CHWP-5-kW` | `chwp5_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 21 | `DPM-CHWP-6-kW` | `chwp6_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 24 | `DPM-CWP-1-kW` | `cwp1_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 25 | `DPM-CWP-2-kW` | `cwp2_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 26 | `DPM-CWP-3-kW` | `cwp3_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 27 | `DPM-CWP-4-kW` | `cwp4_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 28 | `DPM-CWP-5-kW` | `cwp5_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 29 | `DPM-CWP-6-kW` | `cwp6_kw` | kW | pump power model (measured) + ON/OFF inference | confirmed |
| 32 | `CT_01_DPM_kW` | `ct1_kw` | kW | tower power model (measured) + ON/OFF inference | confirmed |
| 33 | `CT_02_DPM_kW` | `ct2_kw` | kW | tower power model (measured) + ON/OFF inference | confirmed |
| 34 | `CT_03_DPM_kW` | `ct3_kw` | kW | tower power model (measured) + ON/OFF inference | confirmed |
| 35 | `DPM_CT_04_kW` | `ct4_kw` | kW | tower power model (measured) + ON/OFF inference | confirmed |
| 36 | `CT_05_DPM_kW` | `ct5_kw` | kW | tower power model (measured) + ON/OFF inference | confirmed |
| 40 | `CH-1-ChwFls` | `ch1_chw_flow_ls` | L/s | per-machine evaporator flow | confirmed |
| 41 | `CH-2-ChwFls` | `ch2_chw_flow_ls` | L/s | per-machine evaporator flow | confirmed |
| 42 | `CH-3-ChwFls` | `ch3_chw_flow_ls` | L/s | per-machine evaporator flow | confirmed |
| 43 | `CH-4-ChwFls` | `ch4_chw_flow_ls` | L/s | per-machine evaporator flow | confirmed |
| 44 | `CH-5-ChwFls` | `ch5_chw_flow_ls` | L/s | per-machine evaporator flow | confirmed |
| 48 | `CHW-Riser-Finger-ChwFls` | `riser_finger_flow_ls` | L/s | building load reconstruction (RT = f * sum(flows) * dT) | confirmed |
| 49 | `CHW-Riser-L1-3-ChwFls` | `riser_l13_flow_ls` | L/s | building load reconstruction (RT = f * sum(flows) * dT) | confirmed |
| 50 | `CHW-Riser-MainBuilding-ChwFls` | `riser_main_building_flow_ls` | L/s | building load reconstruction (RT = f * sum(flows) * dT) | confirmed |
| 51 | `CHW-Riser-T1U-ChwFls` | `riser_t1u_flow_ls` | L/s | building load reconstruction (RT = f * sum(flows) * dT) | confirmed |
| 53 | `CH-1-CwFls` | `ch1_cw_flow_ls` | L/s | per-machine condenser flow | confirmed |
| 54 | `CH-2-CwFls` | `ch2_cw_flow_ls` | L/s | per-machine condenser flow | confirmed |
| 55 | `CH-3-CwFls` | `ch3_cw_flow_ls` | L/s | per-machine condenser flow | confirmed |
| 56 | `CH-4-CwFls` | `ch4_cw_flow_ls` | L/s | per-machine condenser flow | confirmed |
| 57 | `CH-5-CwFls` | `ch5_cw_flow_ls` | L/s | per-machine condenser flow | confirmed |
| 61 | `Header-hcwf` | `cw_header_flow_ls` | L/s | condenser-loop plant state / heat-rejection checks | confirmed |
| 66 | `CH-1-ChwSt` | `ch1_chwst_c` | degC | chiller model input - evaporator leaving water | confirmed |
| 67 | `CH-2-ChwSt` | `ch2_chwst_c` | degC | chiller model input - evaporator leaving water | confirmed |
| 68 | `CH-3-ChwSt` | `ch3_chwst_c` | degC | chiller model input - evaporator leaving water | confirmed |
| 69 | `CH-4-ChwSt` | `ch4_chwst_c` | degC | chiller model input - evaporator leaving water | confirmed |
| 70 | `CH-5-ChwSt` | `ch5_chwst_c` | degC | chiller model input - evaporator leaving water | confirmed |
| 74 | `CHW-Riser-Finger-ChwSt` | `riser_finger_st_c` | degC | secondary-loop diagnostics | confirmed |
| 75 | `CHW-Riser-L1-3-ChwSt` | `riser_l13_st_c` | degC | secondary-loop diagnostics | confirmed |
| 76 | `CHW-Riser-MainBuilding-ChwSt` | `riser_main_building_st_c` | degC | secondary-loop diagnostics | confirmed |
| 77 | `CHW-Riser-T1U-ChwSt` | `riser_t1u_st_c` | degC | secondary-loop diagnostics | confirmed |
| 79 | `CH-1-ChwRt` | `ch1_chwrt_c` | degC | chiller model input - evaporator entering water | confirmed |
| 80 | `CH-2-ChwRt` | `ch2_chwrt_c` | degC | chiller model input - evaporator entering water | confirmed |
| 81 | `CH-3-ChwRt` | `ch3_chwrt_c` | degC | chiller model input - evaporator entering water | confirmed |
| 82 | `CH-4-ChwRt` | `ch4_chwrt_c` | degC | chiller model input - evaporator entering water | confirmed |
| 83 | `CH-5-ChwRt` | `ch5_chwrt_c` | degC | chiller model input - evaporator entering water | confirmed |
| 87 | `CHW-Riser-Finger-ChwRt` | `riser_finger_rt_c` | degC | secondary-loop diagnostics | confirmed |
| 88 | `CHW-Riser-L1-3-ChwRt` | `riser_l13_rt_c` | degC | secondary-loop diagnostics | confirmed |
| 89 | `CHW-Riser-MainBuilding-ChwRt` | `riser_main_building_rt_c` | degC | secondary-loop diagnostics | confirmed |
| 90 | `CHW-Riser-T1U-ChwRt` | `riser_t1u_rt_c` | degC | secondary-loop diagnostics | confirmed |
| 92 | `CH-1-CwSt` | `ch1_cwst_c` | degC | chiller model input - condenser entering water (lift) | confirmed |
| 93 | `CH-2-CwSt` | `ch2_cwst_c` | degC | chiller model input - condenser entering water (lift) | confirmed |
| 94 | `CH-3-CwSt` | `ch3_cwst_c` | degC | chiller model input - condenser entering water (lift) | confirmed |
| 95 | `CH-4-CwSt` | `ch4_cwst_c` | degC | chiller model input - condenser entering water (lift) | confirmed |
| 96 | `CH-5-CwSt` | `ch5_cwst_c` | degC | chiller model input - condenser entering water (lift) | confirmed |
| 100 | `Header-hcwst (degC)` | `header_chwst_c` | degC | plant state / model input - CHWS achieved | confirmed |
| 105 | `CH-1-CwRt` | `ch1_cwrt_c` | degC | chiller model input - condenser leaving water | confirmed |
| 106 | `CH-2-CwRt` | `ch2_cwrt_c` | degC | chiller model input - condenser leaving water | confirmed |
| 107 | `CH-3-CwRt` | `ch3_cwrt_c` | degC | chiller model input - condenser leaving water | confirmed |
| 108 | `CH-4-CwRt` | `ch4_cwrt_c` | degC | chiller model input - condenser leaving water | confirmed |
| 109 | `CH-5-CwRt` | `ch5_cwrt_c` | degC | chiller model input - condenser leaving water | confirmed |
| 113 | `Header-hcwrt` | `header_chwrt_c` | degC | plant state / model input - CHWR achieved | confirmed |
| 118 | `WST_1_WetBulbTemp` | `wst1_wetbulb_c` | degC | disturbance: wet bulb (mean of the 5 sensors) | confirmed |
| 119 | `WST_2_WetBulbTemp` | `wst2_wetbulb_c` | degC | disturbance: wet bulb (mean of the 5 sensors) | confirmed |
| 120 | `WST_3_WetBulbTemp` | `wst3_wetbulb_c` | degC | disturbance: wet bulb (mean of the 5 sensors) | confirmed |
| 121 | `WST_4_WetBulbTemp` | `wst4_wetbulb_c` | degC | disturbance: wet bulb (mean of the 5 sensors) | confirmed |
| 122 | `WST_5_WetBulbTemp` | `wst5_wetbulb_c` | degC | disturbance: wet bulb (mean of the 5 sensors) | confirmed |
| 136 | `DPM-CH-1-CP-2-kW` | `ch1_cp2_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 137 | `DPM-CH-2-CP-2-kW` | `ch2_cp2_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 138 | `DPM-CH-3-CP-2-kW` | `ch3_cp2_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 139 | `DPM-CH-4-CP-2-kW` | `ch4_cp2_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 140 | `DPM-CH-5-CP-2-kW` | `ch5_cp2_kw` | kW | chiller power model (measured) + ON/OFF inference | confirmed |
| 141 | `HL_CH_1_CP1_Power` | `ch1_cp1_kw_hl` | kW | unused | **uncertain** |
| 142 | `HL_CH_1_CP2_Power` | `ch1_cp2_kw_hl` | kW | unused | **uncertain** |
| 143 | `HL_CH_2_CP1_Power` | `ch2_cp1_kw_hl` | kW | unused | **uncertain** |
| 144 | `HL_CH_2_CP2_Power` | `ch2_cp2_kw_hl` | kW | unused | **uncertain** |
| 145 | `HL_CH_3_CP1_Power` | `ch3_cp1_kw_hl` | kW | unused | **uncertain** |
| 146 | `HL_CH_3_CP2_Power` | `ch3_cp2_kw_hl` | kW | unused | **uncertain** |
| 147 | `HL_CH_4_CP1_Power` | `ch4_cp1_kw_hl` | kW | unused | **uncertain** |
| 148 | `HL_CH_4_CP2_Power` | `ch4_cp2_kw_hl` | kW | unused | **uncertain** |
| 149 | `HL_CH_5_CP1_Power` | `ch5_cp1_kw_hl` | kW | unused | **uncertain** |
| 150 | `HL_CH_5_CP2_Power` | `ch5_cp2_kw_hl` | kW | unused | **uncertain** |
| 151 | `CHWP_1_VSDkW` | `chwp1_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 152 | `CHWP_2_VSDkW` | `chwp2_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 153 | `CHWP_3_VSDkW` | `chwp3_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 154 | `CHWP_4_VSDkW` | `chwp4_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 155 | `CHWP_5_VSDkW` | `chwp5_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 156 | `CHWP_6_VSDkW` | `chwp6_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 157 | `CWP_1_VSDkW` | `cwp1_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 158 | `CWP_2_VSDkW` | `cwp2_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 159 | `CWP_3_VSDkW` | `cwp3_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 160 | `CWP_4_VSDkW` | `cwp4_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 161 | `CWP_5_VSDkW` | `cwp5_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 162 | `CWP_6_VSDkW` | `cwp6_vsd_kw` | kW | cross-check against the DPM meter | **uncertain** |
| 163 | `CT_1_VSD_A_kW` | `ct1a_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 164 | `CT_1_VSD_B_kW` | `ct1b_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 165 | `CT_2_VSD_A_kW` | `ct2a_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 166 | `CT_2_VSD_B_kW` | `ct2b_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 167 | `CT_3_VSD_A_kW` | `ct3a_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 168 | `CT_3_VSD_B_kW` | `ct3b_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 169 | `CT_4_VSD_135_kW` | `ct4a_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 170 | `CT_4_VSD_246_kW` | `ct4b_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 171 | `CT_5_VSD_A_kW` | `ct5a_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 172 | `CT_5_VSD_B_kW` | `ct5b_vsd_kw` | kW | per-cell fan power | **uncertain** |
| 173 | `CT_1A_CWST` | `ct1a_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 174 | `CT_1B_CWST` | `ct1b_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 175 | `CT_2A_CWST` | `ct2a_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 176 | `CT_2B_CWST` | `ct2b_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 177 | `CT_3A_CWST` | `ct3a_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 178 | `CT_3B_CWST` | `ct3b_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 179 | `CT_4A_CWST` | `ct4a_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 180 | `CT_4B_CWST` | `ct4b_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 181 | `CT_5A_CWST` | `ct5a_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 182 | `CT_5B_CWST` | `ct5b_cwst_c` | degC | tower model - leaving (supply) condenser water | confirmed |
| 183 | `CT_1A_CWRT` | `ct1a_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 184 | `CT_1B_CWRT` | `ct1b_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 185 | `CT_2A_CWRT` | `ct2a_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 186 | `CT_2B_CWRT` | `ct2b_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 187 | `CT_3A_CWRT` | `ct3a_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 188 | `CT_3B_CWRT` | `ct3b_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 189 | `CT_4A_CWRT` | `ct4a_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 190 | `CT_4B_CWRT` | `ct4b_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 191 | `CT_5A_CWRT` | `ct5a_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |
| 192 | `CT_5B_CWRT` | `ct5b_cwrt_c` | degC | tower model - entering (return) condenser water | confirmed |

### Notes on uncertain or derived columns

- **`total_plant_kw`** (`kw`): workbook-computed plant total
- **`plant_kw_per_rt`** (`kw/rt`): equals kw / rt exactly (max abs err 0.0 over 44,638 rows)
- **`plant_rt`** (`rt`): only rows 2-134 measured; 44,507 rows reconstructed as RT_FACTOR_WORKBOOK * sum(riser flows) * (hcwrt - hcwst)
- **`header_chw_delta_t_c`** (`deltaT`): equals header_chwrt_c - header_chwst_c
- **`avg_kw_unmapped`** (`avg kw`): median 171 kW, max 313 kW. Not reproducible as the average of any column group we can identify. NOT used anywhere downstream.
- **`cw_header_flow_ls`** (`Header-hcwf`): CONDENSER water header flow despite the 'hcw' tag prefix, which on hcwst/hcwrt means chilled water. Median 696 L/s. Do NOT use it for chilled-water duty or for the RT reconstruction.
- **`ch1_cp1_kw_hl`** (`HL_CH_1_CP1_Power`): integer-valued duplicate of the DPM CP-1 channel from a different source; medians differ (CH-3: DPM 260.4 vs HL 243.0). Meaning of the HL_ prefix is undocumented.
- **`ch1_cp2_kw_hl`** (`HL_CH_1_CP2_Power`): see ch1_cp1_kw_hl
- **`ch2_cp1_kw_hl`** (`HL_CH_2_CP1_Power`): integer-valued duplicate of the DPM CP-1 channel from a different source; medians differ (CH-3: DPM 260.4 vs HL 243.0). Meaning of the HL_ prefix is undocumented.
- **`ch2_cp2_kw_hl`** (`HL_CH_2_CP2_Power`): see ch2_cp1_kw_hl
- **`ch3_cp1_kw_hl`** (`HL_CH_3_CP1_Power`): integer-valued duplicate of the DPM CP-1 channel from a different source; medians differ (CH-3: DPM 260.4 vs HL 243.0). Meaning of the HL_ prefix is undocumented.
- **`ch3_cp2_kw_hl`** (`HL_CH_3_CP2_Power`): see ch3_cp1_kw_hl
- **`ch4_cp1_kw_hl`** (`HL_CH_4_CP1_Power`): integer-valued duplicate of the DPM CP-1 channel from a different source; medians differ (CH-3: DPM 260.4 vs HL 243.0). Meaning of the HL_ prefix is undocumented.
- **`ch4_cp2_kw_hl`** (`HL_CH_4_CP2_Power`): see ch4_cp1_kw_hl
- **`ch5_cp1_kw_hl`** (`HL_CH_5_CP1_Power`): integer-valued duplicate of the DPM CP-1 channel from a different source; medians differ (CH-3: DPM 260.4 vs HL 243.0). Meaning of the HL_ prefix is undocumented.
- **`ch5_cp2_kw_hl`** (`HL_CH_5_CP2_Power`): see ch5_cp1_kw_hl
- **`chwp1_vsd_kw`** (`CHWP_1_VSDkW`): VSD-reported power, not a speed or frequency. There is NO pump speed/Hz channel anywhere in this workbook.
- **`cwp1_vsd_kw`** (`CWP_1_VSDkW`): VSD-reported power, not a speed or frequency.
- **`chwp2_vsd_kw`** (`CHWP_2_VSDkW`): VSD-reported power, not a speed or frequency. There is NO pump speed/Hz channel anywhere in this workbook.
- **`cwp2_vsd_kw`** (`CWP_2_VSDkW`): VSD-reported power, not a speed or frequency.
- **`chwp3_vsd_kw`** (`CHWP_3_VSDkW`): VSD-reported power, not a speed or frequency. There is NO pump speed/Hz channel anywhere in this workbook.
- **`cwp3_vsd_kw`** (`CWP_3_VSDkW`): VSD-reported power, not a speed or frequency.
- **`chwp4_vsd_kw`** (`CHWP_4_VSDkW`): VSD-reported power, not a speed or frequency. There is NO pump speed/Hz channel anywhere in this workbook.
- **`cwp4_vsd_kw`** (`CWP_4_VSDkW`): VSD-reported power, not a speed or frequency.
- **`chwp5_vsd_kw`** (`CHWP_5_VSDkW`): VSD-reported power, not a speed or frequency. There is NO pump speed/Hz channel anywhere in this workbook.
- **`cwp5_vsd_kw`** (`CWP_5_VSDkW`): VSD-reported power, not a speed or frequency.
- **`chwp6_vsd_kw`** (`CHWP_6_VSDkW`): VSD-reported power, not a speed or frequency. There is NO pump speed/Hz channel anywhere in this workbook.
- **`cwp6_vsd_kw`** (`CWP_6_VSDkW`): VSD-reported power, not a speed or frequency.
- **`ct1a_vsd_kw`** (`CT_1_VSD_A_kW`): fan VSD power, NOT fan speed %. No fan-speed channel exists.
- **`ct1b_vsd_kw`** (`CT_1_VSD_B_kW`): fan VSD power, NOT fan speed %.
- **`ct2a_vsd_kw`** (`CT_2_VSD_A_kW`): fan VSD power, NOT fan speed %. No fan-speed channel exists.
- **`ct2b_vsd_kw`** (`CT_2_VSD_B_kW`): fan VSD power, NOT fan speed %.
- **`ct3a_vsd_kw`** (`CT_3_VSD_A_kW`): fan VSD power, NOT fan speed %. No fan-speed channel exists.
- **`ct3b_vsd_kw`** (`CT_3_VSD_B_kW`): fan VSD power, NOT fan speed %.
- **`ct4a_vsd_kw`** (`CT_4_VSD_135_kW`): fan VSD power, NOT fan speed %. No fan-speed channel exists.
- **`ct4b_vsd_kw`** (`CT_4_VSD_246_kW`): fan VSD power, NOT fan speed %.
- **`ct5a_vsd_kw`** (`CT_5_VSD_A_kW`): fan VSD power, NOT fan speed %. No fan-speed channel exists.
- **`ct5b_vsd_kw`** (`CT_5_VSD_B_kW`): fan VSD power, NOT fan speed %.

## Signals this dataset does NOT contain

Consumers must report these as *not available* rather than defaulting.

| Requested signal | Why it is missing |
|---|---|
| `chw_dp_kpa` | No differential-pressure channel of any kind. DP-SP cannot be calibrated or validated from this dataset. |
| `chwst_sp_c` | No setpoint channels at all. Only ACHIEVED temperatures are trended, so a setpoint can only be proxied by its achieved value. |
| `dp_sp_kpa` | No DP setpoint (no DP measurement either). |
| `cwst_sp_c` | No condenser-water setpoint; CWS is observable, its setpoint is not. |
| `chwp_speed_pct` | No pump speed or frequency channel - VSD kW only. |
| `cwp_speed_pct` | No pump speed or frequency channel - VSD kW only. |
| `ct_fan_speed_pct` | No fan speed channel - fan VSD kW only. |
| `valve_position_pct` | No valve positions. |
| `oat_dry_bulb_c` | No outdoor dry-bulb; only the five WST wet-bulb sensors. |
| `oat_rh_pct` | No outdoor humidity. |
| `chiller_status` | No status/run flags; ON/OFF must be inferred from kW against the RUN_KW thresholds. |
| `cw_header_flow_ls` | No condenser-water HEADER flow; per-chiller CwFls only. |

## Known anomalies (from the workbook's own audit sheet)

| Code | Period | Detail | Action |
|---|---|---|---|
| `CT4_POWER_GAP` | 2025-12-31 00:00 - 2025-12-31 23:59 | DPM_CT_04_kW and the CT_4 VSD channels are absent for all 1,440 rows; total plant kW is understated on this date. | excluded from tower fitting and from energy baselines |
| `NEGATIVE_HEADER_DT` | 2025-12-23 11:41 - 2025-12-23 11:42 | Header CHWS exceeds CHWR, so the reconstructed RT is negative. | excluded from every fit and from load statistics |
