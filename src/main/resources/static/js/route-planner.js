(function (root, factory) {
  const planner = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = planner;
  }
  root.AquaAlertRoutePlanner = planner;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const REPORT_PROXIMITY_METERS = 180;
  const RISK_PENALTY_KM_PER_POINT = 0.4;
  const SEVERITY_WEIGHTS = { LOW: 1, MEDIUM: 3, HIGH: 6 };

  // Illustrative points and straight sample links only; these are not surveyed roads.
  const SAMPLE_ROAD_NETWORK = {
    nodes: [
      { id: "west", name: "West Demo Junction", latitude: 18.632, longitude: 73.7935 },
      { id: "central", name: "Central Demo Junction", latitude: 18.6298, longitude: 73.7997 },
      { id: "east", name: "East Demo Junction", latitude: 18.6285, longitude: 73.806 },
      { id: "north", name: "North Demo Junction", latitude: 18.6355, longitude: 73.8 },
      { id: "northeast", name: "North-East Demo Junction", latitude: 18.634, longitude: 73.806 },
      { id: "south", name: "South Demo Junction", latitude: 18.6235, longitude: 73.799 },
      { id: "southeast", name: "South-East Demo Junction", latitude: 18.6225, longitude: 73.8055 }
    ],
    edges: [
      { from: "west", to: "central", name: "West-Central Sample Link" },
      { from: "central", to: "east", name: "Central-East Sample Link" },
      { from: "west", to: "north", name: "West-North Sample Link" },
      { from: "north", to: "northeast", name: "North Connector Sample Link" },
      { from: "northeast", to: "east", name: "North-East Sample Link" },
      { from: "central", to: "south", name: "Central-South Sample Link" },
      { from: "south", to: "southeast", name: "South Connector Sample Link" },
      { from: "southeast", to: "east", name: "South-East Sample Link" }
    ]
  };

  function validReport(report) {
    const severity = String(report && report.severity || "").trim().toUpperCase();
    return report
      && Number.isFinite(report.latitude)
      && report.latitude >= -90 && report.latitude <= 90
      && Number.isFinite(report.longitude)
      && report.longitude >= -180 && report.longitude <= 180
      && Object.prototype.hasOwnProperty.call(SEVERITY_WEIGHTS, severity);
  }

  function validReports(reports) {
    return Array.isArray(reports) ? reports.filter(validReport) : [];
  }

  function toLocalMeters(latitude, longitude, originLatitude) {
    const radians = Math.PI / 180;
    return {
      x: longitude * radians * 6371000 * Math.cos(originLatitude * radians),
      y: latitude * radians * 6371000
    };
  }

  function distancePointToSegmentMeters(point, start, end) {
    const originLatitude = (start.latitude + end.latitude + point.latitude) / 3;
    const localStart = toLocalMeters(start.latitude, start.longitude, originLatitude);
    const localEnd = toLocalMeters(end.latitude, end.longitude, originLatitude);
    const localPoint = toLocalMeters(point.latitude, point.longitude, originLatitude);
    const segmentX = localEnd.x - localStart.x;
    const segmentY = localEnd.y - localStart.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection = segmentLengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1,
        ((localPoint.x - localStart.x) * segmentX
          + (localPoint.y - localStart.y) * segmentY) / segmentLengthSquared));
    const closestX = localStart.x + projection * segmentX;
    const closestY = localStart.y + projection * segmentY;
    return Math.hypot(localPoint.x - closestX, localPoint.y - closestY);
  }

  function distanceKm(start, end) {
    const radians = Math.PI / 180;
    const latitudeDelta = (end.latitude - start.latitude) * radians;
    const longitudeDelta = (end.longitude - start.longitude) * radians;
    const startLatitude = start.latitude * radians;
    const endLatitude = end.latitude * radians;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(startLatitude) * Math.cos(endLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  function edgeRiskScore(edge, nodesById, reports) {
    const start = nodesById.get(edge.from);
    const end = nodesById.get(edge.to);
    return reports.reduce((score, report) => {
      const proximity = distancePointToSegmentMeters(report, start, end);
      if (proximity >= REPORT_PROXIMITY_METERS) {
        return score;
      }
      const severity = String(report.severity).trim().toUpperCase();
      const proximityFactor = 1 - proximity / REPORT_PROXIMITY_METERS;
      return score + SEVERITY_WEIGHTS[severity] * proximityFactor;
    }, 0);
  }

  function findRoute(network, startId, destinationId, reports, strategy) {
    if (!network || !Array.isArray(network.nodes) || !Array.isArray(network.edges)
        || !["distance", "lower-risk"].includes(strategy)) {
      return null;
    }

    const nodesById = new Map(network.nodes.map(node => [node.id, node]));
    if (!nodesById.has(startId) || !nodesById.has(destinationId)) {
      return null;
    }

    const usableReports = validReports(reports);
    const adjacency = new Map(network.nodes.map(node => [node.id, []]));
    for (const edge of network.edges) {
      const start = nodesById.get(edge.from);
      const end = nodesById.get(edge.to);
      if (!start || !end) {
        continue;
      }
      const distance = distanceKm(start, end);
      const riskScore = edgeRiskScore(edge, nodesById, usableReports);
      const penalty = riskScore * RISK_PENALTY_KM_PER_POINT;
      const weight = distance + (strategy === "lower-risk" ? penalty : 0);
      adjacency.get(edge.from).push({
        nodeId: edge.to, distance, riskScore, penalty, weight
      });
      adjacency.get(edge.to).push({
        nodeId: edge.from, distance, riskScore, penalty, weight
      });
    }

    const costs = new Map(network.nodes.map(node => [node.id, Infinity]));
    const previous = new Map();
    const settled = new Set();
    costs.set(startId, 0);

    while (settled.size < network.nodes.length) {
      let currentId = null;
      let currentCost = Infinity;
      for (const [nodeId, cost] of costs) {
        if (!settled.has(nodeId) && cost < currentCost) {
          currentId = nodeId;
          currentCost = cost;
        }
      }
      if (currentId === null || currentCost === Infinity) {
        break;
      }
      if (currentId === destinationId) {
        break;
      }

      settled.add(currentId);
      for (const edge of adjacency.get(currentId)) {
        if (settled.has(edge.nodeId)) {
          continue;
        }
        const candidateCost = currentCost + edge.weight;
        if (candidateCost < costs.get(edge.nodeId)) {
          costs.set(edge.nodeId, candidateCost);
          previous.set(edge.nodeId, { nodeId: currentId, edge });
        }
      }
    }

    if (startId !== destinationId && !previous.has(destinationId)) {
      return null;
    }

    const path = [destinationId];
    const pathEdges = [];
    let currentId = destinationId;
    while (currentId !== startId) {
      const previousStep = previous.get(currentId);
      if (!previousStep) {
        return null;
      }
      pathEdges.unshift(previousStep.edge);
      currentId = previousStep.nodeId;
      path.unshift(currentId);
    }

    return {
      nodeIds: path,
      distanceKm: pathEdges.reduce((sum, edge) => sum + edge.distance, 0),
      riskScore: pathEdges.reduce((sum, edge) => sum + edge.riskScore, 0),
      riskPenaltyKm: pathEdges.reduce((sum, edge) => sum + edge.penalty, 0),
      objectiveCost: costs.get(destinationId)
    };
  }

  return {
    REPORT_PROXIMITY_METERS,
    RISK_PENALTY_KM_PER_POINT,
    SAMPLE_ROAD_NETWORK,
    distancePointToSegmentMeters,
    edgeRiskScore,
    findRoute,
    validReports
  };
});
