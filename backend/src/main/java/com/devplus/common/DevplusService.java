package com.devplus.common;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Date;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DevplusService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;

    public DevplusService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> organizations(UUID userId) {
        return jdbc.queryForList("""
            SELECT o.* FROM organization o
            JOIN membership m ON m.organization_id = o.id
            WHERE m.user_id = ? ORDER BY o.created_at
            """, userId);
    }

    @Transactional
    public Map<String, Object> createOrganization(UUID userId, String name) {
        UUID orgId = jdbc.queryForObject(
            "INSERT INTO organization(name) VALUES (?) RETURNING id", UUID.class, name.trim());
        jdbc.update("INSERT INTO membership(organization_id, user_id, role) VALUES (?, ?, 'OWNER')", orgId, userId);
        return organization(userId, orgId);
    }

    public Map<String, Object> organization(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return jdbc.queryForMap("SELECT * FROM organization WHERE id = ?", orgId);
    }

    @Transactional
    public Map<String, Object> updateOrganization(UUID userId, UUID orgId, String name, Boolean aiEnabled) {
        requireRole(userId, orgId, "OWNER", "ADMIN");
        jdbc.update("""
            UPDATE organization SET name = COALESCE(?, name), ai_enabled = COALESCE(?, ai_enabled),
                updated_at = now() WHERE id = ?
            """, name == null ? null : name.trim(), aiEnabled, orgId);
        return organization(userId, orgId);
    }

    public List<Map<String, Object>> members(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return parseJsonColumns(jdbc.queryForList("""
            SELECT m.id, m.organization_id, m.user_id, m.role, m.created_at, m.updated_at,
                   jsonb_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name)::text AS app_user
            FROM membership m JOIN app_user u ON u.id = m.user_id
            WHERE m.organization_id = ? ORDER BY m.created_at
            """, orgId), "app_user");
    }

    @Transactional
    public void addMember(UUID userId, UUID orgId, String email, String role) {
        requireRole(userId, orgId, "OWNER", "ADMIN");
        if (!List.of("OWNER", "ADMIN", "MEMBER", "VIEWER").contains(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported member role");
        }
        if ("ADMIN".equals(role) && !hasRole(userId, orgId, "OWNER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an owner can grant administrator access");
        }
        if ("OWNER".equals(role) && !hasRole(userId, orgId, "OWNER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an owner can grant ownership");
        }
        UUID memberId;
        try {
            memberId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?",
                UUID.class, email.trim().toLowerCase());
        } catch (org.springframework.dao.EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No registered user has that email address");
        }
        jdbc.update("INSERT INTO membership(organization_id, user_id, role) VALUES (?, ?, ?)",
            orgId, memberId, role);
    }

    @Transactional
    public void updateMember(UUID userId, UUID orgId, UUID targetUserId, String role) {
        requireRole(userId, orgId, "OWNER", "ADMIN");
        if (!List.of("OWNER", "ADMIN", "MEMBER", "VIEWER").contains(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported member role");
        }
        if ("ADMIN".equals(role) && !hasRole(userId, orgId, "OWNER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an owner can grant administrator access");
        }
        if ("OWNER".equals(role) && !hasRole(userId, orgId, "OWNER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an owner can grant ownership");
        }
        String targetRole = membershipRole(orgId, targetUserId);
        if ("OWNER".equals(targetRole) && !"OWNER".equals(role)) {
            ensureAnotherOwner(orgId, targetUserId);
        }
        jdbc.update("""
            UPDATE membership SET role = ?, updated_at = now()
            WHERE organization_id = ? AND user_id = ?
            """, role, orgId, targetUserId);
    }

    @Transactional
    public void removeMember(UUID userId, UUID orgId, UUID targetUserId) {
        requireRole(userId, orgId, "OWNER");
        if ("OWNER".equals(membershipRole(orgId, targetUserId))) {
            ensureAnotherOwner(orgId, targetUserId);
        }
        jdbc.update("DELETE FROM membership WHERE organization_id = ? AND user_id = ?", orgId, targetUserId);
    }

    public List<Map<String, Object>> projects(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return jdbc.queryForList("SELECT * FROM project WHERE organization_id = ? ORDER BY created_at", orgId);
    }

    public List<Map<String, Object>> sprintsForOrganization(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return jdbc.queryForList("SELECT * FROM sprint WHERE organization_id = ? ORDER BY created_at DESC", orgId);
    }

    public List<Map<String, Object>> tasksForOrganization(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return parseJsonColumns(jdbc.queryForList("""
            SELECT t.*, CASE WHEN u.id IS NULL THEN NULL ELSE
                jsonb_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name)::text END AS assignee
            FROM task t LEFT JOIN app_user u ON u.id = t.assignee_id
            WHERE t.organization_id = ? ORDER BY t.created_at DESC LIMIT 500
            """, orgId), "assignee");
    }

    public List<Map<String, Object>> buildRunsForOrganization(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return jdbc.queryForList("""
            SELECT * FROM build_run WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50
            """, orgId);
    }

    @Transactional
    public Map<String, Object> createProject(UUID userId, UUID orgId, String key, String name, String description,
                                             String dataOrigin) {
        requireRole(userId, orgId, "OWNER", "ADMIN", "MEMBER");
        String normalizedKey = key.trim().toUpperCase();
        if (!normalizedKey.matches("[A-Z][A-Z0-9]{1,9}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project key must be 2-10 uppercase letters or digits");
        }
        return jdbc.queryForMap("""
            INSERT INTO project(organization_id, key, name, description, data_origin)
            VALUES (?, ?, ?, ?, ?) RETURNING *
            """, orgId, normalizedKey, name.trim(), blankToNull(description),
            dataOrigin == null ? "REAL" : dataOrigin);
    }

    @Transactional
    public Map<String, Object> updateProject(UUID userId, UUID projectId, Map<String, Object> fields) {
        UUID orgId = projectOrganization(projectId);
        requireRole(userId, orgId, "OWNER", "ADMIN");
        StringBuilder query = new StringBuilder("UPDATE project SET updated_at = now()");
        java.util.ArrayList<Object> arguments = new java.util.ArrayList<>();
        if (fields.containsKey("name")) {
            Object name = fields.get("name");
            if (!(name instanceof String text) || text.isBlank() || text.length() > 200) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project name must contain 1-200 characters");
            }
            query.append(", name = ?");
            arguments.add(text.trim());
        }
        if (fields.containsKey("description")) {
            Object description = fields.get("description");
            if (description != null && !(description instanceof String)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project description must be text or null");
            }
            query.append(", description = ?");
            arguments.add(blankToNull((String) description));
        }
        query.append(" WHERE id = ?");
        arguments.add(projectId);
        jdbc.update(query.toString(), arguments.toArray());
        return jdbc.queryForMap("SELECT * FROM project WHERE id = ?", projectId);
    }

    @Transactional
    public void archiveProject(UUID userId, UUID projectId) {
        UUID orgId = projectOrganization(projectId);
        requireRole(userId, orgId, "OWNER", "ADMIN");
        jdbc.update("UPDATE project SET status = 'ARCHIVED', updated_at = now() WHERE id = ?", projectId);
    }

    public List<Map<String, Object>> sprints(UUID userId, UUID projectId) {
        UUID orgId = projectOrganization(projectId);
        requireMembership(userId, orgId);
        return jdbc.queryForList("SELECT * FROM sprint WHERE project_id = ? ORDER BY created_at DESC", projectId);
    }

    @Transactional
    public Map<String, Object> createSprint(UUID userId, UUID projectId, String name, String goal,
                                            java.sql.Date startDate, java.sql.Date endDate) {
        UUID orgId = projectOrganization(projectId);
        requireActiveProject(userId, projectId, orgId);
        requireRole(userId, orgId, "OWNER", "ADMIN", "MEMBER");
        return jdbc.queryForMap("""
            INSERT INTO sprint(organization_id, project_id, name, goal, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *
            """, orgId, projectId, name.trim(), blankToNull(goal), startDate, endDate);
    }

    @Transactional
    public Map<String, Object> transitionSprint(UUID userId, UUID sprintId, String targetStatus) {
        Map<String, Object> sprint = jdbc.queryForMap("SELECT * FROM sprint WHERE id = ?", sprintId);
        UUID orgId = (UUID) sprint.get("organization_id");
        requireRole(userId, orgId, "OWNER", "ADMIN", "MEMBER");
        String current = (String) sprint.get("status");
        boolean allowed = switch (targetStatus) {
            case "ACTIVE" -> "PLANNED".equals(current);
            case "COMPLETED", "CANCELLED" -> "ACTIVE".equals(current) || "PLANNED".equals(current);
            default -> false;
        };
        if (!allowed) throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid sprint status transition");
        if ("ACTIVE".equals(targetStatus)) {
            Integer activeCount = jdbc.queryForObject(
                "SELECT count(*) FROM sprint WHERE project_id = ? AND status = 'ACTIVE' AND id <> ?",
                Integer.class, sprint.get("project_id"), sprintId);
            if (activeCount != null && activeCount > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This project already has an active sprint");
            }
        }
        jdbc.update("UPDATE sprint SET status = ?, updated_at = now() WHERE id = ?", targetStatus, sprintId);
        if ("COMPLETED".equals(targetStatus) || "CANCELLED".equals(targetStatus)) {
            List<Map<String, Object>> unfinished = jdbc.queryForList(
                "SELECT id, status FROM task WHERE sprint_id = ? AND status <> 'DONE'", sprintId);
            for (Map<String, Object> task : unfinished) {
                jdbc.update("""
                    INSERT INTO task_status_history(task_id, organization_id, from_status, to_status, changed_by)
                    VALUES (?, ?, ?, 'BACKLOG', ?)
                    """, task.get("id"), orgId, task.get("status"), userId);
            }
            jdbc.update("""
                UPDATE task SET sprint_id = NULL, status = CASE WHEN status = 'DONE' THEN status ELSE 'BACKLOG' END,
                    version = version + 1, updated_at = now() WHERE sprint_id = ?
                """, sprintId);
        }
        return jdbc.queryForMap("SELECT * FROM sprint WHERE id = ?", sprintId);
    }

    public List<Map<String, Object>> tasks(UUID userId, UUID projectId) {
        UUID orgId = projectOrganization(projectId);
        requireMembership(userId, orgId);
        return parseJsonColumns(jdbc.queryForList("""
            SELECT t.*, CASE WHEN u.id IS NULL THEN NULL ELSE
                jsonb_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name)::text END AS assignee
            FROM task t LEFT JOIN app_user u ON u.id = t.assignee_id
            WHERE t.project_id = ? ORDER BY t.number
            """, projectId), "assignee");
    }

    @Transactional
    public Map<String, Object> createTask(UUID userId, UUID projectId, String title, String description,
                                          String type, String priority, Integer estimatePoints,
                                          UUID assigneeId, UUID sprintId) {
        UUID orgId = projectOrganization(projectId);
        requireActiveProject(userId, projectId, orgId);
        requireRole(userId, orgId, "OWNER", "ADMIN", "MEMBER");
        if (assigneeId != null) {
            Integer assigneeMembership = jdbc.queryForObject(
                "SELECT count(*) FROM membership WHERE organization_id = ? AND user_id = ?",
                Integer.class, orgId, assigneeId);
            if (assigneeMembership == null || assigneeMembership == 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Assignee must be a member of this organization");
            }
        }
        if (sprintId != null) {
            UUID sprintProject = jdbc.queryForObject("SELECT project_id FROM sprint WHERE id = ?", UUID.class, sprintId);
            if (!projectId.equals(sprintProject)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint must belong to the same project");
            }
        }
        Integer number = jdbc.queryForObject("""
            UPDATE project SET task_counter = task_counter + 1 WHERE id = ? RETURNING task_counter
            """, Integer.class, projectId);
        UUID taskId = jdbc.queryForObject("""
            INSERT INTO task(organization_id, project_id, sprint_id, number, title, description, type, priority,
                estimate_points, assignee_id, reporter_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, orgId, projectId, sprintId, number, title.trim(), blankToNull(description),
            type, priority, estimatePoints == null ? 0 : estimatePoints, assigneeId, userId);
        jdbc.update("""
            INSERT INTO task_status_history(task_id, organization_id, from_status, to_status, changed_by)
            VALUES (?, ?, NULL, 'BACKLOG', ?)
            """, taskId, orgId, userId);
        return task(userId, taskId);
    }

    @Transactional
    public Map<String, Object> updateTask(UUID userId, UUID taskId, Map<String, Object> fields) {
        Map<String, Object> task = taskRow(taskId);
        requireActiveProject(userId, (UUID) task.get("project_id"), (UUID) task.get("organization_id"));
        requireRole(userId, (UUID) task.get("organization_id"), "OWNER", "ADMIN", "MEMBER");
        Object version = fields.get("version");
        if (version instanceof Number expected && ((Number) task.get("version")).intValue() != expected.intValue()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Task was changed by another user; refresh and retry");
        }
        Map<String, String> allowed = Map.of(
            "title", "title", "description", "description", "type", "type", "priority", "priority",
            "estimate_points", "estimate_points", "assignee_id", "assignee_id", "sprint_id", "sprint_id"
        );
        StringBuilder update = new StringBuilder("UPDATE task SET version = version + 1, updated_at = now()");
        java.util.ArrayList<Object> values = new java.util.ArrayList<>();
        for (Map.Entry<String, String> entry : allowed.entrySet()) {
            if (!fields.containsKey(entry.getKey())) continue;
            update.append(", ").append(entry.getValue()).append(" = ?");
            Object value = fields.get(entry.getKey());
            if (("assignee_id".equals(entry.getKey()) || "sprint_id".equals(entry.getKey()))
                && value != null && !value.toString().isBlank()) {
                value = UUID.fromString(value.toString());
            } else if (value != null && value.toString().isBlank()) {
                value = null;
            }
            values.add(value);
        }
        if (fields.containsKey("sprint_id") && fields.get("sprint_id") != null) {
            UUID sprintId = UUID.fromString(fields.get("sprint_id").toString());
            UUID sprintProject = jdbc.queryForObject(
                "SELECT project_id FROM sprint WHERE id = ?", UUID.class, sprintId);
            if (!task.get("project_id").equals(sprintProject)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint must belong to the same project");
            }
        }
        if (fields.containsKey("assignee_id") && fields.get("assignee_id") != null) {
            UUID assigneeId = UUID.fromString(fields.get("assignee_id").toString());
            Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM membership WHERE organization_id = ? AND user_id = ?",
                Integer.class, task.get("organization_id"), assigneeId);
            if (count == null || count == 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Assignee must be a member of this organization");
            }
        }
        Integer expectedVersion = version instanceof Number number ? number.intValue() : null;
        update.append(" WHERE id = ?");
        values.add(taskId);
        if (expectedVersion != null) {
            update.append(" AND version = ?");
            values.add(expectedVersion);
        }
        if (jdbc.update(update.toString(), values.toArray()) == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Task changed during this update; refresh and retry");
        }
        return task(userId, taskId);
    }

    @Transactional
    public Map<String, Object> transitionTask(UUID userId, UUID taskId, String nextStatus, Integer version) {
        Map<String, Object> task = taskRow(taskId);
        requireActiveProject(userId, (UUID) task.get("project_id"), (UUID) task.get("organization_id"));
        requireRole(userId, (UUID) task.get("organization_id"), "OWNER", "ADMIN", "MEMBER");
        String current = (String) task.get("status");
        if (version != null && ((Number) task.get("version")).intValue() != version) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Task was changed by another user; refresh and retry");
        }
        boolean allowed = switch (current) {
            case "BACKLOG" -> List.of("TODO", "IN_PROGRESS", "BLOCKED").contains(nextStatus);
            case "TODO" -> List.of("IN_PROGRESS", "BLOCKED", "BACKLOG").contains(nextStatus);
            case "IN_PROGRESS" -> List.of("IN_REVIEW", "DONE", "BLOCKED").contains(nextStatus);
            case "IN_REVIEW" -> List.of("DONE", "IN_PROGRESS", "BLOCKED").contains(nextStatus);
            case "DONE" -> List.of("TODO", "IN_PROGRESS").contains(nextStatus);
            case "BLOCKED" -> List.of("TODO", "IN_PROGRESS", "BACKLOG").contains(nextStatus);
            default -> false;
        };
        if (!allowed) throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid task status transition");
        String transitionSql = """
            UPDATE task SET status = ?, version = version + 1, updated_at = now(),
                started_at = CASE WHEN ? = 'IN_PROGRESS' AND started_at IS NULL THEN now()
                    WHEN ? = 'TODO' THEN NULL ELSE started_at END,
                completed_at = CASE WHEN ? = 'DONE' THEN now() WHEN ? <> 'DONE' THEN NULL ELSE completed_at END
            WHERE id = ?
            """;
        int updated;
        if (version == null) {
            updated = jdbc.update(transitionSql, nextStatus, nextStatus, nextStatus, nextStatus, nextStatus, taskId);
        } else {
            updated = jdbc.update(transitionSql + " AND version = ?", nextStatus, nextStatus, nextStatus,
                nextStatus, nextStatus, taskId, version);
        }
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Task changed during this update; refresh and retry");
        }
        jdbc.update("""
            INSERT INTO task_status_history(task_id, organization_id, from_status, to_status, changed_by)
            VALUES (?, ?, ?, ?, ?)
            """, taskId, task.get("organization_id"), current, nextStatus, userId);
        return task(userId, taskId);
    }

    public List<Map<String, Object>> taskHistory(UUID userId, UUID taskId) {
        Map<String, Object> task = taskRow(taskId);
        requireMembership(userId, (UUID) task.get("organization_id"));
        return jdbc.queryForList(
            "SELECT * FROM task_status_history WHERE task_id = ? ORDER BY changed_at DESC", taskId);
    }

    public List<Map<String, Object>> buildRuns(UUID userId, UUID projectId) {
        requireMembership(userId, projectOrganization(projectId));
        return jdbc.queryForList("""
            SELECT * FROM build_run WHERE project_id = ? ORDER BY created_at DESC LIMIT 200
            """, projectId);
    }

    public List<Map<String, Object>> simulationDatasets(UUID userId, UUID projectId) {
        requireMembership(userId, projectOrganization(projectId));
        return jdbc.queryForList("""
            SELECT * FROM simulation_dataset WHERE project_id = ? ORDER BY created_at DESC
            """, projectId);
    }

    public List<Map<String, Object>> apiKeys(UUID userId, UUID projectId) {
        requireMembership(userId, projectOrganization(projectId));
        return jdbc.queryForList("""
            SELECT id, organization_id, project_id, name, key_prefix, created_by, last_used_at, created_at, updated_at
            FROM project_api_key WHERE project_id = ? ORDER BY created_at
            """, projectId);
    }

    @Transactional
    public Map<String, Object> createApiKey(UUID userId, UUID projectId, String name) {
        UUID orgId = projectOrganization(projectId);
        requireRole(userId, orgId, "OWNER", "ADMIN");
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String secret = "dp_" + HexFormat.of().formatHex(bytes);
        String hash = sha256(secret);
        String prefix = secret.substring(0, 10);
        UUID id = jdbc.queryForObject("""
            INSERT INTO project_api_key(organization_id, project_id, name, key_hash, key_prefix, created_by)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, orgId, projectId, name.trim(), hash, prefix, userId);
        return Map.of("id", id, "name", name.trim(), "key_prefix", prefix, "key", secret,
            "created_at", Instant.now().toString());
    }

    @Transactional
    public void revokeApiKey(UUID userId, UUID keyId) {
        UUID orgId = jdbc.queryForObject(
            "SELECT organization_id FROM project_api_key WHERE id = ?", UUID.class, keyId);
        requireRole(userId, orgId, "OWNER", "ADMIN");
        jdbc.update("DELETE FROM project_api_key WHERE id = ?", keyId);
    }

    public List<Map<String, Object>> aiInteractions(UUID userId, UUID orgId) {
        requireMembership(userId, orgId);
        return parseJsonColumns(jdbc.queryForList("""
            SELECT id, organization_id, project_id, user_id, request_type, request_payload::text AS request_payload,
                response_payload::text AS response_payload, status, decision, error_message, tokens_used, created_at
            FROM ai_interaction WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50
            """, orgId), "request_payload", "response_payload");
    }

    @Transactional
    public Map<String, Object> generateSimulation(UUID userId, UUID projectId, Integer seed, Integer sprintCount) {
        UUID orgId = projectOrganization(projectId);
        requireActiveProject(userId, projectId, orgId);
        requireRole(userId, orgId, "OWNER", "ADMIN");
        if (sprintCount == null || sprintCount < 1 || sprintCount > 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint count must be between 1 and 20");
        }
        int actualSeed = seed == null ? RANDOM.nextInt() : seed;
        java.util.Random random = new java.util.Random(actualSeed);
        UUID datasetId = jdbc.queryForObject("""
            INSERT INTO simulation_dataset(organization_id, project_id, name, seed, created_by)
            VALUES (?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, orgId, projectId, "Simulation " + Instant.now(), actualSeed, userId);
        java.time.LocalDate start = java.time.LocalDate.now().minusDays((long) sprintCount * 14);
        int taskCount = 0;
        int buildCount = 0;
        for (int index = 0; index < sprintCount; index++) {
            java.time.LocalDate sprintStart = start.plusDays((long) index * 14);
            UUID sprintId = jdbc.queryForObject("""
                INSERT INTO sprint(organization_id, project_id, name, goal, status, start_date, end_date,
                    simulation_dataset_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, orgId, projectId, "Simulated Sprint " + (index + 1),
                "Generated analytics sample", "COMPLETED",
                Date.valueOf(sprintStart), Date.valueOf(sprintStart.plusDays(14)), datasetId);
            int tasksInSprint = 5 + random.nextInt(6);
            for (int taskIndex = 0; taskIndex < tasksInSprint; taskIndex++) {
                Integer number = jdbc.queryForObject("""
                    UPDATE project SET task_counter = task_counter + 1 WHERE id = ? RETURNING task_counter
                    """, Integer.class, projectId);
                String status = List.of("TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED")
                    .get(random.nextInt(5));
                jdbc.update("""
                    INSERT INTO task(organization_id, project_id, sprint_id, number, title, description, type,
                        status, priority, estimate_points, reporter_id, started_at, completed_at, simulation_dataset_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, orgId, projectId, sprintId, number, "Sample task " + (taskIndex + 1),
                    "Generated simulation data", List.of("BUG", "FEATURE", "TASK", "SPIKE").get(random.nextInt(4)),
                    status, List.of("LOW", "MEDIUM", "HIGH").get(random.nextInt(3)), random.nextInt(9), userId,
                    List.of("IN_PROGRESS", "IN_REVIEW", "DONE").contains(status) ? Instant.now().minusSeconds(86400L * random.nextInt(14)) : null,
                    "DONE".equals(status) ? Instant.now().minusSeconds(3600L * random.nextInt(72)) : null, datasetId);
                taskCount++;
            }
            for (int buildIndex = 0; buildIndex < 3; buildIndex++) {
                String commit = HexFormat.of().formatHex(randomBytes(random, 20));
                jdbc.update("""
                    INSERT INTO build_run(organization_id, project_id, external_run_id, branch, commit_sha, status,
                        duration_seconds, triggered_by, simulation_dataset_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, orgId, projectId, datasetId + "-build-" + index + "-" + buildIndex,
                    "simulation/" + (index + 1), commit, random.nextInt(5) == 0 ? "FAILED" : "SUCCESS",
                    20 + random.nextInt(500), "simulation", datasetId);
                buildCount++;
            }
        }
        jdbc.update("UPDATE simulation_dataset SET sprint_count = ?, task_count = ?, build_count = ? WHERE id = ?",
            sprintCount, taskCount, buildCount, datasetId);
        return jdbc.queryForMap("SELECT * FROM simulation_dataset WHERE id = ?", datasetId);
    }

    @Transactional
    public void deleteSimulation(UUID userId, UUID datasetId) {
        Map<String, Object> dataset;
        try {
            dataset = jdbc.queryForMap(
                "SELECT id, organization_id FROM simulation_dataset WHERE id = ?", datasetId);
        } catch (org.springframework.dao.EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation dataset not found");
        }
        requireRole(userId, (UUID) dataset.get("organization_id"), "OWNER", "ADMIN");
        jdbc.update("DELETE FROM task WHERE simulation_dataset_id = ?", datasetId);
        jdbc.update("DELETE FROM sprint WHERE simulation_dataset_id = ?", datasetId);
        jdbc.update("DELETE FROM build_run WHERE simulation_dataset_id = ?", datasetId);
        jdbc.update("DELETE FROM simulation_dataset WHERE id = ?", datasetId);
    }

    @Transactional
    public void updateAiDecision(UUID userId, UUID interactionId, String decision) {
        if (!List.of("ACCEPTED", "REJECTED").contains(decision)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Decision must be ACCEPTED or REJECTED");
        }
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT organization_id, user_id FROM ai_interaction WHERE id = ?", interactionId);
        UUID orgId = (UUID) row.get("organization_id");
        requireMembership(userId, orgId);
        if (!userId.equals(row.get("user_id")) && !hasRole(userId, orgId, "OWNER", "ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the requester or an organization admin may decide");
        }
        jdbc.update("UPDATE ai_interaction SET decision = ? WHERE id = ?", decision, interactionId);
    }

    @Transactional
    public Map<String, Object> ingestBuildRun(String key, String externalRunId, String branch, String commitSha,
                                              String status, Integer duration, String triggeredBy, String buildUrl) {
        UUID apiKeyId;
        try {
            apiKeyId = jdbc.queryForObject(
                "SELECT id FROM project_api_key WHERE key_hash = ?", UUID.class, sha256(key));
        } catch (org.springframework.dao.EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid project API key");
        }
        Map<String, Object> apiKey = jdbc.queryForMap(
            "SELECT organization_id, project_id FROM project_api_key WHERE id = ?", apiKeyId);
        jdbc.update("UPDATE project_api_key SET last_used_at = now() WHERE id = ?", apiKeyId);
        UUID projectId = (UUID) apiKey.get("project_id");
        jdbc.update("""
            INSERT INTO build_run(organization_id, project_id, external_run_id, branch, commit_sha, status,
                duration_seconds, triggered_by, build_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, external_run_id) DO UPDATE SET
                branch = EXCLUDED.branch, commit_sha = EXCLUDED.commit_sha, status = EXCLUDED.status,
                duration_seconds = EXCLUDED.duration_seconds, triggered_by = EXCLUDED.triggered_by,
                build_url = EXCLUDED.build_url
            """, apiKey.get("organization_id"), projectId, externalRunId, branch, commitSha.toLowerCase(), status,
            duration == null ? 0 : duration, blankToNull(triggeredBy), blankToNull(buildUrl));
        return jdbc.queryForMap("SELECT * FROM build_run WHERE project_id = ? AND external_run_id = ?",
            projectId, externalRunId);
    }

    public UUID projectOrganization(UUID projectId) {
        try {
            return jdbc.queryForObject("SELECT organization_id FROM project WHERE id = ?", UUID.class, projectId);
        } catch (org.springframework.dao.EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found");
        }
    }

    public void requireMembership(UUID userId, UUID orgId) {
        if (!hasRole(userId, orgId, "OWNER", "ADMIN", "MEMBER", "VIEWER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organization membership required");
        }
    }

    private void requireRole(UUID userId, UUID orgId, String... roles) {
        if (!hasRole(userId, orgId, roles)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Insufficient organization permissions");
        }
    }

    private boolean hasRole(UUID userId, UUID orgId, String... roles) {
        String placeholders = String.join(",", java.util.Collections.nCopies(roles.length, "?"));
        Object[] parameters = new Object[roles.length + 2];
        parameters[0] = userId;
        parameters[1] = orgId;
        System.arraycopy(roles, 0, parameters, 2, roles.length);
        Integer count = jdbc.queryForObject("SELECT count(*) FROM membership WHERE user_id = ? "
            + "AND organization_id = ? AND role IN (" + placeholders + ")", Integer.class, parameters);
        return count != null && count > 0;
    }

    private String membershipRole(UUID orgId, UUID userId) {
        try {
            return jdbc.queryForObject(
                "SELECT role FROM membership WHERE organization_id = ? AND user_id = ?",
                String.class, orgId, userId);
        } catch (org.springframework.dao.EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Organization member not found");
        }
    }

    private void ensureAnotherOwner(UUID orgId, UUID targetId) {
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM membership
            WHERE organization_id = ? AND role = 'OWNER' AND user_id <> ?
            """, Integer.class, orgId, targetId);
        if (count == null || count == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An organization must have at least one owner");
        }
    }

    private Map<String, Object> taskRow(UUID taskId) {
        try {
            return jdbc.queryForMap("SELECT * FROM task WHERE id = ?", taskId);
        } catch (org.springframework.dao.EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
        }
    }

    private Map<String, Object> task(UUID userId, UUID taskId) {
        Map<String, Object> row = taskRow(taskId);
        requireMembership(userId, (UUID) row.get("organization_id"));
        return parseJsonColumns(jdbc.queryForList("""
            SELECT t.*, CASE WHEN u.id IS NULL THEN NULL ELSE
                jsonb_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name)::text END AS assignee
            FROM task t LEFT JOIN app_user u ON u.id = t.assignee_id WHERE t.id = ?
            """, taskId), "assignee").get(0);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireActiveProject(UUID userId, UUID projectId, UUID orgId) {
        requireMembership(userId, orgId);
        String status = jdbc.queryForObject("SELECT status FROM project WHERE id = ?", String.class, projectId);
        if (!"ACTIVE".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Archived projects are read-only");
        }
    }

    private static List<Map<String, Object>> parseJsonColumns(List<Map<String, Object>> rows, String... columns) {
        for (Map<String, Object> row : rows) {
            for (String column : columns) {
                Object value = row.get(column);
                if (value == null || value instanceof Map<?, ?> || value instanceof List<?>) continue;
                try {
                    row.put(column, new com.fasterxml.jackson.databind.ObjectMapper()
                        .readValue(value.toString(), Object.class));
                } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
                    throw new IllegalStateException("Database returned invalid JSON for " + column, exception);
                }
            }
        }
        return rows;
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static byte[] randomBytes(java.util.Random random, int size) {
        byte[] bytes = new byte[size];
        random.nextBytes(bytes);
        return bytes;
    }
}
