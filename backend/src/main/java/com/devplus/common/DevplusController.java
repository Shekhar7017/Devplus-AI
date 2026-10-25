package com.devplus.common;

import com.devplus.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1")
public class DevplusController {
    private final DevplusService service;
    private final GeminiService geminiService;

    public DevplusController(DevplusService service, GeminiService geminiService) {
        this.service = service;
        this.geminiService = geminiService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }

    @GetMapping("/organizations")
    public List<Map<String, Object>> organizations(@AuthenticationPrincipal UserPrincipal user) {
        return service.organizations(user.id());
    }

    @PostMapping("/organizations")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createOrganization(@AuthenticationPrincipal UserPrincipal user,
                                                  @Valid @RequestBody NameRequest request) {
        return service.createOrganization(user.id(), request.name());
    }

    @GetMapping("/organizations/{organizationId}")
    public Map<String, Object> organization(@AuthenticationPrincipal UserPrincipal user,
                                            @PathVariable UUID organizationId) {
        return service.organization(user.id(), organizationId);
    }

    @PutMapping("/organizations/{organizationId}")
    public Map<String, Object> updateOrganization(@AuthenticationPrincipal UserPrincipal user,
                                                  @PathVariable UUID organizationId,
                                                  @RequestBody OrganizationUpdateRequest request) {
        return service.updateOrganization(user.id(), organizationId, request.name(), request.ai_enabled());
    }

    @GetMapping("/organizations/{organizationId}/members")
    public List<Map<String, Object>> members(@AuthenticationPrincipal UserPrincipal user,
                                             @PathVariable UUID organizationId) {
        return service.members(user.id(), organizationId);
    }

    @GetMapping("/organizations/{organizationId}/sprints")
    public List<Map<String, Object>> organizationSprints(@AuthenticationPrincipal UserPrincipal user,
                                                         @PathVariable UUID organizationId) {
        return service.sprintsForOrganization(user.id(), organizationId);
    }

    @GetMapping("/organizations/{organizationId}/tasks")
    public List<Map<String, Object>> organizationTasks(@AuthenticationPrincipal UserPrincipal user,
                                                       @PathVariable UUID organizationId) {
        return service.tasksForOrganization(user.id(), organizationId);
    }

    @GetMapping("/organizations/{organizationId}/build-runs")
    public List<Map<String, Object>> organizationBuildRuns(@AuthenticationPrincipal UserPrincipal user,
                                                           @PathVariable UUID organizationId) {
        return service.buildRunsForOrganization(user.id(), organizationId);
    }

    @PostMapping("/organizations/{organizationId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> addMember(@AuthenticationPrincipal UserPrincipal user,
                                         @PathVariable UUID organizationId,
                                         @Valid @RequestBody AddMemberRequest request) {
        service.addMember(user.id(), organizationId, request.email(), request.role());
        return Map.of("status", "added");
    }

    @PutMapping("/organizations/{organizationId}/members/{memberId}")
    public Map<String, String> updateMember(@AuthenticationPrincipal UserPrincipal user,
                                            @PathVariable UUID organizationId, @PathVariable UUID memberId,
                                            @Valid @RequestBody RoleRequest request) {
        service.updateMember(user.id(), organizationId, memberId, request.role());
        return Map.of("status", "updated");
    }

    @DeleteMapping("/organizations/{organizationId}/members/{memberId}")
    public Map<String, String> removeMember(@AuthenticationPrincipal UserPrincipal user,
                                            @PathVariable UUID organizationId, @PathVariable UUID memberId) {
        service.removeMember(user.id(), organizationId, memberId);
        return Map.of("status", "removed");
    }

    @GetMapping("/projects")
    public List<Map<String, Object>> projects(@AuthenticationPrincipal UserPrincipal user,
                                             @RequestParam("organization_id") UUID organizationId) {
        return service.projects(user.id(), organizationId);
    }

    @PostMapping("/projects")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createProject(@AuthenticationPrincipal UserPrincipal user,
                                             @Valid @RequestBody ProjectRequest request) {
        return service.createProject(user.id(), request.organization_id(), request.key(), request.name(),
            request.description(), request.data_origin());
    }

    @PutMapping("/projects/{projectId}")
    public Map<String, Object> updateProject(@AuthenticationPrincipal UserPrincipal user,
                                             @PathVariable UUID projectId,
                                             @RequestBody Map<String, Object> fields) {
        return service.updateProject(user.id(), projectId, fields);
    }

