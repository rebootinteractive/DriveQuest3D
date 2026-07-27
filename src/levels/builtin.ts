import type { LevelData } from '../shared/types';

// Authored with the in-repo generator and verified solvable-by-ordering before
// being committed. Every path entry is [longitude, latitude] in degrees; the first
// point is where the car starts and the last is its parking bay.

/** 3 cars · 2 waves · 1 blocked at the start. */
const level1: LevelData = {
  id: 'l1-test-drive',
  name: 'Test Drive',
  lives: 5,
  cars: [
    {
      id: 'c1',
      color: 'red',
      path: [[-22.022, -65.158], [-54.18, -49.033], [-80.322, -35.662]],
    },
    {
      id: 'c2',
      color: 'yellow',
      path: [[0.693, -5.081], [10.09, 16.281], [37.436, 4.795], [51.716, 19.007]],
    },
    {
      id: 'c3',
      color: 'mint',
      path: [[-82.6, -31.479], [-66.976, -42.737], [-75.832, -58.544]],
    },
  ],
};

/** 6 cars · 4 waves · 4 blocked at the start. */
const level2: LevelData = {
  id: 'l2-rush-hour',
  name: 'Rush Hour',
  lives: 4,
  cars: [
    {
      id: 'c1',
      color: 'red',
      path: [[-155.349, 62.13], [-168.1, 35.277], [151.85, 24.928], [154.2, -2.136]],
    },
    {
      id: 'c2',
      color: 'yellow',
      path: [[142.558, 26.056], [-178.983, 5.915], [-136.975, 11.283]],
    },
    {
      id: 'c3',
      color: 'mint',
      path: [[-129.009, 15.451], [-141.314, 26.031], [-157.731, 21.697]],
    },
    {
      id: 'c4',
      color: 'blue',
      path: [[61.798, 62.256], [-110.59, 71.803], [-146.109, 30.129]],
    },
    {
      id: 'c5',
      color: 'purple',
      path: [[162.192, -27.007], [152.828, -38.564], [153.803, -52.512]],
    },
    {
      id: 'c6',
      color: 'orange',
      path: [[-71.505, 32.207], [-76.801, 57.139], [-121.312, 36.146], [-148.378, 48.797]],
    },
  ],
};

/** 9 cars · 4 waves · 6 blocked at the start. */
const level3: LevelData = {
  id: 'l3-total-gridlock',
  name: 'Total Gridlock',
  lives: 3,
  cars: [
    {
      id: 'c1',
      color: 'red',
      path: [[-89.223, 54.415], [-70.422, 25.214], [-87.237, -2.723]],
    },
    {
      id: 'c2',
      color: 'yellow',
      path: [[-179.252, 37.679], [148.87, 72.994], [76.894, 48.999]],
    },
    {
      id: 'c3',
      color: 'mint',
      path: [[-86.018, 1.67], [-50.713, 15.98], [-14.497, 35.264]],
    },
    {
      id: 'c4',
      color: 'blue',
      path: [[59.07, 71.09], [27.812, 40.765], [-4.339, 20.241]],
    },
    {
      id: 'c5',
      color: 'purple',
      path: [[-156.984, -14.484], [-123.654, -9.41], [-95.748, 8.323]],
    },
    {
      id: 'c6',
      color: 'orange',
      path: [[-31.191, 14.945], [-41.817, -2.632], [-59.098, -13.957]],
    },
    {
      id: 'c7',
      color: 'pink',
      path: [[122.021, 19.454], [112.576, 2.947], [93.81, 5.704]],
    },
    {
      id: 'c8',
      color: 'lime',
      path: [[-99.825, -50.14], [-54.726, -50.364], [-0.955, -54.558], [15.066, -29.016]],
    },
    {
      id: 'c9',
      color: 'red',
      path: [[22.857, 21.599], [5.98, 46.529], [-32.912, 29.936], [-63.137, 35.719]],
    },
  ],
};

export const BUILTIN_LEVELS: LevelData[] = [level1, level2, level3];
