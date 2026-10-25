(function (root, factory) {
  const planner = typeof module === "object" && module.exports
    ? require("./route-planner.js")
    : root.AquaAlertRoutePlanner;
  const analytics = factory(planner);
  if (typeof module === "object" && module.exports) {
    module.exports = analytics;
  }
  root.AquaAlertReportAnalytics = analytics;
})(typeof globalThis === "undefined" ? this : globalThis, function (planner) {
  "use strict";

  function distanceMeters(first, second) {
    const radians = Math.PI / 180;
    const latitudeDelta = (second.latitude - first.latitude) * radians;
    const longitudeDelta = (second.longitude - first.longitude) * radians;
    const firstLatitude = first.latitude * radians;
    const secondLatitude = second.latitude * radians;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(firstLatitude) * Math.cos(secondLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
    return 6371000 * 2 * Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(1 - haversine)
    );
  }

  function analyzeHotspots(reports, epsilonMeters = 350, minPoints = 3) {
    if (!Number.isFinite(epsilonMeters) || epsilonMeters <= 0
        || !Number.isInteger(minPoints) || minPoints < 2) {
      throw new RangeError("DBSCAN requires a positive radius and minPoints of at least 2");
    }

    const points = planner.validReports(reports);
    const labels = new Array(points.length).fill(0);
    const clusters = [];
    let clusterId = 0;

    function neighborsOf(pointIndex) {
      return points.reduce((neighbors, point, index) => {
        if (distanceMeters(points[pointIndex], point) <= epsilonMeters) {
          neighbors.push(index);
        }
        return neighbors;
      }, []);
    }

    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      if (labels[pointIndex] !== 0) {
        continue;
      }

      const initialNeighbors = neighborsOf(pointIndex);
      if (initialNeighbors.length < minPoints) {
        labels[pointIndex] = -1;
        continue;
      }

      clusterId++;
      labels[pointIndex] = clusterId;
      const queue = initialNeighbors.slice();
      const queued = new Set(queue);

      for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
        const candidate = queue[queueIndex];
        if (labels[candidate] === -1) {
          labels[candidate] = clusterId;
        }
        if (labels[candidate] !== 0) {
          continue;
        }

        labels[candidate] = clusterId;
        const candidateNeighbors = neighborsOf(candidate);
        if (candidateNeighbors.length >= minPoints) {
          for (const neighbor of candidateNeighbors) {
            if (!queued.has(neighbor)) {
              queued.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
    }

    const summaries = [];
    for (let id = 1; id <= clusterId; id++) {
      const members = points.filter((point, index) => labels[index] === id);
      const severityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const member of members) {
        severityCounts[String(member.severity).trim().toUpperCase()]++;
      }
      summaries.push({
        id,
        reportCount: members.length,
        center: {
          latitude: members.reduce((sum, point) => sum + point.latitude, 0)
            / members.length,
          longitude: members.reduce((sum, point) => sum + point.longitude, 0)
            / members.length
        },
        severityCounts
      });
    }

    return {
      eligibleReportCount: points.length,
      insufficientData: points.length < minPoints,
      noiseCount: labels.filter(label => label === -1).length,
      clusters: summaries,
      epsilonMeters,
      minPoints
    };
  }

  return { analyzeHotspots };
});
