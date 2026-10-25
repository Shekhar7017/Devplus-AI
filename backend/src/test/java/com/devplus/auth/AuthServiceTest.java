package com.devplus.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.devplus.security.UserPrincipal;
import com.devplus.user.AppUserEntity;
import com.devplus.user.AppUserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

class AuthServiceTest {
    private final JdbcTemplate jdbc = org.mockito.Mockito.mock(JdbcTemplate.class);
    private final PasswordEncoder passwordEncoder = org.mockito.Mockito.mock(PasswordEncoder.class);
    private final AppUserRepository users = org.mockito.Mockito.mock(AppUserRepository.class);
    private final AuthService service = new AuthService(jdbc, passwordEncoder, users);

    @Test
    void authenticatesCaseInsensitiveEmailWithoutExposingPasswordHash() {
        AppUserEntity user = new AppUserEntity("person@example.com", "Person", "encoded-hash");
        when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("valid-password", "encoded-hash")).thenReturn(true);

        UserPrincipal principal = service.authenticate(" PERSON@example.com ", "valid-password");

        assertEquals("person@example.com", principal.email());
        assertEquals("Person", principal.displayName());
        verify(passwordEncoder).matches("valid-password", "encoded-hash");
    }

    @Test
    void rejectsInvalidPasswordWithUnauthorizedResponse() {
        AppUserEntity user = new AppUserEntity("person@example.com", "Person", "encoded-hash");
        when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong-password", "encoded-hash")).thenReturn(false);

        assertThrows(ResponseStatusException.class,
            () -> service.authenticate("person@example.com", "wrong-password"));
    }
}
