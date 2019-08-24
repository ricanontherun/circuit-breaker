# Circuit Breaker

Close on first caught Error
```javascript
const circuitOptions: CircuitOptions = {
  closeThreshold: 1, // defaults to 1.
};

const circutBreaker: CircuitBreaker = new CircuitBreaker(async (n) => {
  throw new Error('Yep');
});

await circuitBreaker.call(1);

circuitBreaker.isClosed; // true.
```

```javascript
import Circuit from "./circuit";

const circutBreaker = new CircuitBreaker(async () => {
  throw new Error('Yep');
});

await circuitBreaker.call();

circuitBreaker.isClosed; // true

await circuitBreaker.call(); // Error
```
