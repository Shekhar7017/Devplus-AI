package com.devplus;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class DevplusApplication {
    public static void main(String[] args) {
        SpringApplication.run(DevplusApplication.class, args);
    }
}
