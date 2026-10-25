package com.devplus.auth;

import com.devplus.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@Validated
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken());
    }

    @PostMapping("/register")
    public Map<String, Object> register(@Valid @RequestBody RegistrationRequest request,
                                        HttpServletRequest servletRequest,
                                        HttpServletResponse response) {
        UserPrincipal principal = authService.register(request.email(), request.password(), request.displayName());
        authenticate(principal, servletRequest, response);
        return Map.of("user", authService.profile(principal.id()));
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request,
                                     HttpServletRequest servletRequest,
                                     HttpServletResponse response) {
        UserPrincipal principal = authService.authenticate(request.email(), request.password());
        authenticate(principal, servletRequest, response);
        return Map.of("user", authService.profile(principal.id()));
    }

    @GetMapping("/me")
    public Map<String, Object> currentUser(org.springframework.security.core.Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return Map.of("user", authService.profile(principal.id()));
    }

    @PostMapping("/logout")
    public Map<String, String> logout(HttpServletRequest request, HttpServletResponse response,
                                      org.springframework.security.core.Authentication authentication) {
        new SecurityContextLogoutHandler().logout(request, response, authentication);
        return Map.of("status", "signed_out");
    }

    private void authenticate(UserPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
        UsernamePasswordAuthenticationToken authentication =
            UsernamePasswordAuthenticationToken.authenticated(principal, null, java.util.List.of());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context, request, response);
    }

    public record RegistrationRequest(
        @NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Size(min = 10, max = 128) String password,
        @Size(max = 120) String displayName
    ) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
}
