
package com.aquaalert.repository;

import com.aquaalert.model.WaterloggingReport;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaterloggingReportRepository
        extends JpaRepository<WaterloggingReport, Long> {
}
