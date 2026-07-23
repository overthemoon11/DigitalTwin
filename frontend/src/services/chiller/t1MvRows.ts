/**
 * Replay inputs + headline expected outputs for every row of the M&V window
 * (T1_MVrawDataR2_2025_12, Excel rows 2-134 = 2025-12-01 00:00-02:12 — the
 * only rows where the dataset's rt / kw/rt columns are populated).
 *
 * Per row, the OPERATOR INPUTS are: loadRt (rt), chwsSp (Header-hcwst),
 * cwDtSp (= (rt x 3.517 + running chiller kW) / (Header-hcwf x 3.6 x 1.163))
 * and the riser load shares (from measured riser flow x deltaT). All 133 rows run
 * the same duty units (CH-2/3/4, CHWP/CWP-2/3/4, CT-1/2/4/5 = DUTY_DEFAULTS).
 * kw / kwRt / deltaT are the measured outcomes for the summary comparison.
 *
 * GENERATED from the dataset (scratchpad gen_mv_rows.py) - do not hand-edit.
 */
import { DUTY_DEFAULTS } from './t1Snapshot';

export interface T1MvRow {
  row: number;
  time: string;
  loadRt: number;
  chwsSp: number;
  cwDtSp: number;
  shares: [number, number, number, number];
  kw: number;
  kwRt: number;
  deltaT: number;
}

