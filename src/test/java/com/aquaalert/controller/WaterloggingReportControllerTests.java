package com.aquaalert.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import com.aquaalert.model.AppUser;
import com.aquaalert.model.WaterloggingReport;
import com.aquaalert.repository.UserRepository;
import com.aquaalert.repository.WaterloggingReportRepository;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class WaterloggingReportControllerTests {

    @Autowired
    private WaterloggingReportController controller;

    @Autowired
    private WaterloggingReportRepository repository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void reportApiRequiresAuthenticationAndValidCsrfToken() throws Exception {
        MvcResult loginPage = mockMvc.perform(get("/login"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie csrfCookie =
                loginPage.getResponse().getCookie("XSRF-TOKEN");
        assertTrue(csrfCookie != null && !csrfCookie.getValue().isBlank());

        mockMvc.perform(post("/api/reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"location":"Protected test","severity":"HIGH"}
                                """))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/reports")
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"location":"Protected test","severity":"HIGH"}
                                """))
                .andExpect(status().is3xxRedirection());

        mockMvc.perform(get("/api/reports"))
                .andExpect(status().is3xxRedirection());
    }

    @Test
    void savesValidSeverityReportsAndReturnsThemInHistory() {
        for (String severity : List.of("LOW", "MEDIUM", "HIGH")) {
            WaterloggingReport report = new WaterloggingReport();
            report.setLocation("Test location " + UUID.randomUUID());
            report.setSeverity(severity);
            report.setDescription("Test report");

            ResponseEntity<?> response = controller.createReport(report);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            WaterloggingReport saved = assertInstanceOf(
                    WaterloggingReport.class, response.getBody());
            assertEquals(severity, saved.getSeverity());
            assertTrue(repository.findById(saved.getId()).isPresent());
            assertTrue(controller.getAllReports().stream()
                    .anyMatch(historyReport ->
                            saved.getId().equals(historyReport.getId())));
        }
    }

    @Test
    void rejectsUnsupportedSeverityWithoutSaving() {
        long reportCount = repository.count();
        WaterloggingReport report = new WaterloggingReport();
        report.setLocation("Invalid severity test");
        report.setSeverity("CRITICAL");

        ResponseEntity<?> response = controller.createReport(report);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals(
                Map.of("message", "Severity must be LOW, MEDIUM, or HIGH"),
                response.getBody());
        assertEquals(reportCount, repository.count());
    }

    @Test
    void savesReportsWithCoordinatesAndKeepsCoordinatesOptional() {
        WaterloggingReport report = new WaterloggingReport();
        report.setLocation("Located report");
        report.setSeverity("HIGH");
        report.setLatitude(18.6298);
        report.setLongitude(73.7997);

        ResponseEntity<?> response = controller.createReport(report);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        WaterloggingReport saved = assertInstanceOf(
                WaterloggingReport.class, response.getBody());
        assertEquals(18.6298, saved.getLatitude());
        assertEquals(73.7997, saved.getLongitude());

        WaterloggingReport legacyReport = new WaterloggingReport();
        legacyReport.setLocation("Report without coordinates");
        legacyReport.setSeverity("LOW");

        ResponseEntity<?> legacyResponse =
                controller.createReport(legacyReport);

        assertEquals(HttpStatus.OK, legacyResponse.getStatusCode());
        WaterloggingReport savedLegacy = assertInstanceOf(
                WaterloggingReport.class, legacyResponse.getBody());
        assertNull(savedLegacy.getLatitude());
        assertNull(savedLegacy.getLongitude());
    }

    @Test
    void getReportsSerializesPersistedHighReportCoordinates() throws Exception {
        WaterloggingReport report = objectMapper.readValue("""
                {
                  "location": "Coordinate API regression",
                  "severity": "HIGH",
                  "description": "Coordinates from report form",
                  "latitude": 18.6298,
                  "longitude": 73.7997
                }
                """, WaterloggingReport.class);

        ResponseEntity<?> response = controller.createReport(report);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        WaterloggingReport saved = assertInstanceOf(
                WaterloggingReport.class, response.getBody());
        repository.flush();
        entityManager.clear();

        String username = "api-coordinate-test-" + UUID.randomUUID();
        String password = UUID.randomUUID().toString();
        AppUser testUser = new AppUser();
        testUser.setUsername(username);
        testUser.setPassword(passwordEncoder.encode(password));
        testUser.setRole("USER");
        userRepository.saveAndFlush(testUser);

        MvcResult loginPage = mockMvc.perform(get("/login"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie csrfCookie =
                loginPage.getResponse().getCookie("XSRF-TOKEN");
        assertTrue(csrfCookie != null && !csrfCookie.getValue().isBlank());

        MvcResult login = mockMvc.perform(post("/login")
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", username)
                        .param("password", password))
                .andExpect(status().is3xxRedirection())
                .andReturn();
        MockHttpSession session = (MockHttpSession)
                login.getRequest().getSession(false);
        assertTrue(session != null);

        MvcResult history = mockMvc.perform(get("/api/reports").session(session))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode reports = objectMapper.readTree(
                history.getResponse().getContentAsString());
        JsonNode jsonReport = null;
        for (JsonNode candidate : reports) {
            if (candidate.path("id").asLong() == saved.getId()) {
                jsonReport = candidate;
                break;
            }
        }

        assertTrue(jsonReport != null);
        assertEquals("HIGH", jsonReport.path("severity").asString());
        assertTrue(jsonReport.has("latitude"));
        assertTrue(jsonReport.has("longitude"));
        assertEquals(18.6298, jsonReport.path("latitude").asDouble());
        assertEquals(73.7997, jsonReport.path("longitude").asDouble());
    }

    @Test
    void rejectsIncompleteOrOutOfRangeCoordinates() {
        WaterloggingReport incomplete = new WaterloggingReport();
        incomplete.setLocation("Incomplete coordinates");
        incomplete.setSeverity("MEDIUM");
        incomplete.setLatitude(18.6298);

        ResponseEntity<?> incompleteResponse =
                controller.createReport(incomplete);

        assertEquals(HttpStatus.BAD_REQUEST, incompleteResponse.getStatusCode());

        WaterloggingReport outOfRange = new WaterloggingReport();
        outOfRange.setLocation("Out of range coordinates");
        outOfRange.setSeverity("MEDIUM");
        outOfRange.setLatitude(91.0);
        outOfRange.setLongitude(73.7997);

        ResponseEntity<?> outOfRangeResponse =
                controller.createReport(outOfRange);

        assertEquals(HttpStatus.BAD_REQUEST, outOfRangeResponse.getStatusCode());
    }
}
