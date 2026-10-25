package com.devplus.security;

import java.io.Serializable;
import java.util.UUID;

public record UserPrincipal(UUID id, String email, String displayName) implements Serializable {
}