export const T1_MV_ROWS: T1MvRow[] = [
  { row: 2, time: '00:00', loadRt: 3151.0385774808074, chwsSp: 7.52, cwDtSp: 4.3538, shares: [34.382, 18.154, 24.219, 23.246], kw: 1917.69, kwRt: 0.60859, deltaT: 6.55 },
  { row: 3, time: '00:01', loadRt: 3151.0385774808074, chwsSp: 7.52, cwDtSp: 4.3538, shares: [34.354, 18.14, 24.199, 23.307], kw: 1917.69, kwRt: 0.60859, deltaT: 6.55 },
  { row: 4, time: '00:02', loadRt: 3192.043405174865, chwsSp: 7.53, cwDtSp: 4.4053, shares: [33.168, 20.016, 24.249, 22.567], kw: 1920.2, kwRt: 0.60156, deltaT: 6.64 },
  { row: 5, time: '00:03', loadRt: 3216.0002509525166, chwsSp: 7.63, cwDtSp: 4.4476, shares: [32.82, 20.768, 24.087, 22.325], kw: 1930.32, kwRt: 0.60022, deltaT: 6.69 },
  { row: 6, time: '00:04', loadRt: 3234.908545066818, chwsSp: 7.63, cwDtSp: 4.4709, shares: [32.827, 20.774, 23.919, 22.479], kw: 1939.99, kwRt: 0.5997, deltaT: 6.73 },
  { row: 7, time: '00:05', loadRt: 3233.6210852431054, chwsSp: 7.63, cwDtSp: 4.4588, shares: [32.883, 20.657, 23.928, 22.532], kw: 1945.03, kwRt: 0.6015, deltaT: 6.72 },
  { row: 8, time: '00:06', loadRt: 3242.1177011657664, chwsSp: 7.61, cwDtSp: 4.4764, shares: [32.802, 20.566, 24.074, 22.558], kw: 1947.91, kwRt: 0.60081, deltaT: 6.73 },
  { row: 9, time: '00:07', loadRt: 3247.496657605914, chwsSp: 7.61, cwDtSp: 4.48, shares: [32.68, 20.768, 24.187, 22.364], kw: 1951.5, kwRt: 0.60092, deltaT: 6.74 },
  { row: 10, time: '00:08', loadRt: 3244.849372647142, chwsSp: 7.62, cwDtSp: 4.4763, shares: [32.743, 20.832, 24.071, 22.354], kw: 1956.96, kwRt: 0.6031, deltaT: 6.74 },
  { row: 11, time: '00:09', loadRt: 3244.3680481091837, chwsSp: 7.61, cwDtSp: 4.4778, shares: [32.772, 20.832, 24.051, 22.345], kw: 1962.23, kwRt: 0.60481, deltaT: 6.74 },
  { row: 12, time: '00:10', loadRt: 3255.6663203866933, chwsSp: 7.59, cwDtSp: 4.4977, shares: [32.772, 20.842, 24.08, 22.306], kw: 1965.24, kwRt: 0.60364, deltaT: 6.77 },
  { row: 13, time: '00:11', loadRt: 3262.412005231731, chwsSp: 7.59, cwDtSp: 4.4958, shares: [32.739, 20.868, 24.088, 22.305], kw: 1966.35, kwRt: 0.60273, deltaT: 6.78 },
  { row: 14, time: '00:12', loadRt: 3263.9452452658516, chwsSp: 7.59, cwDtSp: 4.5033, shares: [32.679, 20.856, 24.165, 22.3], kw: 1966.15, kwRt: 0.60238, deltaT: 6.78 },
  { row: 15, time: '00:13', loadRt: 3255.585742564686, chwsSp: 7.58, cwDtSp: 4.4975, shares: [32.892, 20.86, 24.057, 22.191], kw: 1968.63, kwRt: 0.60469, deltaT: 6.77 },
  { row: 16, time: '00:14', loadRt: 3265.526689166903, chwsSp: 7.57, cwDtSp: 4.5041, shares: [32.854, 20.855, 24.068, 22.223], kw: 1969.18, kwRt: 0.60302, deltaT: 6.79 },
  { row: 17, time: '00:15', loadRt: 3263.1022131930627, chwsSp: 7.57, cwDtSp: 4.5039, shares: [32.785, 20.965, 24.091, 22.159], kw: 1969.05, kwRt: 0.60343, deltaT: 6.79 },
  { row: 18, time: '00:16', loadRt: 3257.005316690361, chwsSp: 7.57, cwDtSp: 4.4981, shares: [32.825, 20.81, 24.154, 22.21], kw: 1968.37, kwRt: 0.60435, deltaT: 6.78 },
  { row: 19, time: '00:17', loadRt: 3236.6707832243387, chwsSp: 7.55, cwDtSp: 4.4689, shares: [33.555, 19.488, 24.204, 22.754], kw: 1973.14, kwRt: 0.60962, deltaT: 6.73 },
  { row: 20, time: '00:18', loadRt: 3212.1471551890813, chwsSp: 7.43, cwDtSp: 4.4421, shares: [33.801, 18.989, 24.373, 22.837], kw: 1961.31, kwRt: 0.61059, deltaT: 6.68 },
  { row: 21, time: '00:19', loadRt: 3252.144700597099, chwsSp: 7.48, cwDtSp: 4.5062, shares: [32.806, 20.176, 24.465, 22.553], kw: 1966.21, kwRt: 0.60459, deltaT: 6.76 },
  { row: 22, time: '00:20', loadRt: 3265.2363947682684, chwsSp: 7.53, cwDtSp: 4.512, shares: [32.725, 20.563, 24.253, 22.459], kw: 1974.43, kwRt: 0.60468, deltaT: 6.78 },
  { row: 23, time: '00:21', loadRt: 3269.163403127666, chwsSp: 7.53, cwDtSp: 4.517, shares: [32.649, 20.685, 24.089, 22.576], kw: 1972.93, kwRt: 0.6035, deltaT: 6.79 },
  { row: 24, time: '00:22', loadRt: 3260.8233009951673, chwsSp: 7.53, cwDtSp: 4.5007, shares: [32.638, 20.765, 24.043, 22.554], kw: 1972.13, kwRt: 0.6048, deltaT: 6.77 },
  { row: 25, time: '00:23', loadRt: 3266.6082411145862, chwsSp: 7.51, cwDtSp: 4.5144, shares: [32.487, 20.859, 24.173, 22.481], kw: 1974.78, kwRt: 0.60454, deltaT: 6.78 },
  { row: 26, time: '00:24', loadRt: 3269.4866665908444, chwsSp: 7.51, cwDtSp: 4.5097, shares: [32.55, 20.763, 24.14, 22.547], kw: 1971.34, kwRt: 0.60295, deltaT: 6.79 },
  { row: 27, time: '00:25', loadRt: 3262.676590901336, chwsSp: 7.52, cwDtSp: 4.5004, shares: [32.645, 20.78, 24.052, 22.523], kw: 1973.72, kwRt: 0.60494, deltaT: 6.77 },
  { row: 28, time: '00:26', loadRt: 3261.9513905032704, chwsSp: 7.51, cwDtSp: 4.5023, shares: [32.571, 20.761, 24.094, 22.574], kw: 1969.84, kwRt: 0.60388, deltaT: 6.77 },
  { row: 29, time: '00:27', loadRt: 3257.615899004834, chwsSp: 7.51, cwDtSp: 4.5074, shares: [32.602, 20.763, 24.163, 22.472], kw: 1966.41, kwRt: 0.60363, deltaT: 6.76 },
  { row: 30, time: '00:28', loadRt: 3245.0900349161216, chwsSp: 7.54, cwDtSp: 4.4797, shares: [32.557, 20.84, 24.199, 22.404], kw: 1967.31, kwRt: 0.60624, deltaT: 6.74 },
  { row: 31, time: '00:29', loadRt: 3244.4406514643156, chwsSp: 7.54, cwDtSp: 4.4818, shares: [32.725, 20.811, 24.12, 22.343], kw: 1965.42, kwRt: 0.60578, deltaT: 6.73 },
  { row: 32, time: '00:30', loadRt: 3243.2449575206138, chwsSp: 7.53, cwDtSp: 4.4743, shares: [32.568, 20.742, 24.18, 22.51], kw: 1966.29, kwRt: 0.60627, deltaT: 6.74 },
  { row: 33, time: '00:31', loadRt: 3241.3967855558712, chwsSp: 7.54, cwDtSp: 4.4838, shares: [32.679, 20.658, 24.079, 22.585], kw: 1963.29, kwRt: 0.60569, deltaT: 6.73 },
  { row: 34, time: '00:32', loadRt: 3239.539805970998, chwsSp: 7.53, cwDtSp: 4.5067, shares: [32.475, 20.64, 24.243, 22.642], kw: 1963.16, kwRt: 0.606, deltaT: 6.72 },
  { row: 35, time: '00:33', loadRt: 3242.037599431334, chwsSp: 7.52, cwDtSp: 4.4836, shares: [32.631, 20.587, 24.18, 22.602], kw: 1965.27, kwRt: 0.60618, deltaT: 6.73 },
  { row: 36, time: '00:34', loadRt: 3239.394242195053, chwsSp: 7.51, cwDtSp: 4.475, shares: [32.648, 20.63, 24.158, 22.564], kw: 1961.98, kwRt: 0.60566, deltaT: 6.73 },
  { row: 37, time: '00:35', loadRt: 3241.4768872903046, chwsSp: 7.51, cwDtSp: 4.4801, shares: [32.476, 20.653, 24.2, 22.671], kw: 1961.55, kwRt: 0.60514, deltaT: 6.73 },
  { row: 38, time: '00:36', loadRt: 3241.2365820870064, chwsSp: 7.51, cwDtSp: 4.4786, shares: [32.421, 20.7, 24.24, 22.639], kw: 1957.5, kwRt: 0.60394, deltaT: 6.73 },
  { row: 39, time: '00:37', loadRt: 3232.0036967301685, chwsSp: 7.52, cwDtSp: 4.4633, shares: [32.461, 20.835, 24.23, 22.475], kw: 1955.48, kwRt: 0.60504, deltaT: 6.71 },
  { row: 40, time: '00:38', loadRt: 3223.1200216093266, chwsSp: 7.52, cwDtSp: 4.4543, shares: [32.583, 20.75, 24.195, 22.472], kw: 1952.56, kwRt: 0.6058, deltaT: 6.7 },
  { row: 41, time: '00:39', loadRt: 3223.0073078760315, chwsSp: 7.52, cwDtSp: 4.452, shares: [32.387, 20.778, 24.274, 22.562], kw: 1953.58, kwRt: 0.60614, deltaT: 6.69 },
  { row: 42, time: '00:40', loadRt: 3227.426233721922, chwsSp: 7.52, cwDtSp: 4.4558, shares: [32.346, 20.785, 24.236, 22.632], kw: 1951.03, kwRt: 0.60452, deltaT: 6.7 },
  { row: 43, time: '00:41', loadRt: 3211.1702234859254, chwsSp: 7.54, cwDtSp: 4.4396, shares: [32.263, 20.777, 24.364, 22.595], kw: 1949.7, kwRt: 0.60716, deltaT: 6.66 },
  { row: 44, time: '00:42', loadRt: 3221.21091043503, chwsSp: 7.53, cwDtSp: 4.4489, shares: [32.252, 20.87, 24.286, 22.591], kw: 1948.88, kwRt: 0.60501, deltaT: 6.68 },
  { row: 45, time: '00:43', loadRt: 3225.7145798692072, chwsSp: 7.53, cwDtSp: 4.4545, shares: [32.406, 20.707, 24.259, 22.627], kw: 1952.65, kwRt: 0.60534, deltaT: 6.69 },
  { row: 46, time: '00:44', loadRt: 3230.4565311344895, chwsSp: 7.53, cwDtSp: 4.4623, shares: [32.398, 20.757, 24.185, 22.659], kw: 1952.33, kwRt: 0.60435, deltaT: 6.7 },
  { row: 47, time: '00:45', loadRt: 3217.3150858117715, chwsSp: 7.53, cwDtSp: 4.4412, shares: [32.396, 20.654, 24.251, 22.698], kw: 1953.01, kwRt: 0.60703, deltaT: 6.68 },
  { row: 48, time: '00:46', loadRt: 3216.440512937162, chwsSp: 7.53, cwDtSp: 4.4358, shares: [32.322, 20.643, 24.339, 22.695], kw: 1951.86, kwRt: 0.60684, deltaT: 6.68 },
  { row: 49, time: '00:47', loadRt: 3217.3150858117724, chwsSp: 7.53, cwDtSp: 4.4568, shares: [32.336, 20.524, 24.325, 22.815], kw: 1950.84, kwRt: 0.60636, deltaT: 6.68 },
  { row: 50, time: '00:48', loadRt: 3221.0166667045787, chwsSp: 7.52, cwDtSp: 4.4486, shares: [32.348, 20.568, 24.37, 22.714], kw: 1951.29, kwRt: 0.6058, deltaT: 6.69 },
  { row: 51, time: '00:49', loadRt: 3225.634954222349, chwsSp: 7.51, cwDtSp: 4.4491, shares: [32.35, 20.533, 24.357, 22.76], kw: 1951.37, kwRt: 0.60496, deltaT: 6.69 },
  { row: 52, time: '00:50', loadRt: 3215.565940062553, chwsSp: 7.52, cwDtSp: 4.4589, shares: [32.368, 20.58, 24.345, 22.706], kw: 1950.98, kwRt: 0.60673, deltaT: 6.68 },
  { row: 53, time: '00:51', loadRt: 3213.8167943133362, chwsSp: 7.53, cwDtSp: 4.4411, shares: [32.443, 20.616, 24.313, 22.628], kw: 1950.64, kwRt: 0.60695, deltaT: 6.68 },
  { row: 54, time: '00:52', loadRt: 3220.733870685242, chwsSp: 7.52, cwDtSp: 4.4471, shares: [32.456, 20.632, 24.24, 22.671], kw: 1950.91, kwRt: 0.60573, deltaT: 6.68 },
  { row: 55, time: '00:53', loadRt: 3224.0424412851858, chwsSp: 7.51, cwDtSp: 4.452, shares: [32.396, 20.706, 24.288, 22.61], kw: 1950.74, kwRt: 0.60506, deltaT: 6.69 },
  { row: 56, time: '00:54', loadRt: 3218.1501434176857, chwsSp: 7.51, cwDtSp: 4.4467, shares: [32.406, 20.686, 24.34, 22.568], kw: 1949.05, kwRt: 0.60564, deltaT: 6.69 },
  { row: 57, time: '00:55', loadRt: 3221.9721744668745, chwsSp: 7.51, cwDtSp: 4.4458, shares: [32.414, 20.846, 24.327, 22.413], kw: 1947.45, kwRt: 0.60443, deltaT: 6.69 },
  { row: 58, time: '00:56', loadRt: 3219.822282001706, chwsSp: 7.51, cwDtSp: 4.4432, shares: [32.372, 20.856, 24.347, 22.425], kw: 1945.65, kwRt: 0.60427, deltaT: 6.69 },
  { row: 59, time: '00:57', loadRt: 3215.645446687518, chwsSp: 7.52, cwDtSp: 4.435, shares: [32.375, 20.854, 24.295, 22.476], kw: 1946.5, kwRt: 0.60532, deltaT: 6.68 },
  { row: 60, time: '00:58', loadRt: 3210.275892976969, chwsSp: 7.53, cwDtSp: 4.4466, shares: [32.278, 20.959, 24.293, 22.47], kw: 1947.39, kwRt: 0.60661, deltaT: 6.67 },
  { row: 61, time: '00:59', loadRt: 3205.700691384702, chwsSp: 7.53, cwDtSp: 4.4253, shares: [32.428, 20.868, 24.192, 22.512], kw: 1944.94, kwRt: 0.60671, deltaT: 6.66 },
  { row: 62, time: '01:00', loadRt: 3205.22507989764, chwsSp: 7.52, cwDtSp: 4.4252, shares: [32.415, 20.754, 24.276, 22.556], kw: 1946.12, kwRt: 0.60717, deltaT: 6.66 },
  { row: 63, time: '01:01', loadRt: 3219.026025533124, chwsSp: 7.5, cwDtSp: 4.4379, shares: [32.284, 20.781, 24.302, 22.633], kw: 1945.48, kwRt: 0.60437, deltaT: 6.69 },
  { row: 64, time: '01:02', loadRt: 3216.2814996872335, chwsSp: 7.51, cwDtSp: 4.438, shares: [32.383, 20.879, 24.262, 22.476], kw: 1945.17, kwRt: 0.60479, deltaT: 6.68 },
  { row: 65, time: '01:03', loadRt: 3206.5446756326414, chwsSp: 7.52, cwDtSp: 4.4319, shares: [32.421, 20.924, 24.16, 22.495], kw: 1941.51, kwRt: 0.60548, deltaT: 6.67 },
  { row: 66, time: '01:04', loadRt: 3209.4026293431903, chwsSp: 7.52, cwDtSp: 4.4355, shares: [32.215, 20.944, 24.222, 22.619], kw: 1941.53, kwRt: 0.60495, deltaT: 6.67 },
  { row: 67, time: '01:05', loadRt: 3215.6454466875175, chwsSp: 7.52, cwDtSp: 4.441, shares: [32.311, 20.884, 24.175, 22.631], kw: 1940.66, kwRt: 0.60351, deltaT: 6.68 },
  { row: 68, time: '01:06', loadRt: 3214.9597615581465, chwsSp: 7.52, cwDtSp: 4.4449, shares: [32.242, 20.79, 24.184, 22.784], kw: 1943.77, kwRt: 0.6046, deltaT: 6.67 },
  { row: 69, time: '01:07', loadRt: 3216.2019930622687, chwsSp: 7.52, cwDtSp: 4.4347, shares: [32.23, 20.82, 24.262, 22.688], kw: 1943.17, kwRt: 0.60418, deltaT: 6.68 },
  { row: 70, time: '01:08', loadRt: 3218.866774239408, chwsSp: 7.51, cwDtSp: 4.4383, shares: [32.493, 20.851, 24.136, 22.519], kw: 1942.1, kwRt: 0.60335, deltaT: 6.69 },
  { row: 71, time: '01:09', loadRt: 3218.1501434176853, chwsSp: 7.51, cwDtSp: 4.4375, shares: [32.231, 20.911, 24.291, 22.567], kw: 1941.79, kwRt: 0.60339, deltaT: 6.69 },
  { row: 72, time: '01:10', loadRt: 3215.565940062553, chwsSp: 7.52, cwDtSp: 4.4334, shares: [32.251, 20.933, 24.215, 22.601], kw: 1940.88, kwRt: 0.60359, deltaT: 6.68 },
  { row: 73, time: '01:11', loadRt: 3220.06115894228, chwsSp: 7.51, cwDtSp: 4.4431, shares: [32.318, 20.985, 24.09, 22.608], kw: 1940.28, kwRt: 0.60256, deltaT: 6.69 },
  { row: 74, time: '01:12', loadRt: 3222.322574921808, chwsSp: 7.5, cwDtSp: 4.4526, shares: [32.328, 20.955, 24.119, 22.597], kw: 1938.45, kwRt: 0.60157, deltaT: 6.7 },
  { row: 75, time: '01:13', loadRt: 3223.9174682968433, chwsSp: 7.49, cwDtSp: 4.4447, shares: [32.207, 20.96, 24.217, 22.616], kw: 1938.56, kwRt: 0.60131, deltaT: 6.7 },
  { row: 76, time: '01:14', loadRt: 3228.649421723059, chwsSp: 7.48, cwDtSp: 4.46, shares: [32.331, 20.843, 24.149, 22.677], kw: 1937.49, kwRt: 0.60009, deltaT: 6.71 },
  { row: 77, time: '01:15', loadRt: 3212.30616843901, chwsSp: 7.49, cwDtSp: 4.4364, shares: [32.244, 20.912, 24.182, 22.661], kw: 1936.68, kwRt: 0.60289, deltaT: 6.68 },
  { row: 78, time: '01:16', loadRt: 3218.6278972988343, chwsSp: 7.49, cwDtSp: 4.4429, shares: [32.412, 20.842, 24.087, 22.659], kw: 1937.16, kwRt: 0.60186, deltaT: 6.69 },
  { row: 79, time: '01:17', loadRt: 3223.0073078760306, chwsSp: 7.49, cwDtSp: 4.4412, shares: [32.009, 20.999, 24.089, 22.903], kw: 1935.35, kwRt: 0.60048, deltaT: 6.69 },
  { row: 80, time: '01:18', loadRt: 3212.1471551890813, chwsSp: 7.5, cwDtSp: 4.4377, shares: [32.244, 20.974, 24.134, 22.648], kw: 1935.85, kwRt: 0.60267, deltaT: 6.68 },
  { row: 81, time: '01:19', loadRt: 3215.0093936878025, chwsSp: 7.5, cwDtSp: 4.4343, shares: [32.329, 21.02, 24.11, 22.542], kw: 1934.12, kwRt: 0.60159, deltaT: 6.68 },
  { row: 82, time: '01:20', loadRt: 3205.77995996588, chwsSp: 7.5, cwDtSp: 4.4276, shares: [32.295, 21.01, 24.111, 22.584], kw: 1935.37, kwRt: 0.60371, deltaT: 6.66 },
  { row: 83, time: '01:21', loadRt: 3206.7828384418535, chwsSp: 7.5, cwDtSp: 4.4419, shares: [32.39, 20.99, 24.08, 22.54], kw: 1934.17, kwRt: 0.60315, deltaT: 6.67 },
  { row: 84, time: '01:22', loadRt: 3207.365331589422, chwsSp: 7.5, cwDtSp: 4.4327, shares: [32.233, 21.041, 24.188, 22.537], kw: 1934.52, kwRt: 0.60315, deltaT: 6.66 },
  { row: 85, time: '01:23', loadRt: 3200.1518907023033, chwsSp: 7.5, cwDtSp: 4.4205, shares: [32.342, 21.042, 24.14, 22.476], kw: 1934.3, kwRt: 0.60444, deltaT: 6.66 },
  { row: 86, time: '01:24', loadRt: 3212.1471551890813, chwsSp: 7.5, cwDtSp: 4.4272, shares: [32.285, 21.051, 24.088, 22.577], kw: 1936.09, kwRt: 0.60274, deltaT: 6.68 },
  { row: 87, time: '01:25', loadRt: 3206.4933771964743, chwsSp: 7.51, cwDtSp: 4.4236, shares: [32.298, 21.004, 24.167, 22.53], kw: 1936.15, kwRt: 0.60382, deltaT: 6.66 },
  { row: 88, time: '01:26', loadRt: 3200.706770770543, chwsSp: 7.51, cwDtSp: 4.417, shares: [32.262, 20.994, 24.113, 22.631], kw: 1936.79, kwRt: 0.60511, deltaT: 6.66 },
  { row: 89, time: '01:27', loadRt: 3200.5707287460905, chwsSp: 7.52, cwDtSp: 4.4138, shares: [32.244, 20.865, 24.204, 22.686], kw: 1935.66, kwRt: 0.60479, deltaT: 6.65 },
  { row: 90, time: '01:28', loadRt: 3197.0089985783334, chwsSp: 7.51, cwDtSp: 4.4241, shares: [32.209, 20.867, 24.19, 22.734], kw: 1936.73, kwRt: 0.60579, deltaT: 6.65 },
  { row: 91, time: '01:29', loadRt: 3198.9877375604206, chwsSp: 7.5, cwDtSp: 4.4224, shares: [32.226, 20.9, 24.272, 22.602], kw: 1937.14, kwRt: 0.60555, deltaT: 6.65 },
  { row: 92, time: '01:30', loadRt: 3201.362224338926, chwsSp: 7.5, cwDtSp: 4.4276, shares: [32.182, 21.004, 24.174, 22.64], kw: 1940.07, kwRt: 0.60601, deltaT: 6.65 },
  { row: 93, time: '01:31', loadRt: 3195.7578404321866, chwsSp: 7.51, cwDtSp: 4.412, shares: [32.227, 21.012, 24.294, 22.467], kw: 1937.57, kwRt: 0.60629, deltaT: 6.64 },
  { row: 94, time: '01:32', loadRt: 3190.944952118283, chwsSp: 7.51, cwDtSp: 4.4057, shares: [32.333, 20.936, 24.28, 22.451], kw: 1936.02, kwRt: 0.60672, deltaT: 6.63 },
  { row: 95, time: '01:33', loadRt: 3183.8470814899074, chwsSp: 7.51, cwDtSp: 4.4005, shares: [32.252, 20.968, 24.276, 22.505], kw: 1936.45, kwRt: 0.60821, deltaT: 6.62 },
  { row: 96, time: '01:34', loadRt: 3192.2075363662216, chwsSp: 7.5, cwDtSp: 4.4202, shares: [32.297, 20.938, 24.238, 22.527], kw: 1933.62, kwRt: 0.60573, deltaT: 6.63 },
  { row: 97, time: '01:35', loadRt: 3178.565603980665, chwsSp: 7.5, cwDtSp: 4.3906, shares: [32.328, 20.851, 24.32, 22.501], kw: 1932.25, kwRt: 0.6079, deltaT: 6.61 },
  { row: 98, time: '01:36', loadRt: 3198.117092408303, chwsSp: 7.47, cwDtSp: 4.4152, shares: [32.214, 20.984, 24.348, 22.454], kw: 1928.27, kwRt: 0.60294, deltaT: 6.65 },
  { row: 99, time: '01:37', loadRt: 3192.9917716235427, chwsSp: 7.47, cwDtSp: 4.4032, shares: [32.197, 20.982, 24.364, 22.456], kw: 1924.61, kwRt: 0.60276, deltaT: 6.64 },
  { row: 100, time: '01:38', loadRt: 3174.946624282058, chwsSp: 7.5, cwDtSp: 4.3913, shares: [32.109, 21.044, 24.41, 22.436], kw: 1922.65, kwRt: 0.60557, deltaT: 6.61 },
  { row: 101, time: '01:39', loadRt: 3175.969379414274, chwsSp: 7.5, cwDtSp: 4.3819, shares: [32.193, 20.929, 24.385, 22.493], kw: 1920.62, kwRt: 0.60474, deltaT: 6.61 },
  { row: 102, time: '01:40', loadRt: 3175.5760120557293, chwsSp: 7.5, cwDtSp: 4.3849, shares: [32.45, 20.824, 24.307, 22.419], kw: 1920.19, kwRt: 0.60467, deltaT: 6.61 },
  { row: 103, time: '01:41', loadRt: 3175.249415979528, chwsSp: 7.5, cwDtSp: 4.3816, shares: [32.167, 20.96, 24.316, 22.557], kw: 1919.25, kwRt: 0.60444, deltaT: 6.6 },
  { row: 104, time: '01:42', loadRt: 3165.183258345181, chwsSp: 7.5, cwDtSp: 4.3702, shares: [32.3, 20.879, 24.255, 22.566], kw: 1922.42, kwRt: 0.60736, deltaT: 6.59 },
  { row: 105, time: '01:43', loadRt: 3164.5557749218087, chwsSp: 7.5, cwDtSp: 4.3685, shares: [32.221, 20.927, 24.308, 22.543], kw: 1923.71, kwRt: 0.60789, deltaT: 6.59 },
  { row: 106, time: '01:44', loadRt: 3152.9604239977252, chwsSp: 7.53, cwDtSp: 4.3554, shares: [32.386, 20.99, 24.241, 22.383], kw: 1922.76, kwRt: 0.60983, deltaT: 6.56 },
  { row: 107, time: '01:45', loadRt: 3166.8304023315327, chwsSp: 7.51, cwDtSp: 4.3803, shares: [32.345, 21.116, 24.268, 22.271], kw: 1924.72, kwRt: 0.60777, deltaT: 6.59 },
  { row: 108, time: '01:46', loadRt: 3175.4973385840203, chwsSp: 7.48, cwDtSp: 4.382, shares: [32.198, 21.139, 24.333, 22.33], kw: 1921.72, kwRt: 0.60517, deltaT: 6.61 },
  { row: 109, time: '01:47', loadRt: 3178.565603980665, chwsSp: 7.49, cwDtSp: 4.386, shares: [32.066, 21.1, 24.372, 22.461], kw: 1916.62, kwRt: 0.60298, deltaT: 6.61 },
  { row: 110, time: '01:48', loadRt: 3175.8907059425637, chwsSp: 7.49, cwDtSp: 4.3822, shares: [32.294, 21.143, 24.29, 22.273], kw: 1913.3, kwRt: 0.60245, deltaT: 6.61 },
  { row: 111, time: '01:49', loadRt: 3179.907456809781, chwsSp: 7.48, cwDtSp: 4.3908, shares: [32.217, 21.222, 24.299, 22.262], kw: 1913.41, kwRt: 0.60172, deltaT: 6.62 },
  { row: 112, time: '01:50', loadRt: 3169.1221688939445, chwsSp: 7.49, cwDtSp: 4.3738, shares: [32.371, 21.069, 24.214, 22.346], kw: 1913.26, kwRt: 0.60372, deltaT: 6.6 },
  { row: 113, time: '01:51', loadRt: 3166.4382251919255, chwsSp: 7.49, cwDtSp: 4.3725, shares: [32.152, 21.201, 24.203, 22.444], kw: 1909.74, kwRt: 0.60312, deltaT: 6.59 },
  { row: 114, time: '01:52', loadRt: 3174.86795081035, chwsSp: 7.49, cwDtSp: 4.3812, shares: [32.163, 21.249, 24.238, 22.349], kw: 1911.2, kwRt: 0.60198, deltaT: 6.61 },
  { row: 115, time: '01:53', loadRt: 3172.971336934888, chwsSp: 7.49, cwDtSp: 4.3892, shares: [32.177, 21.231, 24.233, 22.358], kw: 1911.65, kwRt: 0.60248, deltaT: 6.6 },
  { row: 116, time: '01:54', loadRt: 3167.70818879727, chwsSp: 7.51, cwDtSp: 4.3654, shares: [32.172, 21.331, 24.16, 22.337], kw: 1909.8, kwRt: 0.6029, deltaT: 6.6 },
  { row: 117, time: '01:55', loadRt: 3149.29074097242, chwsSp: 7.53, cwDtSp: 4.3527, shares: [32.167, 21.283, 24.214, 22.336], kw: 1909.64, kwRt: 0.60637, deltaT: 6.56 },
  { row: 118, time: '01:56', loadRt: 3155.524631674723, chwsSp: 7.52, cwDtSp: 4.3607, shares: [32.206, 21.282, 24.175, 22.338], kw: 1911.36, kwRt: 0.60572, deltaT: 6.58 },
  { row: 119, time: '01:57', loadRt: 3156.934326983224, chwsSp: 7.51, cwDtSp: 4.3651, shares: [32.112, 21.31, 24.233, 22.344], kw: 1911.55, kwRt: 0.60551, deltaT: 6.58 },
  { row: 120, time: '01:58', loadRt: 3170.7769302814895, chwsSp: 7.49, cwDtSp: 4.3674, shares: [32.109, 21.382, 24.27, 22.238], kw: 1912.11, kwRt: 0.60304, deltaT: 6.61 },
  { row: 121, time: '01:59', loadRt: 3166.372763150412, chwsSp: 7.49, cwDtSp: 4.3638, shares: [32.199, 21.359, 24.271, 22.17], kw: 1910.0, kwRt: 0.60321, deltaT: 6.6 },
  { row: 122, time: '02:00', loadRt: 3159.6143429627527, chwsSp: 7.5, cwDtSp: 4.3624, shares: [32.203, 21.37, 24.261, 22.166], kw: 1907.41, kwRt: 0.60368, deltaT: 6.59 },
  { row: 123, time: '02:01', loadRt: 3154.1932527722497, chwsSp: 7.49, cwDtSp: 4.3689, shares: [32.186, 21.254, 24.289, 22.271], kw: 1907.63, kwRt: 0.60479, deltaT: 6.58 },
  { row: 124, time: '02:02', loadRt: 3150.8071989195337, chwsSp: 7.5, cwDtSp: 4.3867, shares: [32.235, 21.173, 24.342, 22.25], kw: 1907.02, kwRt: 0.60525, deltaT: 6.57 },
  { row: 125, time: '02:03', loadRt: 3152.21475183395, chwsSp: 7.48, cwDtSp: 4.3511, shares: [32.277, 21.066, 24.358, 22.299], kw: 1904.45, kwRt: 0.60416, deltaT: 6.57 },
  { row: 126, time: '02:04', loadRt: 3151.745567529144, chwsSp: 7.48, cwDtSp: 4.3482, shares: [32.314, 21.07, 24.342, 22.274], kw: 1904.11, kwRt: 0.60414, deltaT: 6.57 },
  { row: 127, time: '02:05', loadRt: 3148.1195655388105, chwsSp: 7.48, cwDtSp: 4.3537, shares: [32.492, 21.035, 24.261, 22.212], kw: 1900.1, kwRt: 0.60357, deltaT: 6.56 },
  { row: 128, time: '02:06', loadRt: 3140.8259038953647, chwsSp: 7.48, cwDtSp: 4.3388, shares: [32.567, 21.109, 24.063, 22.261], kw: 1899.85, kwRt: 0.60489, deltaT: 6.55 },
  { row: 129, time: '02:07', loadRt: 3127.2940667614444, chwsSp: 7.49, cwDtSp: 4.3273, shares: [32.547, 21.187, 23.856, 22.411], kw: 1889.02, kwRt: 0.60404, deltaT: 6.52 },
  { row: 130, time: '02:08', loadRt: 3123.7373355132213, chwsSp: 7.49, cwDtSp: 4.3111, shares: [32.541, 21.085, 23.928, 22.445], kw: 1892.89, kwRt: 0.60597, deltaT: 6.51 },
  { row: 131, time: '02:09', loadRt: 3118.5521467159515, chwsSp: 7.49, cwDtSp: 4.3065, shares: [32.588, 21.092, 23.837, 22.483], kw: 1891.64, kwRt: 0.60658, deltaT: 6.5 },
  { row: 132, time: '02:10', loadRt: 3123.4274025021323, chwsSp: 7.48, cwDtSp: 4.3186, shares: [32.511, 21.124, 23.847, 22.518], kw: 1891.9, kwRt: 0.60571, deltaT: 6.51 },
  { row: 133, time: '02:11', loadRt: 3108.424454762582, chwsSp: 7.49, cwDtSp: 4.2943, shares: [32.637, 21.095, 23.861, 22.408], kw: 1888.9, kwRt: 0.60767, deltaT: 6.49 },
  { row: 134, time: '02:12', loadRt: 3114.683935172021, chwsSp: 7.49, cwDtSp: 4.3067, shares: [32.566, 21.089, 23.864, 22.481], kw: 1884.93, kwRt: 0.60518, deltaT: 6.5 },
];

