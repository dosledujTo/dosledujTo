// Najnovší z pohybov — hodnota s najväčším epoch (prvý prvok).
export default function (keys, values, rereduce) {
  var best = null;
  for (var i = 0; i < values.length; i++) {
    if (!best || values[i][0] > best[0]) best = values[i];
  }
  return best;
}
