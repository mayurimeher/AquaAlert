const assert = require("node:assert/strict");
const test = require("node:test");
const { analyzeHotspots } = require("../../main/resources/static/js/report-analytics.js");

test("DBSCAN groups valid nearby reports and excludes reports without coordinates", () => {
  const result = analyzeHotspots([
    { latitude: 18.6000, longitude: 73.8000, severity: "HIGH" },
    { latitude: 18.6001, longitude: 73.8001, severity: "MEDIUM" },
    { latitude: 18.5999, longitude: 73.8000, severity: "LOW" },
    { latitude: null, longitude: null, severity: "HIGH" },
    { latitude: 91, longitude: 73.8, severity: "HIGH" }
  ]);

  assert.equal(result.eligibleReportCount, 3);
  assert.equal(result.insufficientData, false);
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].reportCount, 3);
  assert.deepEqual(result.clusters[0].severityCounts, {
    HIGH: 1, MEDIUM: 1, LOW: 1
  });
});

test("DBSCAN reports insufficient data and no clusters when points are sparse", () => {
  const result = analyzeHotspots([
    { latitude: 18.6, longitude: 73.8, severity: "HIGH" },
    { latitude: null, longitude: null, severity: "LOW" }
  ]);

  assert.equal(result.eligibleReportCount, 1);
  assert.equal(result.insufficientData, true);
  assert.equal(result.clusters.length, 0);
});

test("DBSCAN identifies isolated valid reports as noise when enough points exist", () => {
  const reports = [
    { latitude: 18.60, longitude: 73.80, severity: "LOW" },
    { latitude: 18.61, longitude: 73.81, severity: "MEDIUM" },
    { latitude: 18.62, longitude: 73.82, severity: "HIGH" }
  ];

  const result = analyzeHotspots(reports);
  assert.equal(result.insufficientData, false);
  assert.equal(result.clusters.length, 0);
  assert.equal(result.noiseCount, 3);
});
