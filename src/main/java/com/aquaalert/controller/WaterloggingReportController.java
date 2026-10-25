
package com.aquaalert.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aquaalert.model.WaterloggingReport;
import com.aquaalert.repository.WaterloggingReportRepository;

@RestController
@RequestMapping("/api/reports")
@CrossOrigin(origins = "*")
public class WaterloggingReportController {

    private final WaterloggingReportRepository repository;

    public WaterloggingReportController(
            WaterloggingReportRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public ResponseEntity<?> createReport(
            @RequestBody(required = false) WaterloggingReport report) {

        if (report == null) {
            return ResponseEntity.badRequest().body(
                    Map.of("message", "Report details are required"));
        }

        if (report.getLocation() == null
                || report.getLocation().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(
                    Map.of("message", "Location is required"));
        }

        if (report.getSeverity() == null
                || report.getSeverity().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(
                    Map.of("message", "Severity is required"));
        }

        report.setLocation(report.getLocation().trim());
        report.setSeverity(
                report.getSeverity().trim().toUpperCase());

        if (!List.of("LOW", "MEDIUM", "HIGH")
                .contains(report.getSeverity())) {
            return ResponseEntity.badRequest().body(
                    Map.of("message",
                            "Severity must be LOW, MEDIUM, or HIGH"));
        }

        Double latitude = report.getLatitude();
        Double longitude = report.getLongitude();
        if ((latitude == null) != (longitude == null)) {
            return ResponseEntity.badRequest().body(
                    Map.of("message",
                            "Latitude and longitude must be provided together"));
        }

        if (latitude != null
                && (!Double.isFinite(latitude)
                        || latitude < -90 || latitude > 90
                        || !Double.isFinite(longitude)
                        || longitude < -180 || longitude > 180)) {
            return ResponseEntity.badRequest().body(
                    Map.of("message",
                            "Latitude must be between -90 and 90 and longitude between -180 and 180"));
        }

        if (report.getDescription() != null) {
            report.setDescription(
                    report.getDescription().trim());
        }

        return ResponseEntity.ok(repository.save(report));
    }

    @GetMapping
    public List<WaterloggingReport> getAllReports() {
        return repository.findAll();
    }
}
