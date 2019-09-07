# Circuit Breaker

Conditionally call a function depending on the state of the circuit.

## States

### Closed (default state)

All calls are made. If an Error is thrown by the function, the circuit may open according to the following rule:

1. If the number of `consecutive` failed calls (thrown Error) is greater than or equal to the configured `openThreshold`, the circuit will `open`.

### Open

No calls are made. Instead, a default error is thrown. **Note**: As soon as the circuit transitions into the `open` state, a timer is started which will automatically transition the circuit into the `half open` state after `halfOpenTimeout` milliseconds.

### Half Open

A semipermeable state in which only `halfOpenCallRate` percentage of calls are made. The calls which are allowed to be made are observed, and the circuit will `close` or `open` depending on the following rules:

1. If the number of `consecutive` failed calls (thrown Error) is greater than or equal to the configured `openThreshold`, the circuit will `open`.
2. If the number of `consecutive` successful calls is greater than or equal to the configured `closeThreshold`, the circuit will `close`.

Installation
```
npm i @ricanontherun/circuit-breaker
```

Example Usage
```typescript
const circuitBreaker = new CircuitBreaker(() => {
  callSomeDownstreamService(); // Might throw.
}, { // Options.
     // Close the circuit after 10 consecutive successful calls (no throw)
     closeThreshold: 10,

     // Open the circuit (if closed/half-open) after 5 consecutive failed calls.
     openThreshold: 5,

     // Automatically transition from closed to half-open after 5 seconds.
     halfOpenTimeout: 5000,

     // When the circuit is half-open, only allow 80% of calls to be made.
     halfOpenCallRate: 80.0,
});
```