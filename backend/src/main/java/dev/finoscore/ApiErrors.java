package dev.finoscore;

import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;

@RestControllerAdvice
public class ApiErrors {
    private ResponseEntity<ProblemDetail> problem(int status,String message) {
        ProblemDetail p=ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status),message);
        p.setType(URI.create("urn:finos-core:error:"+status));
        var builder=ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON);
        if(status==503) builder.header("Retry-After","1");
        return builder.body(p);
    }
    @ExceptionHandler(ResponseStatusException.class) ResponseEntity<ProblemDetail> domain(ResponseStatusException e) { return problem(e.getStatusCode().value(),e.getReason()); }
    @ExceptionHandler(DuplicateKeyException.class) ResponseEntity<ProblemDetail> duplicate(DuplicateKeyException e) { return problem(409,"Reference already exists; retry the original request with its original idempotency key"); }
    @ExceptionHandler({CannotAcquireLockException.class,org.springframework.transaction.CannotCreateTransactionException.class,DataAccessResourceFailureException.class}) ResponseEntity<ProblemDetail> unavailable(Exception e) { return problem(503,"Storage is temporarily unavailable or busy; retry with the same idempotency key"); }
    @ExceptionHandler({HttpMessageNotReadableException.class,IllegalArgumentException.class,ArithmeticException.class}) ResponseEntity<ProblemDetail> invalid(Exception e) { return problem(400,"Malformed request or value outside the supported range"); }
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<ProblemDetail> invariant(Exception e) { return problem(422,"Database rejected the operation because it violates a ledger invariant"); }
}
