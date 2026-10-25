package com.devplus.common;

import com.devplus.security.UserPrincipal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GeminiService {
    private final JdbcTemplate jdbc;
    private final String apiKey;
    private final String model;
    private final RestClient restClient;

    public GeminiService(JdbcTemplate jdbc, @Value("${app.gemini.api-key}") String apiKey,
                         @Value("${app.gemini.model}") String model) {
        this.jdbc = jdbc;
        this.apiKey = apiKey;
        this.model = model;
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(client);
        requestFactory.setReadTimeout(Duration.ofSeconds(30));
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    public Map<String, Object> assist(UUID userId, DevplusController.AiAssistRequest request) {
        if (request.organization_id() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "organization_id is required");
        }
        Integer membership = jdbc.queryForObject("""
            SELECT count(*) FROM membership WHERE organization_id = ? AND user_id = ?
            """, Integer.class, request.organization_id(), userId);
        if (membership == null || membership == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organization membership required");
        }
        Boolean enabled = jdbc.queryForObject(
            "SELECT ai_enabled FROM organization WHERE id = ?", Boolean.class, request.organization_id());
        if (!Boolean.TRUE.equals(enabled)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "AI assistance is disabled for this organization");
        }
        if (request.project_id() != null) {
            Integer projectCount = jdbc.queryForObject("""
                SELECT count(*) FROM project WHERE id = ? AND organization_id = ?
                """, Integer.class, request.project_id(), request.organization_id());
            if (projectCount == null || projectCount == 0) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found in this organization");
            }
        }
        if (apiKey == null || apiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI assistance is not configured on the server");
        }
        int quotaUpdate = jdbc.update("""
            UPDATE organization
            SET ai_requests_this_period = CASE WHEN ai_quota_reset_at IS NULL OR ai_quota_reset_at <= now()
                    THEN 1 ELSE ai_requests_this_period + 1 END,
                ai_quota_reset_at = CASE WHEN ai_quota_reset_at IS NULL OR ai_quota_reset_at <= now()
                    THEN now() + interval '30 days' ELSE ai_quota_reset_at END
            WHERE id = ? AND ai_enabled = true
                AND (ai_quota_reset_at IS NULL OR ai_quota_reset_at <= now() OR ai_requests_this_period < 100)
            """, request.organization_id());
        if (quotaUpdate == 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Organization AI quota has been reached");
        }
        String requestJson = asJson(request.payload());
        UUID interactionId = jdbc.queryForObject("""
            INSERT INTO ai_interaction(organization_id, project_id, user_id, request_type, request_payload, status)
            VALUES (?, ?, ?, ?, CAST(? AS jsonb), 'PENDING') RETURNING id
            """, UUID.class, request.organization_id(), request.project_id(), userId, request.request_type(),
            requestJson);
        try {
            String prompt = "You are an assistant for a software project management product. Return a JSON object only. "
                + "Request type: " + request.request_type() + ". Input data: " + requestJson;
            Map<?, ?> response = restClient.post()
                .uri("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                    model, apiKey)
                .body(Map.of("contents", new Object[]{Map.of("parts", new Object[]{Map.of("text", prompt)})},
                    "generationConfig", Map.of("responseMimeType", "application/json", "maxOutputTokens", 2048)))
                .retrieve()
                .body(Map.class);
            Object text = response == null ? null : extractText(response);
            if (!(text instanceof String output) || output.isBlank()) {
                throw new IllegalStateException("Gemini returned an empty response");
            }
            jdbc.update("""
                UPDATE ai_interaction SET response_payload = CAST(? AS jsonb), status = 'COMPLETED',
                    tokens_used = 0 WHERE id = ?
                """, asJson(Map.of("raw_response", output)), interactionId);
            return Map.of("id", interactionId, "response", output);
        } catch (RestClientResponseException exception) {
            jdbc.update("UPDATE ai_interaction SET status = 'FAILED', error_message = ? WHERE id = ?",
                "AI provider returned HTTP " + exception.getStatusCode().value(), interactionId);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI provider rejected the request");
        } catch (RestClientException exception) {
            jdbc.update("UPDATE ai_interaction SET status = 'FAILED', error_message = ? WHERE id = ?",
                "AI provider request failed", interactionId);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI provider is unavailable");
        } catch (IllegalStateException exception) {
            jdbc.update("UPDATE ai_interaction SET status = 'FAILED', error_message = ? WHERE id = ?",
                "AI provider returned an invalid response", interactionId);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI provider returned an invalid response");
        }
    }

    private static Object extractText(Map<?, ?> response) {
        Object candidatesValue = response.get("candidates");
        if (!(candidatesValue instanceof java.util.List<?> candidates) || candidates.isEmpty()) return null;
        Object contentValue = ((Map<?, ?>) candidates.get(0)).get("content");
        if (!(contentValue instanceof Map<?, ?> content)) return null;
        Object partsValue = content.get("parts");
        if (!(partsValue instanceof java.util.List<?> parts) || parts.isEmpty()) return null;
        return ((Map<?, ?>) parts.get(0)).get("text");
    }

    private static String asJson(Object value) {
        try {
            String json = new com.fasterxml.jackson.databind.ObjectMapper()
                .writeValueAsString(value == null ? Map.of() : value);
            if (json.length() > 16_384) {
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "AI request payload is too large");
            }
            return json;
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalArgumentException("AI request payload is invalid", exception);
        }
    }
}
