const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findRoute,
  validReports
} = require("../../main/resources/static/js/route-planner.js");

const network = {
  nodes: [
    { id: "A", latitude: 18.0, longitude: 73.0 },
    { id: "B", latitude: 18.0, longitude: 73.01 },
    { id: "C", latitude: 18.01, longitude: 73.0 },
    { id: "D", latitude: 18.0, longitude: 73.02 },
    { id: "Z", latitude: 18.02, longitude: 73.02 }
  ],
  edges: [
    { from: "A", to: "B", name: "Short route west segment" },
    { from: "B", to: "D", name: "Short route east segment" },
    { from: "A", to: "C", name: "Alternative south segment" },
    { from: "C", to: "D", name: "Alternative north segment" }
  ]
};

test("Dijkstra selects the shorter path and returns null for unreachable destinations", () => {
  const route = findRoute(network, "A", "D", [], "distance");
  assert.deepEqual(route.nodeIds, ["A", "B", "D"]);
  assert.ok(route.distanceKm > 0);
  assert.equal(findRoute(network, "A", "Z", [], "distance"), null);
});

test("risk penalties divert the lower-risk route from a nearby high-severity report", () => {
  const report = {
    latitude: 18.0,
    longitude: 73.01,
    severity: "HIGH"
  };

  const shortest = findRoute(network, "A", "D", [report], "distance");
  const lowerRisk = findRoute(network, "A", "D", [report], "lower-risk");

  assert.deepEqual(shortest.nodeIds, ["A", "B", "D"]);
  assert.deepEqual(lowerRisk.nodeIds, ["A", "C", "D"]);
  assert.ok(lowerRisk.distanceKm > shortest.distanceKm);
  assert.equal(lowerRisk.riskScore, 0);
  assert.ok(shortest.riskScore > 0);
});

test("reports without valid coordinates or known severity do not contribute risk", () => {
  const reports = [
    { latitude: null, longitude: null, severity: "HIGH" },
    { latitude: 18.0, longitude: 73.01, severity: "UNKNOWN" },
    { latitude: 91, longitude: 73.01, severity: "HIGH" }
  ];

  assert.equal(validReports(reports).length, 0);
  assert.equal(findRoute(network, "A", "D", reports, "lower-risk").riskScore, 0);
});

test("accepts a saved backend-shaped HIGH report with latitude and longitude", () => {
  const apiReports = [{
    id: 42,
    location: "Central Junction",
    severity: "HIGH",
    description: "Flooded section",
    latitude: 18.0,
    longitude: 73.01
  }];

  assert.deepEqual(validReports(apiReports), apiReports);
  const shortestRoute = findRoute(network, "A", "D", apiReports, "distance");
  const lowerRiskRoute = findRoute(network, "A", "D", apiReports, "lower-risk");
  assert.ok(shortestRoute.riskScore > 0);
  assert.ok(lowerRiskRoute.riskScore < shortestRoute.riskScore);
});
