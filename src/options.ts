import {CircuitState} from "./state";

interface IRandomNumberGenerator {
  (min: number, max: number): number;
}

const random = (min: number, max: number): number => Math.floor((Math.random() * min) + max);

export default class CircuitOptions {
  // The number of thrown Errors required to close the circuit, either
  // from an open -> closed state, or a half-open -> closed state.
  public closeThreshold?: number = 1;

  // The number of successful calls required to open the circuit from a half-open state.
  public openThreshold?: number = 1;

  // When in a closed state, the amount of time (milliseconds) before the circuit will
  // transition into the half-open state.
  public halfOpenTimeout?: number = 60 * 1000;

  // When in a half-open state, the percentage of calls allowed to go through.
  public halfOpenCallRate?: number = 50.0;

  // Initial circuit state, mostly useful for tests.
  public initialState?: CircuitState = CircuitState.OPEN;

  // Random number generator used in half-open state, also useful for tests.
  public random?: IRandomNumberGenerator = random;
}