"""Chiller plant MPC simulator & optimizer.

Implementation of the approach in:
  Khunmaturod et al., "Model Predictive Control for chiller plant energy
  efficiency: Leveraging multi-horizon forecasting and machine learning-based
  system models", Journal of Building Engineering 119 (2026) 115345.

Units convention used throughout the package:
  temperature  degF   (converted to Kelvin only inside the Gordon-Ng model)
  cooling      RT     (1 RT = 3.51685 kW thermal)
  power        kW (electric)
  time step    15 minutes (96 steps/day)
"""

RT_TO_KW = 3.51685

def f_to_k(t_f):
    """Fahrenheit -> Kelvin."""
    return (t_f - 32.0) / 1.8 + 273.15