    @PostMapping("/projects/{projectId}/archive")
    public Map<String, String> archiveProject(@AuthenticationPrincipal UserPrincipal user,
                                              @PathVariable UUID projectId) {
        service.archiveProject(user.id(), projectId);
        return Map.of("status", "archived");
    }

    @GetMapping("/projects/{projectId}/sprints")
    public List<Map<String, Object>> sprints(@AuthenticationPrincipal UserPrincipal user,
                                             @PathVariable UUID projectId) {
        return service.sprints(user.id(), projectId);
    }

    @PostMapping("/projects/{projectId}/sprints")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createSprint(@AuthenticationPrincipal UserPrincipal user,
                                            @PathVariable UUID projectId,
                                            @Valid @RequestBody SprintRequest request) {
        return service.createSprint(user.id(), projectId, request.name(), request.goal(),
            Date.valueOf(request.start_date()), Date.valueOf(request.end_date()));
    }

    @PostMapping("/sprints/{sprintId}/{action:start|complete|cancel}")
    public Map<String, Object> transitionSprint(@AuthenticationPrincipal UserPrincipal user,
                                                @PathVariable UUID sprintId, @PathVariable String action) {
        String status = switch (action) {
            case "start" -> "ACTIVE";
            case "complete" -> "COMPLETED";
            case "cancel" -> "CANCELLED";
            default -> throw new org.springframework.web.server.ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Unsupported sprint action");
        };
        return service.transitionSprint(user.id(), sprintId, status);
    }

    @GetMapping("/projects/{projectId}/tasks")
    public List<Map<String, Object>> tasks(@AuthenticationPrincipal UserPrincipal user,
                                           @PathVariable UUID projectId) {
        return service.tasks(user.id(), projectId);
    }

    @PostMapping("/projects/{projectId}/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createTask(@AuthenticationPrincipal UserPrincipal user,
                                          @PathVariable UUID projectId,
                                          @Valid @RequestBody TaskRequest request) {
        return service.createTask(user.id(), projectId, request.title(), request.description(),
            request.type(), request.priority(), request.estimate_points(), request.assignee_id(), request.sprint_id());
    }

    @PutMapping("/tasks/{taskId}")
    public Map<String, Object> updateTask(@AuthenticationPrincipal UserPrincipal user,
                                          @PathVariable UUID taskId, @RequestBody Map<String, Object> fields) {
        return service.updateTask(user.id(), taskId, fields);
    }

    @PostMapping("/tasks/{taskId}/transition")
    public Map<String, Object> transitionTask(@AuthenticationPrincipal UserPrincipal user,
                                              @PathVariable UUID taskId,
                                              @Valid @RequestBody TransitionTaskRequest request) {
        return service.transitionTask(user.id(), taskId, request.status(), request.version());
    }

    @GetMapping("/tasks/{taskId}/history")
    public List<Map<String, Object>> taskHistory(@AuthenticationPrincipal UserPrincipal user,
                                                @PathVariable UUID taskId) {
        return service.taskHistory(user.id(), taskId);
    }

    @GetMapping("/projects/{projectId}/build-runs")
    public List<Map<String, Object>> buildRuns(@AuthenticationPrincipal UserPrincipal user,
                                               @PathVariable UUID projectId) {
        return service.buildRuns(user.id(), projectId);
    }

    @GetMapping("/projects/{projectId}/simulation-datasets")
    public List<Map<String, Object>> simulationDatasets(@AuthenticationPrincipal UserPrincipal user,
                                                        @PathVariable UUID projectId) {
        return service.simulationDatasets(user.id(), projectId);
    }

    @GetMapping("/projects/{projectId}/api-keys")
    public List<Map<String, Object>> apiKeys(@AuthenticationPrincipal UserPrincipal user,
                                             @PathVariable UUID projectId) {
        return service.apiKeys(user.id(), projectId);
    }

    @PostMapping("/projects/{projectId}/api-keys")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createApiKey(@AuthenticationPrincipal UserPrincipal user,
                                             @PathVariable UUID projectId, @Valid @RequestBody NameRequest request) {
        return service.createApiKey(user.id(), projectId, request.name());
    }

    @PostMapping("/projects/{projectId}/simulation-datasets")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> generateSimulation(@AuthenticationPrincipal UserPrincipal user,
                                                  @PathVariable UUID projectId,
                                                  @Valid @RequestBody SimulationRequest request) {
        return service.generateSimulation(user.id(), projectId, request.seed(), request.sprint_count());
    }

