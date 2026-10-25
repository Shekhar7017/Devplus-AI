package com.devplus.auth;

import com.devplus.security.UserPrincipal;
import com.devplus.user.AppUserEntity;
import com.devplus.user.AppUserRepository;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final AppUserRepository users;

    public AuthService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder, AppUserRepository users) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.users = users;
    }

    @Transactional
    public UserPrincipal register(String email, String password, String displayName) {
        String normalizedEmail = email.trim().toLowerCase();
        if (users.findByEmailIgnoreCase(normalizedEmail).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        try {
            AppUserEntity user = users.saveAndFlush(new AppUserEntity(normalizedEmail,
                displayName == null || displayName.isBlank() ? null : displayName.trim(),
                passwordEncoder.encode(password)));
            return new UserPrincipal(user.getId(), normalizedEmail, user.getDisplayName());
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
    }

    public UserPrincipal authenticate(String email, String password) {
        AppUserEntity user = users.findByEmailIgnoreCase(email.trim().toLowerCase()).orElse(null);
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect");
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect");
        }
        return new UserPrincipal(user.getId(), user.getEmail(), user.getDisplayName());
    }

    public Map<String, Object> profile(UUID userId) {
        return jdbc.queryForMap("""
            SELECT id, email, display_name, created_at, updated_at
            FROM app_user WHERE id = ?
            """, userId);
    }
}
