package com.devplus.common;

import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail handleStatus(ResponseStatusException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(exception.getStatusCode(), exception.getReason());
        detail.setTitle("Request failed");
        return detail;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request validation failed");
        detail.setTitle("Invalid request");
        detail.setProperty("errors", exception.getBindingResult().getFieldErrors().stream()
            .map(error -> Map.of("field", error.getField(), "message",
                error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage()))
            .toList());
        return detail;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleConflict(DataIntegrityViolationException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
            "The operation conflicts with an existing record or database constraint");
        detail.setTitle("Conflict");
        return detail;
    }
}