export const mvRowById = (scenarioId: string | undefined): T1MvRow | undefined => {
  const m = /^row-(\d+)$/.exec(scenarioId ?? '');
  return m ? T1_MV_ROWS.find((r) => r.row === Number(m[1])) : undefined;
};

/** Scenario payload replaying every operator input of one dataset row. */
export function buildRowReplayPayload(r: T1MvRow) {
  return {
    id: `row-${r.row}`,
    label: `Dataset row ${r.row} (${r.time})`,
    precise: true,
    duty: {
      chiller: [...DUTY_DEFAULTS.chiller],
      chwp: [...DUTY_DEFAULTS.chwp],
      cwp: [...DUTY_DEFAULTS.cwp],
      ct: [...DUTY_DEFAULTS.ct],
    },
    controls: {
      'ctrl-building-load': r.loadRt,
      'ctrl-chws-sp': r.chwsSp,
      'ctrl-cw-dt-sp': r.cwDtSp,
      'ctrl-riser-finger': r.shares[0],
      'ctrl-riser-l13': r.shares[1],
      'ctrl-riser-main': r.shares[2],
      'ctrl-riser-t1u': r.shares[3],
      'ctrl-ambient-temp': 31,
      'ctrl-humidity': 65,
      'ctrl-cws-sp': 29,
      'ctrl-dp-sp': 15,
      'ctrl-dp-sp-high': 12,
      'ctrl-ct-fan': 0,
      'ctrl-pump-spd': 0,
      'ctrl-cwp-spd': 0,
      'ctrl-ch-enable': 1,
    },
    advanceSec: 0,
  };
}
