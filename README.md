# Circuit Breaker

Installation
```
npm i @ricanontherun/circuit-breaker
```

Example Usage
```typescript
const circuitBreaker = new CircuitBreaker(() => {
  callSomeDownstreamService();
}, { // Options.
     // Close the circuit after 10 consecutive failed calls.
     closeThreshold: 10,
   
     // Open the circuit (if closed/half-open) after 5 consecutive ok calls.
     openThreshold: 5,
   
     // Automatically transition from closed to half-open after 5 seconds.
     halfOpenTimeout: 5000,
   
     // When the circuit is half-open, only allow 80% of calls to be made.
     halfOpenCallRate: 80.0,
});
```