    @DeleteMapping("/simulation-datasets/{datasetId}")
    public Map<String, String> deleteSimulation(@AuthenticationPrincipal UserPrincipal user,
                                                @PathVariable UUID datasetId) {
        service.deleteSimulation(user.id(), datasetId);
        return Map.of("status", "deleted");
    }

    @DeleteMapping("/api-keys/{keyId}")
    public Map<String, String> revokeApiKey(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID keyId) {
        service.revokeApiKey(user.id(), keyId);
        return Map.of("status", "revoked");
    }

    @PostMapping("/telemetry/ingest-build-run")
    public Map<String, Object> ingestBuildRun(@RequestHeader("X-API-Key") String key,
                                              @Valid @RequestBody BuildRunRequest request) {
        return service.ingestBuildRun(key, request.external_run_id(), request.branch(), request.commit_sha(),
            request.status(), request.duration_seconds(), request.triggered_by(), request.build_url());
    }

    @GetMapping("/organizations/{organizationId}/ai-interactions")
    public List<Map<String, Object>> aiInteractions(@AuthenticationPrincipal UserPrincipal user,
                                                    @PathVariable UUID organizationId) {
        return service.aiInteractions(user.id(), organizationId);
    }

    @PutMapping("/ai-interactions/{interactionId}/decision")
    public Map<String, String> updateAiDecision(@AuthenticationPrincipal UserPrincipal user,
                                                @PathVariable UUID interactionId,
                                                @Valid @RequestBody DecisionRequest request) {
        service.updateAiDecision(user.id(), interactionId, request.decision());
        return Map.of("status", "updated");
    }

    @PostMapping("/ai/assist")
    public Map<String, Object> assist(@AuthenticationPrincipal UserPrincipal user,
                                      @Valid @RequestBody AiAssistRequest request) {
        return geminiService.assist(user.id(), request);
    }

    public record NameRequest(@NotBlank @Size(max = 200) String name) {}
    public record OrganizationUpdateRequest(@Size(max = 200) String name, Boolean ai_enabled) {}
    public record AddMemberRequest(@NotBlank @jakarta.validation.constraints.Email String email,
                                   @Pattern(regexp = "OWNER|ADMIN|MEMBER|VIEWER") String role) {}
    public record RoleRequest(@Pattern(regexp = "OWNER|ADMIN|MEMBER|VIEWER") String role) {}
    public record ProjectRequest(@NotNull UUID organization_id, @NotBlank @Size(max = 10) String key,
                                 @NotBlank @Size(max = 200) String name, @Size(max = 5000) String description,
                                 @Pattern(regexp = "REAL|SIMULATED") String data_origin) {}
    public record ProjectUpdateRequest(@Size(max = 200) String name, @Size(max = 5000) String description) {}
    public record SprintRequest(@NotBlank @Size(max = 200) String name, @Size(max = 2000) String goal,
                                @NotNull java.time.LocalDate start_date, @NotNull java.time.LocalDate end_date) {}
    public record TaskRequest(@NotBlank @Size(max = 200) String title, @Size(max = 10000) String description,
                              @Pattern(regexp = "BUG|FEATURE|TASK|EPIC|SPIKE") String type,
                              @Pattern(regexp = "BLOCKER|HIGH|MEDIUM|LOW") String priority,
                              Integer estimate_points, UUID assignee_id, UUID sprint_id) {}
    public record TransitionTaskRequest(@Pattern(regexp = "BACKLOG|TODO|IN_PROGRESS|IN_REVIEW|DONE|BLOCKED")
                                        String status, Integer version) {}
    public record BuildRunRequest(@NotBlank @Size(max = 200) String external_run_id,
                                  @NotBlank @Size(max = 500) String branch,
                                  @NotBlank @Pattern(regexp = "(?i)[0-9a-f]{7,40}") String commit_sha,
                                  @NotBlank @Pattern(regexp = "SUCCESS|FAILED|RUNNING|CANCELLED") String status,
                                  Integer duration_seconds, @Size(max = 200) String triggered_by,
                                  @Size(max = 2000) String build_url) {}
    public record DecisionRequest(@Pattern(regexp = "ACCEPTED|REJECTED") String decision) {}
    public record SimulationRequest(Integer seed, Integer sprint_count) {}
    public record AiAssistRequest(@NotBlank @Pattern(regexp = "TASK_REFINEMENT|SPRINT_SUMMARY") String request_type,
                                  @NotNull UUID organization_id, UUID project_id, @NotNull Map<String, Object> payload) {}
}
