(function () {
  'use strict';
  window.Domino = {};
  window.Domino.config = {
    width: 0.60, height: 1.20, thickness: 0.16, spacing: 0.48,
    maxCount: 400, maxTurn: Math.PI / 12, step: 1 / 120,
    maxSubsteps: 8, maxPlacements: 12, cellSize: 2,
    notes: [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25],
    noteCycle: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1],
    paper: [246 / 255, 244 / 255, 239 / 255]
  };
}());
